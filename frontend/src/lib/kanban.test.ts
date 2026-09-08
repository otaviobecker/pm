import {
  canEdit,
  checklistComplete,
  describeActivity,
  dueState,
  formatDueDate,
  formatMoment,
  groupAssignments,
  initials,
  isOwner,
  labelsFor,
  moveCard,
  wipState,
  type ActivityEntry,
  type AssignedCard,
  type Column,
} from "@/lib/kanban";
import { makeBoard, makeCard } from "@/test/fixtures";

const columns = (): Column[] => [
  { id: "a", title: "A", wipLimit: null, cardIds: ["1", "2"] },
  { id: "b", title: "B", wipLimit: null, cardIds: ["3"] },
];

describe("moveCard", () => {
  it("reorders within a column", () => {
    expect(moveCard(columns(), "2", "1")[0].cardIds).toEqual(["2", "1"]);
  });

  it("moves a card to another column at the target index", () => {
    const next = moveCard(columns(), "1", "3");

    expect(next[0].cardIds).toEqual(["2"]);
    expect(next[1].cardIds).toEqual(["1", "3"]);
  });

  it("appends when dropped on the column itself", () => {
    const next = moveCard(columns(), "1", "b");

    expect(next[1].cardIds).toEqual(["3", "1"]);
  });

  it("moves a card to the end of its own column when dropped on that column", () => {
    const next = moveCard(columns(), "1", "a");

    expect(next[0].cardIds).toEqual(["2", "1"]);
  });

  it("leaves the board alone for unknown ids", () => {
    const original = columns();

    expect(moveCard(original, "missing", "1")).toBe(original);
    expect(moveCard(original, "1", "missing")).toBe(original);
  });

  it("does not mutate the input", () => {
    const original = columns();
    moveCard(original, "1", "3");

    expect(original[0].cardIds).toEqual(["1", "2"]);
  });
});

describe("wipState", () => {
  const withLimit = (count: number, wipLimit: number | null): Column => ({
    id: "a",
    title: "A",
    wipLimit,
    cardIds: Array.from({ length: count }, (_, index) => String(index)),
  });

  it("reports no limit when none is set", () => {
    expect(wipState(withLimit(9, null))).toBe("none");
  });

  it("distinguishes under, full, and over the limit", () => {
    expect(wipState(withLimit(1, 3))).toBe("under");
    expect(wipState(withLimit(3, 3))).toBe("full");
    expect(wipState(withLimit(4, 3))).toBe("over");
  });
});

describe("dueState", () => {
  const today = new Date(2026, 5, 15);

  it("has no state without a date", () => {
    expect(dueState(null, today)).toBe("none");
  });

  it("buckets dates by how close they are", () => {
    expect(dueState("2026-06-14", today)).toBe("overdue");
    expect(dueState("2026-06-15", today)).toBe("today");
    expect(dueState("2026-06-17", today)).toBe("soon");
    expect(dueState("2026-07-01", today)).toBe("later");
  });
});

describe("formatting helpers", () => {
  it("formats a due date without the year", () => {
    expect(formatDueDate("2026-06-15")).toMatch(/15/);
  });

  it("builds initials from one or two words", () => {
    expect(initials("Casey Jones")).toBe("CJ");
    expect(initials("casey")).toBe("C");
    expect(initials("")).toBe("");
  });
});

describe("role helpers", () => {
  it("lets owners and editors change a board", () => {
    expect(canEdit("owner")).toBe(true);
    expect(canEdit("editor")).toBe(true);
    expect(canEdit("viewer")).toBe(false);
  });

  it("recognizes the owner", () => {
    expect(isOwner("owner")).toBe(true);
    expect(isOwner("editor")).toBe(false);
  });
});

describe("card rollups", () => {
  it("only calls a checklist complete when it has items and all are done", () => {
    expect(checklistComplete(makeCard("a", "A"))).toBe(false);
    expect(
      checklistComplete(
        makeCard("a", "A", { checklistTotal: 2, checklistDone: 1 })
      )
    ).toBe(false);
    expect(
      checklistComplete(
        makeCard("a", "A", { checklistTotal: 2, checklistDone: 2 })
      )
    ).toBe(true);
  });

  it("resolves a card's labels in board order and skips unknown ids", () => {
    const board = makeBoard();
    const card = makeCard("a", "A", {
      labelIds: ["label-bug", "label-gone", "label-feature"],
    });

    expect(labelsFor(board, card).map((label) => label.name)).toEqual([
      "Bug",
      "Feature",
    ]);
  });
});

describe("activity phrasing", () => {
  const entry = (action: string): ActivityEntry => ({
    id: 1,
    actorId: 1,
    actorName: "Casey",
    action,
    subject: "",
    detail: "",
    cardId: null,
    createdAt: "2026-06-15T09:30:00+00:00",
  });

  it("phrases the actions it knows", () => {
    expect(describeActivity(entry("card.created"))).toBe("added");
    expect(describeActivity(entry("comment.added"))).toBe("commented on");
  });

  it("falls back to the raw action otherwise", () => {
    expect(describeActivity(entry("card.teleported"))).toBe("card.teleported");
  });

  it("formats a stored timestamp", () => {
    expect(formatMoment("2026-06-15T09:30:00Z")).toMatch(/15/);
  });
});

describe("groupAssignments", () => {
  const today = new Date(2026, 5, 15);
  const card = (id: string, dueDate: string | null): AssignedCard => ({
    ...makeCard(id, id),
    dueDate,
    boardId: 1,
    boardName: "Board",
    columnTitle: "Backlog",
  });

  it("returns groups in a fixed order, omitting empty ones", () => {
    const grouped = groupAssignments(
      [
        card("undated", null),
        card("later", "2026-08-01"),
        card("overdue", "2026-06-01"),
      ],
      today
    );

    expect(grouped.map(([group]) => group)).toEqual([
      "overdue",
      "later",
      "none",
    ]);
  });

  it("keeps several cards inside one group", () => {
    const grouped = groupAssignments(
      [card("a", "2026-06-01"), card("b", "2026-06-02")],
      today
    );

    expect(grouped).toHaveLength(1);
    expect(grouped[0][1].map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("has nothing to group when nothing is assigned", () => {
    expect(groupAssignments([], today)).toEqual([]);
  });
});
