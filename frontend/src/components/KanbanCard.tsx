"use client";

import { useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import {
  CalendarIcon,
  CheckIcon,
  CloseIcon,
  FlagIcon,
  GripIcon,
  PencilIcon,
  TrashIcon,
} from "@/components/icons";
import type { CardFields } from "@/lib/api";
import {
  dueState,
  formatDueDate,
  initials,
  priorities,
  priorityLabels,
  type BoardMember,
  type Card,
  type Priority,
} from "@/lib/kanban";
import { dueAccent, priorityAccent, type ColumnAccent } from "@/lib/theme";

type KanbanCardProps = {
  card: Card;
  accent: ColumnAccent;
  editable: boolean;
  draggable: boolean;
  members: BoardMember[];
  assigneeName: string | null;
  onEdit: (cardId: string, fields: CardFields) => Promise<boolean>;
  onDelete: (cardId: string) => Promise<boolean>;
};

const chipClass =
  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]";
const inputClass =
  "w-full rounded-lg border border-[var(--stroke)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]";

export const KanbanCard = ({
  card,
  accent,
  editable,
  draggable,
  members,
  assigneeName,
  onEdit,
  onDelete,
}: KanbanCardProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    title: card.title,
    details: card.details,
    priority: card.priority,
    dueDate: card.dueDate ?? "",
    assigneeId: card.assigneeId === null ? "" : String(card.assigneeId),
  });
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, disabled: !draggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const startEditing = () => {
    setDraft({
      title: card.title,
      details: card.details,
      priority: card.priority,
      dueDate: card.dueDate ?? "",
      assigneeId: card.assigneeId === null ? "" : String(card.assigneeId),
    });
    setEditing(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.title.trim()) {
      return;
    }
    const succeeded = await onEdit(card.id, {
      title: draft.title.trim(),
      details: draft.details.trim(),
      priority: draft.priority,
      dueDate: draft.dueDate === "" ? null : draft.dueDate,
      assigneeId: draft.assigneeId === "" ? null : Number(draft.assigneeId),
    });
    if (succeeded) {
      setEditing(false);
    }
  };

  const priorityStyle = priorityAccent[card.priority];
  const due = dueState(card.dueDate);

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
            value={draft.title}
            onChange={(event) =>
              setDraft((current) => ({ ...current, title: event.target.value }))
            }
            className={clsx(inputClass, "text-sm")}
            required
          />
          <textarea
            aria-label="Card details"
            value={draft.details}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                details: event.target.value,
              }))
            }
            rows={3}
            className={clsx(inputClass, "resize-none leading-5")}
          />
          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--gray-text)]">
              Priority
              <select
                aria-label="Card priority"
                value={draft.priority}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    priority: event.target.value as Priority,
                  }))
                }
                className={clsx(inputClass, "mt-1 normal-case tracking-normal")}
              >
                {priorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {priorityLabels[priority]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--gray-text)]">
              Due date
              <input
                aria-label="Card due date"
                type="date"
                value={draft.dueDate}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    dueDate: event.target.value,
                  }))
                }
                className={clsx(inputClass, "mt-1 normal-case tracking-normal")}
              />
            </label>
          </div>
          <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--gray-text)]">
            Assignee
            <select
              aria-label="Card assignee"
              value={draft.assigneeId}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  assigneeId: event.target.value,
                }))
              }
              className={clsx(inputClass, "mt-1 normal-case tracking-normal")}
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName || member.username}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setEditing(false)}
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
          {draggable ? (
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
          ) : (
            <span className="w-5 shrink-0" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <h4 className="font-display text-sm font-semibold leading-snug break-words text-[var(--navy-dark)] max-[1024px]:pr-12">
              {card.title}
            </h4>
            {card.details ? (
              <p className="mt-1 text-xs leading-5 break-words text-[var(--gray-text)]">
                {card.details}
              </p>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span
                className={chipClass}
                style={{
                  backgroundColor: priorityStyle.soft,
                  color: priorityStyle.color,
                }}
                aria-label={`Priority ${priorityLabels[card.priority]}`}
              >
                <FlagIcon width={10} height={10} />
                {priorityLabels[card.priority]}
              </span>
              {card.dueDate && due !== "none" ? (
                <span
                  className={chipClass}
                  style={{
                    backgroundColor: dueAccent[due].soft,
                    color: dueAccent[due].color,
                  }}
                  aria-label={`Due ${card.dueDate}${
                    due === "overdue" ? ", overdue" : ""
                  }`}
                >
                  <CalendarIcon width={10} height={10} />
                  {formatDueDate(card.dueDate)}
                </span>
              ) : null}
              {assigneeName ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--navy-dark)]"
                  aria-label={`Assigned to ${assigneeName}`}
                  title={assigneeName}
                >
                  {initials(assigneeName)}
                </span>
              ) : null}
            </div>
          </div>
          {editable ? (
            <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-lg bg-white opacity-0 shadow-[0_2px_8px_rgba(3,33,71,0.10)] transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 max-[1024px]:opacity-100 max-[1024px]:shadow-none">
              <button
                type="button"
                onClick={startEditing}
                className="icon-button h-6 w-6"
                aria-label={`Edit ${card.title}`}
                title="Edit card"
              >
                <PencilIcon width={14} height={14} />
              </button>
              <button
                type="button"
                onClick={() => void onDelete(card.id)}
                className="icon-button icon-button-danger h-6 w-6"
                aria-label={`Delete ${card.title}`}
                title="Delete card"
              >
                <TrashIcon width={14} height={14} />
              </button>
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
};
