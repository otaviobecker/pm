"use client";

import { useState, type FormEvent } from "react";
import { ApiError, sendChat, type ChatMessage } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

type ChatSidebarProps = {
  onBoardUpdate: (board: BoardData) => void;
};

const HISTORY_LIMIT = 40;

export const ChatSidebar = ({ onBoardUpdate }: ChatSidebarProps) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || pending) {
      return;
    }

    setInput("");
    setError("");
    setPending(true);
    const userMessage: ChatMessage = { role: "user", content: message };
    setMessages((current) => [...current, userMessage]);

    try {
      const result = await sendChat(message, messages.slice(-HISTORY_LIMIT));
      setMessages((current) => [
        ...current,
        { role: "assistant", content: result.message },
      ]);
      if (result.board) {
        onBoardUpdate(result.board);
      }
    } catch (error) {
      setError(
        error instanceof ApiError && error.detail
          ? error.detail
          : "The assistant could not respond. Please try again."
      );
    } finally {
      setPending(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 rounded-full bg-[var(--secondary-purple)] px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(117,57,145,0.35)] transition hover:-translate-y-0.5"
      >
        Ask AI
      </button>
    );
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-[var(--stroke)] bg-white shadow-[-18px_0_50px_rgba(3,33,71,0.16)]">
      <header className="flex items-start justify-between border-b border-[var(--stroke)] p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--primary-blue)]">
            Board assistant
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--navy-dark)]">
            Plan with AI
          </h2>
          <p className="mt-2 text-sm text-[var(--gray-text)]">
            Ask questions or request changes to one or more cards.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-sm font-semibold text-[var(--gray-text)]"
          aria-label="Close AI assistant"
        >
          Close
        </button>
      </header>

      <div
        className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[var(--surface)] p-6"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--stroke)] bg-white p-5 text-sm leading-6 text-[var(--gray-text)]">
            Try “Move the roadmap card to Review” or ask what deserves attention
            next.
          </div>
        ) : null}
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={
              message.role === "user"
                ? "ml-10 rounded-2xl rounded-br-sm bg-[var(--navy-dark)] px-4 py-3 text-sm leading-6 text-white"
                : "mr-10 rounded-2xl rounded-bl-sm border border-[var(--stroke)] bg-white px-4 py-3 text-sm leading-6 text-[var(--navy-dark)]"
            }
          >
            {message.content}
          </div>
        ))}
        {pending ? (
          <p className="text-sm font-semibold text-[var(--primary-blue)]">
            Thinking...
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[var(--stroke)] p-5">
        <label className="sr-only" htmlFor="chat-message">
          Message the board assistant
        </label>
        <textarea
          id="chat-message"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about the board or request a change..."
          rows={3}
          className="w-full resize-none rounded-2xl border border-[var(--stroke)] px-4 py-3 text-sm outline-none focus:border-[var(--primary-blue)]"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="mt-3 w-full rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </aside>
  );
};
