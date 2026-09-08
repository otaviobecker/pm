import {
  ApiError,
  addBoardMember,
  createBoard,
  createCard,
  createColumn,
  deleteBoard,
  deleteCard,
  deleteColumn,
  deleteUser,
  editCard,
  getAllUsers,
  getBoard,
  getBoards,
  getDirectory,
  getSession,
  login,
  logout,
  moveBoardCard,
  moveColumn,
  register,
  removeBoardMember,
  renameColumn,
  sendChat,
  addChecklistItem,
  addComment,
  administerUser,
  changePassword,
  createLabel,
  deleteChecklistItem,
  deleteComment,
  deleteLabel,
  editComment,
  getActivity,
  getCard,
  getMyCards,
  moveChecklistItem,
  setCardLabels,
  updateChecklistItem,
  updateLabel,
  updateBoard,
  updateBoardMember,
  updateColumn,
  updateProfile,
} from "@/lib/api";

type FetchArgs = [string, RequestInit | undefined];

const respond = (
  body: unknown,
  { status = 200, invalidJson = false } = {}
): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (invalidJson) {
        throw new SyntaxError("Unexpected token");
      }
      return body;
    },
  }) as Response;

const stubFetch = (response: Response) => {
  const spy = vi.fn(async () => response);
  vi.stubGlobal("fetch", spy);
  return spy;
};

const lastCall = (spy: ReturnType<typeof stubFetch>): FetchArgs =>
  spy.mock.calls.at(-1) as unknown as FetchArgs;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request handling", () => {
  it("sends JSON and returns the parsed body", async () => {
    const spy = stubFetch(respond({ id: 1 }));

    await expect(getBoard(1)).resolves.toEqual({ id: 1 });
    const [url, init] = lastCall(spy);
    expect(url).toBe("/api/boards/1");
    expect(
      (init?.headers as Record<string, string>)["Content-Type"]
    ).toBe("application/json");
  });

  it("returns nothing for 204 responses", async () => {
    stubFetch(respond(null, { status: 204 }));

    await expect(logout()).resolves.toBeUndefined();
  });

  it("raises an ApiError carrying the server detail", async () => {
    stubFetch(respond({ detail: "Board not found" }, { status: 404 }));

    await expect(getBoard(9)).rejects.toMatchObject({
      status: 404,
      detail: "Board not found",
      message: "Board not found",
    });
  });

  it("reads the first message of a validation error list", async () => {
    stubFetch(
      respond({ detail: [{ msg: "must not be blank" }] }, { status: 422 })
    );

    await expect(createBoard("")).rejects.toMatchObject({
      detail: "must not be blank",
    });
  });

  it("falls back to a generic message when the body is not usable", async () => {
    stubFetch(respond(null, { status: 500, invalidJson: true }));

    await expect(getBoards()).rejects.toMatchObject({
      status: 500,
      detail: undefined,
      message: "Request failed",
    });
  });

  it("falls back to a generic message when the detail is not a string", async () => {
    stubFetch(respond({ detail: { nested: true } }, { status: 400 }));

    await expect(getBoards()).rejects.toMatchObject({ detail: undefined });
  });

  it("labels a 401 without a detail as unauthorized", () => {
    expect(new ApiError(401).message).toBe("Unauthorized");
  });
});

describe("session helpers", () => {
  it("treats an unauthenticated session as no user", async () => {
    stubFetch(respond({ detail: "Authentication required" }, { status: 401 }));

    await expect(getSession()).resolves.toBeNull();
  });

  it("propagates other session failures", async () => {
    stubFetch(respond({ detail: "boom" }, { status: 500 }));

    await expect(getSession()).rejects.toBeInstanceOf(ApiError);
  });

  it("posts credentials on sign-in and registration", async () => {
    const spy = stubFetch(respond({ id: 1 }));

    await login("casey", "secret");
    expect(JSON.parse(lastCall(spy)[1]?.body as string)).toEqual({
      username: "casey",
      password: "secret",
    });

    await register("casey", "secret", "Casey");
    expect(JSON.parse(lastCall(spy)[1]?.body as string)).toEqual({
      username: "casey",
      password: "secret",
      displayName: "Casey",
    });
  });
});

describe("endpoint shapes", () => {
  it("builds the expected requests", async () => {
    const spy = stubFetch(respond({}));
    const method = () => lastCall(spy)[1]?.method;
    const url = () => lastCall(spy)[0];
    const body = () => JSON.parse(lastCall(spy)[1]?.body as string);

    await getBoards();
    expect(url()).toBe("/api/boards");
    await getBoards(true);
    expect(url()).toBe("/api/boards?includeArchived=true");

    await updateBoard(1, { archived: true });
    expect([url(), method(), body()]).toEqual([
      "/api/boards/1",
      "PATCH",
      { archived: true },
    ]);

    await deleteBoard(1);
    expect([url(), method()]).toEqual(["/api/boards/1", "DELETE"]);

    await addBoardMember(1, "casey", "viewer");
    expect([url(), body()]).toEqual([
      "/api/boards/1/members",
      { username: "casey", role: "viewer" },
    ]);

    await updateBoardMember(1, 2, "editor");
    expect([url(), method()]).toEqual(["/api/boards/1/members/2", "PATCH"]);

    await removeBoardMember(1, 2);
    expect([url(), method()]).toEqual(["/api/boards/1/members/2", "DELETE"]);

    await createColumn(1, "Blocked", 3);
    expect([url(), body()]).toEqual([
      "/api/boards/1/columns",
      { title: "Blocked", wipLimit: 3 },
    ]);

    await renameColumn(1, "col-a", "Ideas");
    expect([url(), method(), body()]).toEqual([
      "/api/boards/1/columns/col-a",
      "PATCH",
      { title: "Ideas" },
    ]);

    await updateColumn(1, "col-a", { wipLimit: null });
    expect(body()).toEqual({ wipLimit: null });

    await moveColumn(1, "col-a", 2);
    expect([url(), body()]).toEqual([
      "/api/boards/1/columns/col-a/move",
      { position: 2 },
    ]);

    await deleteColumn(1, "col-a");
    expect(url()).toBe("/api/boards/1/columns/col-a");
    await deleteColumn(1, "col-a", "col b");
    expect(url()).toBe("/api/boards/1/columns/col-a?moveCardsTo=col%20b");

    await createCard(1, "col-a", { title: "New", priority: "high" });
    expect([url(), body()]).toEqual([
      "/api/boards/1/cards",
      { columnId: "col-a", title: "New", priority: "high" },
    ]);

    await editCard(1, "card-1", { dueDate: null });
    expect([url(), method(), body()]).toEqual([
      "/api/boards/1/cards/card-1",
      "PATCH",
      { dueDate: null },
    ]);

    await deleteCard(1, "card-1");
    expect([url(), method()]).toEqual(["/api/boards/1/cards/card-1", "DELETE"]);

    await moveBoardCard(1, "card-1", "col-b", 0);
    expect([url(), body()]).toEqual([
      "/api/boards/1/cards/card-1/move",
      { columnId: "col-b", position: 0 },
    ]);

    await sendChat(1, "Hello", []);
    expect([url(), body()]).toEqual([
      "/api/boards/1/chat",
      { message: "Hello", history: [] },
    ]);

    await getDirectory();
    expect(url()).toBe("/api/users");

    await updateProfile("Casey", "casey@example.com");
    expect([url(), method(), body()]).toEqual([
      "/api/users/me",
      "PATCH",
      { displayName: "Casey", email: "casey@example.com" },
    ]);

    await changePassword("old", "new");
    expect([url(), body()]).toEqual([
      "/api/users/me/password",
      { currentPassword: "old", newPassword: "new" },
    ]);

    await getAllUsers();
    expect(url()).toBe("/api/admin/users");

    await administerUser(2, { isActive: false });
    expect([url(), method(), body()]).toEqual([
      "/api/admin/users/2",
      "PATCH",
      { isActive: false },
    ]);

    await deleteUser(2);
    expect([url(), method()]).toEqual(["/api/admin/users/2", "DELETE"]);
  });

  it("builds the label and card detail requests", async () => {
    const spy = stubFetch(respond({}));
    const method = () => lastCall(spy)[1]?.method;
    const url = () => lastCall(spy)[0];
    const body = () => JSON.parse(lastCall(spy)[1]?.body as string);

    await createLabel(1, "Blocked", "navy");
    expect([url(), body()]).toEqual([
      "/api/boards/1/labels",
      { name: "Blocked", color: "navy" },
    ]);

    await updateLabel(1, "label-a", { color: "yellow" });
    expect([url(), method(), body()]).toEqual([
      "/api/boards/1/labels/label-a",
      "PATCH",
      { color: "yellow" },
    ]);

    await deleteLabel(1, "label-a");
    expect([url(), method()]).toEqual(["/api/boards/1/labels/label-a", "DELETE"]);

    await getCard(1, "card-1");
    expect(url()).toBe("/api/boards/1/cards/card-1");

    await setCardLabels(1, "card-1", ["label-a"]);
    expect([url(), method(), body()]).toEqual([
      "/api/boards/1/cards/card-1/labels",
      "PUT",
      { labelIds: ["label-a"] },
    ]);

    await addComment(1, "card-1", "Hello");
    expect([url(), body()]).toEqual([
      "/api/boards/1/cards/card-1/comments",
      { body: "Hello" },
    ]);

    await editComment(1, "card-1", 3, "Updated");
    expect([url(), method(), body()]).toEqual([
      "/api/boards/1/cards/card-1/comments/3",
      "PATCH",
      { body: "Updated" },
    ]);

    await deleteComment(1, "card-1", 3);
    expect([url(), method()]).toEqual([
      "/api/boards/1/cards/card-1/comments/3",
      "DELETE",
    ]);

    await addChecklistItem(1, "card-1", "Draft");
    expect([url(), body()]).toEqual([
      "/api/boards/1/cards/card-1/checklist",
      { title: "Draft" },
    ]);

    await updateChecklistItem(1, "card-1", 4, { done: true });
    expect([url(), method(), body()]).toEqual([
      "/api/boards/1/cards/card-1/checklist/4",
      "PATCH",
      { done: true },
    ]);

    await moveChecklistItem(1, "card-1", 4, 2);
    expect([url(), body()]).toEqual([
      "/api/boards/1/cards/card-1/checklist/4/move",
      { position: 2 },
    ]);

    await deleteChecklistItem(1, "card-1", 4);
    expect([url(), method()]).toEqual([
      "/api/boards/1/cards/card-1/checklist/4",
      "DELETE",
    ]);
  });

  it("builds the activity and assignment requests", async () => {
    const spy = stubFetch(respond([]));
    const url = () => lastCall(spy)[0];

    await getActivity(1);
    expect(url()).toBe("/api/boards/1/activity");

    await getActivity(1, { limit: 25 });
    expect(url()).toBe("/api/boards/1/activity?limit=25");

    await getActivity(1, { limit: 25, before: 40 });
    expect(url()).toBe("/api/boards/1/activity?limit=25&before=40");

    await getMyCards();
    expect(url()).toBe("/api/users/me/cards");
  });
});
