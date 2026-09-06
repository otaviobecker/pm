"""Whole-board replacement used by the AI assistant.

The proposed board is validated in full before any write starts, and the write runs
in a single transaction so a rejected update never leaves a partial board behind.
"""

import sqlite3
from typing import Any

from app.database import now, transaction
from app.errors import InvalidRequestError
from app.repositories import activity, boards

PRIORITIES = {"low", "medium", "high", "urgent"}

# Cards are parked in this range while positions are rewritten.
STAGING_OFFSET = 1_000_000


def validate(board: dict[str, Any], existing_column_ids: list[str]) -> None:
    proposed_column_ids = [column["id"] for column in board["columns"]]
    if proposed_column_ids != existing_column_ids:
        raise InvalidRequestError(
            "A board update must keep the board's existing columns and their order"
        )

    referenced = [
        card_id for column in board["columns"] for card_id in column["cardIds"]
    ]
    if len(referenced) != len(set(referenced)):
        raise InvalidRequestError("A card may appear in only one column")
    if set(referenced) != set(board["cards"]):
        raise InvalidRequestError("Card records and column card IDs must match")
    if any(not column["title"].strip() for column in board["columns"]):
        raise InvalidRequestError("Column titles may not be blank")
    for card_id, card in board["cards"].items():
        if card["id"] != card_id or not card["title"].strip():
            raise InvalidRequestError("Cards require matching IDs and nonblank titles")
        if card.get("priority", "medium") not in PRIORITIES:
            raise InvalidRequestError(f"Unknown card priority: {card.get('priority')}")


def replace(user_id: int, board_id: int, board: dict[str, Any]) -> dict[str, Any]:
    with transaction() as connection:
        role = boards.require_access(connection, user_id, board_id, minimum="editor")
        existing_column_ids = [
            row["id"]
            for row in connection.execute(
                "SELECT id FROM columns WHERE board_id = ? ORDER BY position",
                (board_id,),
            )
        ]
        validate(board, existing_column_ids)
        guard_foreign_card_ids(connection, board_id, list(board["cards"]))

        for column in board["columns"]:
            connection.execute(
                "UPDATE columns SET title = ? WHERE board_id = ? AND id = ?",
                (column["title"].strip(), board_id, column["id"]),
            )
        touched = apply_cards(connection, board_id, board)
        activity.record(
            connection,
            board_id,
            user_id,
            "assistant.updated",
            "",
            f"{touched} cards added or removed" if touched else "cards rearranged",
        )
        boards.touch(connection, board_id)
        return boards.read(connection, board_id, role)


def apply_cards(
    connection: sqlite3.Connection, board_id: int, board: dict[str, Any]
) -> int:
    """Reconcile the board's cards with the proposal, returning how many were
    added or removed.

    Cards are updated in place rather than replaced so that everything hanging off
    a card -- its labels, comments, and checklist -- survives an assistant edit.
    """
    existing = {
        row["id"]
        for row in connection.execute(
            "SELECT id FROM cards WHERE board_id = ?", (board_id,)
        )
    }
    removed = existing - set(board["cards"])
    for card_id in removed:
        connection.execute(
            "DELETE FROM cards WHERE board_id = ? AND id = ?", (board_id, card_id)
        )

    # First pass parks every card at a position no other card can hold, so moves
    # between columns cannot collide with the cards already sitting there.
    timestamp = now()
    staged = 0
    for column in board["columns"]:
        for card_id in column["cardIds"]:
            card = board["cards"][card_id]
            staged += 1
            if card_id in existing:
                connection.execute(
                    """
                    UPDATE cards
                    SET column_id = ?, title = ?, details = ?, position = ?,
                        priority = ?, due_date = ?, updated_at = ?
                    WHERE board_id = ? AND id = ?
                    """,
                    (
                        column["id"],
                        card["title"].strip(),
                        card.get("details", "").strip(),
                        STAGING_OFFSET + staged,
                        card.get("priority") or "medium",
                        card.get("dueDate"),
                        timestamp,
                        board_id,
                        card_id,
                    ),
                )
            else:
                connection.execute(
                    """
                    INSERT INTO cards
                        (id, board_id, column_id, title, details, position, priority,
                         due_date, assignee_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
                    """,
                    (
                        card_id,
                        board_id,
                        column["id"],
                        card["title"].strip(),
                        card.get("details", "").strip(),
                        STAGING_OFFSET + staged,
                        card.get("priority") or "medium",
                        card.get("dueDate"),
                        timestamp,
                        timestamp,
                    ),
                )

    for column in board["columns"]:
        for position, card_id in enumerate(column["cardIds"]):
            connection.execute(
                "UPDATE cards SET position = ? WHERE board_id = ? AND id = ?",
                (position, board_id, card_id),
            )
    return len(removed) + len(set(board["cards"]) - existing)


def guard_foreign_card_ids(
    connection: sqlite3.Connection, board_id: int, card_ids: list[str]
) -> None:
    """Reject an update that would claim a card ID owned by another board."""
    if not card_ids:
        return
    placeholders = ",".join("?" for _ in card_ids)
    collision = connection.execute(
        f"SELECT id FROM cards WHERE board_id != ? AND id IN ({placeholders})",
        (board_id, *card_ids),
    ).fetchone()
    if collision is not None:
        raise InvalidRequestError("Card ID belongs to another board")
