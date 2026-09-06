"""Unit coverage for the OpenRouter client and the structured-output guards."""

import types

import httpx2
import pytest

from app import ai
from app.errors import InvalidRequestError
from app.repositories import board_updates


class FakeResponse:
    def __init__(self, payload: dict | None = None, error: Exception | None = None):
        self._payload = payload or {}
        self._error = error
        self.status_code = 500

    def raise_for_status(self) -> None:
        if self._error is not None:
            raise self._error

    def json(self) -> dict:
        return self._payload


def fake_client(result):
    class Client:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, *args, **kwargs):
            if isinstance(result, Exception):
                raise result
            return result

    return Client


@pytest.fixture
def api_key(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")


def install_client(monkeypatch, result) -> None:
    stub = types.SimpleNamespace(
        Client=fake_client(result),
        TimeoutException=httpx2.TimeoutException,
        HTTPStatusError=httpx2.HTTPStatusError,
        RequestError=httpx2.RequestError,
    )
    monkeypatch.setattr(ai, "httpx2", stub)


def test_missing_api_key_is_a_configuration_error(monkeypatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    with pytest.raises(ai.AiConfigurationError):
        ai.post_openrouter({})


def test_successful_request_returns_the_payload(monkeypatch, api_key) -> None:
    install_client(monkeypatch, FakeResponse({"ok": True}))

    assert ai.post_openrouter({}) == {"ok": True}


def test_timeouts_become_service_errors(monkeypatch, api_key) -> None:
    install_client(monkeypatch, httpx2.TimeoutException("slow"))

    with pytest.raises(ai.AiServiceError, match="timed out"):
        ai.post_openrouter({})


def test_http_errors_become_service_errors(monkeypatch, api_key) -> None:
    response = FakeResponse()
    install_client(
        monkeypatch,
        FakeResponse(
            error=httpx2.HTTPStatusError("boom", request=None, response=response)
        ),
    )

    with pytest.raises(ai.AiServiceError, match="status 500"):
        ai.post_openrouter({})


def test_transport_errors_become_service_errors(monkeypatch, api_key) -> None:
    install_client(monkeypatch, httpx2.RequestError("no route"))

    with pytest.raises(ai.AiServiceError, match="Unable to reach"):
        ai.post_openrouter({})


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"choices": []},
        {"choices": [{"message": {}}]},
        {"choices": [{"message": {"content": "   "}}]},
        {"choices": [{"message": {"content": 42}}]},
    ],
)
def test_unusable_completions_are_rejected(payload) -> None:
    with pytest.raises(ai.AiResponseError):
        ai.response_content(payload)


def board_proposal(**overrides):
    proposal = {
        "columns": [
            {"id": "col-a", "title": "A", "cardIds": ["card-1"]},
            {"id": "col-b", "title": "B", "cardIds": []},
        ],
        "cards": {
            "card-1": {"id": "card-1", "title": "One", "details": "", "priority": "low"}
        },
    }
    proposal.update(overrides)
    return proposal


def test_validate_accepts_a_well_formed_proposal() -> None:
    board_updates.validate(board_proposal(), ["col-a", "col-b"])


@pytest.mark.parametrize(
    ("proposal", "message"),
    [
        (board_proposal(), "existing columns"),
        (
            board_proposal(
                columns=[
                    {"id": "col-a", "title": "A", "cardIds": ["card-1"]},
                    {"id": "col-b", "title": "B", "cardIds": ["card-1"]},
                ]
            ),
            "only one column",
        ),
        (
            board_proposal(
                columns=[
                    {"id": "col-a", "title": "A", "cardIds": []},
                    {"id": "col-b", "title": "B", "cardIds": []},
                ]
            ),
            "must match",
        ),
        (
            board_proposal(
                columns=[
                    {"id": "col-a", "title": "  ", "cardIds": ["card-1"]},
                    {"id": "col-b", "title": "B", "cardIds": []},
                ]
            ),
            "may not be blank",
        ),
        (
            board_proposal(
                cards={
                    "card-1": {
                        "id": "card-1",
                        "title": "  ",
                        "details": "",
                        "priority": "low",
                    }
                }
            ),
            "nonblank titles",
        ),
        (
            board_proposal(
                cards={
                    "card-1": {
                        "id": "card-1",
                        "title": "One",
                        "details": "",
                        "priority": "someday",
                    }
                }
            ),
            "Unknown card priority",
        ),
    ],
)
def test_validate_rejects_broken_proposals(proposal, message) -> None:
    expected_columns = ["col-a"] if message == "existing columns" else ["col-a", "col-b"]

    with pytest.raises(InvalidRequestError, match=message):
        board_updates.validate(proposal, expected_columns)
