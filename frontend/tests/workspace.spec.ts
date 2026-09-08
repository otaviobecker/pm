import { expect, test } from "@playwright/test";
import { firstColumn, signUp } from "./helpers";

test("records board history and shows it", async ({ page }) => {
  await signUp(page);

  await firstColumn(page).getByRole("button", { name: /add a card/i }).click();
  await firstColumn(page).getByLabel("New card title").fill("Write the brief");
  await firstColumn(page).getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn(page).getByText("Write the brief")).toBeVisible();

  await page.getByRole("button", { name: "Open Write the brief" }).click();
  const card = page.getByRole("dialog", { name: "Write the brief" });
  await card.getByLabel("New comment").fill("Starting on this");
  await card.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(card.getByText("Starting on this")).toBeVisible();
  await card.getByRole("button", { name: "Close dialog" }).click();

  await page.getByRole("button", { name: "Board history" }).click();
  const history = page.getByRole("dialog", { name: /history of/i });

  await expect(history.getByTestId("activity-feed")).toContainText(
    "commented on Write the brief"
  );
  await expect(history.getByTestId("activity-feed")).toContainText(
    "added Write the brief"
  );
});

test("collects assigned cards across boards", async ({ page }) => {
  const username = await signUp(page);

  // Assign a card on the starter board.
  await page.getByRole("button", { name: "Open Align roadmap themes" }).click();
  const card = page.getByRole("dialog", { name: "Align roadmap themes" });
  await card.getByRole("button", { name: "Edit card" }).click();
  await card.getByLabel("Card assignee").selectOption({ label: `Tester ${username}` });
  await card.getByLabel("Card due date").fill("2026-01-01");
  await card.getByRole("button", { name: "Save card" }).click();
  await card.getByRole("button", { name: "Close dialog" }).click();

  // And one on a second board.
  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("Board name").fill("Roadmap");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "Roadmap" })).toBeVisible();

  await firstColumn(page).getByRole("button", { name: /add a card/i }).click();
  await firstColumn(page).getByLabel("New card title").fill("Plan the quarter");
  await firstColumn(page).getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn(page).getByText("Plan the quarter")).toBeVisible();

  // A board with a single member hides the new-card assignee picker, so this
  // one gets its assignee from the card itself.
  await page.getByRole("button", { name: "Open Plan the quarter" }).click();
  const planned = page.getByRole("dialog", { name: "Plan the quarter" });
  await planned.getByRole("button", { name: "Edit card" }).click();
  await planned
    .getByLabel("Card assignee")
    .selectOption({ label: `Tester ${username}` });
  await planned.getByRole("button", { name: "Save card" }).click();
  await planned.getByRole("button", { name: "Close dialog" }).click();

  await page.getByTestId("my-work-link").click();

  const work = page.getByTestId("my-work");
  await expect(work).toContainText("Align roadmap themes");
  await expect(work).toContainText("Plan the quarter");
  await expect(work).toContainText("Kanban Studio · Backlog");
  await expect(work).toContainText("Roadmap · Backlog");
  await expect(page.getByRole("heading", { name: "Overdue" })).toBeVisible();

  // Opening from the list jumps to the card on its own board.
  await work.getByRole("button", { name: /Plan the quarter/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Plan the quarter" })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Roadmap" })).toBeVisible();
});

test("shows an empty state when nothing is assigned", async ({ page }) => {
  await signUp(page);

  await page.getByTestId("my-work-link").click();

  await expect(page.getByText(/nothing assigned to you/i)).toBeVisible();
});
