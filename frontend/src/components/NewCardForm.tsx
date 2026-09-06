"use client";

import { useState, type FormEvent } from "react";
import { CheckIcon, CloseIcon, PlusIcon } from "@/components/icons";
import type { CardFields } from "@/lib/api";
import {
  priorities,
  priorityLabels,
  type BoardMember,
  type Priority,
} from "@/lib/kanban";

const initialFormState = {
  title: "",
  details: "",
  priority: "medium" as Priority,
  dueDate: "",
  assigneeId: "",
};

type NewCardFormProps = {
  members: BoardMember[];
  onAdd: (fields: CardFields & { title: string }) => Promise<boolean>;
};

const inputClass =
  "w-full rounded-lg border border-[var(--stroke)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

export const NewCardForm = ({ members, onAdd }: NewCardFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [formState, setFormState] = useState(initialFormState);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.title.trim()) {
      return;
    }
    const added = await onAdd({
      title: formState.title.trim(),
      details: formState.details.trim(),
      priority: formState.priority,
      dueDate: formState.dueDate === "" ? null : formState.dueDate,
      assigneeId:
        formState.assigneeId === "" ? null : Number(formState.assigneeId),
    });
    if (added) {
      setFormState(initialFormState);
      setIsOpen(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-[var(--gray-text)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--navy-dark)]"
        aria-label="Add a card"
        title="Add a card"
      >
        <PlusIcon width={14} height={14} />
        Add a card
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <input
        value={formState.title}
        onChange={(event) =>
          setFormState((prev) => ({ ...prev, title: event.target.value }))
        }
        placeholder="Card title"
        aria-label="New card title"
        autoFocus
        className={`${inputClass} text-sm`}
        required
      />
      <textarea
        value={formState.details}
        onChange={(event) =>
          setFormState((prev) => ({ ...prev, details: event.target.value }))
        }
        placeholder="Details"
        aria-label="New card details"
        rows={2}
        className={`${inputClass} resize-none leading-5`}
      />
      <div className="grid grid-cols-2 gap-1.5">
        <select
          value={formState.priority}
          onChange={(event) =>
            setFormState((prev) => ({
              ...prev,
              priority: event.target.value as Priority,
            }))
          }
          aria-label="New card priority"
          className={inputClass}
        >
          {priorities.map((priority) => (
            <option key={priority} value={priority}>
              {priorityLabels[priority]}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={formState.dueDate}
          onChange={(event) =>
            setFormState((prev) => ({ ...prev, dueDate: event.target.value }))
          }
          aria-label="New card due date"
          className={inputClass}
        />
      </div>
      {members.length > 1 ? (
        <select
          value={formState.assigneeId}
          onChange={(event) =>
            setFormState((prev) => ({ ...prev, assigneeId: event.target.value }))
          }
          aria-label="New card assignee"
          className={inputClass}
        >
          <option value="">Unassigned</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.displayName || member.username}
            </option>
          ))}
        </select>
      ) : null}
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setFormState(initialFormState);
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
          Add card
        </button>
      </div>
    </form>
  );
};
