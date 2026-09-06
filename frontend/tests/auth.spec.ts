import { expect, test } from "@playwright/test";
import { PASSWORD, signUp, uniqueUsername } from "./helpers";

test("rejects invalid credentials", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("definitely-wrong");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Invalid username or password.")).toBeVisible();
});

test("registers an account and restores the session after reload", async ({
  page,
}) => {
  await signUp(page);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Kanban Studio" })
  ).toBeVisible();
});

test("refuses a duplicate username", async ({ page }) => {
  const username = await signUp(page);
  await page.getByRole("button", { name: "Account and settings" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();

  await page.getByRole("button", { name: "Create one" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("That username is already taken")).toBeVisible();
});

test("refuses a short password", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create one" }).click();
  await page.getByLabel("Username").fill(uniqueUsername());
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(
    page.getByRole("heading", { name: "Create your account" })
  ).toBeVisible();
});

test("signs out from the account dialog", async ({ page }) => {
  await signUp(page);

  await page.getByRole("button", { name: "Account and settings" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});
