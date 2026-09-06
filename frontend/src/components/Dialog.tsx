"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "@/components/icons";

type DialogProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export const Dialog = ({ title, onClose, children }: DialogProps) => {
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-[rgba(3,33,71,0.35)] p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="scroll-slim max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--stroke)] bg-white shadow-[var(--shadow)] outline-none"
      >
        <header className="sticky top-0 flex items-center gap-2 border-b border-[var(--stroke)] bg-white px-5 py-4">
          <h2 className="flex-1 font-display text-lg font-semibold text-[var(--navy-dark)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="icon-button"
            aria-label="Close dialog"
          >
            <CloseIcon width={16} height={16} />
          </button>
        </header>
        <div className="space-y-6 px-5 py-5">{children}</div>
      </div>
    </div>
  );
};

export const Field = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--gray-text)]">
    {label}
    <div className="mt-1.5 normal-case tracking-normal">{children}</div>
  </label>
);

export const dialogInputClass =
  "w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-semibold text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

export const primaryButtonClass =
  "rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50";

export const subtleButtonClass =
  "rounded-full border border-[var(--stroke)] px-4 py-2 text-sm font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]";

export const dangerButtonClass =
  "rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100";
