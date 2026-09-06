import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import {
  ApiError,
  createCard,
  deleteCard,
  editCard,
  getBoard,
  renameColumn,
} from "@/lib/api";
import { initialData } from "@/lib/kanban";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    createCard: vi.fn(),
    deleteCard: vi.fn(),
    editCard: vi.fn(),
    getBoard: vi.fn(),
    moveBoardCard: vi.fn(),
    renameColumn: vi.fn(),
    sendChat: vi.fn(),
  };
});

const mockedCreateCard = vi.mocked(createCard);
const mockedDeleteCard = vi.mocked(deleteCard);
const mockedEditCard = vi.mocked(editCard);
const mockedGetBoard = vi.mocked(getBoard);
const mockedRenameColumn = vi.mocked(renameColumn);

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetBoard.mockResolvedValue(structuredClone(initialData));
});

describe("KanbanBoard", () => {
  it("renders five columns", async () => {
    render(<KanbanBoard />);
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("summarizes progress in the header", async () => {
    render(<KanbanBoard />);

    expect(await screen.findByText("2 of 8 done")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Cards done" })).toHaveAttribute(
      "aria-valuenow",
      "25"
    );
  });

  it("shows the signed-in user and signs out from the header", async () => {
    const onLogout = vi.fn();
    render(<KanbanBoard user={{ username: "user" }} onLogout={onLogout} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Sign out" })
    );

    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("renames a column", async () => {
    mockedRenameColumn.mockResolvedValue({
      ...structuredClone(initialData),
      columns: initialData.columns.map((column) =>
        column.id === "col-backlog" ? { ...column, title: "New Name" } : column
      ),
    });
    render(<KanbanBoard />);
    const column = (await screen.findAllByTestId(/column-/i))[0];
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    await userEvent.tab();

    expect(mockedRenameColumn).toHaveBeenCalledWith("col-backlog", "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("reverts the column title when renaming fails", async () => {
    mockedRenameColumn.mockRejectedValue(new Error("network error"));
    render(<KanbanBoard />);
    const column = (await screen.findAllByTestId(/column-/i))[0];
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    await userEvent.tab();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(input).toHaveValue(initialData.columns[0].title);
  });

  it("shows the server's validation detail when a rename is rejected", async () => {
    mockedRenameColumn.mockRejectedValue(
      new ApiError(422, "title must not be blank")
    );
    render(<KanbanBoard />);
    const column = (await screen.findAllByTestId(/column-/i))[0];
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    await userEvent.tab();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "title must not be blank"
    );
  });

  it("adds and removes a card", async () => {
    const boardWithCard = structuredClone(initialData);
    boardWithCard.cards["card-new"] = {
      id: "card-new",
      title: "New card",
      details: "Notes",
    };
    boardWithCard.columns[0].cardIds.push("card-new");
    mockedCreateCard.mockResolvedValue(boardWithCard);
    mockedDeleteCard.mockResolvedValue(structuredClone(initialData));
    render(<KanbanBoard />);
    const column = (await screen.findAllByTestId(/column-/i))[0];
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(await within(column).findByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(await within(column).findByText("Align roadmap themes")).toBeInTheDocument();
    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("edits a card", async () => {
    const editedBoard = structuredClone(initialData);
    editedBoard.cards["card-1"].title = "Edited title";
    mockedEditCard.mockResolvedValue(editedBoard);
    render(<KanbanBoard />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Edit Align roadmap themes" })
    );
    const title = screen.getByLabelText("Card title");
    await userEvent.clear(title);
    await userEvent.type(title, "Edited title");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(mockedEditCard).toHaveBeenCalledWith(
      "card-1",
      "Edited title",
      "Draft quarterly themes with impact statements and metrics."
    );
    expect(await screen.findByText("Edited title")).toBeInTheDocument();
  });

  it("keeps the edit form open when saving a card fails", async () => {
    mockedEditCard.mockRejectedValue(new Error("network error"));
    render(<KanbanBoard />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Edit Align roadmap themes" })
    );
    const title = screen.getByLabelText("Card title");
    await userEvent.clear(title);
    await userEvent.type(title, "Edited title");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("Card title")).toHaveValue("Edited title");
  });
});
