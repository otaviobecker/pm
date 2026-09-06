import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("creates a second board and switches between them", async ({ page }) => {
  await signUp(page);

  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("Board name").fill("Roadmap");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByRole("heading", { name: "Roadmap" })).toBeVisible();
  // A brand-new board starts empty, with the default columns.
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(page.getByText("0 of 0 done")).toBeVisible();

  await page
    .getByTestId("board-rail")
    .getByRole("button", { name: /Kanban Studio/ })
    .click();
  await expect(page.getByText("2 of 8 done")).toBeVisible();
});

test("remembers the open board across a reload", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("Board name").fill("Retention");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "Retention" })).toBeVisible();

  await page.reload();

  await expect(page.getByRole("heading", { name: "Retention" })).toBeVisible();
});

test("renames a board from its settings", async ({ page }) => {
  await signUp(page);

  await page.getByRole("button", { name: "Board settings" }).click();
  await page.getByLabel("Board name").fill("Q3 delivery");
  await page.getByRole("button", { name: "Save board" }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();

  await expect(page.getByRole("heading", { name: "Q3 delivery" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Q3 delivery" })).toBeVisible();
});

test("archives and restores a board", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("Board name").fill("Later");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "Later" })).toBeVisible();

  await page.getByRole("button", { name: "Board settings" }).click();
  await page.getByRole("button", { name: "Archive board" }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();

  await expect(page.getByTestId("board-rail")).not.toContainText("Later");
  await page.getByRole("button", { name: "Show archived" }).click();
  await expect(page.getByTestId("board-rail")).toContainText("Later");
});

test("deletes a board", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("Board name").fill("Scratch");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "Scratch" })).toBeVisible();

  await page.getByRole("button", { name: "Board settings" }).click();
  await page.getByRole("button", { name: "Delete board", exact: true }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();

  await expect(page.getByTestId("board-rail")).not.toContainText("Scratch");
});

test("shares a board with another account as a viewer", async ({
  page,
  browser,
}) => {
  await signUp(page, "owner");
  const context = await browser.newContext();
  const collaborator = await context.newPage();
  const guest = await signUp(collaborator, "guest");

  // Give the shared board a name the guest cannot confuse with their own.
  await page.bringToFront();
  await page.getByRole("button", { name: "Board settings" }).click();
  await page.getByLabel("Board name").fill("Shared plan");
  await page.getByRole("button", { name: "Save board" }).click();
  await page.getByLabel("Invite by username").fill(guest);
  await page.getByLabel("Invite role").selectOption("viewer");
  await page.getByRole("button", { name: "Invite" }).click();
  await expect(page.getByRole("dialog")).toContainText(`@${guest}`);

  // The guest is already signed in; a reload picks up the newly shared board.
  await collaborator.reload();
  await expect(
    collaborator.locator('[data-testid^="board-option-"]')
  ).toHaveCount(2);
  await collaborator
    .getByTestId("board-rail")
    .getByRole("button", { name: /Shared plan/ })
    .click();

  await expect(
    collaborator.getByRole("heading", { name: "Shared plan" })
  ).toBeVisible();
  // Viewers see the cards but none of the editing affordances.
  await expect(collaborator.getByText("Align roadmap themes")).toBeVisible();
  await expect(
    collaborator.getByRole("button", { name: /add a card/i })
  ).toHaveCount(0);
  await context.close();
});
