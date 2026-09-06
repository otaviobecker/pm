"use client";

import { CloseIcon, SearchIcon } from "@/components/icons";
import {
  priorities,
  priorityLabels,
  type BoardMember,
  type Priority,
} from "@/lib/kanban";

export type Filters = {
  search: string;
  priority: Priority | "all";
  assigneeId: number | "all" | "none";
};

export const emptyFilters: Filters = {
  search: "",
  priority: "all",
  assigneeId: "all",
};

type BoardFiltersProps = {
  filters: Filters;
  members: BoardMember[];
  onChange: (filters: Filters) => void;
  /** Number of matching cards, or null when no filter is active. */
  matchCount: number | null;
};

const selectClass =
  "rounded-lg border border-[var(--stroke)] bg-white px-2 py-1.5 text-xs font-semibold text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

export const BoardFilters = ({
  filters,
  members,
  onChange,
  matchCount,
}: BoardFiltersProps) => (
  <div className="flex flex-wrap items-center gap-2">
    <div className="flex items-center gap-1.5 rounded-lg border border-[var(--stroke)] bg-white px-2 transition focus-within:border-[var(--primary-blue)]">
      <span aria-hidden className="text-[var(--gray-text)]">
        <SearchIcon width={14} height={14} />
      </span>
      <input
        value={filters.search}
        onChange={(event) =>
          onChange({ ...filters, search: event.target.value })
        }
        placeholder="Search cards"
        aria-label="Search cards"
        className="w-36 bg-transparent py-1.5 text-xs font-semibold text-[var(--navy-dark)] outline-none"
      />
    </div>

    <select
      value={filters.priority}
      onChange={(event) =>
        onChange({
          ...filters,
          priority: event.target.value as Filters["priority"],
        })
      }
      aria-label="Filter by priority"
      className={selectClass}
    >
      <option value="all">Any priority</option>
      {priorities.map((priority) => (
        <option key={priority} value={priority}>
          {priorityLabels[priority]}
        </option>
      ))}
    </select>

    <select
      value={String(filters.assigneeId)}
      onChange={(event) => {
        const raw = event.target.value;
        onChange({
          ...filters,
          assigneeId:
            raw === "all" || raw === "none" ? raw : Number.parseInt(raw, 10),
        });
      }}
      aria-label="Filter by assignee"
      className={selectClass}
    >
      <option value="all">Anyone</option>
      <option value="none">Unassigned</option>
      {members.map((member) => (
        <option key={member.userId} value={member.userId}>
          {member.displayName || member.username}
        </option>
      ))}
    </select>

    {matchCount !== null ? (
      <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-text)]">
        {matchCount} match{matchCount === 1 ? "" : "es"}
        <button
          type="button"
          onClick={() => onChange(emptyFilters)}
          className="icon-button h-6 w-6"
          aria-label="Clear filters"
          title="Clear filters"
        >
          <CloseIcon width={12} height={12} />
        </button>
      </span>
    ) : null}
  </div>
);
