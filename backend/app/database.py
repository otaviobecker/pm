"""SQLite connection handling, schema migrations, and first-run seeding."""

import os
import sqlite3
from contextlib import closing, contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterator

from app import security

SCHEMA_VERSION = 3

DEFAULT_ADMIN_USERNAME = "user"
DEFAULT_ADMIN_PASSWORD = "password"

DEFAULT_COLUMNS = [
    ("col-backlog", "Backlog"),
    ("col-discovery", "Discovery"),
    ("col-progress", "In Progress"),
    ("col-review", "Review"),
    ("col-done", "Done"),
]

# Labels are restricted to the product's five colors, named rather than hex so the
# frontend owns the exact values.
LABEL_COLORS = ["yellow", "blue", "purple", "navy", "gray"]

DEFAULT_LABELS = [
    ("label-feature", "Feature", "blue"),
    ("label-bug", "Bug", "purple"),
    ("label-chore", "Chore", "gray"),
    ("label-urgent", "Needs decision", "yellow"),
]

SEED_BOARD_NAME = "Kanban Studio"
SEED_BOARD_DESCRIPTION = (
    "Your starter board. Rename it, or create as many more as you need."
)

SEED_CARDS = [
    ("col-backlog", "Align roadmap themes", "Draft quarterly themes with impact statements and metrics.", "high"),
    ("col-backlog", "Gather customer signals", "Review support tags, sales notes, and churn feedback.", "medium"),
    ("col-discovery", "Prototype analytics view", "Sketch initial dashboard layout and key drill-downs.", "medium"),
    ("col-progress", "Refine status language", "Standardize column labels and tone across the board.", "low"),
    ("col-progress", "Design card layout", "Add hierarchy and spacing for scanning dense lists.", "high"),
    ("col-review", "QA micro-interactions", "Verify hover, focus, and loading states.", "medium"),
    ("col-done", "Ship marketing page", "Final copy approved and asset pack delivered.", "medium"),
    ("col-done", "Close onboarding sprint", "Document release notes and share internally.", "low"),
]

BOARD_SCHEMA = """
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE CHECK (length(trim(username)) > 0),
    display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
    email TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX users_username_folded ON users (lower(username));

CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    description TEXT NOT NULL DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX boards_owner ON boards (owner_id);

CREATE TABLE board_members (
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    created_at TEXT NOT NULL,
    PRIMARY KEY (board_id, user_id)
);

CREATE INDEX board_members_user ON board_members (user_id);

CREATE TABLE columns (
    id TEXT NOT NULL,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0),
    wip_limit INTEGER CHECK (wip_limit IS NULL OR wip_limit > 0),
    PRIMARY KEY (board_id, id),
    UNIQUE (board_id, position)
);

CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    board_id INTEGER NOT NULL,
    column_id TEXT NOT NULL,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    details TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL CHECK (position >= 0),
    priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    due_date TEXT,
    assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (board_id, column_id) REFERENCES columns(board_id, id) ON DELETE CASCADE,
    UNIQUE (board_id, column_id, position)
);

CREATE INDEX cards_board ON cards (board_id);
CREATE INDEX cards_assignee ON cards (assignee_id);
"""

# Added in schema version 3: the tables that turn a card into a work item.
CARD_DETAIL_SCHEMA = """
CREATE TABLE labels (
    id TEXT NOT NULL,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    color TEXT NOT NULL CHECK (color IN ('yellow', 'blue', 'purple', 'navy', 'gray')),
    position INTEGER NOT NULL CHECK (position >= 0),
    PRIMARY KEY (board_id, id),
    UNIQUE (board_id, position)
);

CREATE TABLE card_labels (
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    board_id INTEGER NOT NULL,
    label_id TEXT NOT NULL,
    PRIMARY KEY (card_id, label_id),
    FOREIGN KEY (board_id, label_id) REFERENCES labels(board_id, id) ON DELETE CASCADE
);

CREATE INDEX card_labels_label ON card_labels (board_id, label_id);

CREATE TABLE card_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL CHECK (length(trim(body)) > 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX card_comments_card ON card_comments (card_id);

CREATE TABLE checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
    position INTEGER NOT NULL CHECK (position >= 0),
    created_at TEXT NOT NULL,
    UNIQUE (card_id, position)
);

CREATE INDEX checklist_items_card ON checklist_items (card_id);
"""

SCHEMA = BOARD_SCHEMA + CARD_DETAIL_SCHEMA


def now() -> str:
    return datetime.now(UTC).isoformat()


def database_path() -> Path:
    root = os.environ.get("DATA_DIR") or Path(__file__).resolve().parent.parent / "data"
    return Path(root) / "pm.db"


def connect(*, foreign_keys: bool = True) -> sqlite3.Connection:
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON" if foreign_keys else "PRAGMA foreign_keys = OFF")
    connection.execute("PRAGMA busy_timeout = 5000")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


@contextmanager
def transaction() -> Iterator[sqlite3.Connection]:
    connection = connect()
    try:
        connection.execute("BEGIN IMMEDIATE")
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def create_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(SCHEMA)


def migrate_v1_to_v2(connection: sqlite3.Connection) -> None:
    """Rebuild the single-board v1 schema into the multi-user, multi-board v2 schema."""
    connection.executescript(
        """
        ALTER TABLE users RENAME TO users_v1;
        ALTER TABLE boards RENAME TO boards_v1;
        ALTER TABLE columns RENAME TO columns_v1;
        ALTER TABLE cards RENAME TO cards_v1;
        """
    )
    # Build the schema as version 2 defined it; later steps add the rest.
    connection.executescript(BOARD_SCHEMA)
    timestamp = now()
    # v1 stored no credentials, so migrated accounts get an unusable hash until the
    # seeding step (or an administrator) sets a real password.
    connection.execute(
        """
        INSERT INTO users
            (id, username, display_name, email, password_hash, role, is_active, created_at, updated_at)
        SELECT id, username, username, '', ?, 'admin', 1, created_at, ?
        FROM users_v1
        """,
        (security.UNUSABLE_PASSWORD_HASH, timestamp),
    )
    connection.execute(
        """
        INSERT INTO boards (id, owner_id, name, description, archived, created_at, updated_at)
        SELECT id, user_id, title, '', 0, created_at, updated_at FROM boards_v1
        """
    )
    connection.execute(
        """
        INSERT INTO board_members (board_id, user_id, role, created_at)
        SELECT id, user_id, 'owner', created_at FROM boards_v1
        """
    )
    connection.execute(
        """
        INSERT INTO columns (id, board_id, title, position, wip_limit)
        SELECT id, board_id, title, position, NULL FROM columns_v1
        """
    )
    connection.execute(
        """
        INSERT INTO cards
            (id, board_id, column_id, title, details, position, priority, due_date,
             assignee_id, created_at, updated_at)
        SELECT id, board_id, column_id, title, details, position, 'medium', NULL, NULL,
               created_at, updated_at
        FROM cards_v1
        """
    )
    connection.executescript(
        """
        DROP TABLE cards_v1;
        DROP TABLE columns_v1;
        DROP TABLE boards_v1;
        DROP TABLE users_v1;
        """
    )


def migrate_v2_to_v3(connection: sqlite3.Connection) -> None:
    """Add labels, comments, and checklists, and give existing boards the defaults."""
    connection.executescript(CARD_DETAIL_SCHEMA)
    for row in connection.execute("SELECT id FROM boards").fetchall():
        create_default_labels(connection, row["id"])


# Keyed by the version a step upgrades *from*. Version 0 is an empty file and is
# handled separately: it gets the current schema outright rather than replaying history.
MIGRATIONS = {
    1: migrate_v1_to_v2,
    2: migrate_v2_to_v3,
}


def upgrade(connection: sqlite3.Connection, version: int) -> int:
    """Run one schema step in its own transaction and return the new version."""
    connection.execute("BEGIN IMMEDIATE")
    try:
        # Re-read inside the write lock: another process may have upgraded first.
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        if version >= SCHEMA_VERSION:
            connection.rollback()
            return version
        if version == 0:
            create_schema(connection)
            version = SCHEMA_VERSION
        else:
            MIGRATIONS[version](connection)
            version += 1
        connection.execute(f"PRAGMA user_version = {version}")
        connection.commit()
        return version
    except Exception:
        connection.rollback()
        raise


def initialize_database() -> None:
    """Bring the database up to :data:`SCHEMA_VERSION` and seed the default account."""
    # Migrations rebuild tables, so they run with foreign keys disabled. The pragma is
    # a no-op inside a transaction, which is why it is set before BEGIN IMMEDIATE.
    with closing(connect(foreign_keys=False)) as connection:
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        if version > SCHEMA_VERSION:
            raise RuntimeError(f"Unsupported database version: {version}")
        while version < SCHEMA_VERSION:
            version = upgrade(connection, version)
    seed_default_admin()


def seed_default_admin() -> None:
    """Ensure the bundled administrator account and its starter board exist."""
    with transaction() as connection:
        timestamp = now()
        existing = connection.execute(
            "SELECT id, password_hash FROM users WHERE lower(username) = lower(?)",
            (DEFAULT_ADMIN_USERNAME,),
        ).fetchone()
        if existing is None:
            user_id = connection.execute(
                """
                INSERT INTO users
                    (username, display_name, email, password_hash, role, is_active,
                     created_at, updated_at)
                VALUES (?, ?, '', ?, 'admin', 1, ?, ?)
                """,
                (
                    DEFAULT_ADMIN_USERNAME,
                    "Workspace Admin",
                    security.hash_password(DEFAULT_ADMIN_PASSWORD),
                    timestamp,
                    timestamp,
                ),
            ).lastrowid
        else:
            user_id = existing["id"]
            if existing["password_hash"] == security.UNUSABLE_PASSWORD_HASH:
                connection.execute(
                    "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                    (security.hash_password(DEFAULT_ADMIN_PASSWORD), timestamp, user_id),
                )

        already_seeded = connection.execute(
            "SELECT 1 FROM board_members WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if already_seeded is None:
            seed_starter_board(connection, user_id)


def create_default_columns(connection: sqlite3.Connection, board_id: int) -> None:
    connection.executemany(
        "INSERT INTO columns (id, board_id, title, position, wip_limit) VALUES (?, ?, ?, ?, NULL)",
        [
            (column_id, board_id, title, position)
            for position, (column_id, title) in enumerate(DEFAULT_COLUMNS)
        ],
    )


def create_default_labels(connection: sqlite3.Connection, board_id: int) -> None:
    connection.executemany(
        "INSERT INTO labels (id, board_id, name, color, position) VALUES (?, ?, ?, ?, ?)",
        [
            (label_id, board_id, name, color, position)
            for position, (label_id, name, color) in enumerate(DEFAULT_LABELS)
        ],
    )


def seed_starter_board(connection: sqlite3.Connection, user_id: int) -> int:
    """Create a board owned by ``user_id``, with the default columns and demo cards."""
    timestamp = now()
    board_id = connection.execute(
        """
        INSERT INTO boards (owner_id, name, description, archived, created_at, updated_at)
        VALUES (?, ?, ?, 0, ?, ?)
        """,
        (user_id, SEED_BOARD_NAME, SEED_BOARD_DESCRIPTION, timestamp, timestamp),
    ).lastrowid
    connection.execute(
        "INSERT INTO board_members (board_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)",
        (board_id, user_id, timestamp),
    )
    create_default_columns(connection, board_id)
    create_default_labels(connection, board_id)
    positions: dict[str, int] = {}
    for index, (column_id, title, details, priority) in enumerate(SEED_CARDS, start=1):
        position = positions.get(column_id, 0)
        positions[column_id] = position + 1
        connection.execute(
            """
            INSERT INTO cards
                (id, board_id, column_id, title, details, position, priority, due_date,
                 assignee_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
            """,
            (
                f"card-{board_id}-{index}",
                board_id,
                column_id,
                title,
                details,
                position,
                priority,
                timestamp,
                timestamp,
            ),
        )
    return board_id
