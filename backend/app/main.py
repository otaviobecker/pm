import os
from collections import defaultdict
from contextlib import asynccontextmanager
from pathlib import Path
from secrets import compare_digest, token_urlsafe
from time import monotonic
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from app import ai, db
from app.models import (
    BoardResponse,
    CardRequest,
    ChatRequest,
    ChatResponse,
    CreateCardRequest,
    LoginRequest,
    MoveCardRequest,
    RenameColumnRequest,
    UserResponse,
)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
SESSION_COOKIE = "pm_session"
SESSION_TTL_SECONDS = 24 * 60 * 60
MAX_REQUEST_BODY_BYTES = 3_000_000


def _cookie_secure() -> bool:
    return os.environ.get("COOKIE_SECURE", "false").lower() in {"1", "true", "yes"}

LOGIN_ATTEMPT_LIMIT = 5
LOGIN_ATTEMPT_WINDOW_SECONDS = 60.0
LOGIN_LOCKOUT_SECONDS = 30.0

sessions: dict[str, float] = {}
failed_login_attempts: dict[str, list[float]] = defaultdict(list)
login_lockouts: dict[str, float] = {}


def _prune_sessions() -> None:
    now = monotonic()
    expired = [
        token
        for token, issued_at in sessions.items()
        if now - issued_at > SESSION_TTL_SECONDS
    ]
    for token in expired:
        sessions.pop(token, None)


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _is_locked_out(key: str) -> bool:
    locked_until = login_lockouts.get(key)
    if locked_until is None:
        return False
    if monotonic() >= locked_until:
        login_lockouts.pop(key, None)
        return False
    return True


def _record_failed_login(key: str) -> None:
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


def _clear_failed_logins(key: str) -> None:
    failed_login_attempts.pop(key, None)
    login_lockouts.pop(key, None)


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.initialize_database()
    yield


app = FastAPI(title="Project Management API", lifespan=lifespan)


@app.middleware("http")
async def limit_request_body_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            too_large = int(content_length) > MAX_REQUEST_BODY_BYTES
        except ValueError:
            too_large = False
        if too_large:
            return JSONResponse(
                status_code=413,
                content={"detail": "Request body too large"},
            )
    return await call_next(request)


def current_user(request: Request) -> UserResponse:
    _prune_sessions()
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id is None or session_id not in sessions:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return UserResponse(username="user")


AuthenticatedUser = Annotated[UserResponse, Depends(current_user)]


@app.exception_handler(LookupError)
def not_found(_: Request, exception: LookupError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"detail": str(exception)},
    )


@app.exception_handler(ai.AiConfigurationError)
def ai_not_configured(_: Request, exception: ai.AiConfigurationError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": str(exception)},
    )


@app.exception_handler(ai.AiServiceError)
@app.exception_handler(ai.AiResponseError)
def ai_upstream_error(_: Request, exception: ai.AiError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_502_BAD_GATEWAY,
        content={"detail": str(exception)},
    )


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/hello")
def hello() -> dict[str, str]:
    return {"message": "Hello from FastAPI"}


@app.post("/api/auth/login", response_model=UserResponse)
def login(credentials: LoginRequest, request: Request, response: Response) -> UserResponse:
    client_key = _client_key(request)
    if _is_locked_out(client_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Try again shortly.",
        )

    username_matches = compare_digest(credentials.username, "user")
    password_matches = compare_digest(credentials.password, "password")
    if not username_matches or not password_matches:
        _record_failed_login(client_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    _clear_failed_logins(client_key)
    session_id = token_urlsafe(32)
    sessions[session_id] = monotonic()
    response.set_cookie(
        key=SESSION_COOKIE,
        value=session_id,
        httponly=True,
        samesite="lax",
        secure=_cookie_secure(),
    )
    return UserResponse(username="user")


@app.get("/api/auth/session", response_model=UserResponse)
def read_session(user: AuthenticatedUser) -> UserResponse:
    return user


@app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response) -> None:
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id is not None:
        sessions.pop(session_id, None)
    response.delete_cookie(
        SESSION_COOKIE, httponly=True, samesite="lax", secure=_cookie_secure()
    )


@app.get("/api/board", response_model=BoardResponse)
def read_board(user: AuthenticatedUser) -> dict:
    return db.get_board(user.username)


@app.patch("/api/board/columns/{column_id}", response_model=BoardResponse)
def rename_board_column(
    column_id: str,
    change: RenameColumnRequest,
    user: AuthenticatedUser,
) -> dict:
    return db.rename_column(user.username, column_id, change.title)


@app.post("/api/board/cards", response_model=BoardResponse)
def add_board_card(card: CreateCardRequest, user: AuthenticatedUser) -> dict:
    return db.create_card(user.username, card.columnId, card.title, card.details)


@app.patch("/api/board/cards/{card_id}", response_model=BoardResponse)
def edit_board_card(
    card_id: str,
    change: CardRequest,
    user: AuthenticatedUser,
) -> dict:
    return db.update_card(user.username, card_id, change.title, change.details)


@app.delete("/api/board/cards/{card_id}", response_model=BoardResponse)
def remove_board_card(card_id: str, user: AuthenticatedUser) -> dict:
    return db.delete_card(user.username, card_id)


@app.post("/api/board/cards/{card_id}/move", response_model=BoardResponse)
def move_board_card(
    card_id: str,
    move: MoveCardRequest,
    user: AuthenticatedUser,
) -> dict:
    return db.move_card(user.username, card_id, move.columnId, move.position)


@app.post("/api/ai/test")
def test_ai_connection(_: AuthenticatedUser) -> dict[str, str]:
    return {"message": ai.test_connectivity()}


@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest, user: AuthenticatedUser) -> ChatResponse:
    board = BoardResponse.model_validate(db.get_board(user.username))
    result = ai.chat(board, request.message, request.history)
    if result.board is None:
        return ChatResponse(message=result.message, board=None)
    board_update = {
        "columns": [
            {
                "id": column.id,
                "title": column.title,
                "cardIds": [card.id for card in column.cards],
            }
            for column in result.board.columns
        ],
        "cards": {
            card.id: card.model_dump()
            for column in result.board.columns
            for card in column.cards
        },
    }
    try:
        updated_board = db.replace_board(
            user.username,
            board_update,
        )
    except ValueError as exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="AI returned an invalid board update",
        ) from exception
    return ChatResponse(
        message=result.message,
        board=BoardResponse.model_validate(updated_board),
    )


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
