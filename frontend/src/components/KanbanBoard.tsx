"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { ChatSidebar } from "@/components/ChatSidebar";
import { BoardIcon, CloseIcon, SignOutIcon } from "@/components/icons";
import {
  ApiError,
  createCard,
  deleteCard,
  editCard,
  getBoard,
  moveBoardCard,
  renameColumn,
  type User,
} from "@/lib/api";
import { moveCard, type BoardData } from "@/lib/kanban";
import { columnAccent } from "@/lib/theme";

type KanbanBoardProps = {
  user?: User | null;
  onLogout?: () => void;
};

export const KanbanBoard = ({ user, onLogout }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getBoard()
      .then(setBoard)
      .catch(() => setError("Unable to load the board."));
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board?.cards ?? {}, [board?.cards]);

  const totals = useMemo(() => {
    if (!board) {
      return { cards: 0, done: 0 };
    }
    const lastColumn = board.columns[board.columns.length - 1];
    return {
      cards: Object.keys(board.cards).length,
      done: lastColumn ? lastColumn.cardIds.length : 0,
    };
  }, [board]);

  const updateBoard = async (operation: () => Promise<BoardData>) => {
    setBusy(true);
    setError("");
    try {
      setBoard(await operation());
      return true;
    } catch (error) {
      setError(
        error instanceof ApiError && error.detail
          ? error.detail
          : "The board could not be updated. Please try again."
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!board || !over || active.id === over.id) {
      return;
    }

    const nextColumns = moveCard(
      board.columns,
      active.id as string,
      over.id as string
    );
    const targetColumn = nextColumns.find((column) =>
      column.cardIds.includes(active.id as string)
    );
    if (!targetColumn) {
      return;
    }
    void updateBoard(() =>
      moveBoardCard(
        active.id as string,
        targetColumn.id,
        targetColumn.cardIds.indexOf(active.id as string)
      )
    );
  };

  const handleRenameColumn = (columnId: string, title: string) =>
    updateBoard(() => renameColumn(columnId, title));

  const handleAddCard = (columnId: string, title: string, details: string) => {
    void updateBoard(() => createCard(columnId, title, details));
  };

  const handleEditCard = (cardId: string, title: string, details: string) =>
    updateBoard(() => editCard(cardId, title, details));

  const handleDeleteCard = (_columnId: string, cardId: string) => {
    void updateBoard(() => deleteCard(cardId));
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;
  const activeColumnIndex = board?.columns.findIndex((column) =>
    activeCardId ? column.cardIds.includes(activeCardId) : false
  );

  if (!board) {
    return (
      <main className="grid min-h-screen place-items-center">
        <p className="text-sm font-semibold text-[var(--gray-text)]">
          {error || "Loading board..."}
        </p>
      </main>
    );
  }

  const donePercent = totals.cards
    ? Math.round((totals.done / totals.cards) * 100)
    : 0;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--surface)]">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-20 flex h-16 shrink-0 items-center gap-3 border-b border-[var(--stroke)] bg-white/85 px-5 backdrop-blur">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--navy-dark)] text-white"
          >
            <BoardIcon width={18} height={18} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg font-semibold leading-none text-[var(--navy-dark)]">
              Kanban Studio
            </h1>
            <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
              Single board workspace
            </p>
          </div>

          <div className="ml-auto flex items-center gap-4">
            <div className="hidden items-center gap-3 md:flex">
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--gray-text)]">
                  Progress
                </p>
                <p className="text-xs font-semibold tabular-nums text-[var(--navy-dark)]">
                  {totals.done} of {totals.cards} done
                </p>
              </div>
              <div
                className="h-1.5 w-28 overflow-hidden rounded-full bg-[var(--surface-muted)]"
                role="progressbar"
                aria-label="Cards done"
                aria-valuenow={donePercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span
                  className="block h-full rounded-full bg-[var(--primary-blue)] transition-[width] duration-300"
                  style={{ width: `${donePercent}%` }}
                />
              </div>
            </div>

            {user ? (
              <div className="flex items-center gap-2 border-l border-[var(--stroke)] pl-4">
                <span
                  aria-hidden
                  className="grid h-8 w-8 place-items-center rounded-full bg-[var(--secondary-purple)] text-xs font-bold uppercase text-white"
                >
                  {user.username.slice(0, 2)}
                </span>
                <span className="hidden text-xs font-semibold text-[var(--navy-dark)] sm:inline">
                  {user.username}
                </span>
                {onLogout ? (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="icon-button"
                    aria-label="Sign out"
                    title="Sign out"
                  >
                    <SignOutIcon width={16} height={16} />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>

        {error ? (
          <div className="shrink-0 px-5 pt-3">
            <p
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700"
            >
              <span className="flex-1">{error}</span>
              <button
                type="button"
                onClick={() => setError("")}
                className="icon-button h-6 w-6 text-red-700 hover:bg-red-100 hover:text-red-800"
                aria-label="Dismiss error"
              >
                <CloseIcon width={13} height={13} />
              </button>
            </p>
          </div>
        ) : null}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <main className="scroll-slim min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-5 py-4">
            <section className="flex h-full min-h-0 w-full gap-3">
              {board.columns.map((column, index) => (
                <KanbanColumn
                  key={`${column.id}-${column.title}`}
                  column={column}
                  accent={columnAccent(index)}
                  cards={column.cardIds.map((cardId) => board.cards[cardId])}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onEditCard={handleEditCard}
                  onDeleteCard={handleDeleteCard}
                />
              ))}
            </section>
          </main>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[240px]">
                <KanbanCardPreview
                  card={activeCard}
                  accent={columnAccent(
                    activeColumnIndex === undefined || activeColumnIndex < 0
                      ? 0
                      : activeColumnIndex
                  )}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {busy ? (
          <>
            <div className="fixed inset-0 z-10 cursor-wait" />
            <p className="pointer-events-none fixed bottom-5 left-5 z-20 flex items-center gap-2 rounded-full bg-[var(--navy-dark)] px-4 py-2 text-xs font-semibold text-white shadow-[var(--shadow)]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent-yellow)]" />
              Saving...
            </p>
          </>
        ) : null}
      </div>

      <ChatSidebar onBoardUpdate={setBoard} />
    </div>
  );
};
