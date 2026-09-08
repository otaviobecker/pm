import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MyWorkView } from "@/components/MyWorkView";
import type { AssignedCard } from "@/lib/kanban";
import { makeCard } from "@/test/fixtures";

const assigned = (
  id: string,
  title: string,
  overrides: Partial<AssignedCard> = {}
): AssignedCard => ({
  ...makeCard(id, title),
  boardId: 1,
  boardName: "Kanban Studio",
  columnTitle: "Backlog",
  ...overrides,
});

const renderView = (cards: AssignedCard[], loading = false) => {
  const onOpen = vi.fn();
  render(<MyWorkView cards={cards} loading={loading} onOpen={onOpen} />);
  return { onOpen };
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 5, 15));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MyWorkView", () => {
  it("shows a loading state", () => {
    renderView([], true);

    expect(screen.getByText(/loading your work/i)).toBeInTheDocument();
  });

  it("explains an empty inbox", () => {
    renderView([]);

    expect(screen.getByText(/nothing assigned to you/i)).toBeInTheDocument();
  });

  it("groups cards by how soon they are due", () => {
    renderView([
      assigned("card-1", "Overdue thing", { dueDate: "2026-06-14" }),
      assigned("card-2", "Today thing", { dueDate: "2026-06-15" }),
      assigned("card-3", "Soon thing", { dueDate: "2026-06-17" }),
      assigned("card-4", "Later thing", { dueDate: "2026-07-30" }),
      assigned("card-5", "Undated thing"),
    ]);

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      "Overdue 1",
      "Due today 1",
      "Due soon 1",
      "Later 1",
      "No due date 1",
    ]);
  });

  it("leaves out groups with nothing in them", () => {
    renderView([assigned("card-1", "Undated thing")]);

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)
    ).toEqual(["No due date 1"]);
  });

  it("names the board and column each card sits on", () => {
    renderView([
      assigned("card-1", "Cross-board thing", {
        boardId: 7,
        boardName: "Roadmap",
        columnTitle: "In Progress",
      }),
    ]);

    const card = screen.getByTestId("assigned-card-1");
    expect(within(card).getByText("Roadmap · In Progress")).toBeInTheDocument();
  });

  it("shows priority and due-date chips", () => {
    renderView([
      assigned("card-1", "Urgent thing", {
        priority: "urgent",
        dueDate: "2026-06-14",
      }),
    ]);

    const card = screen.getByTestId("assigned-card-1");
    expect(within(card).getByLabelText("Priority Urgent")).toBeInTheDocument();
    expect(within(card).getByLabelText("Due 2026-06-14")).toBeInTheDocument();
  });

  it("opens a card on its own board", async () => {
    const { onOpen } = renderView([
      assigned("card-9", "Cross-board thing", { boardId: 7 }),
    ]);

    await userEvent.click(screen.getByTestId("assigned-card-9"));

    expect(onOpen).toHaveBeenCalledWith(7, "card-9");
  });
});
