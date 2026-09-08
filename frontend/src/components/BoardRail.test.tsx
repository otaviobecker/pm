import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardRail } from "@/components/BoardRail";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { makeCard, makeSummary } from "@/test/fixtures";
import { columnAccent } from "@/lib/theme";

const boards = [
  makeSummary(),
  makeSummary({ id: 2, name: "Roadmap", cardCount: 1, archived: true }),
];

const renderRail = (onCreate = vi.fn(async () => true), showingMyWork = false) => {
  const onSelect = vi.fn();
  const onToggleArchived = vi.fn();
  const onShowMyWork = vi.fn();
  render(
    <BoardRail
      boards={boards}
      activeBoardId={1}
      showArchived={false}
      showingMyWork={showingMyWork}
      onShowMyWork={onShowMyWork}
      onSelect={onSelect}
      onToggleArchived={onToggleArchived}
      onCreate={onCreate}
    />
  );
  return { onSelect, onToggleArchived, onCreate, onShowMyWork };
};

describe("BoardRail", () => {
  it("marks the open board and selects another", async () => {
    const { onSelect } = renderRail();

    expect(screen.getByTestId("board-option-1")).toHaveAttribute(
      "aria-current",
      "true"
    );
    await userEvent.click(screen.getByTestId("board-option-2"));

    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("marks archived boards", () => {
    renderRail();

    expect(
      screen.getByTestId("board-option-2").querySelector("[aria-label=Archived]")
    ).not.toBeNull();
  });

  it("creates a board and closes the form", async () => {
    const onCreate = vi.fn(async () => true);
    renderRail(onCreate);

    await userEvent.click(screen.getByRole("button", { name: /new board/i }));
    await userEvent.type(screen.getByLabelText("Board name"), "  Roadmap  ");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(onCreate).toHaveBeenCalledWith("Roadmap");
    expect(screen.queryByLabelText("Board name")).toBeNull();
  });

  it("keeps the form open when creation fails", async () => {
    renderRail(vi.fn(async () => false));

    await userEvent.click(screen.getByRole("button", { name: /new board/i }));
    await userEvent.type(screen.getByLabelText("Board name"), "Roadmap");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(screen.getByLabelText("Board name")).toHaveValue("Roadmap");
  });

  it("abandons the form on cancel", async () => {
    renderRail();

    await userEvent.click(screen.getByRole("button", { name: /new board/i }));
    await userEvent.type(screen.getByLabelText("Board name"), "Roadmap");
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByLabelText("Board name")).toBeNull();
  });

  it("toggles archived boards", async () => {
    const { onToggleArchived } = renderRail();

    await userEvent.click(screen.getByRole("button", { name: /show archived/i }));

    expect(onToggleArchived).toHaveBeenCalledOnce();
  });

  it("collapses to icons and still switches boards", async () => {
    const { onSelect } = renderRail();

    await userEvent.click(screen.getByRole("button", { name: /hide board list/i }));
    expect(screen.queryByTestId("board-rail")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Open Roadmap" }));
    expect(onSelect).toHaveBeenCalledWith(2);

    await userEvent.click(screen.getByRole("button", { name: /show board list/i }));
    expect(screen.getByTestId("board-rail")).toBeInTheDocument();
  });

  it("opens the assignment list from the rail and from the collapsed rail", async () => {
    const { onShowMyWork } = renderRail();

    await userEvent.click(screen.getByTestId("my-work-link"));
    expect(onShowMyWork).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: /hide board list/i }));
    await userEvent.click(screen.getByRole("button", { name: "My work" }));
    expect(onShowMyWork).toHaveBeenCalledTimes(2);
  });

  it("marks the assignment list as current while it is showing", () => {
    renderRail(vi.fn(async () => true), true);

    expect(screen.getByTestId("my-work-link")).toHaveAttribute(
      "aria-current",
      "true"
    );
  });

  it("explains an empty list", () => {
    render(
      <BoardRail
        boards={[]}
        activeBoardId={null}
        showArchived={false}
        showingMyWork={false}
        onShowMyWork={vi.fn()}
        onSelect={vi.fn()}
        onToggleArchived={vi.fn()}
        onCreate={vi.fn(async () => true)}
      />
    );

    expect(screen.getByText(/no active boards/i)).toBeInTheDocument();
  });
});

describe("KanbanCardPreview", () => {
  it("renders the dragged card", () => {
    render(
      <KanbanCardPreview
        card={makeCard("card-1", "Align roadmap themes")}
        accent={columnAccent(0)}
      />
    );

    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
    expect(
      screen.getByText("Align roadmap themes details")
    ).toBeInTheDocument();
  });

  it("renders without details or an accent", () => {
    render(
      <KanbanCardPreview card={makeCard("card-1", "Bare", { details: "" })} />
    );

    expect(screen.getByText("Bare")).toBeInTheDocument();
  });
});
