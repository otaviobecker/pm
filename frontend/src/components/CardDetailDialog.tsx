"use client";

import { useState, type FormEvent } from "react";
import clsx from "clsx";
import {
  Dialog,
  Field,
  dialogInputClass,
  primaryButtonClass,
  subtleButtonClass,
} from "@/components/Dialog";
import {
  ChecklistIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  CommentIcon,
  PencilIcon,
  PlusIcon,
  TagIcon,
  TrashIcon,
} from "@/components/icons";
import {
  addChecklistItem,
  addComment,
  deleteChecklistItem,
  deleteComment,
  editCard,
  editComment,
  moveChecklistItem,
  setCardLabels,
  updateChecklistItem,
  type CardWorkspace,
} from "@/lib/api";
import {
  formatDueDate,
  priorities,
  priorityLabels,
  type BoardData,
  type CardDetail,
  type Priority,
} from "@/lib/kanban";
import { labelAccent, priorityAccent } from "@/lib/theme";

type CardDetailDialogProps = {
  card: CardDetail;
  board: BoardData;
  currentUserId: number;
  editable: boolean;
  onClose: () => void;
  /** Runs a card mutation and adopts the returned card and board. */
  onRun: (operation: () => Promise<CardWorkspace>) => Promise<boolean>;
  /** Runs a board-only mutation, used for the card's own fields. */
  onRunBoard: (operation: () => Promise<BoardData>) => Promise<boolean>;
};

const sectionHeading =
  "flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.14em] text-[var(--navy-dark)]";

export const CardDetailDialog = ({
  card,
  board,
  currentUserId,
  editable,
  onClose,
  onRun,
  onRunBoard,
}: CardDetailDialogProps) => {
  const [editingFields, setEditingFields] = useState(false);
  const [draft, setDraft] = useState({
    title: card.title,
    details: card.details,
    priority: card.priority,
    dueDate: card.dueDate ?? "",
    assigneeId: card.assigneeId === null ? "" : String(card.assigneeId),
  });
  const [newItem, setNewItem] = useState("");
  const [newComment, setNewComment] = useState("");
  const [editingComment, setEditingComment] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState("");

  const column = board.columns.find((item) => item.id === card.columnId);
  const assignee = board.members.find(
    (member) => member.userId === card.assigneeId
  );
  const priorityStyle = priorityAccent[card.priority];

  const startEditing = () => {
    setDraft({
      title: card.title,
      details: card.details,
      priority: card.priority,
      dueDate: card.dueDate ?? "",
      assigneeId: card.assigneeId === null ? "" : String(card.assigneeId),
    });
    setEditingFields(true);
  };

  const saveFields = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.title.trim()) {
      return;
    }
    const saved = await onRunBoard(() =>
      editCard(board.id, card.id, {
        title: draft.title.trim(),
        details: draft.details.trim(),
        priority: draft.priority,
        dueDate: draft.dueDate === "" ? null : draft.dueDate,
        assigneeId: draft.assigneeId === "" ? null : Number(draft.assigneeId),
      })
    );
    if (saved) {
      setEditingFields(false);
    }
  };

  const toggleLabel = (labelId: string) => {
    const next = card.labelIds.includes(labelId)
      ? card.labelIds.filter((id) => id !== labelId)
      : [...card.labelIds, labelId];
    void onRun(() => setCardLabels(board.id, card.id, next));
  };

  const submitChecklistItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = newItem.trim();
    if (!title) {
      return;
    }
    if (await onRun(() => addChecklistItem(board.id, card.id, title))) {
      setNewItem("");
    }
  };

  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = newComment.trim();
    if (!body) {
      return;
    }
    if (await onRun(() => addComment(board.id, card.id, body))) {
      setNewComment("");
    }
  };

  const saveComment = async (commentId: number) => {
    const body = commentDraft.trim();
    if (!body) {
      return;
    }
    if (await onRun(() => editComment(board.id, card.id, commentId, body))) {
      setEditingComment(null);
    }
  };

  const checklistPercent = card.checklistTotal
    ? Math.round((card.checklistDone / card.checklistTotal) * 100)
    : 0;

  return (
    <Dialog title={card.title} onClose={onClose}>
      <section className="space-y-3" data-testid="card-detail-fields">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--gray-text)]">
          {column ? column.title : "Unknown column"} · {board.name}
        </p>

        {editingFields ? (
          <form onSubmit={saveFields} className="space-y-3">
            <Field label="Title">
              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                className={dialogInputClass}
                aria-label="Card title"
                required
              />
            </Field>
            <Field label="Details">
              <textarea
                value={draft.details}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    details: event.target.value,
                  }))
                }
                rows={5}
                className={`${dialogInputClass} resize-y`}
                aria-label="Card details"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Priority">
                <select
                  value={draft.priority}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      priority: event.target.value as Priority,
                    }))
                  }
                  className={dialogInputClass}
                  aria-label="Card priority"
                >
                  {priorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {priorityLabels[priority]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Due date">
                <input
                  type="date"
                  value={draft.dueDate}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      dueDate: event.target.value,
                    }))
                  }
                  className={dialogInputClass}
                  aria-label="Card due date"
                />
              </Field>
              <Field label="Assignee">
                <select
                  value={draft.assigneeId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      assigneeId: event.target.value,
                    }))
                  }
                  className={dialogInputClass}
                  aria-label="Card assignee"
                >
                  <option value="">Unassigned</option>
                  {board.members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.displayName || member.username}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex gap-2">
              <button type="submit" className={primaryButtonClass}>
                Save card
              </button>
              <button
                type="button"
                onClick={() => setEditingFields(false)}
                className={subtleButtonClass}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            {card.details ? (
              <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--navy-dark)]">
                {card.details}
              </p>
            ) : (
              <p className="text-sm italic text-[var(--gray-text)]">
                No details yet.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span
                className="rounded-full px-2 py-0.5 uppercase tracking-[0.08em]"
                style={{
                  backgroundColor: priorityStyle.soft,
                  color: priorityStyle.color,
                }}
              >
                {priorityLabels[card.priority]}
              </span>
              <span className="text-[var(--gray-text)]">
                {card.dueDate ? `Due ${formatDueDate(card.dueDate)}` : "No due date"}
              </span>
              <span className="text-[var(--gray-text)]">
                {assignee
                  ? `Assigned to ${assignee.displayName || assignee.username}`
                  : "Unassigned"}
              </span>
            </div>
            {editable ? (
              <button
                type="button"
                onClick={startEditing}
                className={`${subtleButtonClass} inline-flex items-center gap-2`}
              >
                <PencilIcon width={14} height={14} />
                Edit card
              </button>
            ) : null}
          </div>
        )}
      </section>

      <section className="space-y-2 border-t border-[var(--stroke)] pt-5">
        <h3 className={sectionHeading}>
          <TagIcon width={14} height={14} />
          Labels
        </h3>
        {board.labels.length === 0 ? (
          <p className="text-xs text-[var(--gray-text)]">
            This board has no labels yet. Add some from board settings.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {board.labels.map((label) => {
              const active = card.labelIds.includes(label.id);
              const accent = labelAccent[label.color];
              return (
                <button
                  key={label.id}
                  type="button"
                  disabled={!editable}
                  aria-pressed={active}
                  onClick={() => toggleLabel(label.id)}
                  className={clsx(
                    "rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:cursor-default",
                    active ? "text-white" : "hover:brightness-95"
                  )}
                  style={
                    active
                      ? { backgroundColor: accent.color }
                      : { backgroundColor: accent.soft, color: accent.color }
                  }
                >
                  {label.name}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2 border-t border-[var(--stroke)] pt-5">
        <h3 className={sectionHeading}>
          <ChecklistIcon width={14} height={14} />
          Checklist
          {card.checklistTotal > 0 ? (
            <span className="ml-auto text-xs font-semibold normal-case tracking-normal text-[var(--gray-text)]">
              {card.checklistDone} of {card.checklistTotal}
            </span>
          ) : null}
        </h3>
        {card.checklistTotal > 0 ? (
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]"
            role="progressbar"
            aria-label="Checklist progress"
            aria-valuenow={checklistPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span
              className="block h-full rounded-full bg-[var(--primary-blue)] transition-[width] duration-300"
              style={{ width: `${checklistPercent}%` }}
            />
          </div>
        ) : null}
        <ul className="space-y-1">
          {card.checklist.map((item, index) => (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded-xl px-1 py-1 hover:bg-[var(--surface)]"
            >
              <input
                type="checkbox"
                checked={item.done}
                disabled={!editable}
                onChange={(event) =>
                  void onRun(() =>
                    updateChecklistItem(board.id, card.id, item.id, {
                      done: event.target.checked,
                    })
                  )
                }
                aria-label={item.title}
                className="h-4 w-4 shrink-0 accent-[var(--primary-blue)]"
              />
              <span
                className={clsx(
                  "min-w-0 flex-1 text-sm",
                  item.done && "text-[var(--gray-text)] line-through"
                )}
              >
                {item.title}
              </span>
              {editable ? (
                <>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() =>
                      void onRun(() =>
                        moveChecklistItem(board.id, card.id, item.id, index - 1)
                      )
                    }
                    className="icon-button h-6 w-6 disabled:opacity-30"
                    aria-label={`Move ${item.title} up`}
                  >
                    <ChevronUpIcon width={13} height={13} />
                  </button>
                  <button
                    type="button"
                    disabled={index === card.checklist.length - 1}
                    onClick={() =>
                      void onRun(() =>
                        moveChecklistItem(board.id, card.id, item.id, index + 1)
                      )
                    }
                    className="icon-button h-6 w-6 disabled:opacity-30"
                    aria-label={`Move ${item.title} down`}
                  >
                    <ChevronDownIcon width={13} height={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void onRun(() =>
                        deleteChecklistItem(board.id, card.id, item.id)
                      )
                    }
                    className="icon-button icon-button-danger h-6 w-6"
                    aria-label={`Delete ${item.title}`}
                  >
                    <TrashIcon width={13} height={13} />
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
        {editable ? (
          <form onSubmit={submitChecklistItem} className="flex gap-2">
            <input
              value={newItem}
              onChange={(event) => setNewItem(event.target.value)}
              placeholder="Add a checklist item"
              aria-label="New checklist item"
              className={dialogInputClass}
            />
            <button
              type="submit"
              className={`${primaryButtonClass} inline-flex shrink-0 items-center gap-1`}
            >
              <PlusIcon width={14} height={14} />
              Add
            </button>
          </form>
        ) : null}
      </section>

      <section className="space-y-3 border-t border-[var(--stroke)] pt-5">
        <h3 className={sectionHeading}>
          <CommentIcon width={14} height={14} />
          Comments
        </h3>
        <ul className="space-y-2">
          {card.comments.map((comment) => (
            <li
              key={comment.id}
              className="rounded-xl border border-[var(--stroke)] px-3 py-2"
              data-testid={`comment-${comment.id}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--navy-dark)]">
                  {comment.authorName}
                </span>
                {comment.authorId === currentUserId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingComment(comment.id);
                      setCommentDraft(comment.body);
                    }}
                    className="icon-button ml-auto h-6 w-6"
                    aria-label="Edit comment"
                  >
                    <PencilIcon width={13} height={13} />
                  </button>
                ) : null}
                {comment.authorId === currentUserId || board.role === "owner" ? (
                  <button
                    type="button"
                    onClick={() =>
                      void onRun(() =>
                        deleteComment(board.id, card.id, comment.id)
                      )
                    }
                    className={clsx(
                      "icon-button icon-button-danger h-6 w-6",
                      comment.authorId !== currentUserId && "ml-auto"
                    )}
                    aria-label="Delete comment"
                  >
                    <TrashIcon width={13} height={13} />
                  </button>
                ) : null}
              </div>
              {editingComment === comment.id ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    rows={3}
                    aria-label="Edit comment body"
                    className={`${dialogInputClass} resize-y`}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void saveComment(comment.id)}
                      className={`${primaryButtonClass} inline-flex items-center gap-1`}
                    >
                      <CheckIcon width={13} height={13} />
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingComment(null)}
                      className={`${subtleButtonClass} inline-flex items-center gap-1`}
                    >
                      <CloseIcon width={13} height={13} />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--navy-dark)]">
                  {comment.body}
                </p>
              )}
            </li>
          ))}
        </ul>
        {card.comments.length === 0 ? (
          <p className="text-xs text-[var(--gray-text)]">No comments yet.</p>
        ) : null}
        <form onSubmit={submitComment} className="space-y-2">
          <textarea
            value={newComment}
            onChange={(event) => setNewComment(event.target.value)}
            rows={3}
            placeholder="Add a comment"
            aria-label="New comment"
            className={`${dialogInputClass} resize-y`}
          />
          <button type="submit" className={primaryButtonClass}>
            Comment
          </button>
        </form>
      </section>
    </Dialog>
  );
};
