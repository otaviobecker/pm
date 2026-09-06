"""An append-only record of who changed what on a board.

Entries denormalize the actor's name and the subject's title so the history stays
readable after the account or the card it refers to is gone.
"""

import sqlite3
from contextlib import closing
from typing import Any

from app.database import connect, now
from app.repositories import boards

# The closed vocabulary the frontend knows how to phrase.
ACTIONS = {
    "board.created",
    "board.renamed",
    "board.archived",
    "board.restored",
    "member.added",
    "member.role_changed",
    "member.removed",
    "column.created",
    "column.renamed",
    "column.moved",
    "column.deleted",
    "column.wip_limit",
    "label.created",
    "label.deleted",
    "card.created",
    "card.updated",
    "card.moved",
    "card.deleted",
    "card.labeled",
    "comment.added",
    "checklist.completed",
    "assistant.updated",
}

# Boards keep a rolling window of history rather than growing without bound.
MAX_ENTRIES_PER_BOARD = 400


def actor_name(connection: sqlite3.Connection, user_id: int) -> str:
    """Callers always hold a live account: the session user, or a board member."""
    row = connection.execute(
        "SELECT display_name, username FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    return row["display_name"] or row["username"]


def record(
    connection: sqlite3.Connection,
    board_id: int,
    user_id: int,
    action: str,
    subject: str = "",
    detail: str = "",
    card_id: str | None = None,
) -> None:
    """Append one entry. Callers pass their open transaction so it commits with the change."""
    if action not in ACTIONS:
        raise ValueError(f"Unknown activity action: {action}")
    connection.execute(
        """
        INSERT INTO activity
            (board_id, actor_id, actor_name, action, subject, detail, card_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            board_id,
            user_id,
            actor_name(connection, user_id),
            action,
            subject.strip(),
            detail.strip(),
            card_id,
            now(),
        ),
    )
    trim(connection, board_id)


def trim(connection: sqlite3.Connection, board_id: int) -> None:
    connection.execute(
        """
        DELETE FROM activity
        WHERE board_id = ? AND id <= (
            SELECT id FROM activity WHERE board_id = ?
            ORDER BY id DESC LIMIT 1 OFFSET ?
        )
        """,
        (board_id, board_id, MAX_ENTRIES_PER_BOARD),
    )


def serialize(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "actorId": row["actor_id"],
        "actorName": row["actor_name"],
        "action": row["action"],
        "subject": row["subject"],
        "detail": row["detail"],
        "cardId": row["card_id"],
        "createdAt": row["created_at"],
    }


def list_for_board(
    user_id: int, board_id: int, *, limit: int = 50, before: int | None = None
) -> list[dict[str, Any]]:
    """The newest entries first, optionally continuing from an earlier page."""
    with closing(connect()) as connection:
        boards.require_access(connection, user_id, board_id)
        query = "SELECT * FROM activity WHERE board_id = ?"
        parameters: list[Any] = [board_id]
        if before is not None:
            query += " AND id < ?"
            parameters.append(before)
        query += " ORDER BY id DESC LIMIT ?"
        parameters.append(limit)
        rows = connection.execute(query, parameters).fetchall()
    return [serialize(row) for row in rows]
