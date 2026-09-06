"""Board labels, and the labels, comments, and checklist on one card."""

from contextlib import closing

from fastapi.testclient import TestClient

from app import database
from tests.conftest import register


def board_of(client: TestClient, board_id: int) -> dict:
    return client.get(f"/api/boards/{board_id}").json()


def first_card_id(client: TestClient, board_id: int) -> str:
    return board_of(client, board_id)["columns"][0]["cardIds"][0]


def detail(client: TestClient, board_id: int, card_id: str) -> dict:
    response = client.get(f"/api/boards/{board_id}/cards/{card_id}")
    assert response.status_code == 200, response.text
    return response.json()


def test_a_board_starts_with_the_default_labels(admin: TestClient, board_id: int) -> None:
    labels = board_of(admin, board_id)["labels"]

    assert [label["name"] for label in labels] == [
        name for _, name, _ in database.DEFAULT_LABELS
    ]
    assert {label["color"] for label in labels} <= set(database.LABEL_COLORS)


def test_a_new_board_gets_its_own_labels(admin: TestClient) -> None:
    created = admin.post("/api/boards", json={"name": "Roadmap"}).json()

    assert len(created["labels"]) == len(database.DEFAULT_LABELS)


def test_labels_can_be_created_renamed_and_deleted(
    admin: TestClient, board_id: int
) -> None:
    created = admin.post(
        f"/api/boards/{board_id}/labels", json={"name": "Blocked", "color": "navy"}
    )
    assert created.status_code == 200
    label = created.json()["labels"][-1]
    assert (label["name"], label["color"]) == ("Blocked", "navy")

    renamed = admin.patch(
        f"/api/boards/{board_id}/labels/{label['id']}",
        json={"name": "On hold", "color": "yellow"},
    ).json()
    assert renamed["labels"][-1] == {
        "id": label["id"],
        "name": "On hold",
        "color": "yellow",
    }

    deleted = admin.delete(f"/api/boards/{board_id}/labels/{label['id']}").json()
    assert label["id"] not in [item["id"] for item in deleted["labels"]]


def test_label_validation(admin: TestClient, board_id: int) -> None:
    blank = admin.post(f"/api/boards/{board_id}/labels", json={"name": "   "})
    bad_color = admin.post(
        f"/api/boards/{board_id}/labels", json={"name": "Nope", "color": "chartreuse"}
    )
    missing = admin.patch(
        f"/api/boards/{board_id}/labels/label-missing", json={"name": "Nope"}
    )

    assert blank.status_code == 422
    assert bad_color.status_code == 422
    assert missing.status_code == 404


def test_the_label_count_is_capped(admin: TestClient, board_id: int) -> None:
    for index in range(16):
        assert (
            admin.post(
                f"/api/boards/{board_id}/labels", json={"name": f"Extra {index}"}
            ).status_code
            == 200
        )

    response = admin.post(f"/api/boards/{board_id}/labels", json={"name": "Too many"})

    assert response.status_code == 422


def test_labels_can_be_attached_to_a_card(admin: TestClient, board_id: int) -> None:
    card_id = first_card_id(admin, board_id)
    labels = board_of(admin, board_id)["labels"]

    response = admin.put(
        f"/api/boards/{board_id}/cards/{card_id}/labels",
        json={"labelIds": [labels[1]["id"], labels[0]["id"]]},
    )

    assert response.status_code == 200
    body = response.json()
    # Ordering follows the board's label order, not the request order.
    assert body["card"]["labelIds"] == [labels[0]["id"], labels[1]["id"]]
    assert body["board"]["cards"][card_id]["labelIds"] == [
        labels[0]["id"],
        labels[1]["id"],
    ]


def test_duplicate_label_ids_are_collapsed(admin: TestClient, board_id: int) -> None:
    card_id = first_card_id(admin, board_id)
    label_id = board_of(admin, board_id)["labels"][0]["id"]

    response = admin.put(
        f"/api/boards/{board_id}/cards/{card_id}/labels",
        json={"labelIds": [label_id, label_id]},
    )

    assert response.json()["card"]["labelIds"] == [label_id]


def test_an_unknown_label_cannot_be_attached(admin: TestClient, board_id: int) -> None:
    card_id = first_card_id(admin, board_id)

    response = admin.put(
        f"/api/boards/{board_id}/cards/{card_id}/labels",
        json={"labelIds": ["label-missing"]},
    )

    assert response.status_code == 404
    assert detail(admin, board_id, card_id)["labelIds"] == []


def test_a_label_from_another_board_cannot_be_attached(
    admin: TestClient, board_id: int
) -> None:
    other = admin.post("/api/boards", json={"name": "Roadmap"}).json()
    foreign_label = admin.post(
        f"/api/boards/{other['id']}/labels", json={"name": "Foreign"}
    ).json()["labels"][-1]
    card_id = first_card_id(admin, board_id)

    response = admin.put(
        f"/api/boards/{board_id}/cards/{card_id}/labels",
        json={"labelIds": [foreign_label["id"]]},
    )

    assert response.status_code == 404


def test_deleting_a_label_detaches_it_from_cards(
    admin: TestClient, board_id: int
) -> None:
    card_id = first_card_id(admin, board_id)
    label_id = board_of(admin, board_id)["labels"][0]["id"]
    admin.put(
        f"/api/boards/{board_id}/cards/{card_id}/labels",
        json={"labelIds": [label_id]},
    )

    admin.delete(f"/api/boards/{board_id}/labels/{label_id}")

    assert board_of(admin, board_id)["cards"][card_id]["labelIds"] == []


def test_a_card_can_be_created_with_labels(admin: TestClient, board_id: int) -> None:
    label_id = board_of(admin, board_id)["labels"][0]["id"]

    created = admin.post(
        f"/api/boards/{board_id}/cards",
        json={"columnId": "col-backlog", "title": "Tagged", "labelIds": [label_id]},
    ).json()
    card_id = created["columns"][0]["cardIds"][-1]

    assert created["cards"][card_id]["labelIds"] == [label_id]


def test_viewers_cannot_manage_labels(
    admin: TestClient, board_id: int, make_client
) -> None:
    viewer = make_client()
    register(viewer, "casey")
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "viewer"}
    )
    card_id = first_card_id(admin, board_id)
    label_id = board_of(admin, board_id)["labels"][0]["id"]

    assert (
        viewer.post(f"/api/boards/{board_id}/labels", json={"name": "Nope"}).status_code
        == 403
    )
    assert (
        viewer.delete(f"/api/boards/{board_id}/labels/{label_id}").status_code == 403
    )
    assert (
        viewer.put(
            f"/api/boards/{board_id}/cards/{card_id}/labels",
            json={"labelIds": [label_id]},
        ).status_code
        == 403
    )


def test_comments_can_be_added_edited_and_deleted(
    admin: TestClient, board_id: int
) -> None:
    card_id = first_card_id(admin, board_id)

    added = admin.post(
        f"/api/boards/{board_id}/cards/{card_id}/comments",
        json={"body": "  Looks good to me  "},
    )
    assert added.status_code == 200
    comment = added.json()["card"]["comments"][0]
    assert comment["body"] == "Looks good to me"
    assert comment["authorName"] == "Workspace Admin"
    assert added.json()["board"]["cards"][card_id]["commentCount"] == 1

    edited = admin.patch(
        f"/api/boards/{board_id}/cards/{card_id}/comments/{comment['id']}",
        json={"body": "Changed my mind"},
    ).json()
    assert edited["card"]["comments"][0]["body"] == "Changed my mind"

    removed = admin.delete(
        f"/api/boards/{board_id}/cards/{card_id}/comments/{comment['id']}"
    ).json()
    assert removed["card"]["comments"] == []
    assert removed["board"]["cards"][card_id]["commentCount"] == 0


def test_comments_keep_their_order(admin: TestClient, board_id: int) -> None:
    card_id = first_card_id(admin, board_id)
    for body in ["First", "Second", "Third"]:
        admin.post(
            f"/api/boards/{board_id}/cards/{card_id}/comments", json={"body": body}
        )

    bodies = [item["body"] for item in detail(admin, board_id, card_id)["comments"]]

    assert bodies == ["First", "Second", "Third"]


def test_a_blank_or_oversized_comment_is_rejected(
    admin: TestClient, board_id: int
) -> None:
    card_id = first_card_id(admin, board_id)

    blank = admin.post(
        f"/api/boards/{board_id}/cards/{card_id}/comments", json={"body": "   "}
    )
    huge = admin.post(
        f"/api/boards/{board_id}/cards/{card_id}/comments", json={"body": "x" * 5001}
    )

    assert blank.status_code == 422
    assert huge.status_code == 422


def test_viewers_may_comment_but_not_edit_someone_elses(
    admin: TestClient, board_id: int, make_client
) -> None:
    viewer = make_client()
    register(viewer, "casey", displayName="Casey Jones")
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "viewer"}
    )
    card_id = first_card_id(admin, board_id)

    posted = viewer.post(
        f"/api/boards/{board_id}/cards/{card_id}/comments", json={"body": "A question"}
    )
    assert posted.status_code == 200
    comment = posted.json()["card"]["comments"][0]
    assert comment["authorName"] == "Casey Jones"

    assert (
        admin.patch(
            f"/api/boards/{board_id}/cards/{card_id}/comments/{comment['id']}",
            json={"body": "Rewritten"},
        ).status_code
        == 403
    )


def test_the_board_owner_can_remove_any_comment(
    admin: TestClient, board_id: int, make_client
) -> None:
    member = make_client()
    register(member, "casey")
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "editor"}
    )
    card_id = first_card_id(admin, board_id)
    comment = member.post(
        f"/api/boards/{board_id}/cards/{card_id}/comments", json={"body": "Mine"}
    ).json()["card"]["comments"][0]

    response = admin.delete(
        f"/api/boards/{board_id}/cards/{card_id}/comments/{comment['id']}"
    )

    assert response.status_code == 200
    assert response.json()["card"]["comments"] == []


def test_an_editor_cannot_remove_another_members_comment(
    admin: TestClient, board_id: int, make_client
) -> None:
    editor = make_client()
    register(editor, "casey")
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "editor"}
    )
    card_id = first_card_id(admin, board_id)
    comment = admin.post(
        f"/api/boards/{board_id}/cards/{card_id}/comments", json={"body": "Owner note"}
    ).json()["card"]["comments"][0]

    response = editor.delete(
        f"/api/boards/{board_id}/cards/{card_id}/comments/{comment['id']}"
    )

    assert response.status_code == 403


def test_an_unknown_comment_is_a_404(admin: TestClient, board_id: int) -> None:
    card_id = first_card_id(admin, board_id)

    assert (
        admin.patch(
            f"/api/boards/{board_id}/cards/{card_id}/comments/999",
            json={"body": "Nope"},
        ).status_code
        == 404
    )
    assert (
        admin.delete(
            f"/api/boards/{board_id}/cards/{card_id}/comments/999"
        ).status_code
        == 404
    )


def test_deleting_a_card_removes_its_comments(admin: TestClient, board_id: int) -> None:
    card_id = first_card_id(admin, board_id)
    admin.post(
        f"/api/boards/{board_id}/cards/{card_id}/comments", json={"body": "Goodbye"}
    )

    admin.delete(f"/api/boards/{board_id}/cards/{card_id}")

    with closing(database.connect()) as connection:
        assert connection.execute("SELECT count(*) FROM card_comments").fetchone()[0] == 0


def test_a_checklist_tracks_progress(admin: TestClient, board_id: int) -> None:
    card_id = first_card_id(admin, board_id)

    for title in ["Draft", "Review", "Ship"]:
        response = admin.post(
            f"/api/boards/{board_id}/cards/{card_id}/checklist", json={"title": title}
        )
        assert response.status_code == 200
    items = response.json()["card"]["checklist"]
    assert [item["title"] for item in items] == ["Draft", "Review", "Ship"]
    assert response.json()["board"]["cards"][card_id]["checklistTotal"] == 3

    ticked = admin.patch(
        f"/api/boards/{board_id}/cards/{card_id}/checklist/{items[0]['id']}",
        json={"done": True},
    ).json()
    assert ticked["card"]["checklist"][0]["done"] is True
    assert ticked["board"]["cards"][card_id]["checklistDone"] == 1

    renamed = admin.patch(
        f"/api/boards/{board_id}/cards/{card_id}/checklist/{items[1]['id']}",
        json={"title": "Peer review"},
    ).json()
    assert renamed["card"]["checklist"][1]["title"] == "Peer review"
    # Renaming leaves the completion flag alone.
    assert renamed["card"]["checklist"][0]["done"] is True


def test_checklist_items_can_be_reordered_and_removed(
    admin: TestClient, board_id: int
) -> None:
    card_id = first_card_id(admin, board_id)
    ids = []
    for title in ["One", "Two", "Three"]:
        body = admin.post(
            f"/api/boards/{board_id}/cards/{card_id}/checklist", json={"title": title}
        ).json()
        ids = [item["id"] for item in body["card"]["checklist"]]

    moved = admin.post(
        f"/api/boards/{board_id}/cards/{card_id}/checklist/{ids[2]}/move",
        json={"position": 0},
    ).json()
    assert [item["title"] for item in moved["card"]["checklist"]] == [
        "Three",
        "One",
        "Two",
    ]

    removed = admin.delete(
        f"/api/boards/{board_id}/cards/{card_id}/checklist/{ids[0]}"
    ).json()
    assert [item["title"] for item in removed["card"]["checklist"]] == ["Three", "Two"]

    with closing(database.connect()) as connection:
        positions = [
            row["position"]
            for row in connection.execute(
                "SELECT position FROM checklist_items WHERE card_id = ? ORDER BY position",
                (card_id,),
            )
        ]
    assert positions == [0, 1]


def test_moving_a_checklist_item_past_the_end_clamps(
    admin: TestClient, board_id: int
) -> None:
    card_id = first_card_id(admin, board_id)
    for title in ["One", "Two"]:
        body = admin.post(
            f"/api/boards/{board_id}/cards/{card_id}/checklist", json={"title": title}
        ).json()
    first = body["card"]["checklist"][0]["id"]

    moved = admin.post(
        f"/api/boards/{board_id}/cards/{card_id}/checklist/{first}/move",
        json={"position": 99},
    ).json()

    assert [item["title"] for item in moved["card"]["checklist"]] == ["Two", "One"]


def test_checklist_validation(admin: TestClient, board_id: int) -> None:
    card_id = first_card_id(admin, board_id)

    blank = admin.post(
        f"/api/boards/{board_id}/cards/{card_id}/checklist", json={"title": "  "}
    )
    missing = admin.patch(
        f"/api/boards/{board_id}/cards/{card_id}/checklist/999", json={"done": True}
    )
    gone = admin.delete(f"/api/boards/{board_id}/cards/{card_id}/checklist/999")

    assert blank.status_code == 422
    assert missing.status_code == 404
    assert gone.status_code == 404


def test_viewers_cannot_change_a_checklist(
    admin: TestClient, board_id: int, make_client
) -> None:
    viewer = make_client()
    register(viewer, "casey")
    admin.post(
        f"/api/boards/{board_id}/members", json={"username": "casey", "role": "viewer"}
    )
    card_id = first_card_id(admin, board_id)

    response = viewer.post(
        f"/api/boards/{board_id}/cards/{card_id}/checklist", json={"title": "Nope"}
    )

    assert response.status_code == 403


def test_card_detail_requires_board_access(
    admin: TestClient, board_id: int, make_client
) -> None:
    stranger = make_client()
    register(stranger, "stranger")
    card_id = first_card_id(admin, board_id)

    assert (
        stranger.get(f"/api/boards/{board_id}/cards/{card_id}").status_code == 404
    )


def test_an_unknown_card_detail_is_a_404(admin: TestClient, board_id: int) -> None:
    assert admin.get(f"/api/boards/{board_id}/cards/card-missing").status_code == 404


def test_card_detail_reports_its_column(admin: TestClient, board_id: int) -> None:
    card_id = first_card_id(admin, board_id)

    assert detail(admin, board_id, card_id)["columnId"] == "col-backlog"

    admin.post(
        f"/api/boards/{board_id}/cards/{card_id}/move",
        json={"columnId": "col-review", "position": 0},
    )

    assert detail(admin, board_id, card_id)["columnId"] == "col-review"
