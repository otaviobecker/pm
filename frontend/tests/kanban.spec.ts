import { expect, test } from "@playwright/test";
import { firstColumn, signUp } from "./helpers";

test("loads the board and persists a column rename", async ({ page }) => {
  await signUp(page);

  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  const title = page.getByLabel("Column title").first();
  await title.fill("Ideas");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/columns/") &&
        response.request().method() === "PATCH"
    ),
    title.press("Enter"),
  ]);

  await page.reload();
  await expect(page.getByLabel("Column title").first()).toHaveValue("Ideas");
});

test("creates, edits, and deletes a persistent card", async ({ page }) => {
  await signUp(page);
  const column = firstColumn(page);

  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByLabel("New card title").fill("Playwright card");
  await column.getByLabel("New card details").fill("Added via e2e.");
  await column.getByLabel("New card priority").selectOption("high");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/cards") &&
        response.request().method() === "POST"
    ),
    column.getByRole("button", { name: /add card/i }).click(),
  ]);

  await page.reload();
  await expect(column.getByText("Playwright card")).toBeVisible();
  await expect(
    column.getByLabel("Priority High").first()
  ).toBeVisible();

  await column.getByRole("button", { name: "Edit Playwright card" }).click();
  await column.getByLabel("Card title").fill("Edited Playwright card");
  await column.getByLabel("Card due date").fill("2027-03-04");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/cards/") &&
        response.request().method() === "PATCH"
    ),
    column.getByRole("button", { name: "Save" }).click(),
  ]);

  await page.reload();
  await expect(column.getByText("Edited Playwright card")).toBeVisible();
  await expect(column.getByLabel(/^Due 2027-03-04/)).toBeVisible();

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/cards/") &&
        response.request().method() === "DELETE"
    ),
    column
      .locator('button[aria-label="Delete Edited Playwright card"]')
      .click(),
  ]);

  await page.reload();
  await expect(column.getByText("Edited Playwright card")).toHaveCount(0);
});

test("filters the board by search text", async ({ page }) => {
  await signUp(page);

  await page.getByLabel("Search cards").fill("roadmap");

  await expect(page.getByText("Align roadmap themes")).toBeVisible();
  await expect(page.getByText("Gather customer signals")).toHaveCount(0);
  await expect(page.getByText("1 match")).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByText("Gather customer signals")).toBeVisible();
});

test("adds a column and sets a work-in-progress limit", async ({ page }) => {
  await signUp(page);

  await page.getByRole("button", { name: "Add a column" }).click();
  await page.getByLabel("New column title").fill("Blocked");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(6);

  await page.getByRole("button", { name: /Column options for Blocked/i }).click();
  await page.getByLabel("Work-in-progress limit for Blocked").fill("2");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await page.reload();
  await expect(page.getByLabel(/0 of 2 cards/)).toBeVisible();
});

test("moves a card between columns by dragging", async ({ page }) => {
  await signUp(page);
  const card = page.getByText("Align roadmap themes");
  const dragHandle = page.getByRole("button", {
    name: "Drag Align roadmap themes",
  });
  const targetColumn = page.getByTestId("column-col-review");
  await expect(card).toBeVisible();

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
  await page.mouse.move(columnBox.x + columnBox.width / 2, columnBox.y + 120, {
    steps: 12,
  });
  const moveResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/move") && response.request().method() === "POST"
  );
  await page.mouse.up();
  await moveResponse;

  await expect(targetColumn.getByText("Align roadmap themes")).toBeVisible();
  await page.reload();
  await expect(
    page.getByTestId("column-col-review").getByText("Align roadmap themes")
  ).toBeVisible();
});
