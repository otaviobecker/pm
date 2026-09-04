import { expect, test, type Page } from "@playwright/test";

const signIn = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
};

test("holds a session-only AI conversation", async ({ page }) => {
  await signIn(page);
  await page.route("**/api/chat", async (route) => {
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
  await expect(page.getByText("Focus on the review column.")).not.toBeVisible();
});

test("refreshes the board from an AI update", async ({ page }) => {
  await signIn(page);
  const boardResponse = await page.request.get("/api/board");
  const board = await boardResponse.json();
  board.cards["card-1"].title = "AI-updated roadmap";
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      json: { message: "I updated the roadmap card.", board },
    });
  });

  await page.getByRole("button", { name: "Ask AI" }).click();
  await page
    .getByLabel("Message the board assistant")
    .fill("Update the roadmap card");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("I updated the roadmap card.")).toBeVisible();
  await expect(page.getByText("AI-updated roadmap")).toBeVisible();
});

test("supports mobile and keyboard chat interaction", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      json: { message: "Keyboard request received.", board: null },
    });
  });

  await page.getByRole("button", { name: "Ask AI" }).click();
  const input = page.getByLabel("Message the board assistant");
  await input.fill("Keyboard request");
  await input.press("Tab");
  await page.keyboard.press("Enter");

  await expect(page.getByText("Keyboard request received.")).toBeVisible();
  const sidebar = page.getByRole("complementary");
  const box = await sidebar.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(390);
});
