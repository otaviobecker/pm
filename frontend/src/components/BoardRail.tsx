"use client";

import { useState, type FormEvent } from "react";
import clsx from "clsx";
import {
  ArchiveIcon,
  BoardIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  InboxIcon,
  PlusIcon,
} from "@/components/icons";
import type { BoardSummary } from "@/lib/kanban";

type BoardRailProps = {
  boards: BoardSummary[];
  activeBoardId: number | null;
  showArchived: boolean;
  /** True while the cross-board assignment list is showing instead of a board. */
  showingMyWork: boolean;
  onShowMyWork: () => void;
  onSelect: (boardId: number) => void;
  onToggleArchived: () => void;
  onCreate: (name: string) => Promise<boolean>;
};

export const BoardRail = ({
  boards,
  activeBoardId,
  showArchived,
  showingMyWork,
  onShowMyWork,
  onSelect,
  onToggleArchived,
  onCreate,
}: BoardRailProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const created = await onCreate(trimmed);
    if (created) {
      setName("");
      setAdding(false);
    }
  };

  if (collapsed) {
    return (
      <nav
        aria-label="Boards"
        className="flex w-12 shrink-0 flex-col items-center gap-2 border-r border-[var(--stroke)] bg-white/70 py-3"
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="icon-button"
          aria-label="Show board list"
          title="Show board list"
        >
          <ChevronRightIcon width={16} height={16} />
        </button>
        <button
          type="button"
          onClick={onShowMyWork}
          className={clsx(
            "icon-button",
            showingMyWork && "bg-[var(--navy-dark)] text-white hover:text-white"
          )}
          aria-label="My work"
          title="My work"
        >
          <InboxIcon width={16} height={16} />
        </button>
        {boards.map((board) => (
          <button
            key={board.id}
            type="button"
            onClick={() => onSelect(board.id)}
            className={clsx(
              "grid h-8 w-8 place-items-center rounded-lg text-[11px] font-bold uppercase transition",
              board.id === activeBoardId
                ? "bg-[var(--navy-dark)] text-white"
                : "bg-[var(--surface-muted)] text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
            )}
            aria-label={`Open ${board.name}`}
            title={board.name}
          >
            {board.name.slice(0, 2)}
          </button>
        ))}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Boards"
      className="hidden w-60 shrink-0 flex-col border-r border-[var(--stroke)] bg-white/70 md:flex"
      data-testid="board-rail"
    >
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-[var(--stroke)] px-4">
        <span aria-hidden className="text-[var(--secondary-purple)]">
          <BoardIcon width={16} height={16} />
        </span>
        <h2 className="flex-1 font-display text-sm font-semibold uppercase tracking-[0.16em] text-[var(--navy-dark)]">
          Boards
        </h2>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="icon-button"
          aria-label="Hide board list"
          title="Hide board list"
        >
          <ChevronLeftIcon width={16} height={16} />
        </button>
      </div>

      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-2">
        <button
          type="button"
          onClick={onShowMyWork}
          aria-current={showingMyWork ? "true" : undefined}
          className={clsx(
            "mb-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-display text-sm font-semibold transition",
            showingMyWork
              ? "bg-[var(--secondary-purple)] text-white"
              : "text-[var(--navy-dark)] hover:bg-[var(--surface-muted)]"
          )}
          data-testid="my-work-link"
        >
          <InboxIcon width={15} height={15} />
          My work
        </button>

        {boards.length === 0 ? (
          <p className="px-2 py-4 text-xs leading-5 text-[var(--gray-text)]">
            {showArchived
              ? "No boards yet."
              : "No active boards. Create one below."}
          </p>
        ) : null}
        <ul className="space-y-1">
          {boards.map((board) => (
            <li key={board.id}>
              <button
                type="button"
                onClick={() => onSelect(board.id)}
                aria-current={board.id === activeBoardId ? "true" : undefined}
                className={clsx(
                  "w-full rounded-xl px-3 py-2 text-left transition",
                  board.id === activeBoardId
                    ? "bg-[var(--navy-dark)] text-white"
                    : "text-[var(--navy-dark)] hover:bg-[var(--surface-muted)]"
                )}
                data-testid={`board-option-${board.id}`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold">
                    {board.name}
                  </span>
                  {board.archived ? (
                    <span
                      aria-label="Archived"
                      title="Archived"
                      className="shrink-0 opacity-70"
                    >
                      <ArchiveIcon width={13} height={13} />
                    </span>
                  ) : null}
                </span>
                <span
                  className={clsx(
                    "mt-0.5 block truncate text-[10px] font-semibold uppercase tracking-[0.14em]",
                    board.id === activeBoardId
                      ? "text-white/60"
                      : "text-[var(--gray-text)]"
                  )}
                >
                  {board.cardCount} card{board.cardCount === 1 ? "" : "s"} ·{" "}
                  {board.role}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="shrink-0 border-t border-[var(--stroke)] p-2">
        {adding ? (
          <form onSubmit={handleCreate} className="space-y-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Board name"
              aria-label="Board name"
              autoFocus
              className="w-full rounded-lg border border-[var(--stroke)] bg-white px-2.5 py-1.5 text-sm font-semibold text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              required
            />
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setName("");
                }}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--stroke)] px-2.5 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
              >
                <CloseIcon width={13} height={13} />
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-full bg-[var(--secondary-purple)] px-2.5 py-1 text-xs font-semibold text-white transition hover:brightness-110"
              >
                <CheckIcon width={13} height={13} />
                Create
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-[var(--gray-text)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--navy-dark)]"
          >
            <PlusIcon width={14} height={14} />
            New board
          </button>
        )}
        <button
          type="button"
          onClick={onToggleArchived}
          aria-pressed={showArchived}
          className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-text)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--navy-dark)]"
        >
          <ArchiveIcon width={13} height={13} />
          {showArchived ? "Hide archived" : "Show archived"}
        </button>
      </div>
    </nav>
  );
};
