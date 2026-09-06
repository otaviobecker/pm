"""Registration, sign-in, sign-out, and session inspection."""

from fastapi import APIRouter, HTTPException, Request, Response, status

from app.auth import (
    SESSION_COOKIE,
    AuthenticatedUser,
    clear_failed_logins,
    clear_session_cookie,
    client_key,
    is_locked_out,
    record_failed_login,
    set_session_cookie,
)
from app.models import LoginRequest, RegisterRequest, UserResponse
from app.repositories import sessions, users

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, response: Response) -> UserResponse:
    user = users.create(
        payload.username,
        payload.password,
        payload.displayName,
        payload.email,
    )
    set_session_cookie(response, sessions.create(user["id"]))
    return UserResponse.model_validate(user)


@router.post("/login", response_model=UserResponse)
def login(
    credentials: LoginRequest, request: Request, response: Response
) -> UserResponse:
    key = client_key(request, credentials.username)
    if is_locked_out(key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Try again shortly.",
        )

    user = users.authenticate(credentials.username, credentials.password)
    if user is None:
        record_failed_login(key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    clear_failed_logins(key)
    set_session_cookie(response, sessions.create(user["id"]))
    return UserResponse.model_validate(user)


@router.get("/session", response_model=UserResponse)
def read_session(user: AuthenticatedUser) -> UserResponse:
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response) -> None:
    sessions.destroy(request.cookies.get(SESSION_COOKIE))
    clear_session_cookie(response)
