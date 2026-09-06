import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import {
  createCard,
  createColumn,
  deleteCard,
  deleteColumn,
  editCard,
  moveColumn,
  updateColumn,
} from "@/lib/api";
import type { BoardData } from "@/lib/kanban";
import { makeBoard, makeMember } from "@/test/fixtures";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    createCard: vi.fn(),
    createColumn: vi.fn(),
    deleteCard: vi.fn(),
    deleteColumn: vi.fn(),
    editCard: vi.fn(),
    moveBoardCard: vi.fn(),
    moveColumn: vi.fn(),
    updateColumn: vi.fn(),
  };
});

const onRun = vi.fn(async (operation: () => Promise<BoardData>) => {
  await operation();
  return true;
});

const onOpenCard = vi.fn();

const renderBoard = (overrides: Partial<BoardData> = {}) => {
  const board = makeBoard(overrides);
  const memberNames = new Map(
    board.members.map((member) => [member.userId, member.displayName])
  );
  render(
    <KanbanBoard
      board={board}
      editable={board.role !== "viewer" && !board.archived}
      members={board.members}
      memberNames={memberNames}
      onRun={onRun}
      onOpenCard={onOpenCard}
    />
  );
  return board;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("KanbanBoard", () => {
  it("renders every column", () => {
    renderBoard();

    expect(screen.getAllByTestId(/^column-/)).toHaveLength(5);
  });

  it("summarizes progress", () => {
    renderBoard();

    expect(screen.getByText("2 of 8 done")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Cards done" })
    ).toHaveAttribute("aria-valuenow", "25");
  });

  it("renames a column on blur", async () => {
    renderBoard();
    const backlog = screen.getByTestId("column-col-backlog");

    const title = within(backlog).getByLabelText("Column title");
    await userEvent.clear(title);
    await userEvent.type(title, "Ideas");
    await userEvent.tab();

    expect(updateColumn).toHaveBeenCalledWith(1, "col-backlog", {
      title: "Ideas",
    });
  });

  it("adds a card with its priority and due date", async () => {
    renderBoard();
    const backlog = screen.getByTestId("column-col-backlog");

    await userEvent.click(within(backlog).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(backlog).getByLabelText("New card title"), "Write specs");
    await userEvent.selectOptions(
      within(backlog).getByLabelText("New card priority"),
      "high"
    );
    await userEvent.click(within(backlog).getByRole("button", { name: /add card/i }));

    expect(createCard).toHaveBeenCalledWith(1, "col-backlog", {
      title: "Write specs",
      details: "",
      priority: "high",
      dueDate: null,
      assigneeId: null,
    });
  });

  it("edits a card", async () => {
    renderBoard();

    await userEvent.click(
      screen.getByRole("button", { name: "Edit Align roadmap themes" })
    );
    const title = screen.getByLabelText("Card title");
    await userEvent.clear(title);
    await userEvent.type(title, "Align themes");
    await userEvent.selectOptions(screen.getByLabelText("Card priority"), "urgent");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(editCard).toHaveBeenCalledWith(
      1,
      "card-1",
      expect.objectContaining({ title: "Align themes", priority: "urgent" })
    );
  });

  it("deletes a card", async () => {
    renderBoard();

    await userEvent.click(
      screen.getByRole("button", { name: "Delete Align roadmap themes" })
    );

    expect(deleteCard).toHaveBeenCalledWith(1, "card-1");
  });

  it("shows priority and due-date chips", () => {
    const board = makeBoard();
    board.cards["card-1"].priority = "urgent";
    board.cards["card-1"].dueDate = "2026-06-15";
    renderBoard(board);

    const card = screen.getByTestId("card-card-1");
    expect(within(card).getByLabelText("Priority Urgent")).toBeInTheDocument();
    expect(within(card).getByLabelText(/^Due 2026-06-15/)).toBeInTheDocument();
  });

  it("shows the assignee initials", () => {
    const board = makeBoard();
    board.members = [makeMember({ userId: 7, displayName: "Casey Jones" })];
    board.cards["card-1"].assigneeId = 7;
    renderBoard(board);

    expect(screen.getByLabelText("Assigned to Casey Jones")).toHaveTextContent(
      "CJ"
    );
  });

  it("shows a WIP limit on the column badge", () => {
    const board = makeBoard();
    board.columns[0].wipLimit = 2;
    renderBoard(board);

    expect(
      screen.getByLabelText("2 of 2 cards, work-in-progress limit")
    ).toHaveTextContent("2/2");
  });

  it("filters cards by search text", async () => {
    renderBoard();

    await userEvent.type(screen.getByLabelText("Search cards"), "roadmap");

    expect(screen.getByTestId("card-card-1")).toBeInTheDocument();
    expect(screen.queryByTestId("card-card-2")).not.toBeInTheDocument();
    expect(screen.getByText("1 match")).toBeInTheDocument();
  });

  it("filters cards by priority", async () => {
    const board = makeBoard();
    board.cards["card-2"].priority = "urgent";
    renderBoard(board);

    await userEvent.selectOptions(
      screen.getByLabelText("Filter by priority"),
      "urgent"
    );

    expect(screen.queryByTestId("card-card-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("card-card-2")).toBeInTheDocument();
  });

  it("clears the filters", async () => {
    renderBoard();
    await userEvent.type(screen.getByLabelText("Search cards"), "roadmap");

    await userEvent.click(screen.getByRole("button", { name: /clear filters/i }));

    expect(screen.getByTestId("card-card-2")).toBeInTheDocument();
  });

  it("adds a column", async () => {
    renderBoard();

    await userEvent.click(screen.getByRole("button", { name: /add a column/i }));
    await userEvent.type(screen.getByLabelText("New column title"), "Blocked");
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(createColumn).toHaveBeenCalledWith(1, "Blocked");
  });

  it("moves a column from its options menu", async () => {
    renderBoard();

    await userEvent.click(
      screen.getByRole("button", { name: /column options for backlog/i })
    );
    await userEvent.click(screen.getByRole("button", { name: /move backlog right/i }));

    expect(moveColumn).toHaveBeenCalledWith(1, "col-backlog", 1);
  });

  it("deletes a column and re-homes its cards", async () => {
    renderBoard();

    await userEvent.click(
      screen.getByRole("button", { name: /column options for backlog/i })
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Move cards from Backlog to"),
      "col-review"
    );
    await userEvent.click(screen.getByRole("button", { name: /delete backlog/i }));

    expect(deleteColumn).toHaveBeenCalledWith(1, "col-backlog", "col-review");
  });

  it("sets a WIP limit from the column options", async () => {
    renderBoard();

    await userEvent.click(
      screen.getByRole("button", { name: /column options for backlog/i })
    );
    await userEvent.type(
      screen.getByLabelText("Work-in-progress limit for Backlog"),
      "4"
    );
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(updateColumn).toHaveBeenCalledWith(1, "col-backlog", { wipLimit: 4 });
  });

  it("hides editing affordances from viewers", () => {
    renderBoard({ role: "viewer" });

    expect(screen.queryByRole("button", { name: /add a card/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /add a column/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Edit Align roadmap themes" })
    ).toBeNull();
    expect(screen.getAllByLabelText("Column title")).toHaveLength(5);
  });

  it("treats an archived board as read-only", () => {
    renderBoard({ archived: true });

    expect(screen.queryByRole("button", { name: /add a card/i })).toBeNull();
  });

  it("shows a card's labels", () => {
    const board = makeBoard();
    board.cards["card-1"].labelIds = ["label-bug"];
    renderBoard(board);

    const card = screen.getByTestId("card-card-1");
    expect(within(card).getByLabelText("Label Bug")).toHaveTextContent("Bug");
    expect(within(card).queryByLabelText("Label Feature")).toBeNull();
  });

  it("shows checklist progress and comment counts", () => {
    const board = makeBoard();
    Object.assign(board.cards["card-1"], {
      checklistTotal: 3,
      checklistDone: 1,
      commentCount: 2,
    });
    renderBoard(board);

    const card = screen.getByTestId("card-card-1");
    expect(
      within(card).getByLabelText("Checklist 1 of 3 done")
    ).toHaveTextContent("1/3");
    expect(within(card).getByLabelText("2 comments")).toHaveTextContent("2");
  });

  it("leaves the rollup chips off a card that has none", () => {
    renderBoard();

    const card = screen.getByTestId("card-card-1");
    expect(within(card).queryByLabelText(/^Checklist/)).toBeNull();
    expect(within(card).queryByLabelText(/comment/)).toBeNull();
  });

  it("opens a card from its title and from the expand action", async () => {
    renderBoard();

    await userEvent.click(
      screen.getByRole("button", { name: "Open Align roadmap themes" })
    );
    expect(onOpenCard).toHaveBeenCalledWith("card-1");

    await userEvent.click(
      screen.getByRole("button", { name: "Open details for Gather customer signals" })
    );
    expect(onOpenCard).toHaveBeenLastCalledWith("card-2");
  });

  it("lets viewers open a card even though they cannot edit it", async () => {
    renderBoard({ role: "viewer" });

    await userEvent.click(
      screen.getByRole("button", { name: "Open details for Align roadmap themes" })
    );

    expect(onOpenCard).toHaveBeenCalledWith("card-1");
  });

  it("filters cards by label", async () => {
    const board = makeBoard();
    board.cards["card-2"].labelIds = ["label-bug"];
    renderBoard(board);

    await userEvent.selectOptions(
      screen.getByLabelText("Filter by label"),
      "label-bug"
    );

    expect(screen.queryByTestId("card-card-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("card-card-2")).toBeInTheDocument();
  });

  it("hides the label filter when the board has no labels", () => {
    renderBoard({ labels: [] });

    expect(screen.queryByLabelText("Filter by label")).toBeNull();
  });
});
