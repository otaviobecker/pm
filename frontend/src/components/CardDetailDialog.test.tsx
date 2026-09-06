import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardDetailDialog } from "@/components/CardDetailDialog";
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
import type { BoardData, CardDetail } from "@/lib/kanban";
import { makeBoard, makeCardDetail, makeMember } from "@/test/fixtures";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    addChecklistItem: vi.fn(),
    addComment: vi.fn(),
    deleteChecklistItem: vi.fn(),
    deleteComment: vi.fn(),
    editCard: vi.fn(),
    editComment: vi.fn(),
    moveChecklistItem: vi.fn(),
    setCardLabels: vi.fn(),
    updateChecklistItem: vi.fn(),
  };
});

const onRun = vi.fn(async (operation: () => Promise<CardWorkspace>) => {
  await operation();
  return true;
});
const onRunBoard = vi.fn(async (operation: () => Promise<BoardData>) => {
  await operation();
  return true;
});

const renderDialog = ({
  card = {},
  board = {},
  editable = true,
  currentUserId = 1,
}: {
  card?: Partial<CardDetail>;
  board?: Partial<BoardData>;
  editable?: boolean;
  currentUserId?: number;
} = {}) => {
  const onClose = vi.fn();
  render(
    <CardDetailDialog
      card={makeCardDetail(card)}
      board={makeBoard(board)}
      currentUserId={currentUserId}
      editable={editable}
      onClose={onClose}
      onRun={onRun}
      onRunBoard={onRunBoard}
    />
  );
  return { onClose };
};

const comment = (overrides = {}) => ({
  id: 5,
  body: "Looks good",
  authorId: 1,
  authorName: "Workspace Admin",
  createdAt: "2026-01-01T00:00:00+00:00",
  updatedAt: "2026-01-01T00:00:00+00:00",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CardDetailDialog", () => {
  it("shows where the card lives", () => {
    renderDialog();

    expect(screen.getByText(/Backlog · Kanban Studio/)).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Align roadmap themes" })
    ).toBeInTheDocument();
  });

  it("says when a card has no details", () => {
    renderDialog({ card: { details: "" } });

    expect(screen.getByText("No details yet.")).toBeInTheDocument();
  });

  it("edits the card's own fields", async () => {
    renderDialog();

    await userEvent.click(screen.getByRole("button", { name: /edit card/i }));
    const title = screen.getByLabelText("Card title");
    await userEvent.clear(title);
    await userEvent.type(title, "Align the themes");
    await userEvent.selectOptions(screen.getByLabelText("Card priority"), "urgent");
    await userEvent.click(screen.getByRole("button", { name: /save card/i }));

    expect(editCard).toHaveBeenCalledWith(
      1,
      "card-1",
      expect.objectContaining({ title: "Align the themes", priority: "urgent" })
    );
  });

  it("abandons a field edit on cancel", async () => {
    renderDialog();

    await userEvent.click(screen.getByRole("button", { name: /edit card/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByLabelText("Card title")).toBeNull();
    expect(editCard).not.toHaveBeenCalled();
  });

  it("summarizes priority, due date, and assignee", () => {
    renderDialog({
      card: { priority: "high", dueDate: "2026-06-15", assigneeId: 1 },
    });

    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText(/^Due /)).toBeInTheDocument();
    expect(screen.getByText("Assigned to Workspace Admin")).toBeInTheDocument();
  });

  it("adds and removes a label", async () => {
    renderDialog({ card: { labelIds: ["label-bug"] } });

    const feature = screen.getByRole("button", { name: "Feature" });
    expect(feature).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Bug" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await userEvent.click(feature);
    expect(setCardLabels).toHaveBeenCalledWith(1, "card-1", [
      "label-bug",
      "label-feature",
    ]);

    await userEvent.click(screen.getByRole("button", { name: "Bug" }));
    expect(setCardLabels).toHaveBeenLastCalledWith(1, "card-1", []);
  });

  it("explains a board with no labels", () => {
    renderDialog({ board: { labels: [] } });

    expect(screen.getByText(/no labels yet/i)).toBeInTheDocument();
  });

  it("adds a checklist item", async () => {
    renderDialog();

    await userEvent.type(
      screen.getByLabelText("New checklist item"),
      "  Write the spec  "
    );
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(addChecklistItem).toHaveBeenCalledWith(1, "card-1", "Write the spec");
  });

  it("ticks a checklist item and shows progress", async () => {
    renderDialog({
      card: {
        checklistTotal: 2,
        checklistDone: 1,
        checklist: [
          { id: 1, title: "Draft", done: true },
          { id: 2, title: "Review", done: false },
        ],
      },
    });

    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Checklist progress" })
    ).toHaveAttribute("aria-valuenow", "50");

    await userEvent.click(screen.getByLabelText("Review"));

    expect(updateChecklistItem).toHaveBeenCalledWith(1, "card-1", 2, {
      done: true,
    });
  });

  it("reorders and deletes checklist items", async () => {
    renderDialog({
      card: {
        checklistTotal: 2,
        checklist: [
          { id: 1, title: "Draft", done: false },
          { id: 2, title: "Review", done: false },
        ],
      },
    });

    expect(screen.getByRole("button", { name: "Move Draft up" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Move Draft down" }));
    expect(moveChecklistItem).toHaveBeenCalledWith(1, "card-1", 1, 1);

    await userEvent.click(screen.getByRole("button", { name: "Move Review up" }));
    expect(moveChecklistItem).toHaveBeenLastCalledWith(1, "card-1", 2, 0);

    await userEvent.click(screen.getByRole("button", { name: "Delete Draft" }));
    expect(deleteChecklistItem).toHaveBeenCalledWith(1, "card-1", 1);
  });

  it("adds a comment", async () => {
    renderDialog();

    expect(screen.getByText("No comments yet.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("New comment"), "  Ship it  ");
    await userEvent.click(screen.getByRole("button", { name: /^comment$/i }));

    expect(addComment).toHaveBeenCalledWith(1, "card-1", "Ship it");
  });

  it("edits its own comment", async () => {
    renderDialog({ card: { comments: [comment()] } });

    await userEvent.click(screen.getByRole("button", { name: "Edit comment" }));
    const body = screen.getByLabelText("Edit comment body");
    await userEvent.clear(body);
    await userEvent.type(body, "Changed my mind");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(editComment).toHaveBeenCalledWith(1, "card-1", 5, "Changed my mind");
  });

  it("cannot edit someone else's comment but an owner can delete it", () => {
    renderDialog({
      card: { comments: [comment({ authorId: 2, authorName: "Casey" })] },
    });

    const thread = screen.getByTestId("comment-5");
    expect(within(thread).queryByRole("button", { name: "Edit comment" })).toBeNull();
    expect(
      within(thread).getByRole("button", { name: "Delete comment" })
    ).toBeInTheDocument();
  });

  it("hides delete from a member who owns neither the comment nor the board", () => {
    renderDialog({
      board: { role: "editor", members: [makeMember({ role: "editor" })] },
      card: { comments: [comment({ authorId: 2, authorName: "Casey" })] },
    });

    expect(screen.queryByRole("button", { name: "Delete comment" })).toBeNull();
  });

  it("deletes a comment", async () => {
    renderDialog({ card: { comments: [comment()] } });

    await userEvent.click(screen.getByRole("button", { name: "Delete comment" }));

    expect(deleteComment).toHaveBeenCalledWith(1, "card-1", 5);
  });

  it("lets viewers comment but not edit the card, labels, or checklist", () => {
    renderDialog({
      editable: false,
      card: {
        checklistTotal: 1,
        checklist: [{ id: 1, title: "Draft", done: false }],
      },
    });

    expect(screen.queryByRole("button", { name: /edit card/i })).toBeNull();
    expect(screen.queryByLabelText("New checklist item")).toBeNull();
    expect(screen.getByRole("button", { name: "Feature" })).toBeDisabled();
    expect(screen.getByLabelText("Draft")).toBeDisabled();
    // Commenting stays open to every member.
    expect(screen.getByLabelText("New comment")).toBeInTheDocument();
  });

  it("closes from the dialog header", async () => {
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
