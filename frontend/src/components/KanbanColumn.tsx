import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/kanban";
import type { ColumnAccent } from "@/lib/theme";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  accent: ColumnAccent;
  onRename: (columnId: string, title: string) => Promise<boolean>;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onEditCard: (cardId: string, title: string, details: string) => Promise<boolean>;
  onDeleteCard: (columnId: string, cardId: string) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  accent,
  onRename,
  onAddCard,
  onEditCard,
  onDeleteCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  const saveTitle = async (input: HTMLInputElement) => {
    const nextTitle = input.value.trim();
    if (!nextTitle) {
      input.value = column.title;
    } else if (nextTitle !== column.title) {
      const succeeded = await onRename(column.id, nextTitle);
      if (!succeeded) {
        input.value = column.title;
      }
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
          onBlur={(event) => void saveTitle(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          className="min-w-0 flex-1 truncate rounded-md bg-transparent px-1 py-0.5 font-display text-sm font-semibold uppercase tracking-[0.12em] text-[var(--navy-dark)] outline-none transition hover:bg-[var(--surface-muted)] focus:bg-[var(--surface-muted)]"
          aria-label="Column title"
          title="Rename column"
        />
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
          style={{ backgroundColor: accent.soft, color: accent.color }}
          aria-label={`${cards.length} cards`}
        >
          {cards.length}
        </span>
      </div>

      <div className="scroll-slim flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-1">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              accent={accent}
              onEdit={onEditCard}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-[var(--stroke-strong)] px-2 py-6 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
        <div className="pb-2 pt-1">
          <NewCardForm
            onAdd={(title, details) => onAddCard(column.id, title, details)}
          />
        </div>
      </div>
    </section>
  );
};
