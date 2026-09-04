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
import {
  ApiError,
  createCard,
  deleteCard,
  editCard,
  getBoard,
  moveBoardCard,
  renameColumn,
} from "@/lib/api";
import { moveCard, type BoardData } from "@/lib/kanban";

export const KanbanBoard = () => {
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

  if (!board) {
    return (
      <main className="grid min-h-screen place-items-center">
        <p className="text-sm font-semibold text-[var(--gray-text)]">
          {error || "Loading board..."}
        </p>
      </main>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        {busy ? <div className="fixed inset-0 z-10 cursor-wait" /> : null}
        {error ? (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                Focus
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                One board. Five columns. Zero clutter.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="grid gap-6 lg:grid-cols-5">
            {board.columns.map((column) => (
              <KanbanColumn
                key={`${column.id}-${column.title}`}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                onRename={handleRenameColumn}
                onAddCard={handleAddCard}
                onEditCard={handleEditCard}
                onDeleteCard={handleDeleteCard}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        {busy ? (
          <p className="fixed bottom-6 left-6 rounded-full bg-[var(--navy-dark)] px-4 py-2 text-xs font-semibold text-white shadow-lg">
            Saving...
          </p>
        ) : null}
      </main>
      <ChatSidebar onBoardUpdate={setBoard} />
    </div>
  );
};
