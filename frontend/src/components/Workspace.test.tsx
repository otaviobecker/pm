import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Workspace } from "@/components/Workspace";
import {
  ApiError,
  addBoardMember,
  createBoard,
  createLabel,
  deleteBoard,
  deleteLabel,
  getAllUsers,
  getBoard,
  getBoards,
  getCard,
  getDirectory,
  updateBoard,
  updateLabel,
  updateProfile,
} from "@/lib/api";
import {
  makeBoard,
  makeCardDetail,
  makeSummary,
  makeUser,
} from "@/test/fixtures";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getBoards: vi.fn(),
    getBoard: vi.fn(),
    getDirectory: vi.fn(),
    getAllUsers: vi.fn(),
    createBoard: vi.fn(),
    updateBoard: vi.fn(),
    deleteBoard: vi.fn(),
    addBoardMember: vi.fn(),
    createLabel: vi.fn(),
    updateLabel: vi.fn(),
    deleteLabel: vi.fn(),
    getCard: vi.fn(),
    addComment: vi.fn(),
    updateProfile: vi.fn(),
    createCard: vi.fn(),
    editCard: vi.fn(),
    deleteCard: vi.fn(),
    updateColumn: vi.fn(),
  };
});

const secondBoard = () =>
  makeBoard({
    id: 2,
    name: "Roadmap",
    columns: [
      { id: "col-backlog", title: "Backlog", wipLimit: null, cardIds: [] },
    ],
    cards: {},
  });

const renderWorkspace = (user = makeUser()) => {
  const onLogout = vi.fn();
  const onUserChange = vi.fn();
  render(
    <Workspace user={user} onUserChange={onUserChange} onLogout={onLogout} />
  );
  return { onLogout, onUserChange };
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.mocked(getBoards).mockResolvedValue([
    makeSummary(),
    makeSummary({ id: 2, name: "Roadmap", cardCount: 0 }),
  ]);
  vi.mocked(getBoard).mockImplementation(async (boardId: number) =>
    boardId === 2 ? secondBoard() : makeBoard()
  );
  vi.mocked(getDirectory).mockResolvedValue([
    { id: 1, username: "user", displayName: "Workspace Admin" },
    { id: 2, username: "casey", displayName: "Casey Jones" },
  ]);
  vi.mocked(getAllUsers).mockResolvedValue([]);
  vi.mocked(getCard).mockResolvedValue(makeCardDetail());
});

describe("Workspace boards", () => {
  it("lists the boards and opens the first one", async () => {
    renderWorkspace();

    expect(await screen.findByTestId("board-option-1")).toHaveTextContent(
      "Kanban Studio"
    );
    expect(screen.getByTestId("board-option-2")).toHaveTextContent("Roadmap");
    expect(
      await screen.findByRole("heading", { name: "Kanban Studio" })
    ).toBeInTheDocument();
  });

  it("switches to another board", async () => {
    renderWorkspace();

    await userEvent.click(await screen.findByTestId("board-option-2"));

    expect(
      await screen.findByRole("heading", { name: "Roadmap" })
    ).toBeInTheDocument();
    expect(getBoard).toHaveBeenCalledWith(2);
  });

  it("remembers the last board across mounts", async () => {
    const first = renderWorkspace();
    await userEvent.click(await screen.findByTestId("board-option-2"));
    await screen.findByRole("heading", { name: "Roadmap" });
    expect(first.onLogout).not.toHaveBeenCalled();

    expect(window.localStorage.getItem("pm.activeBoardId")).toBe("2");
  });

  it("creates a board from the rail", async () => {
    vi.mocked(createBoard).mockResolvedValue(secondBoard());
    renderWorkspace();

    await userEvent.click(await screen.findByRole("button", { name: /new board/i }));
    await userEvent.type(screen.getByLabelText("Board name"), "Roadmap");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(createBoard).toHaveBeenCalledWith("Roadmap");
    expect(
      await screen.findByRole("heading", { name: "Roadmap" })
    ).toBeInTheDocument();
  });

  it("requests archived boards when asked", async () => {
    renderWorkspace();
    await screen.findByTestId("board-option-1");

    await userEvent.click(screen.getByRole("button", { name: /show archived/i }));

    await waitFor(() => expect(getBoards).toHaveBeenCalledWith(true));
  });

  it("surfaces a board load failure", async () => {
    vi.mocked(getBoard).mockRejectedValue(new ApiError(404, "Board not found"));
    renderWorkspace();

    expect(await screen.findByRole("alert")).toHaveTextContent("Board not found");
  });

  it("shows an empty state when there are no boards", async () => {
    vi.mocked(getBoards).mockResolvedValue([]);
    renderWorkspace();

    expect(await screen.findByText(/no board open/i)).toBeInTheDocument();
  });
});

describe("Board settings", () => {
  const openSettings = async () => {
    await userEvent.click(
      await screen.findByRole("button", { name: /board settings/i })
    );
    return screen.findByRole("dialog", { name: /board settings/i });
  };

  it("renames the board", async () => {
    vi.mocked(updateBoard).mockResolvedValue(makeBoard({ name: "Q3 delivery" }));
    renderWorkspace();
    const dialog = await openSettings();

    const name = within(dialog).getByLabelText("Board name");
    await userEvent.clear(name);
    await userEvent.type(name, "Q3 delivery");
    await userEvent.click(within(dialog).getByRole("button", { name: /save board/i }));

    expect(updateBoard).toHaveBeenCalledWith(1, {
      name: "Q3 delivery",
      description: "Starter board",
    });
  });

  it("invites a member", async () => {
    vi.mocked(addBoardMember).mockResolvedValue(makeBoard());
    renderWorkspace();
    const dialog = await openSettings();

    await userEvent.type(
      within(dialog).getByLabelText(/invite by username/i),
      "casey"
    );
    await userEvent.selectOptions(
      within(dialog).getByLabelText("Invite role"),
      "viewer"
    );
    await userEvent.click(within(dialog).getByRole("button", { name: /invite/i }));

    expect(addBoardMember).toHaveBeenCalledWith(1, "casey", "viewer");
  });

  it("reports an invite failure", async () => {
    vi.mocked(addBoardMember).mockRejectedValue(
      new ApiError(404, "User not found")
    );
    renderWorkspace();
    const dialog = await openSettings();

    await userEvent.type(
      within(dialog).getByLabelText(/invite by username/i),
      "ghost"
    );
    await userEvent.click(within(dialog).getByRole("button", { name: /invite/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("User not found");
  });

  it("archives the board", async () => {
    vi.mocked(updateBoard).mockResolvedValue(makeBoard({ archived: true }));
    renderWorkspace();
    const dialog = await openSettings();

    await userEvent.click(
      within(dialog).getByRole("button", { name: /archive board/i })
    );

    expect(updateBoard).toHaveBeenCalledWith(1, { archived: true });
  });

  it("requires confirmation before deleting a board", async () => {
    vi.mocked(deleteBoard).mockResolvedValue(undefined);
    renderWorkspace();
    const dialog = await openSettings();

    await userEvent.click(
      within(dialog).getByRole("button", { name: /^delete board$/i })
    );
    expect(deleteBoard).not.toHaveBeenCalled();

    await userEvent.click(
      within(dialog).getByRole("button", { name: /delete permanently/i })
    );
    expect(deleteBoard).toHaveBeenCalledWith(1);
  });

  it("offers view-only members a way to leave instead of managing", async () => {
    vi.mocked(getBoard).mockResolvedValue(makeBoard({ role: "viewer" }));
    renderWorkspace();
    const dialog = await openSettings();

    expect(
      within(dialog).getByRole("button", { name: /leave this board/i })
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: /^delete board$/i })
    ).toBeNull();
  });
});

describe("Account dialog", () => {
  it("saves a profile change", async () => {
    const updated = makeUser({ displayName: "Casey" });
    vi.mocked(updateProfile).mockResolvedValue(updated);
    const { onUserChange } = renderWorkspace();

    await userEvent.click(
      await screen.findByRole("button", { name: /account and settings/i })
    );
    const dialog = await screen.findByRole("dialog", { name: /account/i });
    const name = within(dialog).getByLabelText("Display name");
    await userEvent.clear(name);
    await userEvent.type(name, "Casey");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /save profile/i })
    );

    expect(updateProfile).toHaveBeenCalledWith("Casey", "");
    expect(onUserChange).toHaveBeenCalledWith(updated);
  });

  it("lists workspace accounts for administrators", async () => {
    vi.mocked(getAllUsers).mockResolvedValue([
      makeUser(),
      makeUser({ id: 2, username: "casey", displayName: "Casey", role: "member" }),
    ]);
    renderWorkspace();

    await userEvent.click(
      await screen.findByRole("button", { name: /account and settings/i })
    );

    expect(await screen.findByTestId("account-casey")).toHaveTextContent("Casey");
  });

  it("hides administration from members", async () => {
    renderWorkspace(makeUser({ role: "member" }));

    await userEvent.click(
      await screen.findByRole("button", { name: /account and settings/i })
    );

    expect(screen.queryByText(/workspace accounts/i)).toBeNull();
    expect(getAllUsers).not.toHaveBeenCalled();
  });
});

describe("Card details", () => {
  it("opens a card and shows its detail", async () => {
    vi.mocked(getCard).mockResolvedValue(
      makeCardDetail({
        comments: [
          {
            id: 1,
            body: "Needs a decision",
            authorId: 1,
            authorName: "Workspace Admin",
            createdAt: "2026-01-01T00:00:00+00:00",
            updatedAt: "2026-01-01T00:00:00+00:00",
          },
        ],
      })
    );
    renderWorkspace();

    await userEvent.click(
      await screen.findByRole("button", { name: "Open Align roadmap themes" })
    );

    expect(getCard).toHaveBeenCalledWith(1, "card-1");
    const dialog = await screen.findByRole("dialog", {
      name: "Align roadmap themes",
    });
    expect(within(dialog).getByText("Needs a decision")).toBeInTheDocument();
  });

  it("closes the card detail", async () => {
    renderWorkspace();
    await userEvent.click(
      await screen.findByRole("button", { name: "Open Align roadmap themes" })
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Align roadmap themes",
    });

    await userEvent.click(
      within(dialog).getByRole("button", { name: /close dialog/i })
    );

    expect(
      screen.queryByRole("dialog", { name: "Align roadmap themes" })
    ).toBeNull();
  });

  it("reports a card that cannot be opened", async () => {
    vi.mocked(getCard).mockRejectedValue(new ApiError(404, "Card not found"));
    renderWorkspace();

    await userEvent.click(
      await screen.findByRole("button", { name: "Open Align roadmap themes" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Card not found");
  });
});

describe("Board labels", () => {
  const openSettings = async () => {
    await userEvent.click(
      await screen.findByRole("button", { name: /board settings/i })
    );
    return screen.findByRole("dialog", { name: /board settings/i });
  };

  it("adds a label", async () => {
    vi.mocked(createLabel).mockResolvedValue(makeBoard());
    renderWorkspace();
    const dialog = await openSettings();

    await userEvent.type(
      within(dialog).getByLabelText("New label name"),
      "Blocked"
    );
    await userEvent.selectOptions(
      within(dialog).getByLabelText("New label color"),
      "navy"
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: /add label/i })
    );

    expect(createLabel).toHaveBeenCalledWith(1, "Blocked", "navy");
  });

  it("recolors an existing label", async () => {
    vi.mocked(updateLabel).mockResolvedValue(makeBoard());
    renderWorkspace();
    const dialog = await openSettings();

    await userEvent.selectOptions(
      within(dialog).getByLabelText("Color for Bug"),
      "yellow"
    );

    expect(updateLabel).toHaveBeenCalledWith(1, "label-bug", {
      color: "yellow",
    });
  });

  it("renames a label on blur", async () => {
    vi.mocked(updateLabel).mockResolvedValue(makeBoard());
    renderWorkspace();
    const dialog = await openSettings();

    const field = within(dialog).getByLabelText("Name for Bug");
    await userEvent.clear(field);
    await userEvent.type(field, "Defect");
    await userEvent.tab();

    expect(updateLabel).toHaveBeenCalledWith(1, "label-bug", {
      name: "Defect",
    });
  });

  it("deletes a label", async () => {
    vi.mocked(deleteLabel).mockResolvedValue(makeBoard());
    renderWorkspace();
    const dialog = await openSettings();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete label Bug" })
    );

    expect(deleteLabel).toHaveBeenCalledWith(1, "label-bug");
  });

  it("hides label editing from viewers", async () => {
    vi.mocked(getBoard).mockResolvedValue(makeBoard({ role: "viewer" }));
    renderWorkspace();
    const dialog = await openSettings();

    expect(within(dialog).queryByLabelText("New label name")).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Delete label Bug" })
    ).toBeNull();
    expect(within(dialog).getByLabelText("Name for Bug")).toBeDisabled();
  });
});
