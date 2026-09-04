import os
from collections import defaultdict
from secrets import token_urlsafe
from time import monotonic
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from app.models import UserResponse

SESSION_COOKIE = "pm_session"
SESSION_TTL_SECONDS = 24 * 60 * 60

LOGIN_ATTEMPT_LIMIT = 5
LOGIN_ATTEMPT_WINDOW_SECONDS = 60.0
LOGIN_LOCKOUT_SECONDS = 30.0

sessions: dict[str, float] = {}
failed_login_attempts: dict[str, list[float]] = defaultdict(list)
login_lockouts: dict[str, float] = {}


def cookie_secure() -> bool:
    return os.environ.get("COOKIE_SECURE", "false").lower() in {"1", "true", "yes"}


def create_session() -> str:
    session_id = token_urlsafe(32)
    sessions[session_id] = monotonic()
    return session_id


def invalidate_session(session_id: str | None) -> None:
    if session_id is not None:
        sessions.pop(session_id, None)


def prune_sessions() -> None:
    now = monotonic()
    expired = [
        token
        for token, issued_at in sessions.items()
        if now - issued_at > SESSION_TTL_SECONDS
    ]
    for token in expired:
        sessions.pop(token, None)


def client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def is_locked_out(key: str) -> bool:
    locked_until = login_lockouts.get(key)
    if locked_until is None:
        return False
    if monotonic() >= locked_until:
        login_lockouts.pop(key, None)
        return False
    return True


def record_failed_login(key: str) -> None:
    now = monotonic()
    attempts = [
        attempt
        for attempt in failed_login_attempts[key]
        if now - attempt < LOGIN_ATTEMPT_WINDOW_SECONDS
    ]
    attempts.append(now)
    if len(attempts) >= LOGIN_ATTEMPT_LIMIT:
        login_lockouts[key] = now + LOGIN_LOCKOUT_SECONDS
        attempts = []
    failed_login_attempts[key] = attempts


def clear_failed_logins(key: str) -> None:
    failed_login_attempts.pop(key, None)
    login_lockouts.pop(key, None)


def current_user(request: Request) -> UserResponse:
    prune_sessions()
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id is None or session_id not in sessions:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return UserResponse(username="user")


AuthenticatedUser = Annotated[UserResponse, Depends(current_user)]
