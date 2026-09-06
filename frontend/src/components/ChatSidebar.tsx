"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, sendChat, type ChatMessage } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";
import { CloseIcon, SendIcon, SparkleIcon } from "@/components/icons";

type ChatSidebarProps = {
  boardId: number;
  onBoardUpdate: (board: BoardData) => void;
};

const HISTORY_LIMIT = 40;

const suggestions = [
  "What deserves attention next?",
  "Move the roadmap card to Review",
  "Add a card for release notes",
];

export const ChatSidebar = ({ boardId, onBoardUpdate }: ChatSidebarProps) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // The conversation is about one board, so switching boards starts a new thread.
  useEffect(() => {
    setMessages([]);
    setError("");
  }, [boardId]);

  useEffect(() => {
    const thread = scrollRef.current;
    if (thread) {
      thread.scrollTop = thread.scrollHeight;
    }
  }, [messages, pending]);

  const send = async (message: string) => {
    if (!message || pending) {
      return;
    }

    setInput("");
    setError("");
    setPending(true);
    const userMessage: ChatMessage = { role: "user", content: message };
    setMessages((current) => [...current, userMessage]);

    try {
      const result = await sendChat(
        boardId,
        message,
        messages.slice(-HISTORY_LIMIT)
      );
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void send(input.trim());
  };

  if (!open) {
    // Floating on narrow screens, a docked rail from lg up so the trigger never
    // covers a column footer.
    return (
      <div className="pointer-events-none fixed bottom-5 right-5 z-30 lg:static lg:z-auto lg:flex lg:w-14 lg:shrink-0 lg:justify-center lg:border-l lg:border-[var(--stroke)] lg:bg-white/60 lg:pt-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto flex items-center gap-2 rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(117,57,145,0.35)] transition hover:-translate-y-0.5 hover:brightness-110 lg:h-10 lg:w-10 lg:justify-center lg:self-start lg:p-0 lg:shadow-[var(--shadow-soft)] lg:hover:translate-y-0"
          aria-label="Ask AI"
          title="Open the board assistant"
        >
          <SparkleIcon width={16} height={16} />
          <span className="lg:hidden">Ask AI</span>
        </button>
      </div>
    );
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-[var(--stroke)] bg-white shadow-[-18px_0_50px_rgba(3,33,71,0.16)] lg:static lg:z-auto lg:w-[360px] lg:max-w-none lg:shrink-0 lg:shadow-none">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[var(--stroke)] px-4">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--secondary-purple)] text-white"
        >
          <SparkleIcon width={18} height={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-base font-semibold leading-none text-[var(--navy-dark)]">
            Plan with AI
          </h2>
          <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
            Board assistant
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="icon-button"
          aria-label="Close AI assistant"
          title="Close assistant"
        >
          <CloseIcon width={16} height={16} />
        </button>
      </header>

      <div
        ref={scrollRef}
        className="scroll-slim flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-[var(--surface)] p-4"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--stroke-strong)] bg-white p-4">
            <p className="text-sm leading-6 text-[var(--gray-text)]">
              Ask about the board or request changes to one or more cards.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setInput(suggestion)}
                  className="rounded-full border border-[var(--stroke)] px-2.5 py-1 text-xs font-semibold text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={
              message.role === "user"
                ? "ml-8 self-end rounded-2xl rounded-br-sm bg-[var(--navy-dark)] px-3.5 py-2.5 text-sm leading-6 text-white"
                : "mr-8 self-start rounded-2xl rounded-bl-sm border border-[var(--stroke)] bg-white px-3.5 py-2.5 text-sm leading-6 text-[var(--navy-dark)]"
            }
          >
            {message.content}
          </div>
        ))}
        {pending ? (
          <p className="mr-8 flex items-center gap-2 self-start rounded-2xl rounded-bl-sm border border-[var(--stroke)] bg-white px-3.5 py-2.5 text-sm font-semibold text-[var(--primary-blue)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--primary-blue)]" />
            Thinking...
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-700"
          >
            {error}
          </p>
        ) : null}
      </div>

      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-[var(--stroke)] p-3"
      >
        <label className="sr-only" htmlFor="chat-message">
          Message the board assistant
        </label>
        <div className="flex items-end gap-2 rounded-2xl border border-[var(--stroke)] bg-white p-2 transition focus-within:border-[var(--primary-blue)]">
          <textarea
            id="chat-message"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(input.trim());
              }
            }}
            placeholder="Ask about the board or request a change..."
            rows={2}
            className="min-h-[44px] w-full flex-1 resize-none bg-transparent px-1.5 py-1 text-sm leading-6 outline-none"
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--secondary-purple)] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send"
            title="Send (Enter)"
          >
            <SendIcon width={16} height={16} />
          </button>
        </div>
      </form>
    </aside>
  );
};
