import os
import sqlite3
from contextlib import closing, contextmanager
from datetime import UTC, datetime
from pathlib import Path
from secrets import token_urlsafe
from typing import Any, Iterator

FIXED_COLUMNS = [
    ("col-backlog", "backlog", "Backlog", 0),
    ("col-discovery", "discovery", "Discovery", 1),
    ("col-progress", "progress", "In Progress", 2),
    ("col-review", "review", "Review", 3),
    ("col-done", "done", "Done", 4),
]

SEED_CARDS = [
    ("card-1", "col-backlog", "Align roadmap themes", "Draft quarterly themes with impact statements and metrics.", 0),
    ("card-2", "col-backlog", "Gather customer signals", "Review support tags, sales notes, and churn feedback.", 1),
    ("card-3", "col-discovery", "Prototype analytics view", "Sketch initial dashboard layout and key drill-downs.", 0),
    ("card-4", "col-progress", "Refine status language", "Standardize column labels and tone across the board.", 0),
    ("card-5", "col-progress", "Design card layout", "Add hierarchy and spacing for scanning dense lists.", 1),
    ("card-6", "col-review", "QA micro-interactions", "Verify hover, focus, and loading states.", 0),
    ("card-7", "col-done", "Ship marketing page", "Final copy approved and asset pack delivered.", 0),
    ("card-8", "col-done", "Close onboarding sprint", "Document release notes and share internally.", 1),
]

SCHEMA = """
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE CHECK (length(trim(username)) > 0),
    created_at TEXT NOT NULL
);

CREATE TABLE boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Kanban Studio' CHECK (length(trim(title)) > 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE columns (
    id TEXT NOT NULL,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    key TEXT NOT NULL CHECK (key IN ('backlog', 'discovery', 'progress', 'review', 'done')),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 4),
    PRIMARY KEY (board_id, id),
    UNIQUE (board_id, key),
    UNIQUE (board_id, position)
);

CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    board_id INTEGER NOT NULL,
    column_id TEXT NOT NULL,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    details TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL CHECK (position >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (board_id, column_id) REFERENCES columns(board_id, id) ON DELETE CASCADE,
    UNIQUE (board_id, column_id, position)
);

CREATE INDEX cards_board_column_position
ON cards(board_id, column_id, position);
"""


def now() -> str:
    return datetime.now(UTC).isoformat()


def database_path() -> Path:
    return Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parent.parent / "data")) / "pm.db"


def connect() -> sqlite3.Connection:
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 5000")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


@contextmanager
def transaction() -> Iterator[sqlite3.Connection]:
    connection = connect()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database() -> None:
    with transaction() as connection:
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        if version == 0:
            connection.executescript(SCHEMA)
            connection.execute("PRAGMA user_version = 1")
        elif version != 1:
            raise RuntimeError(f"Unsupported database version: {version}")
        seed_board(connection)


def seed_board(connection: sqlite3.Connection) -> None:
    timestamp = now()
    connection.execute(
        "INSERT INTO users (username, created_at) VALUES (?, ?) ON CONFLICT(username) DO NOTHING",
        ("user", timestamp),
    )
    user_id = connection.execute(
        "SELECT id FROM users WHERE username = ?",
        ("user",),
    ).fetchone()["id"]
    existing_board = connection.execute(
        "SELECT id FROM boards WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    if existing_board is not None:
        return

    board_id = connection.execute(
        "INSERT INTO boards (user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (user_id, "Kanban Studio", timestamp, timestamp),
    ).lastrowid
    connection.executemany(
        "INSERT INTO columns (id, board_id, key, title, position) VALUES (?, ?, ?, ?, ?)",
        [(column_id, board_id, key, title, position) for column_id, key, title, position in FIXED_COLUMNS],
    )
    connection.executemany(
        """
        INSERT INTO cards
            (id, board_id, column_id, title, details, position, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (card_id, board_id, column_id, title, details, position, timestamp, timestamp)
            for card_id, column_id, title, details, position in SEED_CARDS
        ],
    )


def board_id_for_user(connection: sqlite3.Connection, username: str) -> int:
    row = connection.execute(
        """
        SELECT boards.id
        FROM boards
        JOIN users ON users.id = boards.user_id
        WHERE users.username = ?
        """,
        (username,),
    ).fetchone()
    if row is None:
        raise LookupError("Board not found")
    return row["id"]


def read_board(connection: sqlite3.Connection, board_id: int) -> dict[str, Any]:
    column_rows = connection.execute(
        "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position",
        (board_id,),
    ).fetchall()
    card_rows = connection.execute(
        """
        SELECT id, column_id, title, details
        FROM cards
        WHERE board_id = ?
        ORDER BY column_id, position
        """,
        (board_id,),
    ).fetchall()
    cards = {
        row["id"]: {
            "id": row["id"],
            "title": row["title"],
            "details": row["details"],
        }
        for row in card_rows
    }
    card_ids_by_column: dict[str, list[str]] = {
        row["id"]: [] for row in column_rows
    }
    for row in card_rows:
        card_ids_by_column[row["column_id"]].append(row["id"])
    return {
        "columns": [
            {
                "id": row["id"],
                "title": row["title"],
                "cardIds": card_ids_by_column[row["id"]],
            }
            for row in column_rows
        ],
        "cards": cards,
    }


def get_board(username: str) -> dict[str, Any]:
    with closing(connect()) as connection:
        return read_board(connection, board_id_for_user(connection, username))


def touch_board(connection: sqlite3.Connection, board_id: int) -> None:
    connection.execute(
        "UPDATE boards SET updated_at = ? WHERE id = ?",
        (now(), board_id),
    )


def rename_column(username: str, column_id: str, title: str) -> dict[str, Any]:
    with transaction() as connection:
        board_id = board_id_for_user(connection, username)
        result = connection.execute(
            "UPDATE columns SET title = ? WHERE board_id = ? AND id = ?",
            (title.strip(), board_id, column_id),
        )
        if result.rowcount == 0:
            raise LookupError("Column not found")
        touch_board(connection, board_id)
        return read_board(connection, board_id)


def create_card(username: str, column_id: str, title: str, details: str) -> dict[str, Any]:
    with transaction() as connection:
        board_id = board_id_for_user(connection, username)
        column = connection.execute(
            "SELECT 1 FROM columns WHERE board_id = ? AND id = ?",
            (board_id, column_id),
        ).fetchone()
        if column is None:
            raise LookupError("Column not found")
        position = connection.execute(
            "SELECT count(*) FROM cards WHERE board_id = ? AND column_id = ?",
            (board_id, column_id),
        ).fetchone()[0]
        card_id = f"card-{token_urlsafe(9)}"
        timestamp = now()
        connection.execute(
            """
            INSERT INTO cards
                (id, board_id, column_id, title, details, position, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (card_id, board_id, column_id, title.strip(), details.strip(), position, timestamp, timestamp),
        )
        touch_board(connection, board_id)
        return read_board(connection, board_id)


def update_card(username: str, card_id: str, title: str, details: str) -> dict[str, Any]:
    with transaction() as connection:
        board_id = board_id_for_user(connection, username)
        result = connection.execute(
            """
            UPDATE cards
            SET title = ?, details = ?, updated_at = ?
            WHERE board_id = ? AND id = ?
            """,
            (title.strip(), details.strip(), now(), board_id, card_id),
        )
        if result.rowcount == 0:
            raise LookupError("Card not found")
        touch_board(connection, board_id)
        return read_board(connection, board_id)


def set_positions(connection: sqlite3.Connection, board_id: int, column_id: str, card_ids: list[str]) -> None:
    for index, card_id in enumerate(card_ids):
        connection.execute(
            "UPDATE cards SET position = ? WHERE board_id = ? AND id = ?",
            (1_000_000 + index, board_id, card_id),
        )
    for index, card_id in enumerate(card_ids):
        connection.execute(
            "UPDATE cards SET position = ? WHERE board_id = ? AND id = ?",
            (index, board_id, card_id),
        )


def delete_card(username: str, card_id: str) -> dict[str, Any]:
    with transaction() as connection:
        board_id = board_id_for_user(connection, username)
        row = connection.execute(
            "SELECT column_id FROM cards WHERE board_id = ? AND id = ?",
            (board_id, card_id),
        ).fetchone()
        if row is None:
            raise LookupError("Card not found")
        connection.execute(
            "DELETE FROM cards WHERE board_id = ? AND id = ?",
            (board_id, card_id),
        )
        remaining = connection.execute(
            "SELECT id FROM cards WHERE board_id = ? AND column_id = ? ORDER BY position",
            (board_id, row["column_id"]),
        ).fetchall()
        set_positions(connection, board_id, row["column_id"], [item["id"] for item in remaining])
        touch_board(connection, board_id)
        return read_board(connection, board_id)


def move_card(username: str, card_id: str, target_column_id: str, target_position: int) -> dict[str, Any]:
    with transaction() as connection:
        board_id = board_id_for_user(connection, username)
        card = connection.execute(
            "SELECT column_id FROM cards WHERE board_id = ? AND id = ?",
            (board_id, card_id),
        ).fetchone()
        target = connection.execute(
            "SELECT 1 FROM columns WHERE board_id = ? AND id = ?",
            (board_id, target_column_id),
        ).fetchone()
        if card is None:
            raise LookupError("Card not found")
        if target is None:
            raise LookupError("Column not found")

        source_column_id = card["column_id"]
        source_ids = [
            row["id"]
            for row in connection.execute(
                "SELECT id FROM cards WHERE board_id = ? AND column_id = ? ORDER BY position",
                (board_id, source_column_id),
            )
        ]
        source_ids.remove(card_id)

        if source_column_id == target_column_id:
            target_ids = source_ids
        else:
            target_ids = [
                row["id"]
                for row in connection.execute(
                    "SELECT id FROM cards WHERE board_id = ? AND column_id = ? ORDER BY position",
                    (board_id, target_column_id),
                )
            ]
            connection.execute(
                "UPDATE cards SET position = ? WHERE board_id = ? AND id = ?",
                (3_000_000, board_id, card_id),
            )
            set_positions(connection, board_id, source_column_id, source_ids)
            set_positions(connection, board_id, target_column_id, target_ids)
            connection.execute(
                "UPDATE cards SET column_id = ?, position = ? WHERE board_id = ? AND id = ?",
                (target_column_id, 2_000_000, board_id, card_id),
            )

        position = max(0, min(target_position, len(target_ids)))
        target_ids.insert(position, card_id)
        set_positions(connection, board_id, target_column_id, target_ids)
        connection.execute(
            "UPDATE cards SET updated_at = ? WHERE board_id = ? AND id = ?",
            (now(), board_id, card_id),
        )
        touch_board(connection, board_id)
        return read_board(connection, board_id)


def validate_board_update(board: dict[str, Any]) -> None:
    expected_ids = [column_id for column_id, _, _, _ in FIXED_COLUMNS]
    columns = board["columns"]
    if [column["id"] for column in columns] != expected_ids:
        raise ValueError("AI board update must preserve the five fixed columns")

    referenced_ids = [
        card_id
        for column in columns
        for card_id in column["cardIds"]
    ]
    if len(referenced_ids) != len(set(referenced_ids)):
        raise ValueError("A card may appear in only one column")
    if set(referenced_ids) != set(board["cards"]):
        raise ValueError("Card records and column card IDs must match")
    if any(not column["title"].strip() for column in columns):
        raise ValueError("Column titles may not be blank")
    for card_id, card in board["cards"].items():
        if card["id"] != card_id or not card["title"].strip():
            raise ValueError("Cards require matching IDs and nonblank titles")


def replace_board(username: str, board: dict[str, Any]) -> dict[str, Any]:
    validate_board_update(board)
    with transaction() as connection:
        board_id = board_id_for_user(connection, username)
        card_ids = list(board["cards"])
        if card_ids:
            placeholders = ",".join("?" for _ in card_ids)
            collision = connection.execute(
                f"SELECT id FROM cards WHERE board_id != ? AND id IN ({placeholders})",
                (board_id, *card_ids),
            ).fetchone()
            if collision is not None:
                raise ValueError("Card ID belongs to another board")

        for column in board["columns"]:
            connection.execute(
                "UPDATE columns SET title = ? WHERE board_id = ? AND id = ?",
                (column["title"].strip(), board_id, column["id"]),
            )

        connection.execute("DELETE FROM cards WHERE board_id = ?", (board_id,))
        timestamp = now()
        for column in board["columns"]:
            for position, card_id in enumerate(column["cardIds"]):
                card = board["cards"][card_id]
                connection.execute(
                    """
                    INSERT INTO cards
                        (id, board_id, column_id, title, details, position, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        card_id,
                        board_id,
                        column["id"],
                        card["title"].strip(),
                        card["details"].strip(),
                        position,
                        timestamp,
                        timestamp,
                    ),
                )
        touch_board(connection, board_id)
        return read_board(connection, board_id)
