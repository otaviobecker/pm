import { expect, test } from "@playwright/test";
import { firstColumn, signUp } from "./helpers";

const openFirstCard = async (page: import("@playwright/test").Page) => {
  await page.getByRole("button", { name: "Open Align roadmap themes" }).click();
  return page.getByRole("dialog", { name: "Align roadmap themes" });
};

test("keeps a checklist and its progress on the card", async ({ page }) => {
  await signUp(page);
  const dialog = await openFirstCard(page);

  // Wait for each item to land: the composer clears itself on success, which
  // would otherwise wipe the next title mid-type.
  await dialog.getByLabel("New checklist item").fill("Draft the themes");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog.getByText("0 of 1")).toBeVisible();

  await dialog.getByLabel("New checklist item").fill("Share with the team");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog.getByText("0 of 2")).toBeVisible();

  // Click rather than check: the box is controlled by the server round trip, so
  // Playwright's own checked-state retry would toggle it back off.
  await dialog.getByRole("checkbox", { name: "Draft the themes" }).click();
  await expect(dialog.getByText("1 of 2")).toBeVisible();
  await expect(
    dialog.getByRole("checkbox", { name: "Draft the themes" })
  ).toBeChecked();

  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    firstColumn(page).getByLabel("Checklist 1 of 2 done")
  ).toBeVisible();

  await page.reload();
  await expect(
    firstColumn(page).getByLabel("Checklist 1 of 2 done")
  ).toBeVisible();
});

test("holds a comment thread on a card", async ({ page }) => {
  await signUp(page);
  const dialog = await openFirstCard(page);

  await dialog.getByLabel("New comment").fill("Blocked on pricing input");
  await dialog.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(dialog.getByText("Blocked on pricing input")).toBeVisible();

  await dialog.getByRole("button", { name: "Edit comment" }).click();
  await dialog.getByLabel("Edit comment body").fill("Unblocked, pricing is in");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByText("Unblocked, pricing is in")).toBeVisible();

  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(firstColumn(page).getByLabel("1 comment")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Open Align roadmap themes" }).click();
  const reopened = page.getByRole("dialog", { name: "Align roadmap themes" });
  await expect(reopened.getByText("Unblocked, pricing is in")).toBeVisible();

  await reopened.getByRole("button", { name: "Delete comment" }).click();
  await expect(reopened.getByText("No comments yet.")).toBeVisible();
});

test("tags a card with a label and filters by it", async ({ page }) => {
  await signUp(page);

  const dialog = await openFirstCard(page);
  await dialog.getByRole("button", { name: "Bug" }).click();
  await expect(dialog.getByRole("button", { name: "Bug" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await dialog.getByRole("button", { name: "Close dialog" }).click();

  await expect(page.getByLabel("Label Bug").first()).toBeVisible();

  await page.getByLabel("Filter by label").selectOption({ label: "Bug" });
  await expect(page.getByText("Align roadmap themes")).toBeVisible();
  await expect(page.getByText("Gather customer signals")).toHaveCount(0);
  await expect(page.getByText("1 match")).toBeVisible();
});

test("manages the board's labels from settings", async ({ page }) => {
  await signUp(page);

  await page.getByRole("button", { name: "Board settings" }).click();
  const settings = page.getByRole("dialog", { name: "Board settings" });
  await settings.getByLabel("New label name").fill("Blocked");
  await settings.getByLabel("New label color").selectOption("navy");
  await settings.getByRole("button", { name: "Add label" }).click();
  await expect(settings.getByLabel("Name for Blocked")).toBeVisible();

  await settings.getByRole("button", { name: "Delete label Chore" }).click();
  await expect(settings.getByLabel("Name for Chore")).toHaveCount(0);

  await settings.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Board settings" }).click();
  await expect(
    page.getByRole("dialog", { name: "Board settings" }).getByLabel("Name for Blocked")
  ).toBeVisible();
});

test("edits a card's fields from its detail view", async ({ page }) => {
  await signUp(page);
  const dialog = await openFirstCard(page);

  await dialog.getByRole("button", { name: "Edit card" }).click();
  await dialog.getByLabel("Card details").fill("Rewritten in the detail view.");
  await dialog.getByLabel("Card priority").selectOption("urgent");
  await dialog.getByRole("button", { name: "Save card" }).click();

  await expect(dialog.getByText("Rewritten in the detail view.")).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog" }).click();

  await page.reload();
  await expect(
    firstColumn(page).getByLabel("Priority Urgent").first()
  ).toBeVisible();
});
