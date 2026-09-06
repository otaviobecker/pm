# Project Management MVP implementation plan

## Agreed constraints

- Complete Parts 1 through 10 in order.
- Pause for user approval after Parts 1 and 5 only.
- Keep the existing five-column, single-board product scope. Column titles may change, but columns cannot be added, removed, or reordered.
- Use a backend-managed, HTTP-only session cookie for the hardcoded `user` / `password` sign-in.
- Store application data in SQLite and persist the database through container restarts with a Docker volume.
- Document the proposed database shape as JSON before implementing it in SQLite.
- Keep AI conversation history only in the current browser session; do not persist chat messages.
- The frontend design may change while retaining the required color scheme and product behavior.

## Part 1: Plan

### Implementation

- [x] Review the root requirements and the existing frontend.
- [x] Record the decisions agreed with the user.
- [x] Expand every implementation part into actionable checklists.
- [x] Add tests and success criteria for every part.
- [x] Add `frontend/AGENTS.md` describing the current frontend.
- [x] Obtain user approval for this plan before starting Part 2.

### Verification

- [x] Confirm all ten parts have implementation, test, and success-criteria sections.
- [x] Confirm the plan includes approval gates after Parts 1 and 5 only.
- [x] Confirm frontend guidance matches the current source and package configuration.

### Success criteria

- The implementation path is detailed enough to execute without unresolved architectural decisions.
- `frontend/AGENTS.md` accurately documents the existing frontend.
- The user explicitly approves the plan.

## Part 2: Scaffolding

### Implementation

- [x] Create a minimal FastAPI project in `backend/`, managed with `uv`.
- [x] Add a health/example API route under `/api`.
- [x] Serve a small placeholder static page at `/` from FastAPI.
- [x] Add a multi-stage Docker build with a Python runtime stage.
- [x] Add Docker Compose configuration, including a named volume for application data.
- [x] Pass `OPENROUTER_API_KEY` into the container without copying `.env` into the image.
- [x] Add start and stop PowerShell scripts for Windows.
- [x] Add start and stop shell scripts compatible with macOS and Linux.
- [x] Add only the minimal root README instructions needed to run and stop the app.

### Tests

- [x] Add backend tests for the example API route and placeholder static page.
- [x] Build the Docker image.
- [x] Start the container using the platform script and verify `/` returns the placeholder page.
- [x] Verify the page can call the example `/api` route successfully.
- [x] Stop and restart the stack using the provided scripts.

### Success criteria

- One command starts the app on each supported operating system and one command stops it.
- FastAPI serves both static content and an API from the same local container.
- The image builds reproducibly with Python dependencies installed by `uv`.
- No secret is committed or embedded in the image.

## Part 3: Add the frontend

### Implementation

- [x] Configure Next.js for a static export.
- [x] Update the Docker build to compile the frontend and copy its static output into the FastAPI image.
- [x] Replace the placeholder page with the existing Kanban frontend at `/`.
- [x] Preserve column renaming, card creation and deletion, and drag-and-drop behavior.
- [x] Update frontend configuration and documentation for the container-served static build.
- [x] Ensure direct requests for static assets and frontend routes are handled correctly by FastAPI.

### Tests

- [x] Run frontend unit tests for board rendering and board operations.
- [x] Run browser tests for loading the board, renaming a column, adding/removing a card, and moving a card.
- [x] Run backend integration tests that verify the exported index and static assets are served.
- [x] Build and run the production container, then execute browser tests against it.

### Success criteria

- The demo Kanban board is available at `/` from the FastAPI container.
- The browser receives a static Next.js build; no Next.js server runs in production.
- Existing board interactions work and all frontend, integration, and browser tests pass.

## Part 4: Add sign-in

### Implementation

- [x] Add backend login, logout, and current-session endpoints.
- [x] Accept only the hardcoded credentials `user` and `password`.
- [x] Create an opaque server-side session and return its identifier in an HTTP-only, SameSite cookie.
- [x] Keep sessions in memory so they expire when the backend restarts; do not persist them.
- [x] Protect application API routes with a shared authentication dependency.
- [x] Add a sign-in screen shown before the board.
- [x] Restore an authenticated session when the page reloads and add logout behavior.
- [x] Show a clear generic error for invalid credentials without exposing sensitive details.

### Tests

- [x] Add backend tests for successful login, rejected login, current-session lookup, logout, and protected-route rejection.
- [x] Assert the authentication cookie has the expected HTTP-only and SameSite attributes.
- [x] Add frontend unit tests for signed-out, failed-login, signed-in, restored-session, and logout states.
- [x] Add browser tests covering the complete login and logout flow.

### Success criteria

- Unauthenticated users cannot access protected API data.
- Valid credentials open the board and invalid credentials do not.
- Refreshing the page retains the session until logout or backend restart.
- The credential and session behavior is comprehensively tested.

## Part 5: Model the database

### Implementation

- [x] Inspect frontend board types and the operations required by both users and AI.
- [x] Propose a normalized schema supporting multiple users and one board per user.
- [x] Model users, boards, fixed ordered columns, ordered cards, and required constraints.
- [x] Specify identifiers, field types, foreign keys, uniqueness rules, ordering, and delete behavior.
- [x] Save the proposed logical schema as JSON in `docs/`.
- [x] Document SQLite storage, initialization, transactions, migrations, and Docker-volume persistence in `docs/`.
- [x] Include an example board payload and map it to the proposed tables.
- [x] Obtain user approval before implementing the schema in Part 6.

### Tests

- [x] Validate that the schema JSON parses successfully.
- [x] Review the schema against create, read, edit, delete, move, and rename operations.
- [x] Verify it enforces one board per user while allowing multiple users.
- [x] Verify it keeps exactly the fixed set of columns for a board while allowing title changes.
- [x] Verify card and column ordering can be represented deterministically.

### Success criteria

- The JSON schema document is valid and unambiguous.
- The database approach covers initialization and persistent local storage.
- Every required Kanban operation maps cleanly to the model.
- The user explicitly approves the schema and approach.

## Part 6: Build the persistent backend

### Implementation

- [x] Implement the approved SQLite schema and a simple initialization/migration mechanism.
- [x] Create the database and seed the hardcoded user and initial board when they do not exist.
- [x] Enable SQLite foreign-key enforcement for every connection.
- [x] Add authenticated API models and routes to read the current user's board.
- [x] Add routes to rename columns and create, edit, delete, and move cards.
- [x] Make reorder and move operations atomic transactions.
- [x] Validate input at the API boundary and return consistent HTTP errors.
- [x] Keep all board access scoped to the authenticated user.

### Tests

- [x] Test creation and seeding of a missing database.
- [x] Test reopening an existing database without replacing user changes.
- [x] Test all read and mutation routes, including card ordering and cross-column moves.
- [x] Test validation failures, missing records, uniqueness constraints, and authentication.
- [x] Test transaction rollback when a board mutation fails.
- [x] Test that one user cannot access another user's board.

### Success criteria

- A new installation creates a usable database and initial board automatically.
- All required board operations are available through authenticated APIs.
- Mutations preserve valid ordering and cannot partially update the board.
- Backend tests pass against isolated temporary SQLite databases.

## Part 7: Connect the frontend and backend

### Implementation

- [x] Add a small typed frontend API client using same-origin `/api` requests.
- [x] Load the authenticated user's board from the backend instead of `initialData`.
- [x] Connect column rename and card create, edit, delete, and move actions to API routes.
- [x] Add card editing to satisfy the product requirements.
- [x] Update UI state from confirmed server responses.
- [x] Show concise loading and recoverable error states for board operations.
- [x] Prevent conflicting board actions while a mutation is pending where necessary.
- [x] Remove demo-only state paths that are no longer used.

### Tests

- [x] Add frontend unit tests with mocked API responses for board loading and every mutation.
- [x] Add backend/frontend integration tests for request and response contracts.
- [x] Add browser tests proving rename, create, edit, delete, and drag-and-drop changes survive a reload.
- [x] Restart the container and verify board changes survive through the Docker volume.
- [x] Run lint, unit, backend, integration, and browser suites.

### Success criteria

- The UI displays database-backed state and no longer resets to demo data.
- Every required manual board action persists after page and container restarts.
- Failed requests do not silently leave the displayed board in a false state.
- All automated tests pass.

## Part 8: Add AI connectivity

### Implementation

- [x] Add a backend OpenRouter client configured from `OPENROUTER_API_KEY`.
- [x] Use the `openai/gpt-oss-120b` model.
- [x] Keep the API key exclusively on the backend.
- [x] Add a minimal authenticated endpoint that sends a test prompt to OpenRouter.
- [x] Map upstream authentication, rate-limit, timeout, and service errors to useful backend responses.

### Tests

- [x] Unit-test request construction and response/error handling with mocked OpenRouter responses.
- [x] Verify requests use the configured model and never expose the API key to the frontend.
- [ ] Run an explicit live connectivity check asking `2+2` and verify the answer is `4`.
- [x] Keep the live test opt-in so the normal test suite is deterministic and does not spend API credit.

### Success criteria

- The backend can successfully call OpenRouter with the configured model.
- The live `2+2` check succeeds when a valid key and network are available.
- Automated tests cover connectivity logic without depending on the external service.

## Part 9: Add structured AI board updates

### Implementation

- [x] Define a strict structured-output schema containing an assistant message and an optional board update.
- [x] Add an authenticated chat endpoint that reads the current board from SQLite.
- [x] Send the current board, the user's request, and browser-supplied current-session conversation history to the model.
- [x] Instruct the model to preserve board constraints and return only the defined structure.
- [x] Validate structured output before using it.
- [x] Apply a valid optional board update atomically and scoped to the authenticated user.
- [x] Return the assistant message and the resulting board to the frontend.
- [x] Do not write conversation messages to SQLite or logs.

### Tests

- [x] Test prompt construction includes the current database board, user request, and supplied history.
- [x] Test responses with no board update and with valid multi-card updates.
- [x] Test malformed output, invalid references, duplicate IDs, missing fixed columns, and unsafe board changes.
- [x] Test that validation failures leave the database unchanged.
- [x] Test successful AI updates persist atomically.
- [x] Add an opt-in live structured-output smoke test.

### Success criteria

- Every model call has the current authoritative board and current-session conversation context.
- The endpoint returns a schema-validated assistant response.
- Valid AI changes persist, while malformed or invalid changes cannot corrupt the board.
- Chat history remains session-only.

## Part 10: Add the AI chat sidebar

### Implementation

- [x] Add a responsive AI chat sidebar that fits the Kanban workflow and required color scheme.
- [x] Support opening/closing the sidebar, message entry, submission, pending state, and errors.
- [x] Keep conversation history in browser memory for the current page session only.
- [x] Send the current-session history with each request.
- [x] Render user and assistant messages accessibly.
- [x] Replace or refresh board state immediately from a successful AI response containing an update.
- [x] Keep manual board controls usable alongside chat.
- [x] Ensure the layout remains usable at desktop and mobile viewport sizes.

### Tests

- [x] Add frontend unit tests for chat rendering, submission, pending/error states, and in-memory history.
- [x] Test both conversational responses and responses that update one or multiple cards.
- [x] Test that an AI board update refreshes the visible board without a page reload.
- [x] Add browser tests for opening chat, sending a request, seeing a response, and observing a persisted board update.
- [x] Test responsive behavior and keyboard-accessible interaction.
- [x] Run the complete production-container test suite.

### Success criteria

- Signed-in users can hold a current-session AI conversation from the sidebar.
- The AI can create, edit, delete, or move one or more cards through validated structured output.
- Successful AI board changes appear automatically and remain after reload.
- The finished application runs locally in one Docker container and all tests pass.
## Part 11: Grow the MVP into a multi-user, multi-board application

The MVP constraints in this plan (one hardcoded account, one board per user, five
fixed columns) were lifted in this part. The constraints that remain are the
required color scheme, SQLite as the only datastore, the single-container
deployment, and session-only chat history.

### Implementation

- [x] Add schema version 2 with `sessions`, `board_members`, credentials on `users`, many boards per owner, flexible columns, and card priority, due date, and assignee.
- [x] Migrate a version 1 database in place, preserving its board, columns, and cards.
- [x] Hash passwords with PBKDF2-SHA256 and persist sessions in SQLite, storing only the token digest.
- [x] Add registration, profile updates, password changes, and administrator account management.
- [x] Keep at least one active administrator in the workspace at all times.
- [x] Scope every board operation through board membership, with owner, editor, and viewer roles.
- [x] Add board creation, renaming, sharing, archiving, leaving, and deletion.
- [x] Allow columns to be added, renamed, reordered, deleted with a destination for their cards, and given a work-in-progress limit.
- [x] Add card priority, due date, and assignee, and enforce that an assignee is a board member.
- [x] Add board filtering by text, priority, and assignee.
- [x] Scope the AI chat endpoint to one board and let the assistant set priorities and due dates.
- [x] Reorganize the backend into `app/routers` and `app/repositories`.
- [x] Rebuild the frontend around an auth screen, a board rail, a workspace shell, and board and account dialogs.

### Tests

- [x] Cover registration, sign-in, throttling, session persistence across a restart, and session revocation.
- [x] Cover the member directory, profile changes, and administrator actions including the last-administrator guard.
- [x] Cover board isolation between accounts and each membership role's permissions.
- [x] Cover column creation, reordering, deletion with card re-homing, and WIP limits.
- [x] Cover card fields, assignee validation, WIP enforcement, moves, and concurrent creation.
- [x] Cover the version 1 to version 2 migration against a database built with the old schema.
- [x] Rebuild the frontend unit tests around the new components and add a workspace integration suite.
- [x] Point the browser tests at the real API and add board, sharing, filtering, and column specs.

### Success criteria

- Any number of accounts, each with any number of boards, share one SQLite database safely.
- A board is only reachable by its members, and each role can do exactly what it should.
- An existing version 1 database keeps its data after upgrading.
- Backend statement coverage stays above 95 percent and all suites pass.


## Part 12: Turn a card into a work item

### Implementation

- [x] Add schema version 3 with `labels`, `card_labels`, `card_comments`, and `checklist_items`, upgrading existing databases in place.
- [x] Give every board up to 20 labels in the product's five colors, seeded with four defaults.
- [x] Attach labels to cards, and detach them everywhere when a label is deleted.
- [x] Add a comment thread per card: any member may comment, the author may edit, and the author or board owner may delete.
- [x] Add an ordered checklist per card, with reordering and completion.
- [x] Roll comment and checklist counts up onto the board projection so the card face can show progress.
- [x] Return both the refreshed card and the refreshed board from every card detail mutation.
- [x] Reconcile cards in place during an assistant update so labels, comments, and checklists survive.
- [x] Make each migration build the schema of the version it upgrades to, not today's schema.
- [x] Add a card detail dialog, label management in board settings, card-face chips, and a label filter.

### Tests

- [x] Cover label creation, renaming, recoloring, deletion, the cap, and detaching from cards.
- [x] Cover comment permissions for authors, editors, viewers, and the board owner.
- [x] Cover checklist creation, completion, renaming, reordering, deletion, and dense positions.
- [x] Cover the version 2 to version 3 migration against a database built with the old schema.
- [x] Cover that an assistant edit preserves a surviving card's labels, comments, and checklist.
- [x] Add unit tests for the card detail dialog, the card face chips, and label management.
- [x] Add browser tests for checklists, comment threads, labelling, label management, and detail editing.

### Success criteria

- A card holds everything a work item needs without leaving the board.
- An assistant edit never silently discards work attached to a card.
- An existing version 2 database keeps its data and gains the default labels.
- Backend statement coverage stays at 100 percent and all suites pass.

## Next candidates

Not started, in rough order of value to the product:

- A per-board activity feed recording who changed what.
- A cross-board "my work" view of everything assigned to the signed-in user,
  with an overdue and due-soon grouping.
- Board templates, so a new board can start from a saved column and label set.
- Card attachments or links.
- Keyboard navigation across the board, and a command palette.
