"""Cards: creation, partial updates, reordering, cross-column moves, and deletion."""

import sqlite3
from secrets import token_urlsafe
from typing import Any

from app.database import now, transaction
from app.errors import InvalidRequestError, NotFoundError
from app.repositories import activity, boards, columns, labels

# Cards are parked in these ranges while positions are rewritten so the
# (board_id, column_id, position) unique index never sees a duplicate.
STAGING_OFFSET = 1_000_000
INCOMING_POSITION = 2_000_000

# Editable card fields, keyed by their API name.
UPDATABLE_FIELDS = {
    "title": "title",
    "details": "details",
    "priority": "priority",
    "dueDate": "due_date",
    "assigneeId": "assignee_id",
}


def set_positions(
    connection: sqlite3.Connection, board_id: int, card_ids: list[str]
) -> None:
    """Renumber ``card_ids`` to 0..n-1; every id must already sit in one column."""
    for index, card_id in enumerate(card_ids):
        connection.execute(
            "UPDATE cards SET position = ? WHERE board_id = ? AND id = ?",
            (STAGING_OFFSET + index, board_id, card_id),
        )
    for index, card_id in enumerate(card_ids):
        connection.execute(
            "UPDATE cards SET position = ? WHERE board_id = ? AND id = ?",
            (index, board_id, card_id),
        )


def column_card_ids(
    connection: sqlite3.Connection, board_id: int, column_id: str
) -> list[str]:
    return [
        row["id"]
        for row in connection.execute(
            "SELECT id FROM cards WHERE board_id = ? AND column_id = ? ORDER BY position",
            (board_id, column_id),
        )
    ]


def require_card(
    connection: sqlite3.Connection, board_id: int, card_id: str
) -> sqlite3.Row:
    row = connection.execute(
        "SELECT id, column_id, title, details, priority, due_date, assignee_id "
        "FROM cards WHERE board_id = ? AND id = ?",
        (board_id, card_id),
    ).fetchone()
    if row is None:
        raise NotFoundError("Card not found")
    return row


def require_assignee(
    connection: sqlite3.Connection, board_id: int, assignee_id: int | None
) -> int | None:
    if assignee_id is None:
        return None
    if boards.membership_role(connection, assignee_id, board_id) is None:
        raise InvalidRequestError("Cards can only be assigned to board members")
    return assignee_id


def enforce_wip_limit(
    connection: sqlite3.Connection, board_id: int, column_id: str, incoming: int = 1
) -> None:
    column = columns.require_column(connection, board_id, column_id)
    limit = column["wip_limit"]
    if limit is None:
        return
    current = connection.execute(
        "SELECT count(*) FROM cards WHERE board_id = ? AND column_id = ?",
        (board_id, column_id),
    ).fetchone()[0]
    if current + incoming > limit:
        raise InvalidRequestError(
            f'"{column["title"]}" is at its work-in-progress limit of {limit}'
        )


def create(
    user_id: int,
    board_id: int,
    column_id: str,
    title: str,
    details: str = "",
    *,
    priority: str = "medium",
    due_date: str | None = None,
    assignee_id: int | None = None,
    label_ids: list[str] | None = None,
) -> dict[str, Any]:
    with transaction() as connection:
        role = boards.require_access(connection, user_id, board_id, minimum="editor")
        columns.require_column(connection, board_id, column_id)
        enforce_wip_limit(connection, board_id, column_id)
        require_assignee(connection, board_id, assignee_id)
        position = len(column_card_ids(connection, board_id, column_id))
        timestamp = now()
        card_id = f"card-{token_urlsafe(9)}"
        connection.execute(
            """
            INSERT INTO cards
                (id, board_id, column_id, title, details, position, priority, due_date,
                 assignee_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                card_id,
                board_id,
                column_id,
                title.strip(),
                details.strip(),
                position,
                priority,
                due_date,
                assignee_id,
                timestamp,
                timestamp,
            ),
        )
        if label_ids:
            labels.set_for_card(connection, board_id, card_id, label_ids)
        activity.record(
            connection, board_id, user_id, "card.created", title.strip(), card_id=card_id
        )
        boards.touch(connection, board_id)
        return boards.read(connection, board_id, role)


def update(
    user_id: int, board_id: int, card_id: str, changes: dict[str, Any]
) -> dict[str, Any]:
    """Apply the supplied subset of card fields. Unlisted fields are left alone."""
    with transaction() as connection:
        role = boards.require_access(connection, user_id, board_id, minimum="editor")
        card = require_card(connection, board_id, card_id)
        assignments: list[str] = []
        values: list[Any] = []
        for field, column in UPDATABLE_FIELDS.items():
            if field not in changes:
                continue
            value = changes[field]
            if field == "assigneeId":
                value = require_assignee(connection, board_id, value)
            elif isinstance(value, str):
                value = value.strip()
            assignments.append(f"{column} = ?")
            values.append(value)
        if not assignments:
            return boards.read(connection, board_id, role)
        assignments.append("updated_at = ?")
        values.extend([now(), board_id, card_id])
        connection.execute(
            f"UPDATE cards SET {', '.join(assignments)} WHERE board_id = ? AND id = ?",
            values,
        )
        activity.record(
            connection,
            board_id,
            user_id,
            "card.updated",
            changes.get("title") or card["title"],
            "changed " + ", ".join(field for field in UPDATABLE_FIELDS if field in changes),
            card_id=card_id,
        )
        boards.touch(connection, board_id)
        return boards.read(connection, board_id, role)


def move(
    user_id: int,
    board_id: int,
    card_id: str,
    target_column_id: str,
    target_position: int,
) -> dict[str, Any]:
    with transaction() as connection:
        role = boards.require_access(connection, user_id, board_id, minimum="editor")
        card = require_card(connection, board_id, card_id)
        target = columns.require_column(connection, board_id, target_column_id)
        source_column_id = card["column_id"]

        source_ids = column_card_ids(connection, board_id, source_column_id)
        source_ids.remove(card_id)

        if source_column_id == target_column_id:
            target_ids = source_ids
        else:
            enforce_wip_limit(connection, board_id, target_column_id)
            target_ids = column_card_ids(connection, board_id, target_column_id)
            connection.execute(
                "UPDATE cards SET position = ? WHERE board_id = ? AND id = ?",
                (3 * STAGING_OFFSET, board_id, card_id),
            )
            set_positions(connection, board_id, source_ids)
            set_positions(connection, board_id, target_ids)
            connection.execute(
                "UPDATE cards SET column_id = ?, position = ? WHERE board_id = ? AND id = ?",
                (target_column_id, INCOMING_POSITION, board_id, card_id),
            )

        target_ids.insert(max(0, min(target_position, len(target_ids))), card_id)
        set_positions(connection, board_id, target_ids)
        connection.execute(
            "UPDATE cards SET updated_at = ? WHERE board_id = ? AND id = ?",
            (now(), board_id, card_id),
        )
        if source_column_id != target_column_id:
            activity.record(
                connection,
                board_id,
                user_id,
                "card.moved",
                card["title"],
                f"to {target['title']}",
                card_id=card_id,
            )
        boards.touch(connection, board_id)
        return boards.read(connection, board_id, role)


def delete(user_id: int, board_id: int, card_id: str) -> dict[str, Any]:
    with transaction() as connection:
        role = boards.require_access(connection, user_id, board_id, minimum="editor")
        card = require_card(connection, board_id, card_id)
        connection.execute(
            "DELETE FROM cards WHERE board_id = ? AND id = ?", (board_id, card_id)
        )
        set_positions(
            connection,
            board_id,
            column_card_ids(connection, board_id, card["column_id"]),
        )
        activity.record(
            connection, board_id, user_id, "card.deleted", card["title"], card_id=card_id
        )
        boards.touch(connection, board_id)
        return boards.read(connection, board_id, role)
