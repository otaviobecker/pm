"""Board lifecycle, isolation between accounts, and membership roles."""

from fastapi.testclient import TestClient

from app import database
from tests.conftest import only_board_id, register


def create_board(client: TestClient, name: str = "Launch plan") -> dict:
    response = client.post("/api/boards", json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


def test_boards_require_authentication(client: TestClient) -> None:
    assert client.get("/api/boards").status_code == 401
    assert client.post("/api/boards", json={"name": "x"}).status_code == 401


def test_new_account_starts_with_one_seeded_board(admin: TestClient) -> None:
    boards = admin.get("/api/boards").json()

    assert len(boards) == 1
    assert boards[0]["name"] == database.SEED_BOARD_NAME
    assert boards[0]["role"] == "owner"
    assert boards[0]["cardCount"] == len(database.SEED_CARDS)
    assert boards[0]["memberCount"] == 1


def test_board_contains_the_default_columns(admin: TestClient, board_id: int) -> None:
    board = admin.get(f"/api/boards/{board_id}").json()

    assert [column["id"] for column in board["columns"]] == [
        column_id for column_id, _ in database.DEFAULT_COLUMNS
    ]
    assert board["role"] == "owner"
    assert len(board["cards"]) == len(database.SEED_CARDS)


def test_a_user_can_own_several_boards(admin: TestClient) -> None:
    created = create_board(admin, "Roadmap")

    boards = admin.get("/api/boards").json()

    assert len(boards) == 2
    assert created["name"] == "Roadmap"
    assert created["cards"] == {}
    assert len(created["columns"]) == len(database.DEFAULT_COLUMNS)


def test_new_boards_are_independent(admin: TestClient, board_id: int) -> None:
    other = create_board(admin, "Roadmap")
    admin.post(
        f"/api/boards/{other['id']}/cards",
        json={"columnId": other["columns"][0]["id"], "title": "Only here"},
    )

    first = admin.get(f"/api/boards/{board_id}").json()

    assert all(card["title"] != "Only here" for card in first["cards"].values())


def test_blank_board_name_is_rejected(admin: TestClient) -> None:
    assert admin.post("/api/boards", json={"name": "   "}).status_code == 422


def test_board_can_be_renamed_and_described(admin: TestClient, board_id: int) -> None:
    response = admin.patch(
        f"/api/boards/{board_id}",
        json={"name": "Q3 delivery", "description": "Everything shipping this quarter"},
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Q3 delivery"
    assert admin.get(f"/api/boards/{board_id}").json()["description"] == (
        "Everything shipping this quarter"
    )


def test_archived_boards_are_hidden_unless_requested(
    admin: TestClient, board_id: int
) -> None:
    admin.patch(f"/api/boards/{board_id}", json={"archived": True})

    assert admin.get("/api/boards").json() == []
    archived = admin.get("/api/boards", params={"includeArchived": True}).json()
    assert [board["id"] for board in archived] == [board_id]
    assert admin.get(f"/api/boards/{board_id}").status_code == 200


def test_board_can_be_deleted(admin: TestClient, board_id: int) -> None:
    response = admin.delete(f"/api/boards/{board_id}")

    assert response.status_code == 204
    assert admin.get("/api/boards").json() == []
    assert admin.get(f"/api/boards/{board_id}").status_code == 404


def test_boards_are_invisible_to_other_accounts(
    admin: TestClient, board_id: int, make_client
) -> None:
    stranger = make_client()
    register(stranger, "stranger")

    assert board_id not in [board["id"] for board in stranger.get("/api/boards").json()]
    assert stranger.get(f"/api/boards/{board_id}").status_code == 404
    assert stranger.delete(f"/api/boards/{board_id}").status_code == 404
    assert (
        stranger.post(
            f"/api/boards/{board_id}/cards",
            json={"columnId": "col-backlog", "title": "Sneaky"},
        ).status_code
        == 404
    )


def test_unknown_board_is_a_404(admin: TestClient) -> None:
    assert admin.get("/api/boards/9999").status_code == 404


def test_owner_can_share_a_board_with_an_editor(
    admin: TestClient, board_id: int, make_client
) -> None:
    collaborator = make_client()
    register(collaborator, "casey")

    response = admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "editor"}
    )

    assert response.status_code == 200
    assert [member["username"] for member in response.json()["members"]] == [
        "user",
        "casey",
    ]
    shared = collaborator.get(f"/api/boards/{board_id}")
    assert shared.status_code == 200
    assert shared.json()["role"] == "editor"
    assert board_id in [board["id"] for board in collaborator.get("/api/boards").json()]


def test_viewers_can_read_but_not_change_a_board(
    admin: TestClient, board_id: int, make_client
) -> None:
    viewer = make_client()
    register(viewer, "casey")
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "viewer"}
    )

    assert viewer.get(f"/api/boards/{board_id}").status_code == 200
    assert (
        viewer.post(
            f"/api/boards/{board_id}/cards",
            json={"columnId": "col-backlog", "title": "Nope"},
        ).status_code
        == 403
    )
    assert (
        viewer.patch(f"/api/boards/{board_id}", json={"name": "Nope"}).status_code == 403
    )


def test_editors_cannot_archive_or_delete_a_board(
    admin: TestClient, board_id: int, make_client
) -> None:
    editor = make_client()
    register(editor, "casey")
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "editor"}
    )

    assert (
        editor.patch(f"/api/boards/{board_id}", json={"archived": True}).status_code
        == 403
    )
    assert editor.delete(f"/api/boards/{board_id}").status_code == 403
    assert (
        editor.post(
            f"/api/boards/{board_id}/members",
            json={"username": "user", "role": "viewer"},
        ).status_code
        == 403
    )


def test_member_role_can_be_changed(
    admin: TestClient, board_id: int, make_client
) -> None:
    member = make_client()
    created = register(member, "casey")
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "viewer"}
    )

    response = admin.patch(
        f"/api/boards/{board_id}/members/{created['id']}", json={"role": "editor"}
    )

    assert response.status_code == 200
    assert (
        member.post(
            f"/api/boards/{board_id}/cards",
            json={"columnId": "col-backlog", "title": "Allowed now"},
        ).status_code
        == 200
    )


def test_owner_can_remove_a_member(
    admin: TestClient, board_id: int, make_client
) -> None:
    member = make_client()
    created = register(member, "casey")
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "editor"}
    )

    response = admin.delete(f"/api/boards/{board_id}/members/{created['id']}")

    assert response.status_code == 204
    assert member.get(f"/api/boards/{board_id}").status_code == 404


def test_a_member_can_leave_a_board(
    admin: TestClient, board_id: int, make_client
) -> None:
    member = make_client()
    created = register(member, "casey")
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "editor"}
    )

    response = member.delete(f"/api/boards/{board_id}/members/{created['id']}")

    assert response.status_code == 204
    assert member.get(f"/api/boards/{board_id}").status_code == 404
    assert admin.get(f"/api/boards/{board_id}").status_code == 200


def test_the_owner_cannot_be_removed_or_demoted(admin: TestClient, board_id: int) -> None:
    owner_id = admin.get("/api/auth/session").json()["id"]

    assert admin.delete(f"/api/boards/{board_id}/members/{owner_id}").status_code == 422
    assert (
        admin.patch(
            f"/api/boards/{board_id}/members/{owner_id}", json={"role": "viewer"}
        ).status_code
        == 422
    )


def test_adding_an_unknown_or_duplicate_member_is_rejected(
    admin: TestClient, board_id: int, make_client
) -> None:
    register(make_client(), "casey")
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "editor"}
    )

    unknown = admin.post(
        f"/api/boards/{board_id}/members", json={"username": "ghost", "role": "editor"}
    )
    duplicate = admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "viewer"}
    )
    owner_role = admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "owner"}
    )

    assert unknown.status_code == 404
    assert duplicate.status_code == 409
    assert owner_role.status_code == 422


def test_deleting_a_shared_board_removes_it_for_everyone(
    admin: TestClient, board_id: int, make_client
) -> None:
    member = make_client()
    register(member, "casey")
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "editor"}
    )

    admin.delete(f"/api/boards/{board_id}")

    assert member.get(f"/api/boards/{board_id}").status_code == 404
    assert only_board_id(member) != board_id
