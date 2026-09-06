# Frontend guide

This directory contains the static Next.js frontend for the Project Management app. Follow the root `AGENTS.md` and `docs/PLAN.md` in addition to this file.

## Stack

- Next.js 16 App Router, React 19, and strict TypeScript
- Tailwind CSS 4 through `@import "tailwindcss"` in `src/app/globals.css`
- `@dnd-kit` for sortable cards and cross-column drag and drop
- Vitest, Testing Library, and jsdom for unit/component tests
- Playwright with Chromium for browser tests, run against the real FastAPI API
- The `@/*` alias resolves to `src/*`

## Current structure

- `src/app/layout.tsx` defines metadata and loads Space Grotesk and Manrope with `next/font`.
- `src/app/page.tsx` renders the authenticated app as the only page.
- `src/app/globals.css` defines global styles and the required color tokens.
- `src/components/App.tsx` restores the session and switches between the auth screen and the workspace.
- `src/components/AuthScreen.tsx` owns sign-in and registration.
- `src/components/Workspace.tsx` is the shell: it loads the board list and the open board, owns the mutation runner every board action goes through, and hosts the header and dialogs.
- `src/components/BoardRail.tsx` lists the boards, creates them, collapses, and toggles archived ones.
- `src/components/BoardSettingsDialog.tsx` renames, shares, archives, leaves, and deletes a board, and manages its labels.
- `src/components/CardDetailDialog.tsx` is the expanded card: its fields, its labels, an ordered checklist, and the comment thread.
- `src/components/AccountDialog.tsx` owns the profile, password change, sign-out, and the administrator account list.
- `src/components/Dialog.tsx` is the shared modal shell and the dialog control classes.
- `src/components/KanbanBoard.tsx` renders the columns, owns filtering and drag-and-drop, and turns interactions into API calls.
- `src/components/BoardFilters.tsx` owns the search, priority, and assignee filters.
- `src/components/KanbanColumn.tsx` renders a droppable column, its editable title, its WIP badge, and its options menu (reorder, WIP limit, delete).
- `src/components/KanbanCard.tsx` renders a sortable card with its label, priority, due-date, checklist, comment, and assignee chips, the inline edit form, and the action row that opens the detail view.
- `src/components/NewCardForm.tsx` and `NewColumnForm.tsx` manage local creation form state.
- `src/components/ChatSidebar.tsx` owns session-only AI conversation state for the open board.
- `src/components/icons.tsx` holds the inline SVG icon set; there is no icon dependency.
- `src/lib/api.ts` is the typed same-origin API client.
- `src/lib/kanban.ts` defines the board types and the pure helpers: `moveCard`, `wipState`, `dueState`, `labelsFor`, `checklistComplete`, role checks, and formatting.
- `src/lib/theme.ts` maps a column's position, a priority, a due-date bucket, and a label color to presentation-only accent colors.
- `src/test/fixtures.ts` builds the board, summary, member, and user fixtures the unit tests share.
- `tests/` holds the Playwright specs and `tests/helpers.ts`, which registers a fresh account per test.

## Current behavior

- Users sign in or register; registration creates the account, signs it in, and seeds a starter board.
- A user can own many boards, switch between them from the rail, and the open board is remembered in `localStorage`.
- A board can be shared with editors and viewers, archived, left, and deleted. Viewers and archived boards render read-only.
- Columns can be renamed, added, reordered, deleted (choosing where their cards go), and given a WIP limit.
- Cards can be created, edited, deleted, reordered, and moved between columns, and carry a priority, due date, and assignee.
- A card opens into a detail dialog holding its labels, an ordered checklist, and a comment thread; the card face shows the resulting rollups. Viewers can read a card and comment on it, but change nothing else.
- Labels belong to the board and are managed from board settings, in the product's five colors.
- The filter bar narrows the board by text, priority, assignee, and label; dragging is disabled while a filter is active because positions refer to the unfiltered column.
- Board changes persist in SQLite through page and container restarts.
- Dragging uses a pointer sensor with a six-pixel activation distance and `closestCorners` collision detection.
- AI conversation history remains in `ChatSidebar` memory, resets on page reload, and resets when the open board changes.
- The layout fills the viewport: a board rail, a fixed-height top bar, one row of columns that scroll horizontally only when they no longer fit, and per-column vertical scrolling.

## Design conventions

- Keep the required colors as CSS variables: yellow `#ecad0a`, blue `#209dd7`, purple `#753991`, navy `#032147`, and gray `#888888`. Column, priority, and due-date accents come from `src/lib/theme.ts` and use only those values, plus one red reserved for destructive actions and overdue dates.
- Use the inline icons in `src/components/icons.tsx` for actions instead of text buttons, and keep a descriptive `aria-label` on every icon-only control.
- Prefer existing CSS variables and Tailwind utility classes over introducing another styling system.
- Preserve accessible labels and stable `data-testid` values when changing tested interactions.
- Keep board transformations immutable and place reusable pure board logic in `src/lib/kanban.ts`.
- Keep transient form or display state local to the smallest component that owns it. Server state belongs to `Workspace`: board mutations go through its `run` helper and card detail mutations through `runCard`, so errors, the busy indicator, the open card, and the board list stay in sync.
- A clickable card title must not share a box with the action row above it; give the title a right margin so the two never steal each other's clicks.
- The production frontend is a static export served by FastAPI; do not depend on a Next.js production server, server actions, or runtime-only Next.js APIs.
- Browser code must call the backend through same-origin `/api` routes and must never receive `OPENROUTER_API_KEY`.

## Commands

Run these commands from `frontend/`:

```bash
npm install
npm run dev
npm run lint
npm run build
npm run test:unit
npm run test:e2e
npm run test:all
```

The browser tests exercise the real API. By default Playwright runs `npm run e2e:server`, which builds the export and starts the FastAPI backend on `127.0.0.1:3100` with `STATIC_DIR` pointing at `out/` and a throwaway `DATA_DIR`; that needs `uv` installed. Set `PLAYWRIGHT_BASE_URL` to reuse a running stack instead, for example the Docker container on `http://localhost:8000`. Add or update unit and browser coverage whenever user-visible behavior changes.
