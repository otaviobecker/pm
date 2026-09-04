# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A single-user-per-account Kanban board (Project Management MVP) with an AI chat sidebar that can read and modify the board via structured output. Next.js frontend is statically exported and served by a FastAPI backend from one Docker container; SQLite is the only datastore.

Each subdirectory has its own `AGENTS.md` with more detail: `backend/AGENTS.md`, `frontend/AGENTS.md`, `scripts/AGENTS.md`. Read the relevant one before making non-trivial changes there. `docs/PLAN.md` records the agreed implementation plan and constraints; `docs/DATABASE.md` and `docs/database-schema.json` document the SQLite schema.

## Commands

### Run the full stack (Docker)

Requires Docker Desktop. Create `.env` in the project root with `OPENROUTER_API_KEY=your-key` to enable AI chat.

```powershell
.\scripts\start.ps1   # Windows
.\scripts\stop.ps1
```

```bash
sh scripts/start.sh   # macOS/Linux
sh scripts/stop.sh
```

App is served at `http://localhost:8000`. Start scripts may rebuild images; stop scripts must preserve the named `app-data` volume (SQLite persistence).

### Backend (from `backend/`)

```bash
uv run pytest              # all backend tests
uv run pytest -k test_name # single test
```

### Frontend (from `frontend/`)

```bash
npm install
npm run dev        # Next.js dev server
npm run lint
npm run build       # static export (output: "export")
npm run test:unit   # Vitest + Testing Library
npm run test:e2e    # Playwright (Chromium), starts dev server on 127.0.0.1:3000 unless PLAYWRIGHT_BASE_URL is set
npm run test:all    # unit then e2e
```

## Architecture

### Container build (`Dockerfile`)

Three stages: (1) `node:24` builds the Next.js static export, (2) `uv`-based image installs backend deps with `uv sync --frozen --no-dev`, (3) final `python:3.14-slim` image copies the venv, `backend/app`, and the frontend's exported `out/` as `static/`. FastAPI serves both the API and the static frontend from one process/port — there is no Next.js server in production.

### Backend (`backend/app/`)

- `main.py` — FastAPI app; defines `/api` routes before mounting static files at `/`, so API requests are never shadowed by the static mount.
- `db.py` — SQLite init/migration (via `PRAGMA user_version`), seeding, queries, and all board mutations. Every connection enables foreign keys, WAL mode, and a busy timeout.
- `ai.py` — OpenRouter client (`openai/gpt-oss-120b`) and structured-output parsing/validation. `OPENROUTER_API_KEY` never leaves the backend.
- `models.py` — shared Pydantic request/response and AI schema models.
- Persistent files live under `DATA_DIR` (`/app/data` in Docker, via the `app-data` volume); the DB path is `${DATA_DIR}/pm.db`.
- All board reads/writes are scoped through the authenticated username — there is no client-supplied user ID.

### Auth

Hardcoded `user`/`password` credentials. Login creates an opaque in-memory server-side session returned via an HTTP-only, SameSite cookie; sessions are not persisted and are lost on backend restart. A shared dependency protects all board/API routes.

### Database model

Four tables: `users`, `boards` (one per user, enforced unique), fixed ordered `columns` (`backlog`, `discovery`, `progress`, `review`, `done` — creation/deletion/reordering are not API operations, only titles are mutable), and ordered `cards` (composite FK ties a card to its board's column). Card/column positions are zero-based; reorders and cross-column moves rewrite positions in one transaction, staged through a high temporary range to avoid uniqueness collisions. AI-driven updates validate the entire proposed change before any write begins, and roll back completely on failure. Chat messages and passwords are never persisted.

### AI chat flow

The chat endpoint loads the current board from SQLite, sends it plus the user's message and browser-supplied current-session history to OpenRouter, and requires a strict structured-output schema (assistant message + optional board update). A valid update is applied atomically and the resulting board is returned; conversation history is never written to SQLite or logs — it lives only in the frontend's in-memory session state (`ChatSidebar.tsx`) and resets on reload.

### Frontend (`frontend/src/`)

- Next.js 16 App Router, React 19, strict TypeScript, static export only (no server actions or runtime-only Next.js APIs) — must work as static HTML served by FastAPI.
- `components/App.tsx` — session restore, sign-in/logout.
- `components/KanbanBoard.tsx` — loads board from the API, coordinates mutations and `@dnd-kit` drag-and-drop (pointer sensor, 6px activation distance, `closestCorners`).
- `components/ChatSidebar.tsx` — owns session-only AI conversation state and applies board updates returned from chat.
- `components/KanbanColumn.tsx` / `KanbanCard.tsx` / `KanbanCardPreview.tsx` / `NewCardForm.tsx` — column/card rendering and local form state.
- `lib/api.ts` — typed same-origin `/api` client; browser code must never receive `OPENROUTER_API_KEY`.
- `lib/kanban.ts` — board types, seed fixtures, and the pure `moveCard` operation; keep reusable board logic here and keep board transformations immutable.
- Required color tokens (do not change): yellow `#ecad0a`, blue `#209dd7`, purple `#753991`, navy `#032147`, gray `#888888`.
- Preserve accessible labels and existing `data-testid` values when touching tested interactions.
