"use client";

import { useState, type FormEvent } from "react";
import { CheckIcon, CloseIcon, PlusIcon } from "@/components/icons";

type NewColumnFormProps = {
  onAdd: (title: string) => Promise<boolean>;
};

export const NewColumnForm = ({ onAdd }: NewColumnFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    if (await onAdd(trimmed)) {
      setTitle("");
      setIsOpen(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex h-full min-w-[160px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[var(--stroke-strong)] px-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--navy-dark)]"
        aria-label="Add a column"
      >
        <PlusIcon width={16} height={16} />
        Add column
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex h-full min-w-[220px] shrink-0 flex-col gap-2 rounded-2xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-3"
    >
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Column title"
        aria-label="New column title"
        autoFocus
        className="w-full rounded-lg border border-[var(--stroke)] bg-white px-2.5 py-1.5 text-sm font-semibold text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
        required
      />
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setTitle("");
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
          Add
        </button>
      </div>
    </form>
  );
};
