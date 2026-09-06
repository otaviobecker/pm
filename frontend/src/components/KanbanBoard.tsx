"use client";

import { useMemo, useState } from "react";
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
import { BoardFilters, type Filters, emptyFilters } from "@/components/BoardFilters";
import { NewColumnForm } from "@/components/NewColumnForm";
import {
  createCard,
  deleteCard,
  deleteColumn,
  editCard,
  moveBoardCard,
  moveColumn,
  updateColumn,
  createColumn,
  type CardFields,
} from "@/lib/api";
import { moveCard, type BoardData, type BoardMember, type Card } from "@/lib/kanban";
import { columnAccent } from "@/lib/theme";

type KanbanBoardProps = {
  board: BoardData;
  editable: boolean;
  members: BoardMember[];
  memberNames: Map<number, string>;
  onRun: (operation: () => Promise<BoardData>) => Promise<boolean>;
};

const matches = (card: Card, filters: Filters, term: string) => {
  if (term && !`${card.title} ${card.details}`.toLowerCase().includes(term)) {
    return false;
  }
  if (filters.priority !== "all" && card.priority !== filters.priority) {
    return false;
  }
  if (filters.assigneeId !== "all") {
    const wanted = filters.assigneeId === "none" ? null : filters.assigneeId;
    if (card.assigneeId !== wanted) {
      return false;
    }
  }
  return true;
};

export const KanbanBoard = ({
  board,
  editable,
  members,
  memberNames,
  onRun,
}: KanbanBoardProps) => {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const filtering =
    filters.search.trim() !== "" ||
    filters.priority !== "all" ||
    filters.assigneeId !== "all";

  const visibleColumns = useMemo(() => {
    if (!filtering) {
      return board.columns;
    }
    const term = filters.search.trim().toLowerCase();
    return board.columns.map((column) => ({
      ...column,
      cardIds: column.cardIds.filter((cardId) =>
        matches(board.cards[cardId], filters, term)
      ),
    }));
  }, [board.columns, board.cards, filters, filtering]);

  const totals = useMemo(() => {
    const lastColumn = board.columns[board.columns.length - 1];
    return {
      cards: Object.keys(board.cards).length,
      done: lastColumn ? lastColumn.cardIds.length : 0,
      shown: visibleColumns.reduce(
        (count, column) => count + column.cardIds.length,
        0
      ),
    };
  }, [board.cards, board.columns, visibleColumns]);

  const handleDragStart = (event: DragStartEvent) =>
    setActiveCardId(event.active.id as string);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
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
    void onRun(() =>
      moveBoardCard(
        board.id,
        active.id as string,
        targetColumn.id,
        targetColumn.cardIds.indexOf(active.id as string)
      )
    );
  };

  const activeCard = activeCardId ? board.cards[activeCardId] : null;
  const activeColumnIndex = board.columns.findIndex((column) =>
    activeCardId ? column.cardIds.includes(activeCardId) : false
  );

  const donePercent = totals.cards
    ? Math.round((totals.done / totals.cards) * 100)
    : 0;

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-3 px-5 pt-3">
        <BoardFilters
          filters={filters}
          members={members}
          onChange={setFilters}
          matchCount={filtering ? totals.shown : null}
        />
        <div className="ml-auto flex items-center gap-3">
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
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <main className="scroll-slim min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-5 py-3">
          <section className="flex h-full min-h-0 w-full gap-3">
            {visibleColumns.map((column, index) => (
              <KanbanColumn
                key={column.id}
                column={column}
                totalCards={board.columns[index]?.cardIds.length ?? 0}
                accent={columnAccent(index)}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                editable={editable}
                draggable={editable && !filtering}
                members={members}
                memberNames={memberNames}
                otherColumns={board.columns.filter(
                  (candidate) => candidate.id !== column.id
                )}
                canDelete={board.columns.length > 1}
                onRename={(title) =>
                  onRun(() => updateColumn(board.id, column.id, { title }))
                }
                onSetWipLimit={(wipLimit) =>
                  onRun(() => updateColumn(board.id, column.id, { wipLimit }))
                }
                onMoveColumn={(position) =>
                  onRun(() => moveColumn(board.id, column.id, position))
                }
                onDeleteColumn={(moveCardsTo) =>
                  onRun(() => deleteColumn(board.id, column.id, moveCardsTo))
                }
                onAddCard={(fields) =>
                  onRun(() => createCard(board.id, column.id, fields))
                }
                onEditCard={(cardId, fields: CardFields) =>
                  onRun(() => editCard(board.id, cardId, fields))
                }
                onDeleteCard={(cardId) =>
                  onRun(() => deleteCard(board.id, cardId))
                }
                position={index}
                columnCount={board.columns.length}
              />
            ))}
            {editable ? (
              <NewColumnForm
                onAdd={(title) => onRun(() => createColumn(board.id, title))}
              />
            ) : null}
          </section>
        </main>
        <DragOverlay>
          {activeCard ? (
            <div className="w-[240px]">
              <KanbanCardPreview
                card={activeCard}
                accent={columnAccent(activeColumnIndex < 0 ? 0 : activeColumnIndex)}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
};
