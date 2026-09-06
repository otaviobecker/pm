# Backend guide

The backend is a Python 3.14 FastAPI application managed with `uv`.

## Structure

- `app/main.py` creates the FastAPI application, maps domain errors to HTTP responses, includes the routers, and mounts static files at `/`.
- `app/routers/` holds the HTTP layer, one module per area: `auth` (register, login, logout, session), `users` (directory, profile, password, administration), `boards` (boards, members, columns), `cards`, and `chat`.
- `app/repositories/` holds the data layer, one module per aggregate: `users`, `sessions`, `boards` (including membership and the board projection), `columns`, `cards`, and `board_updates` (the whole-board replacement used by the assistant).
- `app/database.py` owns the connection helpers, the schema, numbered migrations, and first-run seeding.
- `app/security.py` owns password hashing (PBKDF2-SHA256) and session token generation and digesting.
- `app/auth.py` owns cookie settings, login throttling, and the `AuthenticatedUser` and `AdminUser` dependencies.
- `app/errors.py` defines the domain errors that `main.py` maps to 404, 403, 409, and 422.
- `app/middleware.py` owns cross-cutting ASGI middleware (currently the request body size limit).
- `app/ai.py` owns OpenRouter requests, the board snapshot sent to the model, and structured-output parsing.
- `app/models.py` contains shared Pydantic API and AI models.
- `static/` contains the development fallback page. The Docker build replaces it with the exported Next.js frontend, and `STATIC_DIR` can point elsewhere.
- `tests/` contains pytest tests using FastAPI's `TestClient`, split by area with shared fixtures in `conftest.py`.
- `pyproject.toml` defines runtime and development dependencies.
- `uv.lock` is committed for reproducible container builds.

## Conventions

- Define API routes before the root static mount so `/api` requests are not intercepted.
- Keep browser-facing APIs under `/api`.
- Resolve project paths from `__file__`, not the process working directory.
- Keep request and response models explicit as the API grows. Responses use camelCase field names.
- Store persistent application files under the `DATA_DIR` location, which is `/app/data` in Docker.
- Never expose or log `OPENROUTER_API_KEY`. Never store a plain-text password or a raw session token.
- Routers stay thin: they validate input, call one repository function, and return its result. Repositories own their own transactions.
- Scope every board query through `boards.require_access`, which resolves the caller's membership role. A non-member gets `NotFoundError`, an under-privileged member gets `PermissionDeniedError`.
- Rewrite positions through the high temporary range so a unique index is never violated mid-update.
- Validate complete AI board updates before starting their write transaction.

## Tests

Run backend tests in the project container tooling or with a local `uv` installation:

```bash
cd backend
uv run pytest
uv run pytest -k test_name
uv run --with pytest-cov pytest --cov=app --cov-report=term-missing
```

Statement coverage is above 95 percent; keep it there when adding code. `RUN_LIVE_AI_TEST=1` enables the two opt-in tests that call OpenRouter for real.
