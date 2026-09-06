"use client";

import { useState, type FormEvent } from "react";
import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  SettingsIcon,
  TrashIcon,
} from "@/components/icons";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";
import type { CardFields } from "@/lib/api";
import {
  labelsFor,
  wipState,
  type BoardData,
  type BoardMember,
  type Card,
  type Column,
} from "@/lib/kanban";
import type { ColumnAccent } from "@/lib/theme";

type KanbanColumnProps = {
  column: Column;
  /** Card count before filtering, used for the WIP badge. */
  totalCards: number;
  cards: Card[];
  accent: ColumnAccent;
  editable: boolean;
  draggable: boolean;
  members: BoardMember[];
  memberNames: Map<number, string>;
  board: BoardData;
  onOpenCard: (cardId: string) => void;
  otherColumns: Column[];
  canDelete: boolean;
  position: number;
  columnCount: number;
  onRename: (title: string) => Promise<boolean>;
  onSetWipLimit: (wipLimit: number | null) => Promise<boolean>;
  onMoveColumn: (position: number) => Promise<boolean>;
  onDeleteColumn: (moveCardsTo?: string) => Promise<boolean>;
  onAddCard: (fields: CardFields & { title: string }) => Promise<boolean>;
  onEditCard: (cardId: string, fields: CardFields) => Promise<boolean>;
  onDeleteCard: (cardId: string) => Promise<boolean>;
};

export const KanbanColumn = ({
  column,
  totalCards,
  cards,
  accent,
  editable,
  draggable,
  members,
  memberNames,
  board,
  onOpenCard,
  otherColumns,
  canDelete,
  position,
  columnCount,
  onRename,
  onSetWipLimit,
  onMoveColumn,
  onDeleteColumn,
  onAddCard,
  onEditCard,
  onDeleteCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [menuOpen, setMenuOpen] = useState(false);
  const [limitDraft, setLimitDraft] = useState(
    column.wipLimit === null ? "" : String(column.wipLimit)
  );
  const [destination, setDestination] = useState(otherColumns[0]?.id ?? "");

  const state = wipState({ ...column, cardIds: Array(totalCards).fill("") });

  const saveTitle = async (input: HTMLInputElement) => {
    const nextTitle = input.value.trim();
    if (!nextTitle) {
      input.value = column.title;
    } else if (nextTitle !== column.title) {
      if (!(await onRename(nextTitle))) {
        input.value = column.title;
      }
    }
  };

  const saveLimit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = limitDraft.trim();
    const parsed = trimmed === "" ? null : Number.parseInt(trimmed, 10);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 1)) {
      return;
    }
    if (await onSetWipLimit(parsed)) {
      setMenuOpen(false);
    }
  };

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex h-full min-h-0 min-w-[264px] lg:min-w-[200px] flex-1 basis-0 flex-col overflow-hidden rounded-2xl border bg-[var(--surface-strong)] transition",
        isOver
          ? "border-transparent ring-2 ring-[var(--accent-yellow)]"
          : "border-[var(--stroke)]"
      )}
      style={{ boxShadow: "var(--shadow-soft)" }}
      data-testid={`column-${column.id}`}
    >
      <span
        aria-hidden
        className="block h-1 w-full shrink-0"
        style={{ backgroundColor: accent.color }}
      />
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3">
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: accent.color }}
        />
        <input
          defaultValue={column.title}
          key={column.title}
          onBlur={(event) => void saveTitle(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          readOnly={!editable}
          className="min-w-0 flex-1 truncate rounded-md bg-transparent px-1 py-0.5 font-display text-sm font-semibold uppercase tracking-[0.12em] text-[var(--navy-dark)] outline-none transition hover:bg-[var(--surface-muted)] focus:bg-[var(--surface-muted)] read-only:hover:bg-transparent"
          aria-label="Column title"
          title={editable ? "Rename column" : column.title}
        />
        <span
          className={clsx(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
            state === "over" && "bg-red-100 text-red-700",
            state === "full" && "bg-amber-100 text-amber-800"
          )}
          style={
            state === "over" || state === "full"
              ? undefined
              : { backgroundColor: accent.soft, color: accent.color }
          }
          aria-label={
            column.wipLimit === null
              ? `${totalCards} cards`
              : `${totalCards} of ${column.wipLimit} cards, work-in-progress limit`
          }
        >
          {column.wipLimit === null
            ? totalCards
            : `${totalCards}/${column.wipLimit}`}
        </span>
        {editable ? (
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="icon-button h-6 w-6 shrink-0"
            aria-label={`Column options for ${column.title}`}
            aria-expanded={menuOpen}
          >
            <SettingsIcon width={14} height={14} />
          </button>
        ) : null}
      </div>

      {menuOpen ? (
        <div className="mx-3 mb-2 shrink-0 space-y-2 rounded-xl border border-[var(--stroke)] bg-[var(--surface)] p-2.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void onMoveColumn(position - 1)}
              disabled={position === 0}
              className="icon-button h-6 w-6 disabled:opacity-30"
              aria-label={`Move ${column.title} left`}
            >
              <ChevronLeftIcon width={13} height={13} />
            </button>
            <button
              type="button"
              onClick={() => void onMoveColumn(position + 1)}
              disabled={position === columnCount - 1}
              className="icon-button h-6 w-6 disabled:opacity-30"
              aria-label={`Move ${column.title} right`}
            >
              <ChevronRightIcon width={13} height={13} />
            </button>
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-text)]">
              Column {position + 1} of {columnCount}
            </span>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="icon-button h-6 w-6"
              aria-label="Close column options"
            >
              <CloseIcon width={12} height={12} />
            </button>
          </div>

          <form onSubmit={saveLimit} className="flex items-center gap-1.5">
            <label className="flex-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-text)]">
              WIP limit
              <input
                value={limitDraft}
                onChange={(event) => setLimitDraft(event.target.value)}
                inputMode="numeric"
                placeholder="None"
                aria-label={`Work-in-progress limit for ${column.title}`}
                className="mt-1 w-full rounded-lg border border-[var(--stroke)] bg-white px-2 py-1 text-xs font-semibold normal-case tracking-normal text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
              />
            </label>
            <button
              type="submit"
              className="mt-4 rounded-full bg-[var(--primary-blue)] px-2.5 py-1 text-xs font-semibold text-white transition hover:brightness-110"
            >
              Save
            </button>
          </form>

          {canDelete ? (
            <div className="space-y-1.5 border-t border-[var(--stroke)] pt-2">
              {totalCards > 0 ? (
                <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-text)]">
                  Move cards to
                  <select
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                    aria-label={`Move cards from ${column.title} to`}
                    className="mt-1 w-full rounded-lg border border-[var(--stroke)] bg-white px-2 py-1 text-xs font-semibold normal-case tracking-normal text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
                  >
                    {otherColumns.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  void onDeleteColumn(totalCards > 0 ? destination : undefined)
                }
                className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                aria-label={`Delete ${column.title}`}
              >
                <TrashIcon width={13} height={13} />
                Delete column
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="scroll-slim flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-1">
        <SortableContext
          items={column.cardIds}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              accent={accent}
              editable={editable}
              draggable={draggable}
              members={members}
              assigneeName={
                card.assigneeId === null
                  ? null
                  : memberNames.get(card.assigneeId) ?? null
              }
              labels={labelsFor(board, card)}
              onOpen={onOpenCard}
              onEdit={onEditCard}
              onDelete={onDeleteCard}
            />
          ))}
        </SortableContext>
        {cards.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-[var(--stroke-strong)] px-2 py-6 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--gray-text)]">
            {totalCards === 0 ? "Drop a card here" : "No matching cards"}
          </div>
        ) : null}
        {editable ? (
          <div className="pb-2 pt-1">
            <NewCardForm members={members} onAdd={onAddCard} />
          </div>
        ) : null}
      </div>
    </section>
  );
};
