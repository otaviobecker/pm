"use client";

import { useState, type FormEvent } from "react";
import {
  Dialog,
  Field,
  dangerButtonClass,
  dialogInputClass,
  primaryButtonClass,
  subtleButtonClass,
} from "@/components/Dialog";
import { TrashIcon } from "@/components/icons";
import {
  addBoardMember,
  deleteBoard,
  getBoard,
  removeBoardMember,
  updateBoard,
  updateBoardMember,
  type DirectoryUser,
} from "@/lib/api";
import { canEdit, isOwner, type BoardData, type BoardRole } from "@/lib/kanban";

type BoardSettingsDialogProps = {
  board: BoardData;
  directory: DirectoryUser[];
  currentUserId: number;
  onClose: () => void;
  onRun: (operation: () => Promise<BoardData>) => Promise<boolean>;
  onRunAndReload: (operation: () => Promise<unknown>) => Promise<boolean>;
};

export const BoardSettingsDialog = ({
  board,
  directory,
  currentUserId,
  onClose,
  onRun,
  onRunAndReload,
}: BoardSettingsDialogProps) => {
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description);
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<BoardRole, "owner">>(
    "editor"
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const owner = isOwner(board.role);
  const editable = canEdit(board.role);
  const memberIds = new Set(board.members.map((member) => member.userId));
  const invitable = directory.filter((person) => !memberIds.has(person.id));

  const saveDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onRun(() =>
      updateBoard(board.id, { name: name.trim(), description: description.trim() })
    );
  };

  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const username = inviteName.trim();
    if (!username) {
      return;
    }
    if (await onRun(() => addBoardMember(board.id, username, inviteRole))) {
      setInviteName("");
    }
  };

  return (
    <Dialog title="Board settings" onClose={onClose}>
      <form onSubmit={saveDetails} className="space-y-3">
        <Field label="Board name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={dialogInputClass}
            aria-label="Board name"
            disabled={!editable}
            required
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            className={`${dialogInputClass} resize-none`}
            aria-label="Board description"
            disabled={!editable}
          />
        </Field>
        {editable ? (
          <button type="submit" className={primaryButtonClass}>
            Save board
          </button>
        ) : (
          <p className="text-xs text-[var(--gray-text)]">
            You have view-only access to this board.
          </p>
        )}
      </form>

      <section className="space-y-3 border-t border-[var(--stroke)] pt-5">
        <h3 className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-[var(--navy-dark)]">
          Members
        </h3>
        <ul className="space-y-2">
          {board.members.map((member) => (
            <li
              key={member.userId}
              className="flex items-center gap-2 rounded-xl border border-[var(--stroke)] px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--navy-dark)]">
                  {member.displayName || member.username}
                </p>
                <p className="truncate text-xs text-[var(--gray-text)]">
                  @{member.username}
                </p>
              </div>
              {member.role === "owner" || !owner ? (
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--gray-text)]">
                  {member.role}
                </span>
              ) : (
                <select
                  value={member.role}
                  onChange={(event) =>
                    void onRun(() =>
                      updateBoardMember(
                        board.id,
                        member.userId,
                        event.target.value as Exclude<BoardRole, "owner">
                      )
                    )
                  }
                  aria-label={`Role for ${member.username}`}
                  className="rounded-lg border border-[var(--stroke)] px-2 py-1 text-xs font-semibold"
                >
                  <option value="editor">editor</option>
                  <option value="viewer">viewer</option>
                </select>
              )}
              {owner && member.role !== "owner" ? (
                <button
                  type="button"
                  onClick={() =>
                    void onRun(async () => {
                      await removeBoardMember(board.id, member.userId);
                      return getBoard(board.id);
                    })
                  }
                  className="icon-button icon-button-danger h-7 w-7"
                  aria-label={`Remove ${member.username}`}
                >
                  <TrashIcon width={14} height={14} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {owner ? (
          <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1">
              <Field label="Invite by username">
                <input
                  value={inviteName}
                  onChange={(event) => setInviteName(event.target.value)}
                  list="board-invite-options"
                  className={dialogInputClass}
                  aria-label="Invite by username"
                  placeholder="username"
                />
              </Field>
              <datalist id="board-invite-options">
                {invitable.map((person) => (
                  <option key={person.id} value={person.username}>
                    {person.displayName}
                  </option>
                ))}
              </datalist>
            </div>
            <select
              value={inviteRole}
              onChange={(event) =>
                setInviteRole(event.target.value as Exclude<BoardRole, "owner">)
              }
              aria-label="Invite role"
              className="rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm font-semibold"
            >
              <option value="editor">editor</option>
              <option value="viewer">viewer</option>
            </select>
            <button type="submit" className={primaryButtonClass}>
              Invite
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() =>
              void onRunAndReload(() =>
                removeBoardMember(board.id, currentUserId)
              )
            }
            className={subtleButtonClass}
          >
            Leave this board
          </button>
        )}
      </section>

      {owner ? (
        <section className="space-y-3 border-t border-[var(--stroke)] pt-5">
          <h3 className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-[var(--navy-dark)]">
            Danger zone
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                void onRun(() =>
                  updateBoard(board.id, { archived: !board.archived })
                )
              }
              className={subtleButtonClass}
            >
              {board.archived ? "Restore board" : "Archive board"}
            </button>
            {confirmingDelete ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    void onRunAndReload(() => deleteBoard(board.id))
                  }
                  className={dangerButtonClass}
                >
                  Delete permanently
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className={subtleButtonClass}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className={dangerButtonClass}
              >
                Delete board
              </button>
            )}
          </div>
          <p className="text-xs leading-5 text-[var(--gray-text)]">
            Deleting a board removes its columns and cards for every member.
          </p>
        </section>
      ) : null}
    </Dialog>
  );
};
