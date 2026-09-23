import { expect, test, type Page } from "@playwright/test";

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function signUp(page: Page, name: string) {
  const email = `${name.toLowerCase()}-${unique()}@relay.test`;
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByRole("heading", { name: "Your workspaces" })).toBeVisible();
  return email;
}

test("create a workspace, board and card, then comment on it", async ({ page }) => {
  await signUp(page, "Ada");

  await page.getByLabel("New workspace name").fill("Acme");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("heading", { name: "Acme" })).toBeVisible();

  await page.getByLabel("New board name").fill("Launch");
  await page.getByRole("button", { name: "Create board" }).click();
  await expect(page.getByRole("heading", { name: "Launch" })).toBeVisible();
  await expect(page.getByTestId("column-To do")).toBeVisible();

  await page.getByLabel("Add card to To do").fill("Write the README");
  await page.keyboard.press("Enter");
  const card = page.getByTestId("column-To do").getByText("Write the README");
  await expect(card).toBeVisible();

  await card.click();
  await page.getByLabel("Comment").fill("Starting on this today");
  await page.getByRole("button", { name: "Comment" }).click();
  await expect(page.getByRole("dialog").getByText("Starting on this today", { exact: true })).toBeVisible();
});

test("changes appear live for a second user on the same board", async ({ browser }) => {
  const alice = await browser.newPage();
  await signUp(alice, "Alice");
  await alice.getByLabel("New workspace name").fill("Team");
  await alice.getByRole("button", { name: "Create workspace" }).click();
  const bobPage = await browser.newPage();
  const bobEmail = await signUp(bobPage, "Bob");

  await alice.getByLabel("Invite email").fill(bobEmail);
  await alice.getByRole("button", { name: "Add member" }).click();
  await expect(alice.getByText(bobEmail)).toBeVisible();

  await alice.getByLabel("New board name").fill("Sprint");
  await alice.getByRole("button", { name: "Create board" }).click();
  await expect(alice.getByRole("heading", { name: "Sprint" })).toBeVisible();

  await bobPage.goto(alice.url());
  await expect(bobPage.getByRole("heading", { name: "Sprint" })).toBeVisible();
  await expect(alice.getByText("2 online")).toBeVisible();

  await alice.getByLabel("Add card to To do").fill("Live card");
  await alice.keyboard.press("Enter");
  await expect(bobPage.getByTestId("column-To do").getByText("Live card")).toBeVisible();
});
