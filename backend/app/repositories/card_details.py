"""The expanded view of one card: its comments and its checklist.

Mutations here return both the refreshed card and the refreshed board, because a
comment or a checklist tick changes the rollups shown on the board behind the
card's detail view.
"""

import sqlite3
from contextlib import closing
from typing import Any

from app.database import connect, now, transaction
from app.errors import NotFoundError, PermissionDeniedError
from app.repositories import boards, cards, labels

# Checklist positions are rewritten through this range so the (card_id, position)
# unique index never sees a collision mid-update.
STAGING_OFFSET = 1_000_000


def read_comments(connection: sqlite3.Connection, card_id: str) -> list[dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT card_comments.id, card_comments.body, card_comments.author_id,
               card_comments.created_at, card_comments.updated_at,
               users.username, users.display_name
        FROM card_comments
        LEFT JOIN users ON users.id = card_comments.author_id
        WHERE card_comments.card_id = ?
        ORDER BY card_comments.id
        """,
        (card_id,),
    ).fetchall()
    return [
        {
            "id": row["id"],
            "body": row["body"],
            "authorId": row["author_id"],
            "authorName": row["display_name"] or row["username"] or "Deleted account",
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }
        for row in rows
    ]


def read_checklist(connection: sqlite3.Connection, card_id: str) -> list[dict[str, Any]]:
    rows = connection.execute(
        "SELECT id, title, done FROM checklist_items WHERE card_id = ? ORDER BY position",
        (card_id,),
    ).fetchall()
    return [
        {"id": row["id"], "title": row["title"], "done": bool(row["done"])}
        for row in rows
    ]


def read(connection: sqlite3.Connection, board_id: int, card_id: str) -> dict[str, Any]:
    row = connection.execute(
        f"SELECT {boards.CARD_COLUMNS} FROM cards WHERE cards.board_id = ? AND cards.id = ?",
        (board_id, card_id),
    ).fetchone()
    if row is None:
        raise NotFoundError("Card not found")
    label_ids = boards.read_card_labels(connection, board_id).get(card_id, [])
    detail = boards.serialize_card(row, label_ids)
    detail["boardId"] = board_id
    detail["columnId"] = row["column_id"]
    detail["comments"] = read_comments(connection, card_id)
    detail["checklist"] = read_checklist(connection, card_id)
    return detail


def get(user_id: int, board_id: int, card_id: str) -> dict[str, Any]:
    with closing(connect()) as connection:
        boards.require_access(connection, user_id, board_id)
        return read(connection, board_id, card_id)


def result(
    connection: sqlite3.Connection, board_id: int, card_id: str, role: str
) -> dict[str, Any]:
    return {
        "card": read(connection, board_id, card_id),
        "board": boards.read(connection, board_id, role),
    }


def set_labels(
    user_id: int, board_id: int, card_id: str, label_ids: list[str]
) -> dict[str, Any]:
    with transaction() as connection:
        role = boards.require_access(connection, user_id, board_id, minimum="editor")
        cards.require_card(connection, board_id, card_id)
        labels.set_for_card(connection, board_id, card_id, label_ids)
        boards.touch(connection, board_id)
        return result(connection, board_id, card_id, role)


def require_comment(
    connection: sqlite3.Connection, card_id: str, comment_id: int
) -> sqlite3.Row:
    row = connection.execute(
        "SELECT id, author_id FROM card_comments WHERE card_id = ? AND id = ?",
        (card_id, comment_id),
    ).fetchone()
    if row is None:
        raise NotFoundError("Comment not found")
    return row


def add_comment(
    user_id: int, board_id: int, card_id: str, body: str
) -> dict[str, Any]:
    """Any board member may comment, including viewers."""
    with transaction() as connection:
        role = boards.require_access(connection, user_id, board_id)
        cards.require_card(connection, board_id, card_id)
        timestamp = now()
        connection.execute(
            """
            INSERT INTO card_comments (card_id, author_id, body, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (card_id, user_id, body.strip(), timestamp, timestamp),
        )
        return result(connection, board_id, card_id, role)


def edit_comment(
    user_id: int, board_id: int, card_id: str, comment_id: int, body: str
) -> dict[str, Any]:
    with transaction() as connection:
        role = boards.require_access(connection, user_id, board_id)
        cards.require_card(connection, board_id, card_id)
        comment = require_comment(connection, card_id, comment_id)
        if comment["author_id"] != user_id:
            raise PermissionDeniedError("Only the author can edit a comment")
        connection.execute(
            "UPDATE card_comments SET body = ?, updated_at = ? WHERE id = ?",
            (body.strip(), now(), comment_id),
        )
        return result(connection, board_id, card_id, role)


def delete_comment(
    user_id: int, board_id: int, card_id: str, comment_id: int
) -> dict[str, Any]:
    """The author may delete their own comment; the board owner may delete any."""
    with transaction() as connection:
        role = boards.require_access(connection, user_id, board_id)
        cards.require_card(connection, board_id, card_id)
        comment = require_comment(connection, card_id, comment_id)
        if comment["author_id"] != user_id and role != "owner":
            raise PermissionDeniedError(
                "Only the author or the board owner can delete a comment"
            )
        connection.execute("DELETE FROM card_comments WHERE id = ?", (comment_id,))
        return result(connection, board_id, card_id, role)


def checklist_ids(connection: sqlite3.Connection, card_id: str) -> list[int]:
    return [
        row["id"]
        for row in connection.execute(
            "SELECT id FROM checklist_items WHERE card_id = ? ORDER BY position",
            (card_id,),
        )
    ]


def set_checklist_positions(
    connection: sqlite3.Connection, card_id: str, item_ids: list[int]
) -> None:
    for index, item_id in enumerate(item_ids):
        connection.execute(
            "UPDATE checklist_items SET position = ? WHERE card_id = ? AND id = ?",
            (STAGING_OFFSET + index, card_id, item_id),
        )
    for index, item_id in enumerate(item_ids):
        connection.execute(
            "UPDATE checklist_items SET position = ? WHERE card_id = ? AND id = ?",
            (index, card_id, item_id),
        )


def require_checklist_item(
    connection: sqlite3.Connection, card_id: str, item_id: int
) -> sqlite3.Row:
    row = connection.execute(
        "SELECT id, title, done FROM checklist_items WHERE card_id = ? AND id = ?",
        (card_id, item_id),
    ).fetchone()
    if row is None:
        raise NotFoundError("Checklist item not found")
    return row


def add_checklist_item(
    user_id: int, board_id: int, card_id: str, title: str
) -> dict[str, Any]:
    with transaction() as connection:
        role = boards.require_access(connection, user_id, board_id, minimum="editor")
        cards.require_card(connection, board_id, card_id)
        position = len(checklist_ids(connection, card_id))
        connection.execute(
            """
            INSERT INTO checklist_items (card_id, title, done, position, created_at)
            VALUES (?, ?, 0, ?, ?)
            """,
            (card_id, title.strip(), position, now()),
        )
        boards.touch(connection, board_id)
        return result(connection, board_id, card_id, role)


def update_checklist_item(
    user_id: int,
    board_id: int,
    card_id: str,
    item_id: int,
    *,
    title: str | None = None,
    done: bool | None = None,
) -> dict[str, Any]:
    with transaction() as connection:
        role = boards.require_access(connection, user_id, board_id, minimum="editor")
        cards.require_card(connection, board_id, card_id)
        current = require_checklist_item(connection, card_id, item_id)
        connection.execute(
            "UPDATE checklist_items SET title = ?, done = ? WHERE card_id = ? AND id = ?",
            (
                (title if title is not None else current["title"]).strip(),
                int(done if done is not None else bool(current["done"])),
                card_id,
                item_id,
            ),
        )
        boards.touch(connection, board_id)
        return result(connection, board_id, card_id, role)


def move_checklist_item(
    user_id: int, board_id: int, card_id: str, item_id: int, position: int
) -> dict[str, Any]:
    with transaction() as connection:
        role = boards.require_access(connection, user_id, board_id, minimum="editor")
        cards.require_card(connection, board_id, card_id)
        require_checklist_item(connection, card_id, item_id)
        order = checklist_ids(connection, card_id)
        order.remove(item_id)
        order.insert(max(0, min(position, len(order))), item_id)
        set_checklist_positions(connection, card_id, order)
        boards.touch(connection, board_id)
        return result(connection, board_id, card_id, role)


def delete_checklist_item(
    user_id: int, board_id: int, card_id: str, item_id: int
) -> dict[str, Any]:
    with transaction() as connection:
        role = boards.require_access(connection, user_id, board_id, minimum="editor")
        cards.require_card(connection, board_id, card_id)
        require_checklist_item(connection, card_id, item_id)
        connection.execute(
            "DELETE FROM checklist_items WHERE card_id = ? AND id = ?",
            (card_id, item_id),
        )
        set_checklist_positions(connection, card_id, checklist_ids(connection, card_id))
        boards.touch(connection, board_id)
        return result(connection, board_id, card_id, role)
