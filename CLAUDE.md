# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A multi-user Kanban project management app with an AI chat sidebar that can read and modify the open board via structured output. Next.js frontend is statically exported and served by a FastAPI backend from one Docker container; SQLite is the only datastore.

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
uv run --with pytest-cov pytest --cov=app --cov-report=term-missing
```

### Frontend (from `frontend/`)

```bash
npm install
npm run dev        # Next.js dev server (UI only; /api needs the backend)
npm run lint
npm run build       # static export (output: "export")
npm run test:unit   # Vitest + Testing Library
npm run test:e2e    # Playwright (Chromium) against the real API
npm run test:all    # unit then e2e
```

The browser tests need the API. By default Playwright runs `npm run e2e:server`, which builds the export and starts FastAPI on `127.0.0.1:3100` with `STATIC_DIR` pointing at `out/` and a throwaway `DATA_DIR` (this needs `uv`). Set `PLAYWRIGHT_BASE_URL` to reuse a running stack instead, such as the Docker container on `http://localhost:8000`.

## Architecture

### Container build (`Dockerfile`)

Three stages: (1) `node:24` builds the Next.js static export, (2) `uv`-based image installs backend deps with `uv sync --frozen --no-dev`, (3) final `python:3.14-slim` image copies the venv, `backend/app`, and the frontend's exported `out/` as `static/`. FastAPI serves both the API and the static frontend from one process/port — there is no Next.js server in production.

### Backend (`backend/app/`)

- `main.py` — FastAPI app; maps domain errors to HTTP responses, includes the routers, and mounts static files at `/` last so API requests are never shadowed.
- `routers/` — the HTTP layer: `auth`, `users`, `boards` (boards, members, columns), `card_details` (labels, comments, checklists), `cards`, `chat`. Routers stay thin and delegate to one repository call.
- `repositories/` — the data layer, owning its own transactions: `users`, `sessions`, `boards`, `columns`, `cards`, `labels`, `card_details`, `board_updates`.
- `database.py` — connection helpers, schema, numbered migrations keyed on `PRAGMA user_version`, and seeding. Every connection enables foreign keys, WAL mode, and a busy timeout.
- `security.py` — PBKDF2 password hashing and session token generation/digesting.
- `auth.py` — session cookie settings, login throttling, and the `AuthenticatedUser`/`AdminUser` dependencies.
- `ai.py` — OpenRouter client (`openai/gpt-oss-120b`) and structured-output parsing/validation. `OPENROUTER_API_KEY` never leaves the backend.
- `models.py` — shared Pydantic request/response and AI schema models.
- Persistent files live under `DATA_DIR` (`/app/data` in Docker, via the `app-data` volume); the DB path is `${DATA_DIR}/pm.db`. `STATIC_DIR` overrides the served frontend directory.

### Auth and access

Accounts register with a username and password; passwords are stored as PBKDF2-SHA256 digests. Sign-in creates a server-side session persisted in SQLite (only the token digest is stored) and returned via an HTTP-only, SameSite cookie, so sessions survive a restart. Repeated failures per client and username are throttled. Accounts have an `admin` or `member` role; admins manage accounts, and the workspace always keeps one active administrator.

Board access is per board through `board_members`: `owner` (delete, archive, manage members), `editor` (change contents), `viewer` (read-only). Non-members get a 404 rather than a 403 so board existence is not observable. Every board query is scoped through the authenticated session and membership — there is no client-supplied user ID.

### Database model

Ten tables: `users`, `sessions`, `boards` (many per owner, archivable), `board_members`, `columns` (per board, addable/renamable/reorderable/deletable, with an optional WIP limit), `cards` (with priority, due date, and assignee; the composite FK ties a card to its board's column), `labels` and `card_labels`, `card_comments`, and `checklist_items`. Card, column, label, and checklist positions are zero-based; reorders and cross-column moves rewrite positions in one transaction, staged through a high temporary range to avoid uniqueness collisions. AI-driven updates validate the entire proposed change before any write begins, reconcile cards in place so a card's labels, comments, and checklist survive, and roll back completely on failure. Chat messages and plain-text passwords are never persisted.

### AI chat flow

`POST /api/boards/{id}/chat` loads the board from SQLite, sends a snapshot of it (columns, cards, priorities, due dates — no member details) plus the user's message and browser-supplied session history to OpenRouter, and requires a strict structured-output schema (assistant message + optional board update). A valid update is applied atomically and the resulting board is returned; an update may not add or remove columns, duplicate a card, or claim a card owned by another board. Conversation history is never written to SQLite or logs — it lives only in the frontend's in-memory session state (`ChatSidebar.tsx`) and resets on reload or when the open board changes.

### Frontend (`frontend/src/`)

- Next.js 16 App Router, React 19, strict TypeScript, static export only (no server actions or runtime-only Next.js APIs) — must work as static HTML served by FastAPI.
- `components/App.tsx` — session restore, then the auth screen or the workspace.
- `components/AuthScreen.tsx` — sign-in and registration.
- `components/Workspace.tsx` — the shell: board list, open board, the mutation runner every board action goes through, header, and dialogs.
- `components/BoardRail.tsx` / `BoardSettingsDialog.tsx` / `AccountDialog.tsx` / `Dialog.tsx` — board switching and creation, board sharing and lifecycle, profile and administration, shared modal shell.
- `components/KanbanBoard.tsx` — column rendering, filtering, and `@dnd-kit` drag-and-drop (pointer sensor, 6px activation distance, `closestCorners`).
- `components/KanbanColumn.tsx` / `KanbanCard.tsx` / `KanbanCardPreview.tsx` / `NewCardForm.tsx` / `NewColumnForm.tsx` / `BoardFilters.tsx` — column and card rendering, local form state, and the filter bar.
- `components/CardDetailDialog.tsx` — the expanded card: its fields, labels, checklist, and comment thread.
- `components/ChatSidebar.tsx` — session-only AI conversation state for the open board.
- `lib/api.ts` — typed same-origin `/api` client; browser code must never receive `OPENROUTER_API_KEY`.
- `lib/kanban.ts` — board types and pure helpers (`moveCard`, `wipState`, `dueState`, `labelsFor`, role checks); keep reusable board logic here and keep board transformations immutable.
- Required color tokens (do not change): yellow `#ecad0a`, blue `#209dd7`, purple `#753991`, navy `#032147`, gray `#888888`.
- Preserve accessible labels and existing `data-testid` values when touching tested interactions.
