import { useState, type FormEvent } from "react";
import { CheckIcon, CloseIcon, PlusIcon } from "@/components/icons";

const initialFormState = { title: "", details: "" };

type NewCardFormProps = {
  onAdd: (title: string, details: string) => void;
};

export const NewCardForm = ({ onAdd }: NewCardFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [formState, setFormState] = useState(initialFormState);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.title.trim()) {
      return;
    }
    onAdd(formState.title.trim(), formState.details.trim());
    setFormState(initialFormState);
    setIsOpen(false);
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
        autoFocus
        className="w-full rounded-lg border border-[var(--stroke)] bg-white px-2.5 py-1.5 text-sm font-semibold text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
        required
      />
      <textarea
        value={formState.details}
        onChange={(event) =>
          setFormState((prev) => ({ ...prev, details: event.target.value }))
        }
        placeholder="Details"
        rows={2}
        className="w-full resize-none rounded-lg border border-[var(--stroke)] bg-white px-2.5 py-1.5 text-xs leading-5 text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
      />
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
