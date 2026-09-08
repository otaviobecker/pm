import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityDialog } from "@/components/ActivityDialog";
import { ApiError, getActivity } from "@/lib/api";
import type { ActivityEntry } from "@/lib/kanban";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, getActivity: vi.fn() };
});

const entry = (overrides: Partial<ActivityEntry> = {}): ActivityEntry => ({
  id: 1,
  actorId: 1,
  actorName: "Casey Jones",
  action: "card.created",
  subject: "Align roadmap themes",
  detail: "",
  cardId: "card-1",
  createdAt: "2026-06-15T09:30:00+00:00",
  ...overrides,
});

const page = (count: number, startId: number) =>
  Array.from({ length: count }, (_, index) =>
    entry({ id: startId - index, subject: `Card ${startId - index}` })
  );

const renderDialog = () => {
  const onClose = vi.fn();
  render(
    <ActivityDialog boardId={1} boardName="Kanban Studio" onClose={onClose} />
  );
  return { onClose };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ActivityDialog", () => {
  it("loads the newest entries and phrases them", async () => {
    vi.mocked(getActivity).mockResolvedValue([
      entry(),
      entry({
        id: 2,
        action: "card.moved",
        actorName: "Workspace Admin",
        detail: "to Review",
      }),
    ]);
    renderDialog();

    const feed = await screen.findByTestId("activity-feed");
    expect(getActivity).toHaveBeenCalledWith(1, { limit: 25, before: undefined });
    expect(within(feed).getByTestId("activity-1")).toHaveTextContent(
      "Casey Jones added Align roadmap themes"
    );
    expect(within(feed).getByTestId("activity-2")).toHaveTextContent(
      "Workspace Admin moved Align roadmap themes (to Review)"
    );
  });

  it("falls back to the raw action for something it does not know", async () => {
    vi.mocked(getActivity).mockResolvedValue([
      entry({ action: "card.teleported", subject: "" }),
    ]);
    renderDialog();

    expect(await screen.findByTestId("activity-1")).toHaveTextContent(
      "card.teleported"
    );
  });

  it("says when a board has no history", async () => {
    vi.mocked(getActivity).mockResolvedValue([]);
    renderDialog();

    expect(await screen.findByText(/nothing has happened/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load older/i })).toBeNull();
  });

  it("pages backwards from the oldest entry shown", async () => {
    vi.mocked(getActivity)
      .mockResolvedValueOnce(page(25, 50))
      .mockResolvedValueOnce(page(2, 25));
    renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: /load older/i })
    );

    expect(getActivity).toHaveBeenLastCalledWith(1, { limit: 25, before: 26 });
    expect(await screen.findByTestId("activity-25")).toBeInTheDocument();
    // A short page means there is nothing older left to ask for.
    expect(screen.queryByRole("button", { name: /load older/i })).toBeNull();
  });

  it("reports a failure to load", async () => {
    vi.mocked(getActivity).mockRejectedValue(new ApiError(404, "Board not found"));
    renderDialog();

    expect(await screen.findByRole("alert")).toHaveTextContent("Board not found");
  });

  it("closes", async () => {
    vi.mocked(getActivity).mockResolvedValue([]);
    const { onClose } = renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: /close dialog/i })
    );

    expect(onClose).toHaveBeenCalledOnce();
  });
});
