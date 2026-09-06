"""Boards, board membership, and the full board projection returned to clients."""

import sqlite3
from contextlib import closing
from typing import Any

from app.database import (
    connect,
    create_default_columns,
    now,
    transaction,
)
from app.errors import ConflictError, InvalidRequestError, NotFoundError, PermissionDeniedError

ROLE_RANK = {"viewer": 0, "editor": 1, "owner": 2}


def rank(role: str) -> int:
    return ROLE_RANK.get(role, -1)


def membership_role(
    connection: sqlite3.Connection, user_id: int, board_id: int
) -> str | None:
    row = connection.execute(
        "SELECT role FROM board_members WHERE board_id = ? AND user_id = ?",
        (board_id, user_id),
    ).fetchone()
    return row["role"] if row is not None else None


def require_access(
    connection: sqlite3.Connection,
    user_id: int,
    board_id: int,
    *,
    minimum: str = "viewer",
) -> str:
    """Return the caller's role on the board, or raise.

    A non-member gets ``NotFoundError`` rather than a permission error so board
    existence is not observable to outsiders.
    """
    role = membership_role(connection, user_id, board_id)
    if role is None:
        raise NotFoundError("Board not found")
    if rank(role) < rank(minimum):
        raise PermissionDeniedError(
            f"This action requires the {minimum} role on the board"
        )
    return role


def touch(connection: sqlite3.Connection, board_id: int) -> None:
    connection.execute(
        "UPDATE boards SET updated_at = ? WHERE id = ?", (now(), board_id)
    )


def serialize_card(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "details": row["details"],
        "priority": row["priority"],
        "dueDate": row["due_date"],
        "assigneeId": row["assignee_id"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def read_columns_and_cards(
    connection: sqlite3.Connection, board_id: int
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    column_rows = connection.execute(
        "SELECT id, title, wip_limit FROM columns WHERE board_id = ? ORDER BY position",
        (board_id,),
    ).fetchall()
    card_rows = connection.execute(
        """
        SELECT id, column_id, title, details, position, priority, due_date,
               assignee_id, created_at, updated_at
        FROM cards
        WHERE board_id = ?
        ORDER BY column_id, position
        """,
        (board_id,),
    ).fetchall()

    card_ids_by_column: dict[str, list[str]] = {row["id"]: [] for row in column_rows}
    cards: dict[str, Any] = {}
    for row in card_rows:
        cards[row["id"]] = serialize_card(row)
        card_ids_by_column[row["column_id"]].append(row["id"])

    columns = [
        {
            "id": row["id"],
            "title": row["title"],
            "wipLimit": row["wip_limit"],
            "cardIds": card_ids_by_column[row["id"]],
        }
        for row in column_rows
    ]
    return columns, cards


def read_members(connection: sqlite3.Connection, board_id: int) -> list[dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT users.id, users.username, users.display_name, board_members.role
        FROM board_members
        JOIN users ON users.id = board_members.user_id
        WHERE board_members.board_id = ?
        ORDER BY CASE board_members.role
                     WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END,
                 lower(users.username)
        """,
        (board_id,),
    ).fetchall()
    return [
        {
            "userId": row["id"],
            "username": row["username"],
            "displayName": row["display_name"],
            "role": row["role"],
        }
        for row in rows
    ]


def read(connection: sqlite3.Connection, board_id: int, viewer_role: str) -> dict[str, Any]:
    board = connection.execute(
        "SELECT id, owner_id, name, description, archived, created_at, updated_at "
        "FROM boards WHERE id = ?",
        (board_id,),
    ).fetchone()
    columns, cards = read_columns_and_cards(connection, board_id)
    return {
        "id": board["id"],
        "name": board["name"],
        "description": board["description"],
        "archived": bool(board["archived"]),
        "ownerId": board["owner_id"],
        "role": viewer_role,
        "createdAt": board["created_at"],
        "updatedAt": board["updated_at"],
        "columns": columns,
        "cards": cards,
        "members": read_members(connection, board_id),
    }


def get(user_id: int, board_id: int) -> dict[str, Any]:
    with closing(connect()) as connection:
        role = require_access(connection, user_id, board_id)
        return read(connection, board_id, role)


def list_for_user(user_id: int, *, include_archived: bool = False) -> list[dict[str, Any]]:
    """Summaries of every board the user can open, newest activity first."""
    query = """
        SELECT boards.id, boards.name, boards.description, boards.archived,
               boards.owner_id, boards.created_at, boards.updated_at,
               board_members.role AS viewer_role,
               owner.username AS owner_username,
               owner.display_name AS owner_display_name,
               (SELECT count(*) FROM cards WHERE cards.board_id = boards.id) AS card_count,
               (SELECT count(*) FROM board_members m WHERE m.board_id = boards.id) AS member_count
        FROM boards
        JOIN board_members ON board_members.board_id = boards.id
        JOIN users AS owner ON owner.id = boards.owner_id
        WHERE board_members.user_id = ?
    """
    if not include_archived:
        query += " AND boards.archived = 0"
    query += " ORDER BY boards.updated_at DESC, boards.id DESC"
    with closing(connect()) as connection:
        rows = connection.execute(query, (user_id,)).fetchall()
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "archived": bool(row["archived"]),
            "ownerId": row["owner_id"],
            "ownerUsername": row["owner_username"],
            "ownerDisplayName": row["owner_display_name"],
            "role": row["viewer_role"],
            "cardCount": row["card_count"],
            "memberCount": row["member_count"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }
        for row in rows
    ]


def create(user_id: int, name: str, description: str = "") -> dict[str, Any]:
    with transaction() as connection:
        timestamp = now()
        board_id = connection.execute(
            """
            INSERT INTO boards (owner_id, name, description, archived, created_at, updated_at)
            VALUES (?, ?, ?, 0, ?, ?)
            """,
            (user_id, name.strip(), description.strip(), timestamp, timestamp),
        ).lastrowid
        connection.execute(
            "INSERT INTO board_members (board_id, user_id, role, created_at) "
            "VALUES (?, ?, 'owner', ?)",
            (board_id, user_id, timestamp),
        )
        create_default_columns(connection, board_id)
        return read(connection, board_id, "owner")


def update(
    user_id: int,
    board_id: int,
    *,
    name: str | None = None,
    description: str | None = None,
    archived: bool | None = None,
) -> dict[str, Any]:
    with transaction() as connection:
        role = require_access(connection, user_id, board_id, minimum="editor")
        if archived is not None and rank(role) < rank("owner"):
            raise PermissionDeniedError("Only the board owner can archive a board")
        current = connection.execute(
            "SELECT name, description, archived FROM boards WHERE id = ?",
            (board_id,),
        ).fetchone()
        connection.execute(
            "UPDATE boards SET name = ?, description = ?, archived = ?, updated_at = ? WHERE id = ?",
            (
                (name if name is not None else current["name"]).strip(),
                (
                    description if description is not None else current["description"]
                ).strip(),
                int(archived if archived is not None else bool(current["archived"])),
                now(),
                board_id,
            ),
        )
        return read(connection, board_id, role)


def delete(user_id: int, board_id: int) -> None:
    with transaction() as connection:
        require_access(connection, user_id, board_id, minimum="owner")
        connection.execute("DELETE FROM boards WHERE id = ?", (board_id,))


def add_member(user_id: int, board_id: int, username: str, role: str) -> dict[str, Any]:
    with transaction() as connection:
        require_access(connection, user_id, board_id, minimum="owner")
        member = connection.execute(
            "SELECT id, is_active FROM users WHERE lower(username) = lower(?)",
            (username.strip(),),
        ).fetchone()
        if member is None or not member["is_active"]:
            raise NotFoundError("User not found")
        if membership_role(connection, member["id"], board_id) is not None:
            raise ConflictError("That user is already a member of this board")
        connection.execute(
            "INSERT INTO board_members (board_id, user_id, role, created_at) VALUES (?, ?, ?, ?)",
            (board_id, member["id"], role, now()),
        )
        return read(connection, board_id, "owner")


def update_member(
    user_id: int, board_id: int, member_id: int, role: str
) -> dict[str, Any]:
    with transaction() as connection:
        require_access(connection, user_id, board_id, minimum="owner")
        current = membership_role(connection, member_id, board_id)
        if current is None:
            raise NotFoundError("Board member not found")
        if current == "owner":
            raise InvalidRequestError("The board owner's role cannot be changed")
        connection.execute(
            "UPDATE board_members SET role = ? WHERE board_id = ? AND user_id = ?",
            (role, board_id, member_id),
        )
        return read(connection, board_id, "owner")


def remove_member(user_id: int, board_id: int, member_id: int) -> dict[str, Any] | None:
    """Remove a member. Members may remove themselves; owners may remove anyone else."""
    with transaction() as connection:
        role = require_access(connection, user_id, board_id)
        leaving = member_id == user_id
        if not leaving and rank(role) < rank("owner"):
            raise PermissionDeniedError("Only the board owner can remove other members")
        target = membership_role(connection, member_id, board_id)
        if target is None:
            raise NotFoundError("Board member not found")
        if target == "owner":
            raise InvalidRequestError(
                "The board owner cannot be removed; delete the board instead"
            )
        connection.execute(
            "DELETE FROM board_members WHERE board_id = ? AND user_id = ?",
            (board_id, member_id),
        )
        # Cards keep their history, but an unassigned member should not stay attached.
        connection.execute(
            "UPDATE cards SET assignee_id = NULL WHERE board_id = ? AND assignee_id = ?",
            (board_id, member_id),
        )
        if leaving:
            return None
        return read(connection, board_id, role)
