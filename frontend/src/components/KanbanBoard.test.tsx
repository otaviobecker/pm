import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import {
  createCard,
  deleteCard,
  editCard,
  getBoard,
  renameColumn,
} from "@/lib/api";
import { initialData } from "@/lib/kanban";

vi.mock("@/lib/api", () => ({
  createCard: vi.fn(),
  deleteCard: vi.fn(),
  editCard: vi.fn(),
  getBoard: vi.fn(),
  moveBoardCard: vi.fn(),
  renameColumn: vi.fn(),
  sendChat: vi.fn(),
}));

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
});
