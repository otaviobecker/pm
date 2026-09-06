"""Column creation, renaming, WIP limits, reordering, and deletion."""

from fastapi.testclient import TestClient

from app import database


def titles(board: dict) -> list[str]:
    return [column["title"] for column in board["columns"]]


def test_column_rename_persists(admin: TestClient, board_id: int) -> None:
    response = admin.patch(
        f"/api/boards/{board_id}/columns/col-backlog", json={"title": "Ideas"}
    )

    assert response.status_code == 200
    database.initialize_database()
    assert titles(admin.get(f"/api/boards/{board_id}").json())[0] == "Ideas"


def test_blank_column_title_is_rejected(admin: TestClient, board_id: int) -> None:
    response = admin.patch(
        f"/api/boards/{board_id}/columns/col-backlog", json={"title": "   "}
    )

    assert response.status_code == 422
    assert titles(admin.get(f"/api/boards/{board_id}").json())[0] == "Backlog"


def test_column_title_length_limit_is_enforced(admin: TestClient, board_id: int) -> None:
    response = admin.patch(
        f"/api/boards/{board_id}/columns/col-backlog", json={"title": "x" * 101}
    )

    assert response.status_code == 422


def test_unknown_column_is_a_404(admin: TestClient, board_id: int) -> None:
    response = admin.patch(
        f"/api/boards/{board_id}/columns/col-missing", json={"title": "Ideas"}
    )

    assert response.status_code == 404


def test_column_can_be_added(admin: TestClient, board_id: int) -> None:
    response = admin.post(f"/api/boards/{board_id}/columns", json={"title": "Blocked"})

    assert response.status_code == 200
    assert titles(response.json())[-1] == "Blocked"


def test_column_count_is_capped(admin: TestClient, board_id: int) -> None:
    for index in range(7):
        assert (
            admin.post(
                f"/api/boards/{board_id}/columns", json={"title": f"Extra {index}"}
            ).status_code
            == 200
        )

    response = admin.post(f"/api/boards/{board_id}/columns", json={"title": "Too many"})

    assert response.status_code == 422


def test_columns_can_be_reordered(admin: TestClient, board_id: int) -> None:
    response = admin.post(
        f"/api/boards/{board_id}/columns/col-done/move", json={"position": 0}
    )

    assert response.status_code == 200
    assert titles(response.json()) == [
        "Done",
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
    ]


def test_reordering_past_the_end_clamps(admin: TestClient, board_id: int) -> None:
    response = admin.post(
        f"/api/boards/{board_id}/columns/col-backlog/move", json={"position": 99}
    )

    assert titles(response.json())[-1] == "Backlog"


def test_empty_column_can_be_deleted(admin: TestClient, board_id: int) -> None:
    added = admin.post(
        f"/api/boards/{board_id}/columns", json={"title": "Blocked"}
    ).json()
    column_id = added["columns"][-1]["id"]

    response = admin.delete(f"/api/boards/{board_id}/columns/{column_id}")

    assert response.status_code == 200
    assert titles(response.json()) == [
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]
    # Deleting one column leaves the other columns' cards untouched.
    assert response.json()["columns"][0]["cardIds"] != []


def test_deleting_a_column_with_cards_requires_a_destination(
    admin: TestClient, board_id: int
) -> None:
    response = admin.delete(f"/api/boards/{board_id}/columns/col-backlog")

    assert response.status_code == 422
    assert "Backlog" in titles(admin.get(f"/api/boards/{board_id}").json())


def test_deleting_a_column_moves_its_cards(admin: TestClient, board_id: int) -> None:
    before = admin.get(f"/api/boards/{board_id}").json()
    backlog_ids = before["columns"][0]["cardIds"]
    review_ids = before["columns"][3]["cardIds"]

    response = admin.delete(
        f"/api/boards/{board_id}/columns/col-backlog",
        params={"moveCardsTo": "col-review"},
    )

    assert response.status_code == 200
    board = response.json()
    assert titles(board)[0] == "Discovery"
    assert board["columns"][2]["cardIds"] == review_ids + backlog_ids


def test_cards_cannot_be_moved_into_the_deleted_column(
    admin: TestClient, board_id: int
) -> None:
    response = admin.delete(
        f"/api/boards/{board_id}/columns/col-backlog",
        params={"moveCardsTo": "col-backlog"},
    )

    assert response.status_code == 422


def test_the_last_column_cannot_be_deleted(admin: TestClient, board_id: int) -> None:
    board = admin.get(f"/api/boards/{board_id}").json()
    for column in board["columns"][1:]:
        admin.delete(
            f"/api/boards/{board_id}/columns/{column['id']}",
            params={"moveCardsTo": "col-backlog"},
        )

    response = admin.delete(
        f"/api/boards/{board_id}/columns/col-backlog",
        params={"moveCardsTo": "col-backlog"},
    )

    assert response.status_code == 422
    assert len(admin.get(f"/api/boards/{board_id}").json()["columns"]) == 1


def test_wip_limit_can_be_set_and_cleared(admin: TestClient, board_id: int) -> None:
    limited = admin.patch(
        f"/api/boards/{board_id}/columns/col-progress", json={"wipLimit": 3}
    )
    assert limited.json()["columns"][2]["wipLimit"] == 3

    renamed = admin.patch(
        f"/api/boards/{board_id}/columns/col-progress", json={"title": "Doing"}
    )
    assert renamed.json()["columns"][2]["wipLimit"] == 3

    cleared = admin.patch(
        f"/api/boards/{board_id}/columns/col-progress", json={"wipLimit": None}
    )
    assert cleared.json()["columns"][2]["wipLimit"] is None


def test_a_new_column_can_carry_a_wip_limit(admin: TestClient, board_id: int) -> None:
    response = admin.post(
        f"/api/boards/{board_id}/columns", json={"title": "Blocked", "wipLimit": 2}
    )

    assert response.json()["columns"][-1]["wipLimit"] == 2


def test_invalid_wip_limit_is_rejected(admin: TestClient, board_id: int) -> None:
    response = admin.patch(
        f"/api/boards/{board_id}/columns/col-progress", json={"wipLimit": 0}
    )

    assert response.status_code == 422
