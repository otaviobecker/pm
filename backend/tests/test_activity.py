"""The per-board record of who changed what."""

import pytest
from fastapi.testclient import TestClient

from app import database
from app.repositories import activity
from tests.conftest import register


def feed(client: TestClient, board_id: int, **params) -> list[dict]:
    response = client.get(f"/api/boards/{board_id}/activity", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def actions(client: TestClient, board_id: int) -> list[str]:
    return [entry["action"] for entry in feed(client, board_id)]


def first_card_id(client: TestClient, board_id: int) -> str:
    return client.get(f"/api/boards/{board_id}").json()["columns"][0]["cardIds"][0]


def test_a_seeded_board_starts_with_an_empty_history(
    admin: TestClient, board_id: int
) -> None:
    assert feed(admin, board_id) == []


def test_creating_a_board_is_recorded(admin: TestClient) -> None:
    created = admin.post("/api/boards", json={"name": "Roadmap"}).json()

    entries = feed(admin, created["id"])

    assert [entry["action"] for entry in entries] == ["board.created"]
    assert entries[0]["subject"] == "Roadmap"
    assert entries[0]["actorName"] == "Workspace Admin"


def test_card_lifecycle_is_recorded(admin: TestClient, board_id: int) -> None:
    created = admin.post(
        f"/api/boards/{board_id}/cards",
        json={"columnId": "col-backlog", "title": "Ship the thing"},
    ).json()
    card_id = created["columns"][0]["cardIds"][-1]
    admin.patch(
        f"/api/boards/{board_id}/cards/{card_id}", json={"priority": "urgent"}
    )
    admin.post(
        f"/api/boards/{board_id}/cards/{card_id}/move",
        json={"columnId": "col-review", "position": 0},
    )
    admin.delete(f"/api/boards/{board_id}/cards/{card_id}")

    entries = feed(admin, board_id)

    assert [entry["action"] for entry in entries] == [
        "card.deleted",
        "card.moved",
        "card.updated",
        "card.created",
    ]
    assert entries[1]["detail"] == "to Review"
    assert entries[2]["detail"] == "changed priority"
    assert {entry["cardId"] for entry in entries} == {card_id}


def test_reordering_within_a_column_is_not_recorded(
    admin: TestClient, board_id: int
) -> None:
    card_id = first_card_id(admin, board_id)

    admin.post(
        f"/api/boards/{board_id}/cards/{card_id}/move",
        json={"columnId": "col-backlog", "position": 1},
    )

    assert feed(admin, board_id) == []


def test_comments_and_completed_checklist_items_are_recorded(
    admin: TestClient, board_id: int
) -> None:
    card_id = first_card_id(admin, board_id)
    admin.post(
        f"/api/boards/{board_id}/cards/{card_id}/comments", json={"body": "Looks good"}
    )
    item = admin.post(
        f"/api/boards/{board_id}/cards/{card_id}/checklist", json={"title": "Draft"}
    ).json()["card"]["checklist"][0]
    admin.patch(
        f"/api/boards/{board_id}/cards/{card_id}/checklist/{item['id']}",
        json={"done": True},
    )
    # Reopening and renaming are noise, so they are not recorded.
    admin.patch(
        f"/api/boards/{board_id}/cards/{card_id}/checklist/{item['id']}",
        json={"done": False},
    )
    admin.patch(
        f"/api/boards/{board_id}/cards/{card_id}/checklist/{item['id']}",
        json={"title": "Draft it"},
    )

    entries = feed(admin, board_id)

    assert [entry["action"] for entry in entries] == [
        "checklist.completed",
        "comment.added",
    ]
    assert entries[0]["detail"] == "Draft"


def test_labelling_a_card_is_recorded(admin: TestClient, board_id: int) -> None:
    card_id = first_card_id(admin, board_id)
    label_id = admin.get(f"/api/boards/{board_id}").json()["labels"][0]["id"]

    admin.put(
        f"/api/boards/{board_id}/cards/{card_id}/labels",
        json={"labelIds": [label_id]},
    )

    entries = feed(admin, board_id)
    assert entries[0]["action"] == "card.labeled"
    assert entries[0]["detail"] == "1 labels"


def test_board_and_member_changes_are_recorded(
    admin: TestClient, board_id: int, make_client
) -> None:
    member = register(make_client(), "casey", displayName="Casey Jones")
    admin.patch(f"/api/boards/{board_id}", json={"name": "Q3 delivery"})
    admin.patch(f"/api/boards/{board_id}", json={"archived": True})
    admin.patch(f"/api/boards/{board_id}", json={"archived": False})
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "viewer"}
    )
    admin.patch(
        f"/api/boards/{board_id}/members/{member['id']}", json={"role": "editor"}
    )
    admin.delete(f"/api/boards/{board_id}/members/{member['id']}")

    assert actions(admin, board_id) == [
        "member.removed",
        "member.role_changed",
        "member.added",
        "board.restored",
        "board.archived",
        "board.renamed",
    ]


def test_a_member_leaving_is_recorded(
    admin: TestClient, board_id: int, make_client
) -> None:
    collaborator = make_client()
    member = register(collaborator, "casey")
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "editor"}
    )

    collaborator.delete(f"/api/boards/{board_id}/members/{member['id']}")

    entries = feed(admin, board_id)
    assert entries[0]["action"] == "member.removed"
    assert entries[0]["detail"] == "left the board"


def test_column_changes_are_recorded(admin: TestClient, board_id: int) -> None:
    admin.patch(f"/api/boards/{board_id}/columns/col-backlog", json={"title": "Ideas"})
    admin.patch(f"/api/boards/{board_id}/columns/col-backlog", json={"wipLimit": 3})
    admin.post(
        f"/api/boards/{board_id}/columns/col-backlog/move", json={"position": 1}
    )
    added = admin.post(
        f"/api/boards/{board_id}/columns", json={"title": "Blocked"}
    ).json()
    admin.delete(f"/api/boards/{board_id}/columns/{added['columns'][-1]['id']}")

    entries = feed(admin, board_id)

    assert [entry["action"] for entry in entries] == [
        "column.deleted",
        "column.created",
        "column.moved",
        "column.wip_limit",
        "column.renamed",
    ]
    assert entries[2]["detail"] == "to position 2"
    assert entries[3]["detail"] == "limit 3"


def test_deleting_a_column_notes_how_many_cards_moved(
    admin: TestClient, board_id: int
) -> None:
    admin.delete(
        f"/api/boards/{board_id}/columns/col-backlog",
        params={"moveCardsTo": "col-review"},
    )

    entries = feed(admin, board_id)
    assert entries[0]["action"] == "column.deleted"
    assert entries[0]["detail"] == "2 cards moved"


def test_label_changes_are_recorded(admin: TestClient, board_id: int) -> None:
    created = admin.post(
        f"/api/boards/{board_id}/labels", json={"name": "Blocked", "color": "navy"}
    ).json()
    admin.delete(f"/api/boards/{board_id}/labels/{created['labels'][-1]['id']}")

    entries = feed(admin, board_id)
    assert [entry["action"] for entry in entries] == ["label.deleted", "label.created"]
    assert entries[1]["detail"] == "navy"


def test_an_assistant_update_is_recorded(
    admin: TestClient, board_id: int, monkeypatch
) -> None:
    from tests.test_chat import reply_with, structured_board

    board = admin.get(f"/api/boards/{board_id}").json()
    board["cards"]["card-new"] = {
        "id": "card-new",
        "title": "Added by the assistant",
        "details": "",
        "priority": "medium",
        "dueDate": None,
    }
    board["columns"][0]["cardIds"].append("card-new")
    reply_with(monkeypatch, {"message": "Added one.", "board": structured_board(board)})

    admin.post(f"/api/boards/{board_id}/chat", json={"message": "Add", "history": []})

    entries = feed(admin, board_id)
    assert entries[0]["action"] == "assistant.updated"
    assert entries[0]["detail"] == "1 cards added or removed"


def test_history_survives_the_card_it_describes(
    admin: TestClient, board_id: int
) -> None:
    card_id = first_card_id(admin, board_id)
    admin.post(
        f"/api/boards/{board_id}/cards/{card_id}/comments", json={"body": "A note"}
    )

    admin.delete(f"/api/boards/{board_id}/cards/{card_id}")

    entries = feed(admin, board_id)
    assert [entry["action"] for entry in entries] == ["card.deleted", "comment.added"]
    assert entries[1]["subject"] == "Align roadmap themes"


def test_history_survives_the_account_that_made_it(
    admin: TestClient, board_id: int, make_client
) -> None:
    editor = make_client()
    member = register(editor, "casey", displayName="Casey Jones")
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "editor"}
    )
    editor.post(
        f"/api/boards/{board_id}/cards",
        json={"columnId": "col-backlog", "title": "Caseys card"},
    )

    admin.delete(f"/api/admin/users/{member['id']}")

    entry = next(
        item for item in feed(admin, board_id) if item["action"] == "card.created"
    )
    assert entry["actorName"] == "Casey Jones"
    assert entry["actorId"] is None


def test_the_feed_pages_backwards(admin: TestClient, board_id: int) -> None:
    for index in range(5):
        admin.post(
            f"/api/boards/{board_id}/columns", json={"title": f"Column {index}"}
        )

    newest = feed(admin, board_id, limit=2)
    older = feed(admin, board_id, limit=2, before=newest[-1]["id"])

    assert [entry["subject"] for entry in newest] == ["Column 4", "Column 3"]
    assert [entry["subject"] for entry in older] == ["Column 2", "Column 1"]


def test_the_feed_rejects_a_silly_limit(admin: TestClient, board_id: int) -> None:
    assert (
        admin.get(f"/api/boards/{board_id}/activity", params={"limit": 0}).status_code
        == 422
    )
    assert (
        admin.get(f"/api/boards/{board_id}/activity", params={"limit": 500}).status_code
        == 422
    )


def test_the_feed_needs_board_access(
    admin: TestClient, board_id: int, make_client
) -> None:
    stranger = make_client()
    register(stranger, "stranger")

    assert stranger.get(f"/api/boards/{board_id}/activity").status_code == 404


def test_viewers_can_read_the_feed(
    admin: TestClient, board_id: int, make_client
) -> None:
    viewer = make_client()
    register(viewer, "casey")
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "viewer"}
    )

    assert viewer.get(f"/api/boards/{board_id}/activity").status_code == 200


def test_the_history_is_trimmed_to_a_rolling_window(
    admin: TestClient, board_id: int, monkeypatch
) -> None:
    monkeypatch.setattr(activity, "MAX_ENTRIES_PER_BOARD", 3)

    for index in range(6):
        admin.post(
            f"/api/boards/{board_id}/columns", json={"title": f"Column {index}"}
        )

    entries = feed(admin, board_id, limit=100)
    assert [entry["subject"] for entry in entries] == [
        "Column 5",
        "Column 4",
        "Column 3",
    ]


def test_each_board_keeps_its_own_history(admin: TestClient, board_id: int) -> None:
    other = admin.post("/api/boards", json={"name": "Roadmap"}).json()
    admin.post(f"/api/boards/{board_id}/columns", json={"title": "Only here"})

    assert actions(admin, other["id"]) == ["board.created"]
    assert actions(admin, board_id) == ["column.created"]


def test_an_unknown_action_is_a_programming_error() -> None:
    with database.transaction() as connection:
        with pytest.raises(ValueError, match="Unknown activity action"):
            activity.record(connection, 1, 1, "card.teleported")


def test_a_deleted_board_takes_its_history_with_it(
    admin: TestClient, board_id: int
) -> None:
    admin.post(f"/api/boards/{board_id}/columns", json={"title": "Blocked"})

    admin.delete(f"/api/boards/{board_id}")

    with database.transaction() as connection:
        assert connection.execute("SELECT count(*) FROM activity").fetchone()[0] == 0
