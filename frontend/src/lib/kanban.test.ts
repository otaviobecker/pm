import {
  canEdit,
  dueState,
  formatDueDate,
  initials,
  isOwner,
  moveCard,
  wipState,
  type Column,
} from "@/lib/kanban";

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
