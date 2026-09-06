import type {
  AccountRole,
  BoardData,
  BoardRole,
  BoardSummary,
  CardDetail,
  LabelColor,
  Priority,
} from "@/lib/kanban";

export type User = {
  id: number;
  username: string;
  displayName: string;
  email: string;
  role: AccountRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DirectoryUser = {
  id: number;
  username: string;
  displayName: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResponse = {
  message: string;
  board: BoardData | null;
};

export type CardFields = {
  title?: string;
  details?: string;
  priority?: Priority;
  dueDate?: string | null;
  assigneeId?: number | null;
};

/** A card detail mutation also returns the board whose rollups it changed. */
export type CardWorkspace = {
  card: CardDetail;
  board: BoardData;
};

export class ApiError extends Error {
  status: number;
  detail?: string;

  constructor(status: number, detail?: string) {
    super(detail ?? (status === 401 ? "Unauthorized" : "Request failed"));
    this.status = status;
    this.detail = detail;
  }
}

const errorDetail = async (response: Response): Promise<string | undefined> => {
  try {
    const body: unknown = await response.json();
    const detail = (body as { detail?: unknown } | null)?.detail;
    if (typeof detail === "string") {
      return detail;
    }
    // FastAPI validation errors arrive as a list of per-field problems.
    if (Array.isArray(detail)) {
      const first = detail[0] as { msg?: unknown } | undefined;
      return typeof first?.msg === "string" ? first.msg : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await errorDetail(response));
  }

  return response.status === 204 ? (undefined as T) : response.json();
};

export const getSession = async (): Promise<User | null> => {
  try {
    return await request<User>("/api/auth/session");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
};

export const login = (username: string, password: string) =>
  request<User>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const register = (
  username: string,
  password: string,
  displayName: string
) =>
  request<User>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password, displayName }),
  });

export const logout = () => request<void>("/api/auth/logout", { method: "POST" });

export const updateProfile = (displayName: string, email: string) =>
  request<User>("/api/users/me", {
    method: "PATCH",
    body: JSON.stringify({ displayName, email }),
  });

export const changePassword = (currentPassword: string, newPassword: string) =>
  request<void>("/api/users/me/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });

export const getDirectory = () => request<DirectoryUser[]>("/api/users");

export const getAllUsers = () => request<User[]>("/api/admin/users");

export const administerUser = (
  userId: number,
  changes: { role?: AccountRole; isActive?: boolean }
) =>
  request<User>(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });

export const deleteUser = (userId: number) =>
  request<void>(`/api/admin/users/${userId}`, { method: "DELETE" });

export const getBoards = (includeArchived = false) =>
  request<BoardSummary[]>(
    `/api/boards${includeArchived ? "?includeArchived=true" : ""}`
  );

export const getBoard = (boardId: number) =>
  request<BoardData>(`/api/boards/${boardId}`);

export const createBoard = (name: string, description = "") =>
  request<BoardData>("/api/boards", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });

export const updateBoard = (
  boardId: number,
  changes: { name?: string; description?: string; archived?: boolean }
) =>
  request<BoardData>(`/api/boards/${boardId}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });

export const deleteBoard = (boardId: number) =>
  request<void>(`/api/boards/${boardId}`, { method: "DELETE" });

export const addBoardMember = (
  boardId: number,
  username: string,
  role: Exclude<BoardRole, "owner">
) =>
  request<BoardData>(`/api/boards/${boardId}/members`, {
    method: "POST",
    body: JSON.stringify({ username, role }),
  });

export const updateBoardMember = (
  boardId: number,
  userId: number,
  role: Exclude<BoardRole, "owner">
) =>
  request<BoardData>(`/api/boards/${boardId}/members/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });

export const removeBoardMember = (boardId: number, userId: number) =>
  request<void>(`/api/boards/${boardId}/members/${userId}`, {
    method: "DELETE",
  });

export const createColumn = (
  boardId: number,
  title: string,
  wipLimit: number | null = null
) =>
  request<BoardData>(`/api/boards/${boardId}/columns`, {
    method: "POST",
    body: JSON.stringify({ title, wipLimit }),
  });

export const updateColumn = (
  boardId: number,
  columnId: string,
  changes: { title?: string; wipLimit?: number | null }
) =>
  request<BoardData>(`/api/boards/${boardId}/columns/${columnId}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });

export const renameColumn = (
  boardId: number,
  columnId: string,
  title: string
) => updateColumn(boardId, columnId, { title });

export const moveColumn = (
  boardId: number,
  columnId: string,
  position: number
) =>
  request<BoardData>(`/api/boards/${boardId}/columns/${columnId}/move`, {
    method: "POST",
    body: JSON.stringify({ position }),
  });

export const deleteColumn = (
  boardId: number,
  columnId: string,
  moveCardsTo?: string
) =>
  request<BoardData>(
    `/api/boards/${boardId}/columns/${columnId}` +
      (moveCardsTo ? `?moveCardsTo=${encodeURIComponent(moveCardsTo)}` : ""),
    { method: "DELETE" }
  );

export const createCard = (
  boardId: number,
  columnId: string,
  fields: CardFields & { title: string }
) =>
  request<BoardData>(`/api/boards/${boardId}/cards`, {
    method: "POST",
    body: JSON.stringify({ columnId, ...fields }),
  });

export const editCard = (
  boardId: number,
  cardId: string,
  fields: CardFields
) =>
  request<BoardData>(`/api/boards/${boardId}/cards/${cardId}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });

export const deleteCard = (boardId: number, cardId: string) =>
  request<BoardData>(`/api/boards/${boardId}/cards/${cardId}`, {
    method: "DELETE",
  });

export const moveBoardCard = (
  boardId: number,
  cardId: string,
  columnId: string,
  position: number
) =>
  request<BoardData>(`/api/boards/${boardId}/cards/${cardId}/move`, {
    method: "POST",
    body: JSON.stringify({ columnId, position }),
  });

export const sendChat = (
  boardId: number,
  message: string,
  history: ChatMessage[]
) =>
  request<ChatResponse>(`/api/boards/${boardId}/chat`, {
    method: "POST",
    body: JSON.stringify({ message, history }),
  });

export const createLabel = (boardId: number, name: string, color: LabelColor) =>
  request<BoardData>(`/api/boards/${boardId}/labels`, {
    method: "POST",
    body: JSON.stringify({ name, color }),
  });

export const updateLabel = (
  boardId: number,
  labelId: string,
  changes: { name?: string; color?: LabelColor }
) =>
  request<BoardData>(`/api/boards/${boardId}/labels/${labelId}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });

export const deleteLabel = (boardId: number, labelId: string) =>
  request<BoardData>(`/api/boards/${boardId}/labels/${labelId}`, {
    method: "DELETE",
  });

export const getCard = (boardId: number, cardId: string) =>
  request<CardDetail>(`/api/boards/${boardId}/cards/${cardId}`);

export const setCardLabels = (
  boardId: number,
  cardId: string,
  labelIds: string[]
) =>
  request<CardWorkspace>(`/api/boards/${boardId}/cards/${cardId}/labels`, {
    method: "PUT",
    body: JSON.stringify({ labelIds }),
  });

export const addComment = (boardId: number, cardId: string, body: string) =>
  request<CardWorkspace>(`/api/boards/${boardId}/cards/${cardId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });

export const editComment = (
  boardId: number,
  cardId: string,
  commentId: number,
  body: string
) =>
  request<CardWorkspace>(
    `/api/boards/${boardId}/cards/${cardId}/comments/${commentId}`,
    { method: "PATCH", body: JSON.stringify({ body }) }
  );

export const deleteComment = (
  boardId: number,
  cardId: string,
  commentId: number
) =>
  request<CardWorkspace>(
    `/api/boards/${boardId}/cards/${cardId}/comments/${commentId}`,
    { method: "DELETE" }
  );

export const addChecklistItem = (
  boardId: number,
  cardId: string,
  title: string
) =>
  request<CardWorkspace>(`/api/boards/${boardId}/cards/${cardId}/checklist`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });

export const updateChecklistItem = (
  boardId: number,
  cardId: string,
  itemId: number,
  changes: { title?: string; done?: boolean }
) =>
  request<CardWorkspace>(
    `/api/boards/${boardId}/cards/${cardId}/checklist/${itemId}`,
    { method: "PATCH", body: JSON.stringify(changes) }
  );

export const moveChecklistItem = (
  boardId: number,
  cardId: string,
  itemId: number,
  position: number
) =>
  request<CardWorkspace>(
    `/api/boards/${boardId}/cards/${cardId}/checklist/${itemId}/move`,
    { method: "POST", body: JSON.stringify({ position }) }
  );

export const deleteChecklistItem = (
  boardId: number,
  cardId: string,
  itemId: number
) =>
  request<CardWorkspace>(
    `/api/boards/${boardId}/cards/${cardId}/checklist/${itemId}`,
    { method: "DELETE" }
  );
