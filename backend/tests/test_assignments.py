"""The cross-board list of what one person is assigned."""

from fastapi.testclient import TestClient

from tests.conftest import register


def my_cards(client: TestClient) -> list[dict]:
    response = client.get("/api/users/me/cards")
    assert response.status_code == 200, response.text
    return response.json()


def assign(
    client: TestClient, board_id: int, column_id: str, title: str, **fields
) -> str:
    created = client.post(
        f"/api/boards/{board_id}/cards",
        json={"columnId": column_id, "title": title, **fields},
    )
    assert created.status_code == 200, created.text
    board = created.json()
    return next(
        card_id
        for card_id, card in board["cards"].items()
        if card["title"] == title
    )


def test_my_work_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/users/me/cards").status_code == 401


def test_nothing_is_assigned_on_a_fresh_board(admin: TestClient, board_id: int) -> None:
    assert my_cards(admin) == []


def test_assigned_cards_carry_their_board_and_column(
    admin: TestClient, board_id: int
) -> None:
    me = admin.get("/api/auth/session").json()["id"]
    assign(admin, board_id, "col-review", "Review the draft", assigneeId=me)

    assigned = my_cards(admin)

    assert len(assigned) == 1
    assert assigned[0]["title"] == "Review the draft"
    assert assigned[0]["boardId"] == board_id
    assert assigned[0]["boardName"] == "Kanban Studio"
    assert assigned[0]["columnTitle"] == "Review"


def test_cards_from_several_boards_appear_together(
    admin: TestClient, board_id: int
) -> None:
    me = admin.get("/api/auth/session").json()["id"]
    other = admin.post("/api/boards", json={"name": "Roadmap"}).json()
    assign(admin, board_id, "col-backlog", "On the studio board", assigneeId=me)
    assign(admin, other["id"], "col-backlog", "On the roadmap", assigneeId=me)

    titles = [card["title"] for card in my_cards(admin)]

    assert sorted(titles) == ["On the roadmap", "On the studio board"]


def test_due_cards_come_first_and_undated_ones_last(
    admin: TestClient, board_id: int
) -> None:
    me = admin.get("/api/auth/session").json()["id"]
    assign(admin, board_id, "col-backlog", "Someday", assigneeId=me)
    assign(
        admin, board_id, "col-backlog", "Later", assigneeId=me, dueDate="2027-01-01"
    )
    assign(
        admin, board_id, "col-backlog", "Sooner", assigneeId=me, dueDate="2026-01-01"
    )

    assert [card["title"] for card in my_cards(admin)] == [
        "Sooner",
        "Later",
        "Someday",
    ]


def test_someone_elses_cards_stay_out_of_my_list(
    admin: TestClient, board_id: int, make_client
) -> None:
    collaborator = make_client()
    member = register(collaborator, "casey")
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "editor"}
    )
    assign(admin, board_id, "col-backlog", "For Casey", assigneeId=member["id"])

    assert my_cards(admin) == []
    assert [card["title"] for card in my_cards(collaborator)] == ["For Casey"]


def test_archived_boards_drop_out_of_my_work(admin: TestClient, board_id: int) -> None:
    me = admin.get("/api/auth/session").json()["id"]
    assign(admin, board_id, "col-backlog", "Parked", assigneeId=me)

    admin.patch(f"/api/boards/{board_id}", json={"archived": True})

    assert my_cards(admin) == []


def test_losing_board_access_removes_its_cards(
    admin: TestClient, board_id: int, make_client
) -> None:
    collaborator = make_client()
    member = register(collaborator, "casey")
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "editor"}
    )
    assign(admin, board_id, "col-backlog", "For Casey", assigneeId=member["id"])
    assert len(my_cards(collaborator)) == 1

    admin.delete(f"/api/boards/{board_id}/members/{member['id']}")

    assert my_cards(collaborator) == []


def test_assigned_cards_carry_their_labels_and_rollups(
    admin: TestClient, board_id: int
) -> None:
    me = admin.get("/api/auth/session").json()["id"]
    label_id = admin.get(f"/api/boards/{board_id}").json()["labels"][0]["id"]
    card_id = assign(
        admin, board_id, "col-backlog", "Tagged and tracked", assigneeId=me
    )
    admin.put(
        f"/api/boards/{board_id}/cards/{card_id}/labels",
        json={"labelIds": [label_id]},
    )
    admin.post(
        f"/api/boards/{board_id}/cards/{card_id}/checklist", json={"title": "Step"}
    )
    admin.post(
        f"/api/boards/{board_id}/cards/{card_id}/comments", json={"body": "Note"}
    )

    card = my_cards(admin)[0]

    assert card["labelIds"] == [label_id]
    assert (card["checklistTotal"], card["commentCount"]) == (1, 1)


def test_unassigning_a_card_removes_it(admin: TestClient, board_id: int) -> None:
    me = admin.get("/api/auth/session").json()["id"]
    card_id = assign(admin, board_id, "col-backlog", "Mine for now", assigneeId=me)

    admin.patch(f"/api/boards/{board_id}/cards/{card_id}", json={"assigneeId": None})

    assert my_cards(admin) == []
