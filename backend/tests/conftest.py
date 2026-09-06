"""Shared fixtures. Every test runs against its own SQLite file under ``tmp_path``."""

from collections.abc import Callable, Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import auth, database
from app.main import app

DEFAULT_USERNAME = database.DEFAULT_ADMIN_USERNAME
DEFAULT_PASSWORD = database.DEFAULT_ADMIN_PASSWORD


@pytest.fixture(autouse=True)
def isolated_database(tmp_path, monkeypatch) -> Iterator[None]:
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.delenv("COOKIE_SECURE", raising=False)
    auth.reset_login_throttling()
    yield
    auth.reset_login_throttling()


@pytest.fixture
def make_client(isolated_database) -> Iterator[Callable[[], TestClient]]:
    """Build additional clients so several accounts can be signed in at once."""
    opened: list[TestClient] = []

    def build() -> TestClient:
        client = TestClient(app)
        client.__enter__()
        opened.append(client)
        return client

    yield build
    for client in reversed(opened):
        client.__exit__(None, None, None)


@pytest.fixture
def client(make_client) -> TestClient:
    return make_client()


def sign_in(
    client: TestClient,
    username: str = DEFAULT_USERNAME,
    password: str = DEFAULT_PASSWORD,
) -> dict[str, Any]:
    response = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert response.status_code == 200, response.text
    return response.json()


def register(
    client: TestClient,
    username: str,
    password: str = "correct-horse",
    **extra: Any,
) -> dict[str, Any]:
    response = client.post(
        "/api/auth/register",
        json={"username": username, "password": password, **extra},
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def admin(client) -> TestClient:
    """The seeded administrator, signed in."""
    sign_in(client)
    return client


def only_board_id(client: TestClient) -> int:
    boards = client.get("/api/boards").json()
    assert len(boards) == 1, boards
    return boards[0]["id"]


@pytest.fixture
def board_id(admin) -> int:
    return only_board_id(admin)


def column_id(board: dict[str, Any], index: int = 0) -> str:
    return board["columns"][index]["id"]
