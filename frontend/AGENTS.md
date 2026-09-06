# Frontend guide

This directory contains the static Next.js frontend for the Project Management MVP. Follow the root `AGENTS.md` and `docs/PLAN.md` in addition to this file.

## Stack

- Next.js 16 App Router, React 19, and strict TypeScript
- Tailwind CSS 4 through `@import "tailwindcss"` in `src/app/globals.css`
- `@dnd-kit` for sortable cards and cross-column drag and drop
- Vitest, Testing Library, and jsdom for unit/component tests
- Playwright with Chromium for browser tests
- The `@/*` alias resolves to `src/*`

## Current structure

- `src/app/layout.tsx` defines metadata and loads Space Grotesk and Manrope with `next/font`.
- `src/app/page.tsx` renders the authenticated app as the only page.
- `src/app/globals.css` defines global styles and the required color tokens.
- `src/components/App.tsx` restores the session, owns sign-in and logout, and hands the user and logout handler to the board.
- `src/components/KanbanBoard.tsx` owns the full-height app shell (top bar, board region, docked chat), loads server state, and coordinates board API actions and drag-and-drop.
- `src/components/ChatSidebar.tsx` owns session-only AI conversation state and applies returned board updates.
- `src/components/KanbanColumn.tsx` renders a droppable column, editable title, cards, and new-card form.
- `src/components/KanbanCard.tsx` renders a sortable card with icon actions for drag, edit, and delete.
- `src/components/KanbanCardPreview.tsx` renders the drag overlay.
- `src/components/NewCardForm.tsx` manages local add-card form state.
- `src/components/icons.tsx` holds the inline SVG icon set; there is no icon dependency.
- `src/lib/api.ts` is the typed same-origin API client.
- `src/lib/kanban.ts` defines board types, seed fixtures, and the pure `moveCard` operation.
- `src/lib/theme.ts` maps a column's position to its presentation-only accent colors.
- `src/lib/kanban.test.ts` tests card reordering and cross-column moves.
- `src/components/KanbanBoard.test.tsx` tests rendering, column renaming, and card creation/deletion.
- `tests/kanban.spec.ts` tests core flows in a browser.

## Current behavior

- Users sign in with the MVP credentials before the board is shown.
- Board state is loaded from and mutated through the FastAPI API.
- The board has five fixed columns. Titles are editable, but columns are not added, removed, or reordered.
- Cards can be created, edited, deleted, reordered, and moved between columns.
- Board changes persist in SQLite through page and container restarts.
- Dragging uses a pointer sensor with a six-pixel activation distance and `closestCorners` collision detection.
- AI conversation history remains in `ChatSidebar` memory and resets on page reload.
- A structured board returned by chat replaces the visible board immediately.
- The layout fills the viewport: a fixed-height top bar, one row of equal-width columns that scroll horizontally only when they no longer fit, and per-column vertical scrolling.
- Card drag, edit, and delete are icon buttons that keep their existing accessible labels; edit and delete fade in on hover or focus and stay visible below 1024px.
- The assistant opens from a docked rail button on large screens and a floating button on small ones, then takes a docked panel beside the board from `lg` up and a full-height overlay below it.
- Chat sends on Enter and inserts a newline on Shift+Enter.

## Design conventions

- Keep the required colors as CSS variables: yellow `#ecad0a`, blue `#209dd7`, purple `#753991`, navy `#032147`, and gray `#888888`. Column and card accents come from `columnAccent` in `src/lib/theme.ts` and use only those five values.
- Use the inline icons in `src/components/icons.tsx` for actions instead of text buttons, and keep a descriptive `aria-label` on every icon-only control.
- Prefer existing CSS variables and Tailwind utility classes over introducing another styling system.
- Preserve accessible labels and stable `data-testid` values when changing tested interactions.
- Keep board transformations immutable and place reusable pure board logic in `src/lib/kanban.ts`.
- Keep transient form or display state local to the smallest component that owns it.
- The production frontend will be a static export served by FastAPI; do not depend on a Next.js production server, server actions, or runtime-only Next.js APIs.
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

Playwright starts the development server at `http://127.0.0.1:3000`. Add or update unit and browser coverage whenever user-visible board behavior changes.
