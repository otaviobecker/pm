import { expect, type Page } from "@playwright/test";

export const PASSWORD = "correct-horse-battery";

let counter = 0;

/** A username that is unique across parallel runs and repeated runs of the suite. */
export const uniqueUsername = (prefix = "e2e") => {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}`;
};

/** Register a fresh account so each test owns its own starter board. */
export const signUp = async (page: Page, prefix = "e2e") => {
  const username = uniqueUsername(prefix);
  await page.goto("/");
  await page.getByRole("button", { name: "Create one" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Display name").fill(`Tester ${username}`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("heading", { name: "Kanban Studio" })
  ).toBeVisible();
  return username;
};

export const signIn = async (page: Page, username: string) => {
  await page.goto("/");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Kanban Studio" })
  ).toBeVisible();
};

export const firstColumn = (page: Page) =>
  page.locator('[data-testid^="column-"]').first();
