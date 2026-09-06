"""Session lifetime, refresh, and login throttling details."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app import auth, database
from app.repositories import sessions


def stored_expiry() -> datetime:
    with database.transaction() as connection:
        row = connection.execute("SELECT expires_at FROM sessions").fetchone()
    return datetime.fromisoformat(row["expires_at"])


def set_expiry(moment: datetime) -> None:
    with database.transaction() as connection:
        connection.execute(
            "UPDATE sessions SET expires_at = ?", (moment.isoformat(),)
        )


def test_a_fresh_session_is_not_extended(admin: TestClient) -> None:
    before = stored_expiry()

    admin.get("/api/auth/session")

    assert stored_expiry() == before


def test_an_aging_session_is_extended_on_use(admin: TestClient) -> None:
    expiring_soon = datetime.now(UTC) + timedelta(hours=1)
    set_expiry(expiring_soon)

    assert admin.get("/api/auth/session").status_code == 200

    assert stored_expiry() > expiring_soon + timedelta(days=1)


def test_a_session_is_rejected_once_the_account_is_deactivated(
    client: TestClient, make_client
) -> None:
    from tests.conftest import register

    register(client, "casey")
    with database.transaction() as connection:
        connection.execute("UPDATE users SET is_active = 0 WHERE username = 'casey'")

    assert client.get("/api/auth/session").status_code == 401
    # The rejected session is also cleared away.
    with database.transaction() as connection:
        assert connection.execute("SELECT count(*) FROM sessions").fetchone()[0] == 0


def test_an_unknown_token_resolves_to_nobody(client: TestClient) -> None:
    assert sessions.resolve(None) is None
    assert sessions.resolve("") is None
    assert sessions.resolve("not-a-real-token") is None


def test_destroying_an_absent_token_is_harmless(admin: TestClient) -> None:
    sessions.destroy(None)

    assert admin.get("/api/auth/session").status_code == 200


def test_a_lockout_expires(monkeypatch) -> None:
    auth.reset_login_throttling()
    key = "127.0.0.1:casey"
    auth.login_lockouts[key] = 100.0

    monkeypatch.setattr(auth, "monotonic", lambda: 99.0)
    assert auth.is_locked_out(key) is True

    monkeypatch.setattr(auth, "monotonic", lambda: 101.0)
    assert auth.is_locked_out(key) is False
    assert key not in auth.login_lockouts


def test_failures_outside_the_window_are_forgotten(monkeypatch) -> None:
    auth.reset_login_throttling()
    key = "127.0.0.1:casey"
    clock = {"now": 0.0}
    monkeypatch.setattr(auth, "monotonic", lambda: clock["now"])

    for _ in range(auth.LOGIN_ATTEMPT_LIMIT - 1):
        auth.record_failed_login(key)
    clock["now"] = auth.LOGIN_ATTEMPT_WINDOW_SECONDS + 1
    auth.record_failed_login(key)

    assert auth.is_locked_out(key) is False
