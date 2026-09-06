"""Registration, sign-in, session persistence, and throttling."""

from fastapi.testclient import TestClient

from app import database, security
from app.repositories import sessions
from tests.conftest import DEFAULT_PASSWORD, DEFAULT_USERNAME, register, sign_in


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_static_page_calls_api(client: TestClient) -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "The FastAPI static site is running." in response.text
    assert 'fetch("/api/health")' in response.text


def test_login_sets_session_cookie(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": DEFAULT_USERNAME, "password": DEFAULT_PASSWORD},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["username"] == DEFAULT_USERNAME
    assert body["role"] == "admin"
    cookie = response.headers["set-cookie"].lower()
    assert "pm_session=" in cookie
    assert "httponly" in cookie
    assert "samesite=lax" in cookie


def test_login_is_case_insensitive_on_username(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": DEFAULT_USERNAME.upper(), "password": DEFAULT_PASSWORD},
    )

    assert response.status_code == 200


def test_login_rejects_invalid_credentials(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": DEFAULT_USERNAME, "password": "wrong"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid username or password"}


def test_login_rejects_unknown_user_without_leaking_which_field_failed(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/auth/login", json={"username": "nobody", "password": "whatever"}
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid username or password"}


def test_login_locks_out_after_repeated_failures(client: TestClient) -> None:
    for _ in range(5):
        failed = client.post(
            "/api/auth/login",
            json={"username": DEFAULT_USERNAME, "password": "wrong"},
        )
        assert failed.status_code == 401

    locked_out = client.post(
        "/api/auth/login",
        json={"username": DEFAULT_USERNAME, "password": DEFAULT_PASSWORD},
    )

    assert locked_out.status_code == 429


def test_lockout_is_scoped_to_the_attempted_username(client: TestClient) -> None:
    register(client, "victim")
    for _ in range(5):
        client.post("/api/auth/login", json={"username": "victim", "password": "no"})

    response = client.post(
        "/api/auth/login",
        json={"username": DEFAULT_USERNAME, "password": DEFAULT_PASSWORD},
    )

    assert response.status_code == 200


def test_login_cookie_is_not_secure_by_default(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": DEFAULT_USERNAME, "password": DEFAULT_PASSWORD},
    )

    assert "secure" not in response.headers["set-cookie"].lower()


def test_login_cookie_is_secure_when_configured(
    client: TestClient, monkeypatch
) -> None:
    monkeypatch.setenv("COOKIE_SECURE", "true")

    response = client.post(
        "/api/auth/login",
        json={"username": DEFAULT_USERNAME, "password": DEFAULT_PASSWORD},
    )

    assert "secure" in response.headers["set-cookie"].lower()


def test_session_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/auth/session").status_code == 401


def test_session_returns_the_current_user(admin: TestClient) -> None:
    response = admin.get("/api/auth/session")

    assert response.status_code == 200
    assert response.json()["username"] == DEFAULT_USERNAME


def test_logout_invalidates_the_session(admin: TestClient) -> None:
    response = admin.post("/api/auth/logout")

    assert response.status_code == 204
    assert admin.get("/api/auth/session").status_code == 401


def test_session_survives_a_backend_restart(client: TestClient, make_client) -> None:
    sign_in(client)
    cookie = client.cookies["pm_session"]

    restarted = make_client()
    restarted.cookies.set("pm_session", cookie)

    assert restarted.get("/api/auth/session").status_code == 200


def test_session_tokens_are_not_stored_in_plain_text(admin: TestClient) -> None:
    token = admin.cookies["pm_session"]

    with database.transaction() as connection:
        stored = connection.execute("SELECT token_hash FROM sessions").fetchall()

    assert [row["token_hash"] for row in stored] == [security.hash_token(token)]


def test_expired_sessions_are_rejected_and_pruned(admin: TestClient) -> None:
    with database.transaction() as connection:
        connection.execute("UPDATE sessions SET expires_at = '2000-01-01T00:00:00+00:00'")

    assert admin.get("/api/auth/session").status_code == 401
    with database.transaction() as connection:
        assert connection.execute("SELECT count(*) FROM sessions").fetchone()[0] == 0


def test_register_creates_an_account_with_a_starter_board(client: TestClient) -> None:
    body = register(client, "newcomer", displayName="New Comer")

    assert body["username"] == "newcomer"
    assert body["displayName"] == "New Comer"
    assert body["role"] == "member"
    boards = client.get("/api/boards").json()
    assert len(boards) == 1
    assert boards[0]["cardCount"] == len(database.SEED_CARDS)


def test_register_signs_the_new_account_in(client: TestClient) -> None:
    register(client, "newcomer")

    assert client.get("/api/auth/session").json()["username"] == "newcomer"


def test_register_rejects_a_duplicate_username(client: TestClient) -> None:
    register(client, "duplicate")

    response = client.post(
        "/api/auth/register",
        json={"username": "DUPLICATE", "password": "correct-horse"},
    )

    assert response.status_code == 409


def test_register_rejects_a_weak_password(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register", json={"username": "shorty", "password": "short"}
    )

    assert response.status_code == 422


def test_register_rejects_an_invalid_username(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register", json={"username": "no spaces", "password": "correct-horse"}
    )

    assert response.status_code == 422


def test_passwords_are_stored_hashed(client: TestClient) -> None:
    register(client, "hashed", password="correct-horse")

    with database.transaction() as connection:
        stored = connection.execute(
            "SELECT password_hash FROM users WHERE username = 'hashed'"
        ).fetchone()["password_hash"]

    assert "correct-horse" not in stored
    assert stored.startswith("pbkdf2_sha256$")
    assert security.verify_password("correct-horse", stored)


def test_inactive_accounts_cannot_sign_in(admin: TestClient, make_client) -> None:
    member = make_client()
    created = register(member, "suspended")

    admin.patch(f"/api/admin/users/{created['id']}", json={"isActive": False})

    response = member.post(
        "/api/auth/login", json={"username": "suspended", "password": "correct-horse"}
    )
    assert response.status_code == 401


def test_deactivating_a_user_drops_their_sessions(
    admin: TestClient, make_client
) -> None:
    member = make_client()
    created = register(member, "suspended")
    assert member.get("/api/auth/session").status_code == 200

    admin.patch(f"/api/admin/users/{created['id']}", json={"isActive": False})

    assert member.get("/api/auth/session").status_code == 401


def test_oversized_request_body_is_rejected(admin: TestClient, board_id: int) -> None:
    response = admin.post(
        f"/api/boards/{board_id}/cards",
        json={"columnId": "col-backlog", "title": "x", "details": "y" * 3_100_000},
    )

    assert response.status_code == 413


def test_prune_expired_removes_only_stale_sessions(admin: TestClient) -> None:
    with database.transaction() as connection:
        connection.execute(
            "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) "
            "VALUES ('stale', 1, '2000-01-01T00:00:00+00:00', '2000-01-02T00:00:00+00:00')"
        )

    assert sessions.prune_expired() == 1
    assert admin.get("/api/auth/session").status_code == 200
