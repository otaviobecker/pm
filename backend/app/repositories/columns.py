"""Board columns: creation, renaming, WIP limits, reordering, and deletion."""

import sqlite3
from secrets import token_urlsafe
from typing import Any

from app.database import transaction
from app.errors import InvalidRequestError, NotFoundError
from app.repositories import boards

MAX_COLUMNS = 12
# Positions are rewritten through this range so the (board_id, position) unique
# index never sees a collision mid-update.
STAGING_OFFSET = 1_000_000


def require_column(
    connection: sqlite3.Connection, board_id: int, column_id: str
) -> sqlite3.Row:
    row = connection.execute(
        "SELECT id, title, position, wip_limit FROM columns WHERE board_id = ? AND id = ?",
        (board_id, column_id),
    ).fetchone()
    if row is None:
        raise NotFoundError("Column not found")
    return row


def ordered_ids(connection: sqlite3.Connection, board_id: int) -> list[str]:
    return [
        row["id"]
        for row in connection.execute(
            "SELECT id FROM columns WHERE board_id = ? ORDER BY position",
            (board_id,),
        )
    ]


def set_positions(
    connection: sqlite3.Connection, board_id: int, column_ids: list[str]
) -> None:
    for index, column_id in enumerate(column_ids):
        connection.execute(
            "UPDATE columns SET position = ? WHERE board_id = ? AND id = ?",
            (STAGING_OFFSET + index, board_id, column_id),
        )
    for index, column_id in enumerate(column_ids):
        connection.execute(
            "UPDATE columns SET position = ? WHERE board_id = ? AND id = ?",
            (index, board_id, column_id),
        )


def create(
    user_id: int,
    board_id: int,
    title: str,
    wip_limit: int | None = None,
) -> dict[str, Any]:
    with transaction() as connection:
        role = boards.require_access(connection, user_id, board_id, minimum="editor")
        existing = ordered_ids(connection, board_id)
        if len(existing) >= MAX_COLUMNS:
            raise InvalidRequestError(f"A board may have at most {MAX_COLUMNS} columns")
        connection.execute(
            "INSERT INTO columns (id, board_id, title, position, wip_limit) VALUES (?, ?, ?, ?, ?)",
            (f"col-{token_urlsafe(8)}", board_id, title.strip(), len(existing), wip_limit),
        )
        boards.touch(connection, board_id)
        return boards.read(connection, board_id, role)


def update(
    user_id: int,
    board_id: int,
    column_id: str,
    *,
    title: str | None = None,
    wip_limit: int | None = None,
    clear_wip_limit: bool = False,
) -> dict[str, Any]:
    with transaction() as connection:
        role = boards.require_access(connection, user_id, board_id, minimum="editor")
        current = require_column(connection, board_id, column_id)
        next_limit = current["wip_limit"]
        if clear_wip_limit:
            next_limit = None
        elif wip_limit is not None:
            next_limit = wip_limit
        connection.execute(
            "UPDATE columns SET title = ?, wip_limit = ? WHERE board_id = ? AND id = ?",
            (
                (title if title is not None else current["title"]).strip(),
                next_limit,
                board_id,
                column_id,
            ),
        )
        boards.touch(connection, board_id)
        return boards.read(connection, board_id, role)


def move(user_id: int, board_id: int, column_id: str, position: int) -> dict[str, Any]:
    with transaction() as connection:
        role = boards.require_access(connection, user_id, board_id, minimum="editor")
        require_column(connection, board_id, column_id)
        order = ordered_ids(connection, board_id)
        order.remove(column_id)
        order.insert(max(0, min(position, len(order))), column_id)
        set_positions(connection, board_id, order)
        boards.touch(connection, board_id)
        return boards.read(connection, board_id, role)


def delete(
    user_id: int,
    board_id: int,
    column_id: str,
    *,
    move_cards_to: str | None = None,
) -> dict[str, Any]:
    with transaction() as connection:
        role = boards.require_access(connection, user_id, board_id, minimum="editor")
        require_column(connection, board_id, column_id)
        order = ordered_ids(connection, board_id)
        if len(order) == 1:
            raise InvalidRequestError("A board must keep at least one column")

        card_ids = [
            row["id"]
            for row in connection.execute(
                "SELECT id FROM cards WHERE board_id = ? AND column_id = ? ORDER BY position",
                (board_id, column_id),
            )
        ]
        if card_ids:
            if move_cards_to is None:
                raise InvalidRequestError(
                    "This column still has cards; choose a column to move them to"
                )
            if move_cards_to == column_id:
                raise InvalidRequestError("Cards cannot be moved into the deleted column")
            require_column(connection, board_id, move_cards_to)
            target_ids = [
                row["id"]
                for row in connection.execute(
                    "SELECT id FROM cards WHERE board_id = ? AND column_id = ? ORDER BY position",
                    (board_id, move_cards_to),
                )
            ]
            # Stage the moving cards far out of range before they join the target
            # column so the (board_id, column_id, position) index stays satisfied.
            for offset, card_id in enumerate(card_ids):
                connection.execute(
                    "UPDATE cards SET column_id = ?, position = ? WHERE board_id = ? AND id = ?",
                    (move_cards_to, 2 * STAGING_OFFSET + offset, board_id, card_id),
                )
            from app.repositories.cards import set_positions as set_card_positions

            set_card_positions(connection, board_id, target_ids + card_ids)

        connection.execute(
            "DELETE FROM columns WHERE board_id = ? AND id = ?", (board_id, column_id)
        )
        order.remove(column_id)
        set_positions(connection, board_id, order)
        boards.touch(connection, board_id)
        return boards.read(connection, board_id, role)
