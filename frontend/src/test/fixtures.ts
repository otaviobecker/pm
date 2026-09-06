import type { User } from "@/lib/api";
import type {
  BoardData,
  BoardMember,
  BoardSummary,
  Card,
  CardDetail,
  Column,
  Label,
} from "@/lib/kanban";

const timestamp = "2026-01-01T00:00:00+00:00";

export const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 1,
  username: "user",
  displayName: "Workspace Admin",
  email: "",
  role: "admin",
  isActive: true,
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

export const makeCard = (
  id: string,
  title: string,
  overrides: Partial<Card> = {}
): Card => ({
  id,
  title,
  details: `${title} details`,
  priority: "medium",
  dueDate: null,
  assigneeId: null,
  labelIds: [],
  commentCount: 0,
  checklistTotal: 0,
  checklistDone: 0,
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

export const makeLabels = (): Label[] => [
  { id: "label-feature", name: "Feature", color: "blue" },
  { id: "label-bug", name: "Bug", color: "purple" },
];

export const makeCardDetail = (
  overrides: Partial<CardDetail> = {}
): CardDetail => ({
  ...makeCard("card-1", "Align roadmap themes"),
  boardId: 1,
  columnId: "col-backlog",
  comments: [],
  checklist: [],
  ...overrides,
});

const columnSpecs: [string, string, string[]][] = [
  ["col-backlog", "Backlog", ["card-1", "card-2"]],
  ["col-discovery", "Discovery", ["card-3"]],
  ["col-progress", "In Progress", ["card-4", "card-5"]],
  ["col-review", "Review", ["card-6"]],
  ["col-done", "Done", ["card-7", "card-8"]],
];

const cardTitles: Record<string, string> = {
  "card-1": "Align roadmap themes",
  "card-2": "Gather customer signals",
  "card-3": "Prototype analytics view",
  "card-4": "Refine status language",
  "card-5": "Design card layout",
  "card-6": "QA micro-interactions",
  "card-7": "Ship marketing page",
  "card-8": "Close onboarding sprint",
};

export const makeMember = (
  overrides: Partial<BoardMember> = {}
): BoardMember => ({
  userId: 1,
  username: "user",
  displayName: "Workspace Admin",
  role: "owner",
  ...overrides,
});

export const makeBoard = (overrides: Partial<BoardData> = {}): BoardData => {
  const columns: Column[] = columnSpecs.map(([id, title, cardIds]) => ({
    id,
    title,
    wipLimit: null,
    cardIds: [...cardIds],
  }));
  const cards: Record<string, Card> = {};
  Object.entries(cardTitles).forEach(([id, title]) => {
    cards[id] = makeCard(id, title);
  });
  return {
    id: 1,
    name: "Kanban Studio",
    description: "Starter board",
    archived: false,
    ownerId: 1,
    role: "owner",
    createdAt: timestamp,
    updatedAt: timestamp,
    columns,
    cards,
    labels: makeLabels(),
    members: [makeMember()],
    ...overrides,
  };
};

export const makeSummary = (
  overrides: Partial<BoardSummary> = {}
): BoardSummary => ({
  id: 1,
  name: "Kanban Studio",
  description: "Starter board",
  archived: false,
  ownerId: 1,
  ownerUsername: "user",
  ownerDisplayName: "Workspace Admin",
  role: "owner",
  cardCount: 8,
  memberCount: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});
