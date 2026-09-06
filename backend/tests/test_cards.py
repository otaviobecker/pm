"""Card creation, editing, movement, deletion, and their guardrails."""

import threading

from fastapi.testclient import TestClient

from app.repositories import cards as card_repository
from tests.conftest import register


def board_of(client: TestClient, board_id: int) -> dict:
    return client.get(f"/api/boards/{board_id}").json()


def test_create_edit_and_delete_a_card(admin: TestClient, board_id: int) -> None:
    created = admin.post(
        f"/api/boards/{board_id}/cards",
        json={
            "columnId": "col-backlog",
            "title": "New card",
            "details": "Initial details",
        },
    ).json()
    card_id = created["columns"][0]["cardIds"][-1]
    assert created["cards"][card_id]["title"] == "New card"
    assert created["cards"][card_id]["priority"] == "medium"

    edited = admin.patch(
        f"/api/boards/{board_id}/cards/{card_id}",
        json={"title": "Edited card", "details": "Updated details"},
    ).json()
    assert edited["cards"][card_id]["title"] == "Edited card"

    deleted = admin.delete(f"/api/boards/{board_id}/cards/{card_id}").json()
    assert card_id not in deleted["cards"]
    assert card_id not in deleted["columns"][0]["cardIds"]


def test_a_partial_update_leaves_other_fields_alone(
    admin: TestClient, board_id: int
) -> None:
    board = board_of(admin, board_id)
    card_id = board["columns"][0]["cardIds"][0]
    original = board["cards"][card_id]

    updated = admin.patch(
        f"/api/boards/{board_id}/cards/{card_id}", json={"priority": "urgent"}
    ).json()["cards"][card_id]

    assert updated["priority"] == "urgent"
    assert updated["title"] == original["title"]
    assert updated["details"] == original["details"]
    assert updated["createdAt"] == original["createdAt"]


def test_card_priority_and_due_date_round_trip(admin: TestClient, board_id: int) -> None:
    created = admin.post(
        f"/api/boards/{board_id}/cards",
        json={
            "columnId": "col-backlog",
            "title": "Scheduled",
            "priority": "high",
            "dueDate": "2026-12-01",
        },
    ).json()
    card_id = created["columns"][0]["cardIds"][-1]

    assert created["cards"][card_id]["dueDate"] == "2026-12-01"
    assert board_of(admin, board_id)["cards"][card_id]["priority"] == "high"

    cleared = admin.patch(
        f"/api/boards/{board_id}/cards/{card_id}", json={"dueDate": None}
    ).json()
    assert cleared["cards"][card_id]["dueDate"] is None


def test_invalid_priority_and_due_date_are_rejected(
    admin: TestClient, board_id: int
) -> None:
    bad_priority = admin.post(
        f"/api/boards/{board_id}/cards",
        json={"columnId": "col-backlog", "title": "x", "priority": "whenever"},
    )
    bad_date = admin.post(
        f"/api/boards/{board_id}/cards",
        json={"columnId": "col-backlog", "title": "x", "dueDate": "not-a-date"},
    )

    assert bad_priority.status_code == 422
    assert bad_date.status_code == 422


def test_cards_can_be_assigned_to_board_members(
    admin: TestClient, board_id: int, make_client
) -> None:
    collaborator = make_client()
    member = register(collaborator, "casey")
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "editor"}
    )

    created = admin.post(
        f"/api/boards/{board_id}/cards",
        json={
            "columnId": "col-backlog",
            "title": "Assigned",
            "assigneeId": member["id"],
        },
    ).json()
    card_id = created["columns"][0]["cardIds"][-1]

    assert created["cards"][card_id]["assigneeId"] == member["id"]


def test_cards_cannot_be_assigned_to_a_non_member(
    admin: TestClient, board_id: int, make_client
) -> None:
    outsider = register(make_client(), "casey")

    response = admin.post(
        f"/api/boards/{board_id}/cards",
        json={
            "columnId": "col-backlog",
            "title": "Assigned",
            "assigneeId": outsider["id"],
        },
    )

    assert response.status_code == 422


def test_removing_a_member_clears_their_assignments(
    admin: TestClient, board_id: int, make_client
) -> None:
    member = register(make_client(), "casey")
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "editor"}
    )
    created = admin.post(
        f"/api/boards/{board_id}/cards",
        json={
            "columnId": "col-backlog",
            "title": "Assigned",
            "assigneeId": member["id"],
        },
    ).json()
    card_id = created["columns"][0]["cardIds"][-1]

    admin.delete(f"/api/boards/{board_id}/members/{member['id']}")

    assert board_of(admin, board_id)["cards"][card_id]["assigneeId"] is None


def test_blank_card_title_is_rejected(admin: TestClient, board_id: int) -> None:
    card_id = board_of(admin, board_id)["columns"][0]["cardIds"][0]

    created = admin.post(
        f"/api/boards/{board_id}/cards",
        json={"columnId": "col-backlog", "title": "   ", "details": ""},
    )
    edited = admin.patch(
        f"/api/boards/{board_id}/cards/{card_id}", json={"title": "   "}
    )

    assert created.status_code == 422
    assert edited.status_code == 422


def test_card_length_limits_are_enforced(admin: TestClient, board_id: int) -> None:
    oversized_title = admin.post(
        f"/api/boards/{board_id}/cards",
        json={"columnId": "col-backlog", "title": "x" * 201},
    )
    oversized_details = admin.post(
        f"/api/boards/{board_id}/cards",
        json={"columnId": "col-backlog", "title": "Valid", "details": "x" * 5001},
    )

    assert oversized_title.status_code == 422
    assert oversized_details.status_code == 422


def test_creating_a_card_in_an_unknown_column_is_a_404(
    admin: TestClient, board_id: int
) -> None:
    response = admin.post(
        f"/api/boards/{board_id}/cards",
        json={"columnId": "col-missing", "title": "Nowhere"},
    )

    assert response.status_code == 404


def test_cards_reorder_within_a_column(admin: TestClient, board_id: int) -> None:
    board = board_of(admin, board_id)
    first, second = board["columns"][0]["cardIds"][:2]

    response = admin.post(
        f"/api/boards/{board_id}/cards/{second}/move",
        json={"columnId": "col-backlog", "position": 0},
    )

    assert response.json()["columns"][0]["cardIds"] == [second, first]


def test_cards_move_between_columns(admin: TestClient, board_id: int) -> None:
    board = board_of(admin, board_id)
    moving = board["columns"][0]["cardIds"][1]
    review_ids = board["columns"][3]["cardIds"]

    response = admin.post(
        f"/api/boards/{board_id}/cards/{moving}/move",
        json={"columnId": "col-review", "position": 0},
    ).json()

    assert moving not in response["columns"][0]["cardIds"]
    assert response["columns"][3]["cardIds"] == [moving, *review_ids]


def test_a_failed_move_rolls_back(admin: TestClient, board_id: int) -> None:
    before = board_of(admin, board_id)
    card_id = before["columns"][0]["cardIds"][0]

    response = admin.post(
        f"/api/boards/{board_id}/cards/{card_id}/move",
        json={"columnId": "col-missing", "position": 0},
    )

    assert response.status_code == 404
    assert board_of(admin, board_id) == before


def test_wip_limit_blocks_new_and_incoming_cards(
    admin: TestClient, board_id: int
) -> None:
    admin.patch(f"/api/boards/{board_id}/columns/col-progress", json={"wipLimit": 2})
    board = board_of(admin, board_id)
    assert len(board["columns"][2]["cardIds"]) == 2

    created = admin.post(
        f"/api/boards/{board_id}/cards",
        json={"columnId": "col-progress", "title": "One too many"},
    )
    moved = admin.post(
        f"/api/boards/{board_id}/cards/{board['columns'][0]['cardIds'][0]}/move",
        json={"columnId": "col-progress", "position": 0},
    )

    assert created.status_code == 422
    assert "work-in-progress limit" in created.json()["detail"]
    assert moved.status_code == 422
    assert board_of(admin, board_id) == board


def test_reordering_inside_a_full_column_still_works(
    admin: TestClient, board_id: int
) -> None:
    admin.patch(f"/api/boards/{board_id}/columns/col-progress", json={"wipLimit": 2})
    board = board_of(admin, board_id)
    first, second = board["columns"][2]["cardIds"]

    response = admin.post(
        f"/api/boards/{board_id}/cards/{second}/move",
        json={"columnId": "col-progress", "position": 0},
    )

    assert response.status_code == 200
    assert response.json()["columns"][2]["cardIds"] == [second, first]


def test_cards_of_another_board_are_not_reachable(
    admin: TestClient, board_id: int
) -> None:
    other = admin.post("/api/boards", json={"name": "Other"}).json()
    card_id = board_of(admin, board_id)["columns"][0]["cardIds"][0]

    response = admin.patch(
        f"/api/boards/{other['id']}/cards/{card_id}", json={"title": "Changed"}
    )

    assert response.status_code == 404


def test_concurrent_card_creation_keeps_positions_unique(
    admin: TestClient, board_id: int
) -> None:
    user_id = admin.get("/api/auth/session").json()["id"]
    errors: list[BaseException] = []
    thread_count = 6
    barrier = threading.Barrier(thread_count)

    def create(index: int) -> None:
        try:
            barrier.wait()
            card_repository.create(
                user_id, board_id, "col-backlog", f"Concurrent {index}", ""
            )
        except BaseException as exception:  # noqa: BLE001
            errors.append(exception)

    threads = [threading.Thread(target=create, args=(index,)) for index in range(thread_count)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert not errors, errors
    backlog_ids = board_of(admin, board_id)["columns"][0]["cardIds"]
    assert len(backlog_ids) == len(set(backlog_ids)) == 2 + thread_count


def test_an_empty_update_leaves_the_card_untouched(
    admin: TestClient, board_id: int
) -> None:
    before = board_of(admin, board_id)
    card_id = before["columns"][0]["cardIds"][0]

    response = admin.patch(f"/api/boards/{board_id}/cards/{card_id}", json={})

    assert response.status_code == 200
    assert response.json()["cards"][card_id] == before["cards"][card_id]
