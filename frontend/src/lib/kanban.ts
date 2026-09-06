export type Priority = "low" | "medium" | "high" | "urgent";
export type LabelColor = "yellow" | "blue" | "purple" | "navy" | "gray";
export type BoardRole = "owner" | "editor" | "viewer";
export type AccountRole = "admin" | "member";

export type Card = {
  id: string;
  title: string;
  details: string;
  priority: Priority;
  dueDate: string | null;
  assigneeId: number | null;
  labelIds: string[];
  commentCount: number;
  checklistTotal: number;
  checklistDone: number;
  createdAt: string;
  updatedAt: string;
};

export type Label = {
  id: string;
  name: string;
  color: LabelColor;
};

export type Comment = {
  id: number;
  body: string;
  authorId: number | null;
  authorName: string;
  createdAt: string;
  updatedAt: string;
};

export type ChecklistItem = {
  id: number;
  title: string;
  done: boolean;
};

export type CardDetail = Card & {
  boardId: number;
  columnId: string;
  comments: Comment[];
  checklist: ChecklistItem[];
};

export type Column = {
  id: string;
  title: string;
  wipLimit: number | null;
  cardIds: string[];
};

export type BoardMember = {
  userId: number;
  username: string;
  displayName: string;
  role: BoardRole;
};

export type BoardData = {
  id: number;
  name: string;
  description: string;
  archived: boolean;
  ownerId: number;
  role: BoardRole;
  createdAt: string;
  updatedAt: string;
  columns: Column[];
  cards: Record<string, Card>;
  labels: Label[];
  members: BoardMember[];
};

export type BoardSummary = {
  id: number;
  name: string;
  description: string;
  archived: boolean;
  ownerId: number;
  ownerUsername: string;
  ownerDisplayName: string;
  role: BoardRole;
  cardCount: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

export const priorities: Priority[] = ["low", "medium", "high", "urgent"];

export const labelColors: LabelColor[] = [
  "yellow",
  "blue",
  "purple",
  "navy",
  "gray",
];

export const priorityLabels: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

/** Roles ordered from least to most capable, used for permission checks. */
const roleRank: Record<BoardRole, number> = { viewer: 0, editor: 1, owner: 2 };

export const canEdit = (role: BoardRole) => roleRank[role] >= roleRank.editor;
export const isOwner = (role: BoardRole) => role === "owner";

const isColumnId = (columns: Column[], id: string) =>
  columns.some((column) => column.id === id);

const findColumnId = (columns: Column[], id: string) => {
  if (isColumnId(columns, id)) {
    return id;
  }
  return columns.find((column) => column.cardIds.includes(id))?.id;
};

export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string
): Column[] => {
  const activeColumnId = findColumnId(columns, activeId);
  const overColumnId = findColumnId(columns, overId);

  if (!activeColumnId || !overColumnId) {
    return columns;
  }

  const activeColumn = columns.find((column) => column.id === activeColumnId);
  const overColumn = columns.find((column) => column.id === overColumnId);

  if (!activeColumn || !overColumn) {
    return columns;
  }

  const isOverColumn = isColumnId(columns, overId);

  if (activeColumnId === overColumnId) {
    if (isOverColumn) {
      const nextCardIds = activeColumn.cardIds.filter(
        (cardId) => cardId !== activeId
      );
      nextCardIds.push(activeId);
      return columns.map((column) =>
        column.id === activeColumnId
          ? { ...column, cardIds: nextCardIds }
          : column
      );
    }

    const oldIndex = activeColumn.cardIds.indexOf(activeId);
    const newIndex = activeColumn.cardIds.indexOf(overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      return columns;
    }

    const nextCardIds = [...activeColumn.cardIds];
    nextCardIds.splice(oldIndex, 1);
    nextCardIds.splice(newIndex, 0, activeId);

    return columns.map((column) =>
      column.id === activeColumnId
        ? { ...column, cardIds: nextCardIds }
        : column
    );
  }

  const activeIndex = activeColumn.cardIds.indexOf(activeId);
  if (activeIndex === -1) {
    return columns;
  }

  const nextActiveCardIds = [...activeColumn.cardIds];
  nextActiveCardIds.splice(activeIndex, 1);

  const nextOverCardIds = [...overColumn.cardIds];
  if (isOverColumn) {
    nextOverCardIds.push(activeId);
  } else {
    const overIndex = overColumn.cardIds.indexOf(overId);
    const insertIndex = overIndex === -1 ? nextOverCardIds.length : overIndex;
    nextOverCardIds.splice(insertIndex, 0, activeId);
  }

  return columns.map((column) => {
    if (column.id === activeColumnId) {
      return { ...column, cardIds: nextActiveCardIds };
    }
    if (column.id === overColumnId) {
      return { ...column, cardIds: nextOverCardIds };
    }
    return column;
  });
};

/** How many cards a column holds relative to its WIP limit. */
export const wipState = (column: Column) => {
  if (column.wipLimit === null) {
    return "none" as const;
  }
  if (column.cardIds.length > column.wipLimit) {
    return "over" as const;
  }
  return column.cardIds.length === column.wipLimit
    ? ("full" as const)
    : ("under" as const);
};

/** Relative day bucket for a due date, used to colour the badge. */
export const dueState = (dueDate: string | null, today = new Date()) => {
  if (!dueDate) {
    return "none" as const;
  }
  const due = new Date(`${dueDate}T00:00:00`);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((due.getTime() - start.getTime()) / 86_400_000);
  if (days < 0) {
    return "overdue" as const;
  }
  if (days === 0) {
    return "today" as const;
  }
  return days <= 3 ? ("soon" as const) : ("later" as const);
};

export const formatDueDate = (dueDate: string) => {
  const due = new Date(`${dueDate}T00:00:00`);
  return due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || name.slice(0, 2).toUpperCase();

/** Cards with every checklist item ticked are complete; empty checklists are not. */
export const checklistComplete = (card: Card) =>
  card.checklistTotal > 0 && card.checklistDone === card.checklistTotal;

export const labelsFor = (board: BoardData, card: Card): Label[] =>
  card.labelIds
    .map((labelId) => board.labels.find((label) => label.id === labelId))
    .filter((label): label is Label => label !== undefined);
