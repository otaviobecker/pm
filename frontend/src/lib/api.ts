import type { BoardData } from "@/lib/kanban";

export type User = {
  username: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResponse = {
  message: string;
  board: BoardData | null;
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
    return typeof detail === "string" ? detail : undefined;
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

export const logout = () =>
  request<void>("/api/auth/logout", {
    method: "POST",
  });

export const getBoard = () => request<BoardData>("/api/board");

export const renameColumn = (columnId: string, title: string) =>
  request<BoardData>(`/api/board/columns/${columnId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });

export const createCard = (columnId: string, title: string, details: string) =>
  request<BoardData>("/api/board/cards", {
    method: "POST",
    body: JSON.stringify({ columnId, title, details }),
  });

export const editCard = (cardId: string, title: string, details: string) =>
  request<BoardData>(`/api/board/cards/${cardId}`, {
    method: "PATCH",
    body: JSON.stringify({ title, details }),
  });

export const deleteCard = (cardId: string) =>
  request<BoardData>(`/api/board/cards/${cardId}`, {
    method: "DELETE",
  });

export const moveBoardCard = (
  cardId: string,
  columnId: string,
  position: number
) =>
  request<BoardData>(`/api/board/cards/${cardId}/move`, {
    method: "POST",
    body: JSON.stringify({ columnId, position }),
  });

export const sendChat = (message: string, history: ChatMessage[]) =>
  request<ChatResponse>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message, history }),
  });
