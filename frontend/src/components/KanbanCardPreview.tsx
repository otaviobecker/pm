import type { Card } from "@/lib/kanban";
import type { ColumnAccent } from "@/lib/theme";
import { GripIcon } from "@/components/icons";

type KanbanCardPreviewProps = {
  card: Card;
  accent?: ColumnAccent;
};

export const KanbanCardPreview = ({ card, accent }: KanbanCardPreviewProps) => (
  <article className="relative overflow-hidden rounded-xl border border-[var(--stroke-strong)] bg-white shadow-[0_18px_32px_rgba(3,33,71,0.18)]">
    <span
      aria-hidden
      className="absolute inset-y-0 left-0 w-[3px]"
      style={{ backgroundColor: accent?.color ?? "var(--primary-blue)" }}
    />
    <div className="flex items-start gap-1 py-2.5 pl-2 pr-3">
      <span className="mt-0.5 shrink-0 text-[var(--stroke-strong)]">
        <GripIcon width={14} height={14} />
      </span>
      <div className="min-w-0 flex-1">
        <h4 className="font-display text-sm font-semibold leading-snug text-[var(--navy-dark)] break-words">
          {card.title}
        </h4>
        {card.details ? (
          <p className="mt-1 text-xs leading-5 text-[var(--gray-text)] break-words">
            {card.details}
          </p>
        ) : null}
      </div>
    </div>
  </article>
);
