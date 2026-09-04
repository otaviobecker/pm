from collections.abc import Iterator
import json
import os
import threading

from fastapi.testclient import TestClient
import pytest

from app import ai, db
from app.main import app, failed_login_attempts, login_lockouts, sessions


@pytest.fixture
def client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    sessions.clear()
    failed_login_attempts.clear()
    login_lockouts.clear()
    with TestClient(app) as test_client:
        yield test_client


def login(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )
    assert response.status_code == 200


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_hello(client: TestClient) -> None:
    response = client.get("/api/hello")

    assert response.status_code == 200
    assert response.json() == {"message": "Hello from FastAPI"}


def test_static_page_calls_api(client: TestClient) -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "The FastAPI static site is running." in response.text
    assert 'fetch("/api/hello")' in response.text


def test_login_sets_session_cookie(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )

    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    cookie = response.headers["set-cookie"].lower()
    assert "pm_session=" in cookie
    assert "httponly" in cookie
    assert "samesite=lax" in cookie


def test_login_rejects_invalid_credentials(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "wrong"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid username or password"}


def test_login_locks_out_after_repeated_failures(client: TestClient) -> None:
    for _ in range(5):
        response = client.post(
            "/api/auth/login",
            json={"username": "user", "password": "wrong"},
        )
        assert response.status_code == 401

    locked_out = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )

    assert locked_out.status_code == 429


def test_login_cookie_is_not_secure_by_default(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )

    cookie = response.headers["set-cookie"].lower()
    assert "secure" not in cookie


def test_login_cookie_is_secure_when_configured(
    client: TestClient,
    monkeypatch,
) -> None:
    monkeypatch.setenv("COOKIE_SECURE", "true")

    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )

    cookie = response.headers["set-cookie"].lower()
    assert "secure" in cookie


def test_oversized_request_body_is_rejected(client: TestClient) -> None:
    login(client)

    response = client.post(
        "/api/board/cards",
        json={
            "columnId": "col-backlog",
            "title": "x",
            "details": "y" * 3_100_000,
        },
    )

    assert response.status_code == 413


def test_session_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/auth/session")

    assert response.status_code == 401


def test_session_returns_current_user(client: TestClient) -> None:
    login(client)

    response = client.get("/api/auth/session")

    assert response.status_code == 200
    assert response.json() == {"username": "user"}


def test_logout_invalidates_session(client: TestClient) -> None:
    login(client)

    response = client.post("/api/auth/logout")

    assert response.status_code == 204
    assert client.get("/api/auth/session").status_code == 401


def test_board_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/board")

    assert response.status_code == 401


def test_missing_database_is_created_and_seeded(client: TestClient) -> None:
    login(client)

    response = client.get("/api/board")

    assert response.status_code == 200
    assert [column["id"] for column in response.json()["columns"]] == [
        "col-backlog",
        "col-discovery",
        "col-progress",
        "col-review",
        "col-done",
    ]
    assert len(response.json()["cards"]) == 8
    assert db.database_path().exists()


def test_column_rename_persists_without_reseeding(client: TestClient) -> None:
    login(client)

    response = client.patch(
        "/api/board/columns/col-backlog",
        json={"title": "Ideas"},
    )
    db.initialize_database()

    assert response.status_code == 200
    board = client.get("/api/board").json()
    assert board["columns"][0]["title"] == "Ideas"


def test_blank_column_title_is_rejected(client: TestClient) -> None:
    login(client)

    response = client.patch(
        "/api/board/columns/col-backlog",
        json={"title": "   "},
    )

    assert response.status_code == 422
    board = client.get("/api/board").json()
    assert board["columns"][0]["title"] == "Backlog"


def test_column_title_length_limit_is_enforced(client: TestClient) -> None:
    login(client)

    response = client.patch(
        "/api/board/columns/col-backlog",
        json={"title": "x" * 101},
    )

    assert response.status_code == 422


def test_create_edit_and_delete_card(client: TestClient) -> None:
    login(client)

    created = client.post(
        "/api/board/cards",
        json={
            "columnId": "col-backlog",
            "title": "New card",
            "details": "Initial details",
        },
    ).json()
    card_id = created["columns"][0]["cardIds"][-1]
    assert created["cards"][card_id]["title"] == "New card"

    edited = client.patch(
        f"/api/board/cards/{card_id}",
        json={"title": "Edited card", "details": "Updated details"},
    ).json()
    assert edited["cards"][card_id]["title"] == "Edited card"

    deleted = client.delete(f"/api/board/cards/{card_id}").json()
    assert card_id not in deleted["cards"]
    assert card_id not in deleted["columns"][0]["cardIds"]


def test_blank_card_title_is_rejected(client: TestClient) -> None:
    login(client)

    created = client.post(
        "/api/board/cards",
        json={"columnId": "col-backlog", "title": "   ", "details": ""},
    )
    assert created.status_code == 422

    edited = client.patch(
        "/api/board/cards/card-1",
        json={"title": "   ", "details": ""},
    )
    assert edited.status_code == 422


def test_card_title_and_details_length_limits_are_enforced(client: TestClient) -> None:
    login(client)

    oversized_title = client.post(
        "/api/board/cards",
        json={"columnId": "col-backlog", "title": "x" * 201, "details": ""},
    )
    assert oversized_title.status_code == 422

    oversized_details = client.post(
        "/api/board/cards",
        json={
            "columnId": "col-backlog",
            "title": "Valid title",
            "details": "x" * 5001,
        },
    )
    assert oversized_details.status_code == 422


def test_concurrent_card_creation_does_not_corrupt_positions(client: TestClient) -> None:
    login(client)
    errors: list[BaseException] = []
    thread_count = 6
    barrier = threading.Barrier(thread_count)

    def create(index: int) -> None:
        try:
            barrier.wait()
            db.create_card("user", "col-backlog", f"Concurrent {index}", "")
        except BaseException as exception:  # noqa: BLE001
            errors.append(exception)

    threads = [threading.Thread(target=create, args=(i,)) for i in range(thread_count)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert not errors, errors
    board = db.get_board("user")
    backlog_ids = board["columns"][0]["cardIds"]
    assert len(backlog_ids) == len(set(backlog_ids)) == 2 + thread_count


def test_reorders_and_moves_cards(client: TestClient) -> None:
    login(client)

    reordered = client.post(
        "/api/board/cards/card-2/move",
        json={"columnId": "col-backlog", "position": 0},
    ).json()
    assert reordered["columns"][0]["cardIds"] == ["card-2", "card-1"]

    moved = client.post(
        "/api/board/cards/card-2/move",
        json={"columnId": "col-review", "position": 0},
    ).json()
    assert moved["columns"][0]["cardIds"] == ["card-1"]
    assert moved["columns"][3]["cardIds"] == ["card-2", "card-6"]


def test_failed_move_rolls_back(client: TestClient) -> None:
    login(client)
    before = client.get("/api/board").json()

    response = client.post(
        "/api/board/cards/card-1/move",
        json={"columnId": "missing", "position": 0},
    )

    assert response.status_code == 404
    assert client.get("/api/board").json() == before


def test_cannot_mutate_card_owned_by_another_user(client: TestClient) -> None:
    login(client)
    timestamp = db.now()
    with db.transaction() as connection:
        other_user_id = connection.execute(
            "INSERT INTO users (username, created_at) VALUES (?, ?)",
            ("other", timestamp),
        ).lastrowid
        other_board_id = connection.execute(
            "INSERT INTO boards (user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (other_user_id, "Other", timestamp, timestamp),
        ).lastrowid
        connection.executemany(
            "INSERT INTO columns (id, board_id, key, title, position) VALUES (?, ?, ?, ?, ?)",
            [
                (column_id, other_board_id, key, title, position)
                for column_id, key, title, position in db.FIXED_COLUMNS
            ],
        )
        connection.execute(
            """
            INSERT INTO cards
                (id, board_id, column_id, title, details, position, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "card-other",
                other_board_id,
                "col-backlog",
                "Other card",
                "",
                0,
                timestamp,
                timestamp,
            ),
        )

    response = client.patch(
        "/api/board/cards/card-other",
        json={"title": "Changed", "details": ""},
    )

    assert response.status_code == 404


def openrouter_response(content: str) -> dict:
    return {"choices": [{"message": {"content": content}}]}


def structured_board(board: dict) -> dict:
    return {
        "columns": [
            {
                "id": column["id"],
                "title": column["title"],
                "cards": [
                    board["cards"][card_id]
                    for card_id in column["cardIds"]
                ],
            }
            for column in board["columns"]
        ]
    }


def test_ai_connectivity_builds_expected_request(
    client: TestClient,
    monkeypatch,
) -> None:
    login(client)
    captured = {}

    def fake_post(payload):
        captured.update(payload)
        return openrouter_response("4")

    monkeypatch.setattr(ai, "post_openrouter", fake_post)

    response = client.post("/api/ai/test")

    assert response.status_code == 200
    assert response.json() == {"message": "4"}
    assert captured["model"] == "openai/gpt-oss-120b"
    assert "2+2" in captured["messages"][0]["content"]


def test_ai_connectivity_requires_api_key(
    client: TestClient,
    monkeypatch,
) -> None:
    login(client)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    response = client.post("/api/ai/test")

    assert response.status_code == 503
    assert "OPENROUTER_API_KEY" in response.json()["detail"]


def test_chat_includes_board_request_and_history(
    client: TestClient,
    monkeypatch,
) -> None:
    login(client)
    captured = {}

    def fake_post(payload):
        captured.update(payload)
        return openrouter_response(
            json.dumps({"message": "No board change needed.", "board": None})
        )

    monkeypatch.setattr(ai, "post_openrouter", fake_post)

    response = client.post(
        "/api/chat",
        json={
            "message": "What should I do next?",
            "history": [
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": "How can I help?"},
            ],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "message": "No board change needed.",
        "board": None,
    }
    assert captured["model"] == "openai/gpt-oss-120b"
    assert captured["messages"][1] == {"role": "user", "content": "Hello"}
    assert "card-1" in captured["messages"][-1]["content"]
    assert "What should I do next?" in captured["messages"][-1]["content"]
    assert captured["response_format"]["type"] == "json_schema"


def test_chat_applies_multi_card_board_update(
    client: TestClient,
    monkeypatch,
) -> None:
    login(client)
    board = client.get("/api/board").json()
    board["cards"]["card-1"]["title"] = "Updated roadmap"
    board["columns"][0]["cardIds"].remove("card-2")
    board["columns"][3]["cardIds"].insert(0, "card-2")
    board["cards"]["card-ai"] = {
        "id": "card-ai",
        "title": "AI-created task",
        "details": "Created through structured output.",
    }
    board["columns"][2]["cardIds"].append("card-ai")
    monkeypatch.setattr(
        ai,
        "post_openrouter",
        lambda _: openrouter_response(
            json.dumps(
                {
                    "message": "I updated three cards.",
                    "board": structured_board(board),
                }
            )
        ),
    )

    response = client.post(
        "/api/chat",
        json={"message": "Update the board", "history": []},
    )

    assert response.status_code == 200
    assert response.json()["board"]["cards"]["card-1"]["title"] == "Updated roadmap"
    persisted = client.get("/api/board").json()
    assert persisted["columns"][3]["cardIds"][0] == "card-2"
    assert persisted["cards"]["card-ai"]["title"] == "AI-created task"


def test_invalid_ai_board_update_rolls_back(
    client: TestClient,
    monkeypatch,
) -> None:
    login(client)
    before = client.get("/api/board").json()
    invalid = json.loads(json.dumps(before))
    invalid["columns"].pop()
    monkeypatch.setattr(
        ai,
        "post_openrouter",
        lambda _: openrouter_response(
            json.dumps(
                {
                    "message": "Changed it.",
                    "board": structured_board(invalid),
                }
            )
        ),
    )

    response = client.post(
        "/api/chat",
        json={"message": "Remove a column", "history": []},
    )

    assert response.status_code == 422
    assert client.get("/api/board").json() == before


def test_malformed_ai_output_leaves_board_unchanged(
    client: TestClient,
    monkeypatch,
) -> None:
    login(client)
    before = client.get("/api/board").json()
    monkeypatch.setattr(
        ai,
        "post_openrouter",
        lambda _: openrouter_response("not json"),
    )

    response = client.post(
        "/api/chat",
        json={"message": "Update the board", "history": []},
    )

    assert response.status_code == 502
    assert client.get("/api/board").json() == before


def test_duplicate_ai_card_references_are_rejected(
    client: TestClient,
    monkeypatch,
) -> None:
    login(client)
    before = client.get("/api/board").json()
    invalid = structured_board(before)
    invalid["columns"][1]["cards"].append(invalid["columns"][0]["cards"][0])
    monkeypatch.setattr(
        ai,
        "post_openrouter",
        lambda _: openrouter_response(
            json.dumps({"message": "Duplicated a card.", "board": invalid})
        ),
    )

    response = client.post(
        "/api/chat",
        json={"message": "Duplicate a card", "history": []},
    )

    assert response.status_code == 422
    assert client.get("/api/board").json() == before


def test_ai_board_update_enforces_card_title_length(
    client: TestClient,
    monkeypatch,
) -> None:
    login(client)
    before = client.get("/api/board").json()
    invalid = structured_board(json.loads(json.dumps(before)))
    invalid["columns"][0]["cards"][0]["title"] = "x" * 201
    monkeypatch.setattr(
        ai,
        "post_openrouter",
        lambda _: openrouter_response(
            json.dumps({"message": "Changed it.", "board": invalid})
        ),
    )

    response = client.post(
        "/api/chat",
        json={"message": "Make a title huge", "history": []},
    )

    assert response.status_code == 502
    assert client.get("/api/board").json() == before


@pytest.mark.skipif(
    os.environ.get("RUN_LIVE_AI_TEST") != "1",
    reason="Set RUN_LIVE_AI_TEST=1 for the opt-in OpenRouter check.",
)
def test_live_openrouter_connectivity(client: TestClient) -> None:
    login(client)

    response = client.post("/api/ai/test")

    assert response.status_code == 200
    assert response.json()["message"].strip() == "4"


@pytest.mark.skipif(
    os.environ.get("RUN_LIVE_AI_TEST") != "1",
    reason="Set RUN_LIVE_AI_TEST=1 for the opt-in OpenRouter check.",
)
def test_live_structured_chat(client: TestClient) -> None:
    login(client)

    response = client.post(
        "/api/chat",
        json={
            "message": "Reply with a short greeting and do not change the board.",
            "history": [],
        },
    )

    assert response.status_code == 200
    assert response.json()["message"]
    assert response.json()["board"] is None
