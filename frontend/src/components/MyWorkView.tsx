"use client";

import clsx from "clsx";
import { CalendarIcon, FlagIcon, InboxIcon } from "@/components/icons";
import {
  dueState,
  formatDueDate,
  groupAssignments,
  priorityLabels,
  workGroupLabels,
  type AssignedCard,
} from "@/lib/kanban";
import { dueAccent, priorityAccent } from "@/lib/theme";

type MyWorkViewProps = {
  cards: AssignedCard[];
  loading: boolean;
  /** Opens the card on its own board. */
  onOpen: (boardId: number, cardId: string) => void;
};

const chipClass =
  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]";

export const MyWorkView = ({ cards, loading, onOpen }: MyWorkViewProps) => {
  const groups = groupAssignments(cards);

  if (loading) {
    return (
      <p className="grid flex-1 place-items-center text-sm font-semibold text-[var(--gray-text)]">
        Loading your work...
      </p>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="grid flex-1 place-items-center px-6 text-center">
        <div>
          <span aria-hidden className="text-[var(--stroke-strong)]">
            <InboxIcon width={32} height={32} />
          </span>
          <p className="mt-3 font-display text-lg font-semibold text-[var(--navy-dark)]">
            Nothing assigned to you
          </p>
          <p className="mt-2 text-sm text-[var(--gray-text)]">
            Cards assigned to you across your boards collect here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <main
      className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-4"
      data-testid="my-work"
    >
      <div className="mx-auto max-w-3xl space-y-6">
        {groups.map(([group, groupCards]) => (
          <section key={group} className="space-y-2">
            <h2
              className={clsx(
                "font-display text-sm font-semibold uppercase tracking-[0.14em]",
                group === "overdue" ? "text-red-700" : "text-[var(--navy-dark)]"
              )}
            >
              {workGroupLabels[group]}{" "}
              <span className="text-[var(--gray-text)]">{groupCards.length}</span>
            </h2>
            <ul className="space-y-2">
              {groupCards.map((card) => {
                const due = dueState(card.dueDate);
                const priority = priorityAccent[card.priority];
                return (
                  <li key={`${card.boardId}-${card.id}`}>
                    <button
                      type="button"
                      onClick={() => onOpen(card.boardId, card.id)}
                      className="flex w-full items-start gap-3 rounded-xl border border-[var(--stroke)] bg-white px-4 py-3 text-left transition hover:border-[var(--stroke-strong)] hover:shadow-[var(--shadow-soft)]"
                      data-testid={`assigned-${card.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-sm font-semibold text-[var(--navy-dark)]">
                          {card.title}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--gray-text)]">
                          {card.boardName} · {card.columnTitle}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                        <span
                          className={chipClass}
                          style={{
                            backgroundColor: priority.soft,
                            color: priority.color,
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
                            aria-label={`Due ${card.dueDate}`}
                          >
                            <CalendarIcon width={10} height={10} />
                            {formatDueDate(card.dueDate)}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
};
