"""Schema versioning and the upgrade from the original single-board database."""

import sqlite3
from contextlib import closing

import pytest
from fastapi.testclient import TestClient

from app import database, security

V1_SCHEMA = """
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
"""

V1_COLUMNS = [
    ("col-backlog", "backlog", "Ideas", 0),
    ("col-discovery", "discovery", "Discovery", 1),
    ("col-progress", "progress", "In Progress", 2),
    ("col-review", "review", "Review", 3),
    ("col-done", "done", "Done", 4),
]


def build_v1_database() -> None:
    timestamp = "2026-01-01T00:00:00+00:00"
    with closing(database.connect()) as connection:
        connection.executescript(V1_SCHEMA)
        connection.execute("PRAGMA user_version = 1")
        connection.execute(
            "INSERT INTO users (id, username, created_at) VALUES (1, 'user', ?)",
            (timestamp,),
        )
        connection.execute(
            "INSERT INTO boards (id, user_id, title, created_at, updated_at) "
            "VALUES (1, 1, 'Legacy board', ?, ?)",
            (timestamp, timestamp),
        )
        connection.executemany(
            "INSERT INTO columns (id, board_id, key, title, position) VALUES (?, 1, ?, ?, ?)",
            V1_COLUMNS,
        )
        connection.execute(
            "INSERT INTO cards (id, board_id, column_id, title, details, position, "
            "created_at, updated_at) VALUES ('card-1', 1, 'col-backlog', 'Legacy card', "
            "'Still here', 0, ?, ?)",
            (timestamp, timestamp),
        )


def test_a_fresh_database_is_created_at_the_current_version(client: TestClient) -> None:
    with closing(database.connect()) as connection:
        version = connection.execute("PRAGMA user_version").fetchone()[0]

    assert version == database.SCHEMA_VERSION
    assert database.database_path().exists()


def test_a_v1_database_is_upgraded_in_place(isolated_database, make_client) -> None:
    build_v1_database()

    client = make_client()

    with closing(database.connect()) as connection:
        assert (
            connection.execute("PRAGMA user_version").fetchone()[0]
            == database.SCHEMA_VERSION
        )

    signed_in = client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    )
    assert signed_in.status_code == 200
    boards = client.get("/api/boards").json()
    assert [board["name"] for board in boards] == ["Legacy board"]
    assert boards[0]["role"] == "owner"

    board = client.get(f"/api/boards/{boards[0]['id']}").json()
    assert board["columns"][0]["title"] == "Ideas"
    assert board["cards"]["card-1"]["title"] == "Legacy card"
    assert board["cards"]["card-1"]["priority"] == "medium"
    assert board["cards"]["card-1"]["assigneeId"] is None


def test_migration_gives_the_legacy_account_a_usable_password(
    isolated_database, make_client
) -> None:
    build_v1_database()

    make_client()

    with closing(database.connect()) as connection:
        stored = connection.execute(
            "SELECT password_hash, role FROM users WHERE username = 'user'"
        ).fetchone()

    assert stored["role"] == "admin"
    assert security.verify_password(database.DEFAULT_ADMIN_PASSWORD, stored["password_hash"])


def test_migration_does_not_add_a_second_starter_board(
    isolated_database, make_client
) -> None:
    build_v1_database()

    client = make_client()
    client.post("/api/auth/login", json={"username": "user", "password": "password"})

    assert len(client.get("/api/boards").json()) == 1


def test_initialization_is_idempotent(client: TestClient) -> None:
    before = client.get("/api/boards")
    database.initialize_database()
    database.initialize_database()

    assert before.status_code == 401
    with closing(database.connect()) as connection:
        assert connection.execute("SELECT count(*) FROM users").fetchone()[0] == 1
        assert connection.execute("SELECT count(*) FROM boards").fetchone()[0] == 1


def test_a_newer_database_is_refused(isolated_database) -> None:
    with closing(database.connect()) as connection:
        connection.execute(f"PRAGMA user_version = {database.SCHEMA_VERSION + 1}")

    with pytest.raises(RuntimeError, match="Unsupported database version"):
        database.initialize_database()


def test_foreign_keys_and_wal_are_enabled(client: TestClient) -> None:
    with closing(database.connect()) as connection:
        assert connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        assert connection.execute("PRAGMA journal_mode").fetchone()[0] == "wal"


def test_deleting_a_board_cascades_to_columns_and_cards(
    admin: TestClient, board_id: int
) -> None:
    admin.delete(f"/api/boards/{board_id}")

    with closing(database.connect()) as connection:
        assert connection.execute("SELECT count(*) FROM columns").fetchone()[0] == 0
        assert connection.execute("SELECT count(*) FROM cards").fetchone()[0] == 0
        assert (
            connection.execute("SELECT count(*) FROM board_members").fetchone()[0] == 0
        )


def test_card_positions_stay_dense_and_zero_based(admin: TestClient, board_id: int) -> None:
    board = admin.get(f"/api/boards/{board_id}").json()
    admin.delete(f"/api/boards/{board_id}/cards/{board['columns'][0]['cardIds'][0]}")

    with closing(database.connect()) as connection:
        rows: list[sqlite3.Row] = connection.execute(
            "SELECT column_id, position FROM cards WHERE board_id = ? ORDER BY column_id, position",
            (board_id,),
        ).fetchall()

    by_column: dict[str, list[int]] = {}
    for row in rows:
        by_column.setdefault(row["column_id"], []).append(row["position"])
    for positions in by_column.values():
        assert positions == list(range(len(positions)))


def test_upgrading_an_already_current_database_does_nothing(client: TestClient) -> None:
    with closing(database.connect(foreign_keys=False)) as connection:
        assert (
            database.upgrade(connection, 0) == database.SCHEMA_VERSION
        )

    assert client.get("/api/health").status_code == 200


def test_a_failing_migration_leaves_the_version_alone(
    isolated_database, monkeypatch
) -> None:
    build_v1_database()

    def explode(_):
        raise RuntimeError("migration blew up")

    monkeypatch.setitem(database.MIGRATIONS, 1, explode)

    with pytest.raises(RuntimeError, match="migration blew up"):
        database.initialize_database()

    with closing(database.connect()) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 1
        assert connection.execute(
            "SELECT title FROM boards WHERE id = 1"
        ).fetchone()["title"] == "Legacy board"
