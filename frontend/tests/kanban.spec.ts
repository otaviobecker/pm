import { expect, test } from "@playwright/test";

const signIn = async (page: import("@playwright/test").Page) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
};

test("loads the board and persists a column rename", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  const title = page.getByLabel("Column title").first();
  await title.fill("Ideas");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/board/columns/") &&
        response.request().method() === "PATCH"
    ),
    title.press("Enter"),
  ]);
  await page.reload();
  await expect(page.getByLabel("Column title").first()).toHaveValue("Ideas");

  await page.getByLabel("Column title").first().fill("Backlog");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/board/columns/") &&
        response.request().method() === "PATCH"
    ),
    page.getByLabel("Column title").first().press("Enter"),
  ]);
});

test("creates, edits, and deletes a persistent card", async ({ page }) => {
  await signIn(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/board/cards") &&
        response.request().method() === "POST"
    ),
    firstColumn.getByRole("button", { name: /add card/i }).click(),
  ]);
  await page.reload();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
  await firstColumn
    .getByRole("button", { name: "Edit Playwright card" })
    .click();
  await firstColumn.getByLabel("Card title").fill("Edited Playwright card");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/board/cards/") &&
        response.request().method() === "PATCH"
    ),
    firstColumn.getByRole("button", { name: "Save" }).click(),
  ]);
  await page.reload();
  await expect(firstColumn.getByText("Edited Playwright card")).toBeVisible();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/board/cards/") &&
        response.request().method() === "DELETE"
    ),
    firstColumn
      .locator('button[aria-label="Delete Edited Playwright card"]')
      .click(),
  ]);
  await page.reload();
  await expect(firstColumn.getByText("Playwright card")).not.toBeVisible();
  await expect(firstColumn.getByText("Edited Playwright card")).not.toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await signIn(page);
  const card = page.getByTestId("card-card-1");
  const dragHandle = card.getByRole("button", {
    name: "Drag Align roadmap themes",
  });
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await dragHandle.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  const moveResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/board/cards/card-1/move") &&
      response.request().method() === "POST"
  );
  await page.mouse.up();
  await moveResponse;
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
  await page.reload();
  await expect(
    page.getByTestId("column-col-review").getByTestId("card-card-1")
  ).toBeVisible();

  await page.request.post("/api/board/cards/card-1/move", {
    data: { columnId: "col-backlog", position: 0 },
  });
});
