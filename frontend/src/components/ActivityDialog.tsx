"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog, subtleButtonClass } from "@/components/Dialog";
import { HistoryIcon } from "@/components/icons";
import { ApiError, getActivity } from "@/lib/api";
import {
  describeActivity,
  formatMoment,
  initials,
  type ActivityEntry,
} from "@/lib/kanban";

const PAGE_SIZE = 25;

type ActivityDialogProps = {
  boardId: number;
  boardName: string;
  onClose: () => void;
};

export const ActivityDialog = ({
  boardId,
  boardName,
  onClose,
}: ActivityDialogProps) => {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (before?: number) => {
      setLoading(true);
      try {
        const page = await getActivity(boardId, { limit: PAGE_SIZE, before });
        setEntries((current) =>
          before === undefined ? page : [...current, ...page]
        );
        setExhausted(page.length < PAGE_SIZE);
        setError("");
      } catch (caught) {
        setError(
          caught instanceof ApiError && caught.detail
            ? caught.detail
            : "Unable to load this board's history."
        );
      } finally {
        setLoading(false);
      }
    },
    [boardId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Dialog title={`History of ${boardName}`} onClose={onClose}>
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
        >
          {error}
        </p>
      ) : null}

      {entries.length === 0 && !loading && !error ? (
        <p className="flex items-center gap-2 text-sm text-[var(--gray-text)]">
          <HistoryIcon width={16} height={16} />
          Nothing has happened on this board yet.
        </p>
      ) : null}

      <ol className="space-y-2" data-testid="activity-feed">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="flex items-start gap-2.5 rounded-xl border border-[var(--stroke)] px-3 py-2"
            data-testid={`activity-${entry.id}`}
          >
            <span
              aria-hidden
              className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--surface-muted)] text-[10px] font-bold uppercase text-[var(--navy-dark)]"
            >
              {initials(entry.actorName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-6 text-[var(--navy-dark)]">
                <span className="font-semibold">{entry.actorName}</span>{" "}
                {describeActivity(entry)}
                {entry.subject ? (
                  <span className="font-semibold"> {entry.subject}</span>
                ) : null}
                {entry.detail ? (
                  <span className="text-[var(--gray-text)]"> ({entry.detail})</span>
                ) : null}
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--gray-text)]">
                {formatMoment(entry.createdAt)}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {loading ? (
        <p className="text-sm font-semibold text-[var(--gray-text)]">Loading...</p>
      ) : null}

      {!exhausted && entries.length > 0 ? (
        <button
          type="button"
          onClick={() => void load(entries[entries.length - 1].id)}
          className={subtleButtonClass}
        >
          Load older
        </button>
      ) : null}
    </Dialog>
  );
};
