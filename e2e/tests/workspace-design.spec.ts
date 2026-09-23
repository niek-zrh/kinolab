import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import {
  bulkCreateShots,
  createProduction,
  createStudio,
  gotoStable,
  signUp,
  uniqueEmail,
  uploadOptions,
} from "./helpers";

test.describe.configure({ mode: "serial" });
let context: BrowserContext;
let page: Page;
let base: string;
const errors: string[] = [];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  context = await browser.newContext();
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await signUp(page, "Workspace Artist", uniqueEmail("workspace"));
  await createStudio(page, "Workspace Studio");
  base = await createProduction(page, "The Quiet Frame");
});
test.afterAll(async () => {
  await context?.close();
});

test("overview has a clear empty-state identity and real workspace links", async () => {
  await gotoStable(page, base);
  const hero = page.getByRole("region", { name: "Production at a glance" });
  await expect(
    hero.getByRole("heading", { name: "The Quiet Frame" }),
  ).toBeVisible();
  await expect(hero).toContainText("Studio artwork");
  await expect(hero.locator("img")).toHaveAttribute(
    "src",
    "/brand/creative-workbench-v1.jpg",
  );
  await hero.getByRole("link", { name: "Open storyboard" }).click();
  await expect(page).toHaveURL(new RegExp(`${base}/storyboard$`));
});

test("production imagery replaces decorative artwork as work is added", async () => {
  await bulkCreateShots(page, base, ["SC010_SH010"]);
  const shotPath = (await page
    .getByRole("link", { name: "SC010_SH010" })
    .getAttribute("href"))!;
  await gotoStable(page, shotPath);
  await uploadOptions(page, 1);
  await page.getByLabel("Assignee", { exact: true }).click();
  await page.getByRole("option", { name: "Workspace Artist" }).click();
  await expect(page.getByLabel("Assignee", { exact: true })).toContainText(
    "Workspace Artist",
  );
  await gotoStable(page, base);
  const hero = page.getByRole("region", { name: "Production at a glance" });
  await expect(hero).toContainText("Production frame · SC010_SH010");
  await expect(hero.locator("img")).toHaveAttribute("src", /^http/);
});

test("artists can focus assignments and recover an empty filter", async () => {
  await gotoStable(page, `${base}/my-work`);
  const filters = page.getByRole("group", { name: "Filter assignments" });
  await expect(filters).toBeVisible();
  await filters.getByRole("button", { name: /^Settled/ }).click();
  await expect(page.getByText("No assignments in this view.")).toBeVisible();
  await page.getByRole("button", { name: "Show all work" }).click();
  await expect(
    filters.getByRole("button", { name: /^All work/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator("main").getByRole("link").filter({ hasText: "SC010_SH010" }),
  ).toBeVisible();
});

test("contextual assistance previews explain consent and human review, then restore focus", async () => {
  await gotoStable(page, `${base}/references`);
  const trigger = page.getByRole("button", {
    name: "Preview AI assistance: Look development",
  });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Look development", exact: true }),
  ).toBeVisible();
  await expect(dialog).toContainText(
    "No production data is sent to an AI service",
  );
  await expect(dialog).toContainText("Your team decides");
  await expect(dialog.locator("textarea, input")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("AI workspace filters the roadmap and closes same-page detail navigation", async () => {
  await gotoStable(page, `${base}/assistants`);
  await expect(page.getByRole("article")).toHaveCount(6);
  await page
    .getByRole("group", { name: "Assistant workflow" })
    .getByRole("button", { name: "Create", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(2);
  const card = page.getByRole("article", { name: "Character continuity" });
  await card.getByRole("button").click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "See the AI workspace plan" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await card.getByRole("link", { name: "Open characters" }).click();
  await expect(page).toHaveURL(new RegExp(`${base}/characters$`));
});

test("command search offers immediate keyboard workspace navigation", async () => {
  await page.getByRole("button", { name: /Search/ }).click();
  const dialog = page.getByRole("dialog", { name: "Search", exact: true });
  await expect(
    dialog.getByRole("option", { name: /Storyboard/ }),
  ).toBeVisible();
  await dialog.getByRole("combobox").fill("AI workspace");
  await expect(
    dialog.getByRole("option", { name: /AI workspace/ }),
  ).toBeVisible();
  await dialog.getByRole("combobox").press("Enter");
  await expect(page).toHaveURL(new RegExp(`${base}/assistants$`));
});

test("collapsed navigation retains accessible destination names and user preferences", async () => {
  await page
    .getByRole("button", { name: "Collapse menu", exact: true })
    .click();
  const nav = page.getByRole("navigation", { name: "Production workspace" });
  await expect(
    nav.getByRole("link", { name: "AI workspace", exact: true }),
  ).toBeVisible();
  await nav.getByRole("link", { name: "Storyboard", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${base}/storyboard$`));
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Expand menu", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Expand menu", exact: true }).click();
});

test("new workspaces and AI sheets fit mobile without horizontal overflow", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["", "/my-work", "/assistants", "/references"]) {
    await gotoStable(page, base + path);
    await expect(page.locator("main h1")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
  await page
    .getByRole("button", { name: "Preview AI assistance: Look development" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByLabel("Production navigation").selectOption("/assistants");
  await expect(page).toHaveURL(new RegExp(`${base}/assistants$`));
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("artwork loads in both themes with reduced motion and no runtime errors", async () => {
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (value) => localStorage.setItem("kinolab-theme", value),
      theme,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoStable(page, `${base}/assistants`);
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    const art = page.locator('img[src="/brand/assistant-frames-v1.jpg"]');
    await expect
      .poll(() =>
        art.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true);
    await expect(page.getByRole("article")).toHaveCount(6);
  }
  expect(errors).toEqual([]);
});
