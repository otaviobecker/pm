"""Password hashing and opaque token helpers built on the standard library."""

import hashlib
from base64 import urlsafe_b64encode
from secrets import compare_digest, token_bytes

ALGORITHM = "pbkdf2_sha256"
ITERATIONS = 240_000
SALT_BYTES = 16
TOKEN_BYTES = 32

# Stored on accounts that must never authenticate with a password.
UNUSABLE_PASSWORD_HASH = "!"


def hash_password(password: str, *, salt: bytes | None = None) -> str:
    """Return a self-describing PBKDF2 digest of ``password``."""
    salt = token_bytes(SALT_BYTES) if salt is None else salt
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS)
    return f"{ALGORITHM}${ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    """Check ``password`` against a stored digest in constant time."""
    try:
        algorithm, iterations, salt_hex, digest_hex = encoded.split("$")
        if algorithm != ALGORITHM:
            return False
        expected = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        )
    except (AttributeError, ValueError):
        return False
    return compare_digest(expected.hex(), digest_hex)


def generate_token() -> str:
    """Return a URL-safe opaque token for a session cookie."""
    return urlsafe_b64encode(token_bytes(TOKEN_BYTES)).decode("ascii").rstrip("=")


def hash_token(token: str) -> str:
    """Return the digest stored for a session token; raw tokens are never persisted."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
