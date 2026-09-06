"""Board labels and the labels attached to a card."""

import sqlite3
from secrets import token_urlsafe
from typing import Any

from app.database import transaction
from app.errors import InvalidRequestError, NotFoundError
from app.repositories import activity, boards

MAX_LABELS = 20
# Positions are rewritten through this range so the (board_id, position) unique
# index never sees a collision mid-update.
STAGING_OFFSET = 1_000_000


def require_label(
    connection: sqlite3.Connection, board_id: int, label_id: str
) -> sqlite3.Row:
    row = connection.execute(
        "SELECT id, name, color, position FROM labels WHERE board_id = ? AND id = ?",
        (board_id, label_id),
    ).fetchone()
    if row is None:
        raise NotFoundError("Label not found")
    return row


def ordered_ids(connection: sqlite3.Connection, board_id: int) -> list[str]:
    return [
        row["id"]
        for row in connection.execute(
            "SELECT id FROM labels WHERE board_id = ? ORDER BY position",
            (board_id,),
        )
    ]


def set_positions(
    connection: sqlite3.Connection, board_id: int, label_ids: list[str]
) -> None:
    for index, label_id in enumerate(label_ids):
        connection.execute(
            "UPDATE labels SET position = ? WHERE board_id = ? AND id = ?",
            (STAGING_OFFSET + index, board_id, label_id),
        )
    for index, label_id in enumerate(label_ids):
        connection.execute(
            "UPDATE labels SET position = ? WHERE board_id = ? AND id = ?",
            (index, board_id, label_id),
        )


def create(user_id: int, board_id: int, name: str, color: str) -> dict[str, Any]:
    with transaction() as connection:
        role = boards.require_access(connection, user_id, board_id, minimum="editor")
        existing = ordered_ids(connection, board_id)
        if len(existing) >= MAX_LABELS:
            raise InvalidRequestError(f"A board may have at most {MAX_LABELS} labels")
        connection.execute(
            "INSERT INTO labels (id, board_id, name, color, position) VALUES (?, ?, ?, ?, ?)",
            (f"label-{token_urlsafe(8)}", board_id, name.strip(), color, len(existing)),
        )
        activity.record(connection, board_id, user_id, "label.created", name.strip(), color)
        boards.touch(connection, board_id)
        return boards.read(connection, board_id, role)


def update(
    user_id: int,
    board_id: int,
    label_id: str,
    *,
    name: str | None = None,
    color: str | None = None,
) -> dict[str, Any]:
    with transaction() as connection:
        role = boards.require_access(connection, user_id, board_id, minimum="editor")
        current = require_label(connection, board_id, label_id)
        connection.execute(
            "UPDATE labels SET name = ?, color = ? WHERE board_id = ? AND id = ?",
            (
                (name if name is not None else current["name"]).strip(),
                color if color is not None else current["color"],
                board_id,
                label_id,
            ),
        )
        boards.touch(connection, board_id)
        return boards.read(connection, board_id, role)


def delete(user_id: int, board_id: int, label_id: str) -> dict[str, Any]:
    """Remove a label from the board and from every card carrying it."""
    with transaction() as connection:
        role = boards.require_access(connection, user_id, board_id, minimum="editor")
        label = require_label(connection, board_id, label_id)
        connection.execute(
            "DELETE FROM labels WHERE board_id = ? AND id = ?", (board_id, label_id)
        )
        remaining = ordered_ids(connection, board_id)
        set_positions(connection, board_id, remaining)
        activity.record(connection, board_id, user_id, "label.deleted", label["name"])
        boards.touch(connection, board_id)
        return boards.read(connection, board_id, role)


def set_for_card(
    connection: sqlite3.Connection,
    board_id: int,
    card_id: str,
    label_ids: list[str],
) -> None:
    """Replace a card's labels. Every ID must belong to the same board."""
    wanted = list(dict.fromkeys(label_ids))
    for label_id in wanted:
        require_label(connection, board_id, label_id)
    connection.execute("DELETE FROM card_labels WHERE card_id = ?", (card_id,))
    connection.executemany(
        "INSERT INTO card_labels (card_id, board_id, label_id) VALUES (?, ?, ?)",
        [(card_id, board_id, label_id) for label_id in wanted],
    )
