"""Password hashing, token handling, and the request size guard."""

import pytest
from fastapi.testclient import TestClient

from app import security
from app.middleware import MAX_REQUEST_BODY_BYTES


def test_hashing_is_salted_and_verifiable() -> None:
    first = security.hash_password("correct-horse")
    second = security.hash_password("correct-horse")

    assert first != second
    assert security.verify_password("correct-horse", first)
    assert security.verify_password("correct-horse", second)


def test_verification_rejects_the_wrong_password() -> None:
    encoded = security.hash_password("correct-horse")

    assert not security.verify_password("battery-staple", encoded)


@pytest.mark.parametrize(
    "encoded",
    [
        "",
        "!",
        "not-a-hash",
        "bcrypt$1$aa$bb",
        "pbkdf2_sha256$notanumber$aa$bb",
        "pbkdf2_sha256$1$zz$bb",
    ],
)
def test_verification_rejects_unusable_hashes(encoded: str) -> None:
    assert not security.verify_password("correct-horse", encoded)


def test_tokens_are_unique_and_hashed_consistently() -> None:
    first = security.generate_token()
    second = security.generate_token()

    assert first != second
    assert security.hash_token(first) == security.hash_token(first)
    assert security.hash_token(first) != security.hash_token(second)


def test_a_malformed_content_length_is_ignored(client: TestClient) -> None:
    response = client.get("/api/health", headers={"content-length": "not-a-number"})

    assert response.status_code == 200


def test_the_body_limit_is_generous_enough_for_normal_requests() -> None:
    assert MAX_REQUEST_BODY_BYTES > 1_000_000
