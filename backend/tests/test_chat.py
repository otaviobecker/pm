"""The board-scoped AI assistant endpoint."""

import json
import os

import pytest
from fastapi.testclient import TestClient

from app import ai
from tests.conftest import register


def openrouter_response(content: str) -> dict:
    return {"choices": [{"message": {"content": content}}]}


def structured_board(board: dict) -> dict:
    """Reshape a board response into the AI's nested schema."""
    return {
        "columns": [
            {
                "id": column["id"],
                "title": column["title"],
                "cards": [
                    {
                        "id": card_id,
                        "title": board["cards"][card_id]["title"],
                        "details": board["cards"][card_id]["details"],
                        "priority": board["cards"][card_id]["priority"],
                        "dueDate": board["cards"][card_id]["dueDate"],
                    }
                    for card_id in column["cardIds"]
                ],
            }
            for column in board["columns"]
        ]
    }


def reply_with(monkeypatch, payload: dict | str) -> None:
    content = payload if isinstance(payload, str) else json.dumps(payload)
    monkeypatch.setattr(ai, "post_openrouter", lambda _: openrouter_response(content))


def test_ai_connectivity_builds_the_expected_request(
    admin: TestClient, monkeypatch
) -> None:
    captured: dict = {}

    def fake_post(payload):
        captured.update(payload)
        return openrouter_response("4")

    monkeypatch.setattr(ai, "post_openrouter", fake_post)

    response = admin.post("/api/ai/test")

    assert response.status_code == 200
    assert response.json() == {"message": "4"}
    assert captured["model"] == "openai/gpt-oss-120b"
    assert "2+2" in captured["messages"][0]["content"]


def test_ai_connectivity_requires_an_api_key(admin: TestClient, monkeypatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    response = admin.post("/api/ai/test")

    assert response.status_code == 503
    assert "OPENROUTER_API_KEY" in response.json()["detail"]


def test_chat_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/boards/1/chat", json={"message": "hi", "history": []})

    assert response.status_code == 401


def test_chat_sends_the_board_the_request_and_the_history(
    admin: TestClient, board_id: int, monkeypatch
) -> None:
    captured: dict = {}

    def fake_post(payload):
        captured.update(payload)
        return openrouter_response(
            json.dumps({"message": "No board change needed.", "board": None})
        )

    monkeypatch.setattr(ai, "post_openrouter", fake_post)

    response = admin.post(
        f"/api/boards/{board_id}/chat",
        json={
            "message": "What should I do next?",
            "history": [
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": "How can I help?"},
            ],
        },
    )

    assert response.status_code == 200
    assert response.json() == {"message": "No board change needed.", "board": None}
    assert captured["model"] == "openai/gpt-oss-120b"
    assert "col-backlog" in captured["messages"][0]["content"]
    assert captured["messages"][1] == {"role": "user", "content": "Hello"}
    assert "Align roadmap themes" in captured["messages"][-1]["content"]
    assert "What should I do next?" in captured["messages"][-1]["content"]
    assert captured["response_format"]["type"] == "json_schema"


def test_chat_does_not_leak_member_details_to_the_model(
    admin: TestClient, board_id: int, monkeypatch, make_client
) -> None:
    register(make_client(), "casey", email="casey@example.com")
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "editor"}
    )
    captured: dict = {}

    def fake_post(payload):
        captured.update(payload)
        return openrouter_response(json.dumps({"message": "ok", "board": None}))

    monkeypatch.setattr(ai, "post_openrouter", fake_post)

    admin.post(f"/api/boards/{board_id}/chat", json={"message": "hi", "history": []})

    assert "casey" not in json.dumps(captured)


def test_chat_applies_a_multi_card_board_update(
    admin: TestClient, board_id: int, monkeypatch
) -> None:
    board = admin.get(f"/api/boards/{board_id}").json()
    first_card = board["columns"][0]["cardIds"][0]
    moving_card = board["columns"][0]["cardIds"][1]
    board["cards"][first_card]["title"] = "Updated roadmap"
    board["columns"][0]["cardIds"].remove(moving_card)
    board["columns"][3]["cardIds"].insert(0, moving_card)
    board["cards"]["card-ai"] = {
        "id": "card-ai",
        "title": "AI-created task",
        "details": "Created through structured output.",
        "priority": "urgent",
        "dueDate": "2027-01-15",
    }
    board["columns"][2]["cardIds"].append("card-ai")
    reply_with(
        monkeypatch,
        {"message": "I updated three cards.", "board": structured_board(board)},
    )

    response = admin.post(
        f"/api/boards/{board_id}/chat",
        json={"message": "Update the board", "history": []},
    )

    assert response.status_code == 200
    assert response.json()["board"]["cards"][first_card]["title"] == "Updated roadmap"
    persisted = admin.get(f"/api/boards/{board_id}").json()
    assert persisted["columns"][3]["cardIds"][0] == moving_card
    assert persisted["cards"]["card-ai"]["priority"] == "urgent"
    assert persisted["cards"]["card-ai"]["dueDate"] == "2027-01-15"


def test_board_update_preserves_created_at_and_assignee(
    admin: TestClient, board_id: int, monkeypatch
) -> None:
    user_id = admin.get("/api/auth/session").json()["id"]
    board = admin.get(f"/api/boards/{board_id}").json()
    card_id = board["columns"][0]["cardIds"][0]
    admin.patch(
        f"/api/boards/{board_id}/cards/{card_id}", json={"assigneeId": user_id}
    )
    board = admin.get(f"/api/boards/{board_id}").json()
    original = dict(board["cards"][card_id])
    board["cards"][card_id]["title"] = "Renamed by the assistant"
    reply_with(monkeypatch, {"message": "Renamed.", "board": structured_board(board)})

    admin.post(
        f"/api/boards/{board_id}/chat", json={"message": "Rename it", "history": []}
    )

    updated = admin.get(f"/api/boards/{board_id}").json()["cards"][card_id]
    assert updated["title"] == "Renamed by the assistant"
    assert updated["createdAt"] == original["createdAt"]
    assert updated["assigneeId"] == user_id


def test_an_update_that_drops_a_column_is_rejected(
    admin: TestClient, board_id: int, monkeypatch
) -> None:
    before = admin.get(f"/api/boards/{board_id}").json()
    invalid = json.loads(json.dumps(before))
    dropped = invalid["columns"].pop()
    for card_id in dropped["cardIds"]:
        invalid["cards"].pop(card_id)
    reply_with(monkeypatch, {"message": "Changed it.", "board": structured_board(invalid)})

    response = admin.post(
        f"/api/boards/{board_id}/chat",
        json={"message": "Remove a column", "history": []},
    )

    assert response.status_code == 422
    assert admin.get(f"/api/boards/{board_id}").json() == before


def test_malformed_model_output_leaves_the_board_unchanged(
    admin: TestClient, board_id: int, monkeypatch
) -> None:
    before = admin.get(f"/api/boards/{board_id}").json()
    reply_with(monkeypatch, "not json")

    response = admin.post(
        f"/api/boards/{board_id}/chat",
        json={"message": "Update the board", "history": []},
    )

    assert response.status_code == 502
    assert admin.get(f"/api/boards/{board_id}").json() == before


def test_duplicate_card_references_are_rejected(
    admin: TestClient, board_id: int, monkeypatch
) -> None:
    before = admin.get(f"/api/boards/{board_id}").json()
    invalid = structured_board(before)
    invalid["columns"][1]["cards"].append(invalid["columns"][0]["cards"][0])
    reply_with(monkeypatch, {"message": "Duplicated a card.", "board": invalid})

    response = admin.post(
        f"/api/boards/{board_id}/chat",
        json={"message": "Duplicate a card", "history": []},
    )

    assert response.status_code == 422
    assert admin.get(f"/api/boards/{board_id}").json() == before


def test_card_title_length_is_enforced_on_ai_updates(
    admin: TestClient, board_id: int, monkeypatch
) -> None:
    before = admin.get(f"/api/boards/{board_id}").json()
    invalid = structured_board(json.loads(json.dumps(before)))
    invalid["columns"][0]["cards"][0]["title"] = "x" * 201
    reply_with(monkeypatch, {"message": "Changed it.", "board": invalid})

    response = admin.post(
        f"/api/boards/{board_id}/chat", json={"message": "Make a title huge", "history": []}
    )

    assert response.status_code == 502
    assert admin.get(f"/api/boards/{board_id}").json() == before


def test_an_update_cannot_steal_a_card_from_another_board(
    admin: TestClient, board_id: int, monkeypatch
) -> None:
    other = admin.post("/api/boards", json={"name": "Other"}).json()
    stolen = admin.get(f"/api/boards/{board_id}").json()["columns"][0]["cardIds"][0]
    proposal = other
    proposal["cards"][stolen] = {
        "id": stolen,
        "title": "Stolen",
        "details": "",
        "priority": "medium",
        "dueDate": None,
    }
    proposal["columns"][0]["cardIds"].append(stolen)
    reply_with(monkeypatch, {"message": "Taken.", "board": structured_board(proposal)})

    response = admin.post(
        f"/api/boards/{other['id']}/chat", json={"message": "Take it", "history": []}
    )

    assert response.status_code == 422


def test_viewers_cannot_change_a_board_through_chat(
    admin: TestClient, board_id: int, monkeypatch, make_client
) -> None:
    viewer = make_client()
    register(viewer, "casey")
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "viewer"}
    )
    board = admin.get(f"/api/boards/{board_id}").json()
    reply_with(monkeypatch, {"message": "Changed.", "board": structured_board(board)})

    response = viewer.post(
        f"/api/boards/{board_id}/chat", json={"message": "Change it", "history": []}
    )

    assert response.status_code == 403


def test_chat_on_another_users_board_is_a_404(
    admin: TestClient, board_id: int, make_client
) -> None:
    stranger = make_client()
    register(stranger, "stranger")

    response = stranger.post(
        f"/api/boards/{board_id}/chat", json={"message": "hi", "history": []}
    )

    assert response.status_code == 404


@pytest.mark.skipif(
    os.environ.get("RUN_LIVE_AI_TEST") != "1",
    reason="Set RUN_LIVE_AI_TEST=1 for the opt-in OpenRouter check.",
)
def test_live_openrouter_connectivity(admin: TestClient) -> None:
    response = admin.post("/api/ai/test")

    assert response.status_code == 200
    assert response.json()["message"].strip() == "4"


@pytest.mark.skipif(
    os.environ.get("RUN_LIVE_AI_TEST") != "1",
    reason="Set RUN_LIVE_AI_TEST=1 for the opt-in OpenRouter check.",
)
def test_live_structured_chat(admin: TestClient, board_id: int) -> None:
    response = admin.post(
        f"/api/boards/{board_id}/chat",
        json={
            "message": "Reply with a short greeting and do not change the board.",
            "history": [],
        },
    )

    assert response.status_code == 200
    assert response.json()["message"]
    assert response.json()["board"] is None


def test_the_assistant_can_clear_every_card(
    admin: TestClient, board_id: int, monkeypatch
) -> None:
    board = admin.get(f"/api/boards/{board_id}").json()
    for column in board["columns"]:
        column["cardIds"] = []
    board["cards"] = {}
    reply_with(monkeypatch, {"message": "Cleared the board.", "board": structured_board(board)})

    response = admin.post(
        f"/api/boards/{board_id}/chat",
        json={"message": "Delete everything", "history": []},
    )

    assert response.status_code == 200
    assert admin.get(f"/api/boards/{board_id}").json()["cards"] == {}
