import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app import ai, database
from app.errors import (
    ConflictError,
    InvalidRequestError,
    NotFoundError,
    PermissionDeniedError,
)
from app.middleware import limit_request_body_size
from app.repositories import sessions
from app.routers import auth, boards, cards, chat, users

# Defaults to the development fallback page; the Docker build and the browser
# tests point this at the exported Next.js frontend.
STATIC_DIR = Path(
    os.environ.get("STATIC_DIR")
    or Path(__file__).resolve().parent.parent / "static"
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    database.initialize_database()
    sessions.prune_expired()
    yield


app = FastAPI(title="Project Management API", lifespan=lifespan)
app.middleware("http")(limit_request_body_size)


def error_response(status_code: int, exception: Exception) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"detail": str(exception)})


@app.exception_handler(NotFoundError)
def not_found(_: Request, exception: NotFoundError) -> JSONResponse:
    return error_response(status.HTTP_404_NOT_FOUND, exception)


@app.exception_handler(PermissionDeniedError)
def permission_denied(_: Request, exception: PermissionDeniedError) -> JSONResponse:
    return error_response(status.HTTP_403_FORBIDDEN, exception)


@app.exception_handler(ConflictError)
def conflict(_: Request, exception: ConflictError) -> JSONResponse:
    return error_response(status.HTTP_409_CONFLICT, exception)


@app.exception_handler(InvalidRequestError)
def invalid_request(_: Request, exception: InvalidRequestError) -> JSONResponse:
    return error_response(status.HTTP_422_UNPROCESSABLE_CONTENT, exception)


@app.exception_handler(ai.AiConfigurationError)
def ai_not_configured(_: Request, exception: ai.AiConfigurationError) -> JSONResponse:
    return error_response(status.HTTP_503_SERVICE_UNAVAILABLE, exception)


@app.exception_handler(ai.AiServiceError)
@app.exception_handler(ai.AiResponseError)
def ai_upstream_error(_: Request, exception: ai.AiError) -> JSONResponse:
    return error_response(status.HTTP_502_BAD_GATEWAY, exception)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(boards.router)
app.include_router(cards.router)
app.include_router(chat.router)

# Mounted last so that no static file can shadow an /api route.
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
