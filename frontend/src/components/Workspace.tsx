"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AccountDialog } from "@/components/AccountDialog";
import { ActivityDialog } from "@/components/ActivityDialog";
import { BoardRail } from "@/components/BoardRail";
import { BoardSettingsDialog } from "@/components/BoardSettingsDialog";
import { CardDetailDialog } from "@/components/CardDetailDialog";
import { ChatSidebar } from "@/components/ChatSidebar";
import { KanbanBoard } from "@/components/KanbanBoard";
import { MyWorkView } from "@/components/MyWorkView";
import {
  BoardIcon,
  CloseIcon,
  HistoryIcon,
  SettingsIcon,
  SparkleIcon,
} from "@/components/icons";
import {
  ApiError,
  createBoard,
  getBoard,
  getBoards,
  getCard,
  getDirectory,
  getMyCards,
  type CardWorkspace,
  type DirectoryUser,
  type User,
} from "@/lib/api";
import {
  canEdit,
  initials,
  type AssignedCard,
  type BoardData,
  type BoardSummary,
  type CardDetail,
} from "@/lib/kanban";

const ACTIVE_BOARD_KEY = "pm.activeBoardId";

const readStoredBoardId = (): number | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = window.localStorage.getItem(ACTIVE_BOARD_KEY);
  const parsed = stored === null ? Number.NaN : Number.parseInt(stored, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const storeBoardId = (boardId: number | null) => {
  if (typeof window === "undefined") {
    return;
  }
  if (boardId === null) {
    window.localStorage.removeItem(ACTIVE_BOARD_KEY);
  } else {
    window.localStorage.setItem(ACTIVE_BOARD_KEY, String(boardId));
  }
};

type WorkspaceProps = {
  user: User;
  onUserChange: (user: User) => void;
  onLogout: () => void | Promise<void>;
};

export const Workspace = ({ user, onUserChange, onLogout }: WorkspaceProps) => {
  const [summaries, setSummaries] = useState<BoardSummary[]>([]);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openCard, setOpenCard] = useState<CardDetail | null>(null);
  const [showingMyWork, setShowingMyWork] = useState(false);
  const [myCards, setMyCards] = useState<AssignedCard[]>([]);
  const [loadingMyWork, setLoadingMyWork] = useState(false);

  const describe = (caught: unknown, fallback: string) =>
    caught instanceof ApiError && caught.detail ? caught.detail : fallback;

  const refreshSummaries = useCallback(
    async (includeArchived: boolean) => {
      const next = await getBoards(includeArchived);
      setSummaries(next);
      return next;
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getBoards(showArchived), getDirectory()])
      .then(([boards, people]) => {
        if (cancelled) {
          return;
        }
        setSummaries(boards);
        setDirectory(people);
        setActiveBoardId((current) => {
          if (current !== null && boards.some((item) => item.id === current)) {
            return current;
          }
          const stored = readStoredBoardId();
          const preferred = boards.find((item) => item.id === stored);
          return (preferred ?? boards[0])?.id ?? null;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setError("Unable to load your boards.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [showArchived]);

  useEffect(() => {
    if (activeBoardId === null) {
      setBoard(null);
      return;
    }
    let cancelled = false;
    storeBoardId(activeBoardId);
    getBoard(activeBoardId)
      .then((next) => {
        if (!cancelled) {
          setBoard(next);
          setError("");
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setBoard(null);
          setError(describe(caught, "Unable to load this board."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeBoardId]);

  /** Run a board mutation, adopt the returned board, and refresh the rail. */
  const run = useCallback(
    async (operation: () => Promise<BoardData>) => {
      setBusy(true);
      setError("");
      try {
        const next = await operation();
        setBoard(next);
        setActiveBoardId(next.id);
        setOpenCard((current) =>
          current && next.cards[current.id]
            ? { ...current, ...next.cards[current.id] }
            : null
        );
        await refreshSummaries(showArchived);
        return true;
      } catch (caught) {
        setError(
          describe(caught, "The board could not be updated. Please try again.")
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refreshSummaries, showArchived]
  );

  /** Run an operation that removes the current board or membership. */
  const runAndReload = useCallback(
    async (operation: () => Promise<unknown>) => {
      setBusy(true);
      setError("");
      try {
        await operation();
        const boards = await refreshSummaries(showArchived);
        setActiveBoardId(boards[0]?.id ?? null);
        return true;
      } catch (caught) {
        setError(describe(caught, "That change could not be applied."));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refreshSummaries, showArchived]
  );

  /** Runs a card detail mutation, which returns both the card and its board. */
  const runCard = useCallback(
    async (operation: () => Promise<CardWorkspace>) => {
      setBusy(true);
      setError("");
      try {
        const { card, board: nextBoard } = await operation();
        setOpenCard(card);
        setBoard(nextBoard);
        return true;
      } catch (caught) {
        setError(describe(caught, "That change could not be applied."));
        return false;
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const showCard = useCallback(async (boardId: number, cardId: string) => {
    try {
      setOpenCard(await getCard(boardId, cardId));
    } catch (caught) {
      setError(describe(caught, "That card could not be opened."));
    }
  }, []);

  const showMyWork = useCallback(async () => {
    setShowingMyWork(true);
    setLoadingMyWork(true);
    try {
      setMyCards(await getMyCards());
      setError("");
    } catch (caught) {
      setError(describe(caught, "Unable to load your assigned cards."));
    } finally {
      setLoadingMyWork(false);
    }
  }, []);

  /** Jump from the assignment list to the card on its own board. */
  const openAssignedCard = useCallback(
    (boardId: number, cardId: string) => {
      setShowingMyWork(false);
      setActiveBoardId(boardId);
      void showCard(boardId, cardId);
    },
    [showCard]
  );

  const membersById = useMemo(() => {
    const entries = new Map<number, string>();
    board?.members.forEach((member) =>
      entries.set(member.userId, member.displayName || member.username)
    );
    return entries;
  }, [board?.members]);

  const editable = board ? canEdit(board.role) && !board.archived : false;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--surface)]">
      <BoardRail
        boards={summaries}
        activeBoardId={activeBoardId}
        showArchived={showArchived}
        showingMyWork={showingMyWork}
        onShowMyWork={() => void showMyWork()}
        onSelect={(boardId) => {
          setShowingMyWork(false);
          setActiveBoardId(boardId);
        }}
        onToggleArchived={() => setShowArchived((current) => !current)}
        onCreate={(name) => run(() => createBoard(name))}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-20 flex h-16 shrink-0 items-center gap-3 border-b border-[var(--stroke)] bg-white/85 px-5 backdrop-blur">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--navy-dark)] text-white"
          >
            <BoardIcon width={18} height={18} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg font-semibold leading-none text-[var(--navy-dark)]">
              {showingMyWork ? "My work" : board?.name ?? "Kanban Studio"}
            </h1>
            <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
              {showingMyWork
                ? `${myCards.length} assigned to you`
                : board
                  ? `${board.role}${board.archived ? " · archived" : ""} · ${
                      board.members.length
                    } member${board.members.length === 1 ? "" : "s"}`
                  : "No board selected"}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {board && !showingMyWork ? (
              <>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  className="icon-button"
                  aria-label="Board history"
                  title="Board history"
                >
                  <HistoryIcon width={16} height={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="icon-button"
                  aria-label="Board settings"
                  title="Board settings"
                >
                  <SettingsIcon width={16} height={16} />
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => setAccountOpen(true)}
              className="flex items-center gap-2 rounded-full border border-[var(--stroke)] py-1 pl-1 pr-3 transition hover:border-[var(--stroke-strong)]"
              aria-label="Account and settings"
            >
              <span
                aria-hidden
                className="grid h-7 w-7 place-items-center rounded-full bg-[var(--secondary-purple)] text-[11px] font-bold uppercase text-white"
              >
                {initials(user.displayName || user.username)}
              </span>
              <span className="hidden text-xs font-semibold text-[var(--navy-dark)] sm:inline">
                {user.displayName || user.username}
              </span>
            </button>
          </div>
        </header>

        {error ? (
          <div className="shrink-0 px-5 pt-3">
            <p
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700"
            >
              <span className="flex-1">{error}</span>
              <button
                type="button"
                onClick={() => setError("")}
                className="icon-button h-6 w-6 text-red-700 hover:bg-red-100 hover:text-red-800"
                aria-label="Dismiss error"
              >
                <CloseIcon width={13} height={13} />
              </button>
            </p>
          </div>
        ) : null}

        {showingMyWork ? (
          <MyWorkView
            cards={myCards}
            loading={loadingMyWork}
            onOpen={openAssignedCard}
          />
        ) : loading ? (
          <p className="grid flex-1 place-items-center text-sm font-semibold text-[var(--gray-text)]">
            Loading board...
          </p>
        ) : board ? (
          <KanbanBoard
            board={board}
            editable={editable}
            memberNames={membersById}
            members={board.members}
            onRun={run}
            onOpenCard={(cardId) => void showCard(board.id, cardId)}
          />
        ) : (
          <div className="grid flex-1 place-items-center px-6 text-center">
            <div>
              <p className="font-display text-lg font-semibold text-[var(--navy-dark)]">
                No board open
              </p>
              <p className="mt-2 text-sm text-[var(--gray-text)]">
                Create a board from the list on the left to get started.
              </p>
            </div>
          </div>
        )}

        {busy ? (
          <p className="pointer-events-none fixed bottom-5 left-5 z-20 flex items-center gap-2 rounded-full bg-[var(--navy-dark)] px-4 py-2 text-xs font-semibold text-white shadow-[var(--shadow)]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent-yellow)]" />
            Saving...
          </p>
        ) : null}
      </div>

      {board && !showingMyWork ? (
        <ChatSidebar boardId={board.id} onBoardUpdate={setBoard} />
      ) : (
        <div
          aria-hidden
          className="hidden lg:flex lg:w-14 lg:shrink-0 lg:justify-center lg:border-l lg:border-[var(--stroke)] lg:bg-white/60 lg:pt-4"
        >
          <span className="icon-button opacity-30">
            <SparkleIcon width={16} height={16} />
          </span>
        </div>
      )}

      {settingsOpen && board ? (
        <BoardSettingsDialog
          board={board}
          directory={directory}
          currentUserId={user.id}
          onClose={() => setSettingsOpen(false)}
          onRun={run}
          onRunAndReload={async (operation) => {
            const ok = await runAndReload(operation);
            if (ok) {
              setSettingsOpen(false);
            }
            return ok;
          }}
        />
      ) : null}

      {openCard && board ? (
        <CardDetailDialog
          card={openCard}
          board={board}
          currentUserId={user.id}
          editable={editable}
          onClose={() => setOpenCard(null)}
          onRun={runCard}
          onRunBoard={run}
        />
      ) : null}

      {historyOpen && board ? (
        <ActivityDialog
          boardId={board.id}
          boardName={board.name}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}

      {accountOpen ? (
        <AccountDialog
          user={user}
          onUserChange={onUserChange}
          onClose={() => setAccountOpen(false)}
          onLogout={onLogout}
        />
      ) : null}
    </div>
  );
};
