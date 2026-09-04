# Backend guide

The backend is a Python 3.14 FastAPI application managed with `uv`.

## Structure

- `app/main.py` creates the FastAPI application, defines `/api` routes, and mounts static files at `/`.
- `app/auth.py` owns the session store, login lockout tracking, cookie settings, and the `current_user` dependency.
- `app/middleware.py` owns cross-cutting ASGI middleware (currently the request body size limit).
- `app/db.py` owns SQLite initialization, seed data, queries, and transactional board mutations.
- `app/ai.py` owns OpenRouter requests and structured-output parsing.
- `app/models.py` contains shared Pydantic API and AI models.
- `static/` contains the development fallback page. The Docker build replaces it with the exported Next.js frontend.
- `tests/` contains pytest tests using FastAPI's `TestClient`.
- `pyproject.toml` defines runtime and development dependencies.
- `uv.lock` is committed for reproducible container builds.

## Conventions

- Define API routes before the root static mount so `/api` requests are not intercepted.
- Keep browser-facing APIs under `/api`.
- Resolve project paths from `__file__`, not the process working directory.
- Keep request and response models explicit as the API grows.
- Store persistent application files under the `DATA_DIR` location, which is `/app/data` in Docker.
- Never expose or log `OPENROUTER_API_KEY`.
- Scope every board query through the authenticated username.
- Validate complete AI board updates before starting their write transaction.

## Tests

Run backend tests in the project container tooling or with a local `uv` installation:

```bash
cd backend
uv run pytest
```