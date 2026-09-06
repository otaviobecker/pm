import { useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Card } from "@/lib/kanban";
import type { ColumnAccent } from "@/lib/theme";
import {
  CheckIcon,
  CloseIcon,
  GripIcon,
  PencilIcon,
  TrashIcon,
} from "@/components/icons";

type KanbanCardProps = {
  card: Card;
  accent: ColumnAccent;
  onEdit: (cardId: string, title: string, details: string) => Promise<boolean>;
  onDelete: (cardId: string) => void;
};

export const KanbanCard = ({
  card,
  accent,
  onEdit,
  onDelete,
}: KanbanCardProps) => {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    const succeeded = await onEdit(card.id, title.trim(), details.trim());
    if (succeeded) {
      setEditing(false);
    }
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group relative overflow-hidden rounded-xl border border-[var(--stroke)] bg-white shadow-[var(--shadow-soft)]",
        "transition-all duration-150 hover:border-[var(--stroke-strong)] hover:shadow-[0_10px_24px_rgba(3,33,71,0.10)]",
        isDragging && "opacity-50 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      data-testid={`card-${card.id}`}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: accent.color }}
      />
      {editing ? (
        <form onSubmit={handleSubmit} className="space-y-2 py-2.5 pl-3.5 pr-2.5">
          <input
            aria-label="Card title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-lg border border-[var(--stroke)] bg-white px-2.5 py-1.5 text-sm font-semibold text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
            required
          />
          <textarea
            aria-label="Card details"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg border border-[var(--stroke)] bg-white px-2.5 py-1.5 text-xs leading-5 text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
          />
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setTitle(card.title);
                setDetails(card.details);
                setEditing(false);
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
              Save
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start gap-1 py-2.5 pl-2 pr-2.5">
          <button
            ref={setActivatorNodeRef}
            type="button"
            className="icon-button h-6 w-5 shrink-0 cursor-grab text-[var(--stroke-strong)] hover:bg-transparent hover:text-[var(--gray-text)] active:cursor-grabbing"
            aria-label={`Drag ${card.title}`}
            title="Drag to reorder or move"
            {...attributes}
            {...listeners}
          >
            <GripIcon width={14} height={14} />
          </button>
          <div className="min-w-0 flex-1">
            <h4 className="font-display text-sm font-semibold leading-snug break-words text-[var(--navy-dark)] max-[1024px]:pr-12">
              {card.title}
            </h4>
            {card.details ? (
              <p className="mt-1 text-xs leading-5 break-words text-[var(--gray-text)]">
                {card.details}
              </p>
            ) : null}
          </div>
          <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-lg bg-white opacity-0 shadow-[0_2px_8px_rgba(3,33,71,0.10)] transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 max-[1024px]:opacity-100 max-[1024px]:shadow-none">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="icon-button h-6 w-6"
              aria-label={`Edit ${card.title}`}
              title="Edit card"
            >
              <PencilIcon width={14} height={14} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(card.id)}
              className="icon-button icon-button-danger h-6 w-6"
              aria-label={`Delete ${card.title}`}
              title="Delete card"
            >
              <TrashIcon width={14} height={14} />
            </button>
          </div>
        </div>
      )}
    </article>
  );
};
