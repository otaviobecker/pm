"""User accounts: creation, authentication, profiles, and administration."""

import sqlite3
from contextlib import closing
from typing import Any

from app import security
from app.database import connect, now, seed_starter_board, transaction
from app.errors import ConflictError, InvalidRequestError, NotFoundError

USER_FIELDS = (
    "id, username, display_name, email, role, is_active, created_at, updated_at"
)


def serialize(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "username": row["username"],
        "displayName": row["display_name"],
        "email": row["email"],
        "role": row["role"],
        "isActive": bool(row["is_active"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def serialize_directory_entry(row: sqlite3.Row) -> dict[str, Any]:
    """A minimal projection safe to show to any signed-in member."""
    return {
        "id": row["id"],
        "username": row["username"],
        "displayName": row["display_name"],
    }


def find_by_username(
    connection: sqlite3.Connection, username: str
) -> sqlite3.Row | None:
    return connection.execute(
        f"SELECT {USER_FIELDS}, password_hash FROM users WHERE lower(username) = lower(?)",
        (username.strip(),),
    ).fetchone()


def require(connection: sqlite3.Connection, user_id: int) -> sqlite3.Row:
    row = connection.execute(
        f"SELECT {USER_FIELDS} FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    if row is None:
        raise NotFoundError("User not found")
    return row


def get(user_id: int) -> dict[str, Any]:
    with closing(connect()) as connection:
        return serialize(require(connection, user_id))


def create(
    username: str,
    password: str,
    display_name: str = "",
    email: str = "",
    *,
    role: str = "member",
    with_starter_board: bool = True,
) -> dict[str, Any]:
    username = username.strip()
    display_name = display_name.strip() or username
    with transaction() as connection:
        if find_by_username(connection, username) is not None:
            raise ConflictError("That username is already taken")
        timestamp = now()
        try:
            user_id = connection.execute(
                """
                INSERT INTO users
                    (username, display_name, email, password_hash, role, is_active,
                     created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    username,
                    display_name,
                    email.strip(),
                    security.hash_password(password),
                    role,
                    timestamp,
                    timestamp,
                ),
            ).lastrowid
        except sqlite3.IntegrityError as exception:
            raise ConflictError("That username is already taken") from exception
        if with_starter_board:
            seed_starter_board(connection, user_id, with_sample_cards=True)
        return serialize(require(connection, user_id))


def authenticate(username: str, password: str) -> dict[str, Any] | None:
    """Return the user when the credentials match an active account."""
    with closing(connect()) as connection:
        row = find_by_username(connection, username)
    # Hash even when the user is missing so that a wrong username and a wrong
    # password cost about the same amount of time.
    stored = row["password_hash"] if row is not None else security.UNUSABLE_PASSWORD_HASH
    matched = security.verify_password(password, stored)
    if row is None or not matched or not row["is_active"]:
        return None
    return serialize(row)


def list_all() -> list[dict[str, Any]]:
    with closing(connect()) as connection:
        rows = connection.execute(
            f"SELECT {USER_FIELDS} FROM users ORDER BY lower(username)"
        ).fetchall()
    return [serialize(row) for row in rows]


def directory() -> list[dict[str, Any]]:
    with closing(connect()) as connection:
        rows = connection.execute(
            "SELECT id, username, display_name FROM users "
            "WHERE is_active = 1 ORDER BY lower(username)"
        ).fetchall()
    return [serialize_directory_entry(row) for row in rows]


def update_profile(user_id: int, display_name: str, email: str) -> dict[str, Any]:
    with transaction() as connection:
        require(connection, user_id)
        connection.execute(
            "UPDATE users SET display_name = ?, email = ?, updated_at = ? WHERE id = ?",
            (display_name.strip(), email.strip(), now(), user_id),
        )
        return serialize(require(connection, user_id))


def change_password(user_id: int, current_password: str, new_password: str) -> None:
    with transaction() as connection:
        row = connection.execute(
            "SELECT password_hash FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if row is None:
            raise NotFoundError("User not found")
        if not security.verify_password(current_password, row["password_hash"]):
            raise InvalidRequestError("Current password is incorrect")
        connection.execute(
            "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
            (security.hash_password(new_password), now(), user_id),
        )
        # Every existing session for this account is dropped so a stolen cookie
        # cannot outlive the password it was issued against.
        connection.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))


def count_active_admins(connection: sqlite3.Connection, *, excluding: int) -> int:
    return connection.execute(
        "SELECT count(*) FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?",
        (excluding,),
    ).fetchone()[0]


def administer(
    user_id: int,
    *,
    role: str | None = None,
    is_active: bool | None = None,
    display_name: str | None = None,
) -> dict[str, Any]:
    """Apply an administrator-only change to another account."""
    with transaction() as connection:
        current = require(connection, user_id)
        next_role = role if role is not None else current["role"]
        next_active = is_active if is_active is not None else bool(current["is_active"])
        losing_admin = current["role"] == "admin" and current["is_active"]
        if losing_admin and (next_role != "admin" or not next_active):
            if count_active_admins(connection, excluding=user_id) == 0:
                raise InvalidRequestError(
                    "The workspace must keep at least one active administrator"
                )
        connection.execute(
            """
            UPDATE users
            SET role = ?, is_active = ?, display_name = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                next_role,
                1 if next_active else 0,
                (display_name or current["display_name"]).strip(),
                now(),
                user_id,
            ),
        )
        if not next_active:
            connection.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        return serialize(require(connection, user_id))


def delete(user_id: int) -> None:
    """Remove an account along with the boards it owns."""
    with transaction() as connection:
        current = require(connection, user_id)
        if current["role"] == "admin" and current["is_active"]:
            if count_active_admins(connection, excluding=user_id) == 0:
                raise InvalidRequestError(
                    "The workspace must keep at least one active administrator"
                )
        connection.execute("DELETE FROM users WHERE id = ?", (user_id,))
