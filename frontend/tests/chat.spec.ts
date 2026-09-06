import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("holds a session-only AI conversation", async ({ page }) => {
  await signUp(page);
  await page.route("**/api/boards/*/chat", async (route) => {
    await route.fulfill({
      json: { message: "Focus on the review column.", board: null },
    });
  });

  await page.getByRole("button", { name: "Ask AI" }).click();
  await page
    .getByLabel("Message the board assistant")
    .fill("What should I focus on?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Focus on the review column.")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Ask AI" }).click();
  await expect(page.getByText("Focus on the review column.")).toHaveCount(0);
});

test("applies a board returned by the assistant", async ({ page }) => {
  await signUp(page);
  const board = await page.evaluate(async () => {
    const boards = await (await fetch("/api/boards")).json();
    const response = await fetch(`/api/boards/${boards[0].id}`);
    return response.json();
  });
  const renamedCardId = board.columns[0].cardIds[0];
  board.cards[renamedCardId].title = "Renamed by the assistant";

  await page.route("**/api/boards/*/chat", async (route) => {
    await route.fulfill({ json: { message: "Renamed one card.", board } });
  });

  await page.getByRole("button", { name: "Ask AI" }).click();
  await page.getByLabel("Message the board assistant").fill("Rename a card");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Renamed one card.")).toBeVisible();
  await expect(page.getByText("Renamed by the assistant")).toBeVisible();
});

test("surfaces an assistant error", async ({ page }) => {
  await signUp(page);
  await page.route("**/api/boards/*/chat", async (route) => {
    await route.fulfill({
      status: 503,
      json: { detail: "OPENROUTER_API_KEY is not configured" },
    });
  });

  await page.getByRole("button", { name: "Ask AI" }).click();
  await page.getByLabel("Message the board assistant").fill("Hello");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(
    page.getByText("OPENROUTER_API_KEY is not configured")
  ).toBeVisible();
});
