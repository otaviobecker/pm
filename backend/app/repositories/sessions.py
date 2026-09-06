"""Server-side sessions persisted in SQLite so sign-in survives a restart."""

import sqlite3
from contextlib import closing
from datetime import UTC, datetime, timedelta
from typing import Any

from app import security
from app.database import connect, now, transaction

SESSION_TTL = timedelta(days=7)
# A session is extended when less than this much of its lifetime remains.
SESSION_REFRESH_THRESHOLD = SESSION_TTL / 2


def create(user_id: int) -> str:
    """Issue a session token; only its digest is stored."""
    token = security.generate_token()
    expires_at = datetime.now(UTC) + SESSION_TTL
    with transaction() as connection:
        connection.execute(
            "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (security.hash_token(token), user_id, now(), expires_at.isoformat()),
        )
    return token


def resolve(token: str | None) -> dict[str, Any] | None:
    """Return the active user for ``token``, refreshing the session when it is aging."""
    if not token:
        return None
    token_hash = security.hash_token(token)
    with closing(connect()) as connection:
        row = connection.execute(
            """
            SELECT sessions.expires_at, users.id, users.username, users.display_name,
                   users.email, users.role, users.is_active, users.created_at,
                   users.updated_at
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ?
            """,
            (token_hash,),
        ).fetchone()
    if row is None:
        return None

    expires_at = datetime.fromisoformat(row["expires_at"])
    current = datetime.now(UTC)
    if expires_at <= current:
        destroy(token)
        return None
    if not row["is_active"]:
        destroy(token)
        return None
    if expires_at - current < SESSION_REFRESH_THRESHOLD:
        extend(token_hash, current + SESSION_TTL)

    # Import locally: users imports this module's table indirectly and a top-level
    # import would be circular.
    from app.repositories.users import serialize

    return serialize(row)


def extend(token_hash: str, expires_at: datetime) -> None:
    with transaction() as connection:
        connection.execute(
            "UPDATE sessions SET expires_at = ? WHERE token_hash = ?",
            (expires_at.isoformat(), token_hash),
        )


def destroy(token: str | None) -> None:
    if not token:
        return
    with transaction() as connection:
        connection.execute(
            "DELETE FROM sessions WHERE token_hash = ?",
            (security.hash_token(token),),
        )


def destroy_all_for_user(user_id: int) -> int:
    with transaction() as connection:
        result = connection.execute(
            "DELETE FROM sessions WHERE user_id = ?",
            (user_id,),
        )
    return result.rowcount


def prune_expired(connection: sqlite3.Connection | None = None) -> int:
    """Delete sessions whose expiry has passed."""
    timestamp = datetime.now(UTC).isoformat()
    if connection is not None:
        return connection.execute(
            "DELETE FROM sessions WHERE expires_at <= ?", (timestamp,)
        ).rowcount
    with transaction() as owned:
        return owned.execute(
            "DELETE FROM sessions WHERE expires_at <= ?", (timestamp,)
        ).rowcount
