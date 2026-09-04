# Code review

Full-repository review of the Project Management MVP: FastAPI + SQLite backend, statically-exported Next.js frontend, Docker packaging, and test suites. Scope was every source file under `backend/`, `frontend/src`, `frontend/tests`, `scripts/`, the Docker/Compose setup, and `docs/`. Generated code (`node_modules`, `.next`, lockfiles) and vendor output were excluded.

Findings are ordered by severity within each area. Each includes the affected location and a concrete action. A consolidated checklist is at the end.

**Status: all 12 findings fixed and verified** (see the "Verification" note added to each finding, and the checklist at the end). One additional issue (#13) was found and fixed while verifying the Docker hardening — see the Docker section.

## Summary

| Severity | Count |
|---|---|
| High | 2 (1 original + #13 found during fix verification) |
| Medium | 5 |
| Low | 6 |

Nothing found rises to "critical" for the app's stated scope (a local, single-user Docker demo with hardcoded credentials). The most important finding is a real concurrency bug reachable from normal use (two browser tabs); the rest are hardening items that matter more if this MVP is ever exposed beyond localhost or given real credentials.

## Backend

### 1. Card create/move have a TOCTOU race that can corrupt ordering or 500 (High)

`backend/app/db.py:233-257` (`create_card`) and `backend/app/db.py:312-367` (`move_card`) read state with plain `SELECT`s, compute a new position/ordering in Python, and only then issue the first `INSERT`/`UPDATE`. Python's `sqlite3` module (default `isolation_level=""`) does not open an implicit transaction until the first write statement, so every `SELECT` before that point runs outside any lock.

Concretely: `create_card` does `SELECT count(*) FROM cards WHERE board_id=? AND column_id=?` to pick the new row's position, then inserts at that position several statements later (`db.py:242-255`). Two requests that create a card in the same column at nearly the same time (e.g. two open browser tabs) can both read the same count and both attempt to insert at the same `(board_id, column_id, position)`, which is `UNIQUE` (`db.py:64`). The loser gets an unhandled `sqlite3.IntegrityError` — there is no exception handler for it in `main.py`, so the client sees a bare 500.

`move_card` has a subtler version: for a cross-column move it reads the target column's card order (`db.py:341-347`) *before* any write starts, then later overwrites positions for every card in that stale list (`set_positions`, `db.py:277-287`). If another request concurrently moved one of those cards out of the target column in between, this write blindly reassigns its `position` in its *new* column, which can silently duplicate or skip positions there.

**Action:** open these transactions with `BEGIN IMMEDIATE` (e.g. `connection.execute("BEGIN IMMEDIATE")` right after `connect()` in `transaction()`, or set `isolation_level=None` and manage transactions explicitly) so the read-modify-write sequence in `create_card`/`move_card`/`delete_card` holds the write lock for its whole duration. Add a test that fires two `create_card` calls against the same column without waiting for the first to commit (or interleave with `threading`) to confirm no `IntegrityError` surfaces.

**Verification:** `connect()` now opens with `isolation_level=None` and `transaction()` issues `BEGIN IMMEDIATE` immediately (`db.py`), so every mutation holds the write lock for its whole read-modify-write sequence. Confirmed the bug was real by temporarily reverting the fix and re-running the new concurrency test (#9) — it failed with exactly the predicted `sqlite3.IntegrityError: UNIQUE constraint failed: cards.board_id, cards.column_id, cards.position`; restoring the fix made it pass consistently across 8 repeated runs.

### 2. Login has no throttling (Medium)

`backend/app/main.py:85-103`. Credentials are fixed (`user`/`password` — deliberately, per `docs/PLAN.md`), compared with `secrets.compare_digest` (good, timing-safe), but there is no rate limit, delay, or lockout on repeated failed attempts. For a purely local demo this is low risk; if this container is ever reachable over a network, the fixed password becomes brute-forceable in effectively zero time.

**Action:** before any non-localhost deployment, add a per-IP or per-username attempt limiter (e.g. `slowapi`, or a simple in-memory token-bucket next to the existing `sessions` set) on `/api/auth/login`.

**Verification:** added an in-memory per-client-IP limiter (`main.py`): 5 failed attempts within 60 seconds locks that client out for 30 seconds with a 429. Confirmed live against a running server — 5 wrong-password attempts followed by a 6th (even with the correct password) returned 429; a new `test_login_locks_out_after_repeated_failures` covers it.

### 3. Session cookie omits `Secure`, and `sessions` grows unbounded (Medium)

`backend/app/main.py:25` and `:97-102`. `sessions: set[str]` only shrinks on explicit logout (`main.py:111-116`); a client that logs in repeatedly without logging out accumulates entries for the life of the process. Separately, `response.set_cookie(..., httponly=True, samesite="lax")` never sets `secure=True`, so the cookie would be sent over plain HTTP if this were ever served over anything but `localhost`.

**Action:** add `secure=True` when the app is not running on `localhost`/HTTP-for-dev (e.g. gate it on an environment flag), and either cap `sessions` with a TTL/eviction (a dict of `token -> issued_at` pruned on each login check) or accept the current in-memory-until-restart model explicitly in `backend/AGENTS.md` as a known MVP limitation (it's already implied by `docs/PLAN.md` but not called out as a growth risk).

**Verification:** `sessions` is now `dict[str, float]` (token → issued-at), pruned lazily on every authenticated request against a 24-hour TTL. The cookie's `secure` flag is now read at request time from a `COOKIE_SECURE` env var (defaults off); confirmed live that a plain login omits `Secure` by default and includes it once `COOKIE_SECURE=true` is set. Two backend tests cover both states.

### 4. Redundant explicit index (Low)

`backend/app/db.py:64` (`UNIQUE (board_id, column_id, position)`) already creates a covering index; `db.py:67-68` (`CREATE INDEX cards_board_column_position ON cards(board_id, column_id, position)`) duplicates it exactly, doubling write-side index maintenance for no read benefit.

**Action:** drop the explicit `CREATE INDEX` statement (this was flagged in an earlier diff review and not yet addressed).

**Verification:** removed from `SCHEMA` in `db.py`. This only affects fresh databases; it's a pure optimization with no correctness impact, so pre-existing local volumes keeping the harmless duplicate index is not a concern.

### 5. No request body size limit (Low)

Nothing in `backend/app/main.py` bounds request body size at the ASGI/Starlette level; individual string fields are capped by Pydantic (`models.py`), but a client could still send a very large JSON body (e.g. deeply nested or padded) before validation rejects it, spending CPU/memory to parse and reject.

**Action:** add a small body-size-limiting middleware (or a reverse proxy in front of the container in any real deployment) — not urgent for a local MVP.

**Verification:** added ASGI middleware in `main.py` rejecting any request with `Content-Length` over 3MB (comfortably above the largest legitimate payload: 50 chat messages × 10,000 chars) with a 413. Confirmed live: a 3.1MB body returns 413, a normal-size request still returns 200; `test_oversized_request_body_is_rejected` covers it.

## Frontend

### 6. Generic error handling hides the actual failure reason (Medium)

`frontend/src/lib/api.ts:17-31`. `request()` discards the response body and status beyond a single "Unauthorized" vs. "Request failed" split, and every caller converts that into one fixed, often-wrong message:

- `App.tsx:31-42` shows "Invalid username or password." for *any* login failure, including a network error or a 500.
- `KanbanBoard.tsx:47-59` (`updateBoard`) shows "The board could not be updated. Please try again." for every failure — a validation rejection (e.g. a card title over the 200-character limit, now enforced server-side per the recent fix) looks identical to a dropped connection, and the user gets no actionable hint.

**Action:** have `request()` surface the parsed `{ detail }` body (FastAPI's default error shape) and status code, and let callers show that detail when present, falling back to the generic message only for non-JSON/network failures.

**Verification:** added an `ApiError` class (status + optional string `detail`) thrown by `request()`. `App.tsx` now distinguishes actual 401s ("Invalid username or password.") from other server details (shown verbatim) from network failures ("Unable to reach the server..."); `KanbanBoard.tsx` and `ChatSidebar.tsx` show `error.detail` when present, falling back to their original generic copy otherwise. Automatic Pydantic 422s (array-shaped `detail`) still fall back to the generic message by design — only explicit `HTTPException(detail=...)` strings surface. New unit tests cover all three paths in each component.

### 7. Chat history is never trimmed client-side (Low)

`frontend/src/components/ChatSidebar.tsx:18-45` accumulates every message in `messages` for the life of the page and sends the full array as `history` on each request. The backend caps `history` at 50 entries (`backend/app/models.py:68`); once a conversation crosses that, every subsequent send gets a 422 that surfaces only as the generic "The assistant could not respond. Please try again." with no indication that the fix is to reload the page.

**Action:** either trim `messages` to the most recent N entries before sending, or surface a clearer error (and perhaps an in-UI "start a new conversation" affordance) when the backend rejects history as too long.

**Verification:** `ChatSidebar` now sends `messages.slice(-40)` as history, comfortably under the server's 50-entry cap regardless of how long the on-page conversation grows. Covered by a new test that drives 22 exchanges (44 messages) and asserts the payload sent on the last request is capped at 40.

### 8. Drag-and-drop is not optimistic (Low / by design)

`frontend/src/components/KanbanBoard.tsx:63-89` (`handleDragEnd`) computes the new layout but only calls `setBoard` after the server confirms (`updateBoard`, :47-59), so a dropped card visually returns to its old slot for the round-trip before jumping to its new one. `docs/PLAN.md` (Part 7) explicitly calls for "Update UI state from confirmed server responses," so this is a documented tradeoff, not an oversight — flagged only because it's a noticeable UX rough edge if this app is developed further.

**Action:** no change required; consider optimistic updates with rollback-on-failure as a future enhancement if the flash becomes a real complaint.

## Testing

### 9. No test exercises concurrent mutations (Medium)

Following from Finding 1: `backend/tests/test_app.py` has strong coverage of the happy paths, ownership isolation, and AI-update validation (25 tests), but nothing exercises two overlapping requests against the same board. This is exactly the gap that let the TOCTOU issue above go unnoticed.

**Action:** add a regression test using `threading` (or two `TestClient` calls sharing one `tmp_path` DB before/after the `BEGIN IMMEDIATE` fix) that fires concurrent `create_card` calls into the same column and asserts no `IntegrityError`/500 and that all cards end up with distinct, contiguous positions.

**Verification:** added `test_concurrent_card_creation_does_not_corrupt_positions`, which uses a `threading.Barrier` to force 6 threads into `db.create_card` at the same instant and asserts no exceptions and no duplicate positions. Confirmed it actually exercises the bug (see #1's verification note) and is stable across 8 repeated runs post-fix.

### 10. No test for oversized manual title/details (Low)

The recent fix added `test_ai_board_update_enforces_card_title_length`, but there's no equivalent for the plain REST path (`POST /api/board/cards`, `PATCH /api/board/cards/{id}`) with a title over 200 characters or details over 5000. The `Field(max_length=...)` constraints are trusted but not directly exercised.

**Action:** add one boundary test per limit (column title 100, card title 200, card details 5000) to lock in the current constraints against future refactors.

**Verification:** added `test_column_title_length_limit_is_enforced` and `test_card_title_and_details_length_limits_are_enforced`, both passing.

## Docker & operations

### 11. Final image runs as root (Low)

`Dockerfile:21-35`. The final `python:3.14-slim-bookworm` stage never adds/switches to a non-root user before `CMD ["uvicorn", ...]`. For a local single-container demo the practical risk is minimal, but it's a one-line hardening step (`RUN useradd -m app && chown -R app /app` + `USER app`) that costs nothing here since the app only writes to the mounted `DATA_DIR` volume.

**Action:** add a non-root `USER` before `CMD`, and confirm the `app-data` volume mount still has write permission for that user (Compose creates it as root-owned by default — may need an explicit `chown` in an entrypoint, or a documented volume permission note).

**Verification:** the naive fix (build-time `chown` + static `USER appuser`) was tried first and it **broke** — see #13 below, which is exactly the volume-permission risk this finding called out. The final fix uses a `docker-entrypoint.sh` that always starts the container as root, `chown -R`s `/app/data` on every start (idempotent, and cheap for a small SQLite file), then drops to `appuser` via `gosu` before `exec`ing `uvicorn`. Confirmed via `docker top` that the running server process is `uid=1000` while `/app/data` and `pm.db` are `appuser:appuser` and writable, and a live login + card-create round-trip through the rebuilt container succeeded.

### 12. No restart policy in Compose (Low)

`compose.yaml:1-17` has no `restart:` key, so the container does not come back after an unexpected crash or host reboot without re-running `scripts/start.*`.

**Action:** add `restart: unless-stopped` for anyone running this as a longer-lived local service rather than a one-off demo.

**Verification:** added `restart: unless-stopped` to the `app` service; confirmed via `docker inspect` that the running container reports that policy.

### 13. (Found during fix verification) Build-time `chown` alone breaks existing volumes on upgrade (High)

Not part of the original review — surfaced while verifying #11's fix. A build-time-only fix (`chown -R appuser /app` + `USER appuser`, no entrypoint) makes the container **crash-loop** on any `app-data` volume that already has data from a previous root-owned run: `sqlite3.OperationalError: attempt to write a readonly database`, because Docker does not retroactively re-chown an existing named volume's contents when the image changes. This is exactly the "may need an explicit `chown` in an entrypoint" caveat #11 flagged in advance, confirmed by actually hitting it against this repo's own local `app-data` volume (which had data from earlier sessions).

**Action:** don't rely on build-time ownership alone for anything that mounts a pre-existing volume; use a startup entrypoint that fixes ownership every time, as implemented for #11.

**Verification:** reproduced the crash against the real pre-existing volume, then confirmed the `docker-entrypoint.sh` fix resolves it without losing the existing board data (the earlier "Docker smoke test card" and prior board state were still present and readable/writable after the fix).

## What's solid

Worth calling out since a review otherwise reads as all gaps:

- Every board query is consistently scoped through the authenticated username (`db.py`), and it's actually tested (`test_cannot_mutate_card_owned_by_another_user`).
- SQL is 100% parameterized — no string-built queries with user data anywhere in `db.py`.
- The AI path validates a *complete* proposed board before any write begins and rolls back atomically on any failure (`db.py:370-435`, exercised by `test_invalid_ai_board_update_rolls_back`, `test_malformed_ai_output_leaves_board_unchanged`, `test_duplicate_ai_card_references_are_rejected`).
- `OPENROUTER_API_KEY` never crosses into a response model or frontend-visible payload; confirmed by reading every model in `models.py` and every response path in `main.py`.
- No `dangerouslySetInnerHTML`, `eval`, or raw DOM injection anywhere in the frontend — all card/column content is rendered as plain React text, so there's no stored-XSS surface from user-entered titles/details.
- Login and password comparisons use `secrets.compare_digest`, avoiding a timing side-channel even though the credentials are fixed.
- Backend (25 tests) and frontend (18 tests, plus Playwright browser coverage across auth/kanban/chat) both passed cleanly before this fix pass; after it, backend is at 32 tests and frontend at 23, all passing, plus a full 9-test Playwright run and a live-container smoke test.

## Action checklist

- [x] Serialize `create_card`/`move_card`/`delete_card` transactions with `BEGIN IMMEDIATE` to close the TOCTOU window (#1)
- [x] Add a concurrency regression test for card creation/move (#9)
- [x] Add login throttling before any non-localhost deployment (#2)
- [x] Set `secure=True` on the session cookie outside local HTTP, and bound `sessions` growth (#3)
- [x] Drop the redundant `cards_board_column_position` index (#4)
- [x] Have `request()` in `api.ts` surface real error detail/status to callers (#6)
- [x] Trim or gracefully handle chat history once it exceeds the 50-message server cap (#7)
- [x] Add boundary tests for title/details length limits on the REST endpoints (#10)
- [x] Run the final Docker image as a non-root user (#11)
- [x] Add `restart: unless-stopped` to `compose.yaml` (#12)
- [x] Add a request body size limit (#5)
- [x] Fix the volume-ownership regression the #11 fix introduced on upgrade (#13, found during verification)
