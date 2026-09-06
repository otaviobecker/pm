"""Session cookie handling, login throttling, and the request dependencies."""

import os
from collections import defaultdict
from time import monotonic
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response, status

from app.models import UserResponse
from app.repositories import sessions

SESSION_COOKIE = "pm_session"

LOGIN_ATTEMPT_LIMIT = 5
LOGIN_ATTEMPT_WINDOW_SECONDS = 60.0
LOGIN_LOCKOUT_SECONDS = 30.0

failed_login_attempts: dict[str, list[float]] = defaultdict(list)
login_lockouts: dict[str, float] = {}


def cookie_secure() -> bool:
    return os.environ.get("COOKIE_SECURE", "false").lower() in {"1", "true", "yes"}


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        secure=cookie_secure(),
        max_age=int(sessions.SESSION_TTL.total_seconds()),
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        SESSION_COOKIE,
        httponly=True,
        samesite="lax",
        secure=cookie_secure(),
        path="/",
    )


def client_key(request: Request, username: str = "") -> str:
    host = request.client.host if request.client else "unknown"
    return f"{host}:{username.strip().lower()}"


def is_locked_out(key: str) -> bool:
    locked_until = login_lockouts.get(key)
    if locked_until is None:
        return False
    if monotonic() >= locked_until:
        login_lockouts.pop(key, None)
        return False
    return True


def record_failed_login(key: str) -> None:
    current = monotonic()
    attempts = [
        attempt
        for attempt in failed_login_attempts[key]
        if current - attempt < LOGIN_ATTEMPT_WINDOW_SECONDS
    ]
    attempts.append(current)
    if len(attempts) >= LOGIN_ATTEMPT_LIMIT:
        login_lockouts[key] = current + LOGIN_LOCKOUT_SECONDS
        attempts = []
    failed_login_attempts[key] = attempts


def clear_failed_logins(key: str) -> None:
    failed_login_attempts.pop(key, None)
    login_lockouts.pop(key, None)


def reset_login_throttling() -> None:
    """Test and administration helper that forgets every recorded failure."""
    failed_login_attempts.clear()
    login_lockouts.clear()


def current_user(request: Request) -> UserResponse:
    user = sessions.resolve(request.cookies.get(SESSION_COOKIE))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return UserResponse.model_validate(user)


AuthenticatedUser = Annotated[UserResponse, Depends(current_user)]


def current_admin(user: AuthenticatedUser) -> UserResponse:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required",
        )
    return user


AdminUser = Annotated[UserResponse, Depends(current_admin)]
