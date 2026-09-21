import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import {
  createProduction,
  createStudio,
  trackErrors,
  uniqueEmail,
  PASSWORD,
  showShotsTable,
} from "./helpers";

/**
 * Run as a real account instead of a throwaway owner when E2E_EMAIL and
 * E2E_PASSWORD are set (the credentials never live in the repo): sign in,
 * or sign up with them on a fresh local deployment, and reuse the account's
 * studio when it already has one.
 */
const ENV_EMAIL = process.env.E2E_EMAIL;
const ENV_PASSWORD = process.env.E2E_PASSWORD;

async function signInWithPassword(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Sign in" }).click();
  const landed = await page
    .waitForURL("**/", { timeout: 25_000 })
    .then(() => true)
    .catch(() => false);
  if (landed) return;
  // Unknown on this deployment: create it with the same credentials.
  await page.getByText("New here? Create an account").click();
  await expect(page.locator("#name")).toBeVisible({ timeout: 5_000 });
  await page.fill("#name", email.split("@")[0]);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/", { timeout: 25_000 });
}

/**
 * The wizard suggests the production code from the name's initials and codes
 * are unique per studio, so a persistent account (E2E_EMAIL) would collide on
 * its second run — vary the initials with a per-run tag.
 */
function uniqueProductionName(prefix: string): string {
  const tag = Date.now()
    .toString(36)
    .slice(-5)
    .split("")
    .reverse()
    .join(" ")
    .toUpperCase();
  return `${prefix} ${tag}`;
}

/** Create the studio when the account has none; otherwise use the existing one. */
async function ensureStudio(page: Page, name: string) {
  const studioField = page.locator("#studio-name");
  const home = page.getByText("Productions").first();
  await expect(studioField.or(home)).toBeVisible({ timeout: 20_000 });
  if (await studioField.isVisible()) await createStudio(page, name);
}

/**
 * Local hardened replacement for helpers.signUp — that helper has two flake
 * modes under a busy dev server (both observed while building this suite):
 *  1. it clicks "New here? Create an account" before React hydration, the
 *     click is swallowed and the #name field never appears;
 *  2. the sign-up submit itself occasionally hangs with the button stuck
 *     disabled; a reload followed by signing in (or a fresh attempt) recovers.
 */
async function signUpRobust(page: Page, name: string, email: string) {
  await page.goto("/sign-in");
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!(await page.locator("#name").isVisible())) {
      await page
        .getByText("New here? Create an account")
        .click({ timeout: 5_000 })
        .catch(() => {});
      const appeared = await page
        .locator("#name")
        .waitFor({ state: "visible", timeout: 2_000 })
        .then(() => true)
        .catch(() => false);
      if (!appeared) continue;
    }
    await page.fill("#name", name);
    await page.fill("#email", email);
    await page.fill("#password", PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    try {
      await page.waitForURL("**/", { timeout: 25_000 });
      return;
    } catch {
      // Submit hung. Reload; if the account did get created, sign in works.
      await page.reload();
      const signedIn = await page
        .fill("#email", email, { timeout: 5_000 })
        .then(async () => {
          await page.fill("#password", PASSWORD);
          await page.getByRole("button", { name: "Sign in" }).click();
          await page.waitForURL("**/", { timeout: 15_000 });
          return true;
        })
        .catch(() => false);
      if (signedIn) return;
      await page.goto("/sign-in");
    }
  }
  throw new Error(`sign-up for ${email} did not complete`);
}

/**
 * Shots list: bulk paste-create, single create (button + N hotkey), URL-driven
 * filters (incl. malformed-param regression), inline status / due-date edits,
 * the no-pick→Approved invariant and the table/grid toggle.
 *
 * One throwaway owner/studio/production shared by the whole serial suite.
 */

const CODES = Array.from(
  { length: 12 },
  (_, i) => `SC010_SH${String((i + 1) * 10).padStart(3, "0")}`,
);

test.describe.serial("shots list", () => {
  let context: BrowserContext;
  let page: Page;
  let errors: string[];
  let base: string;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(120_000);
    context = await browser.newContext();
    page = await context.newPage();
    errors = trackErrors(page);
    if (ENV_EMAIL && ENV_PASSWORD) {
      await signInWithPassword(page, ENV_EMAIL, ENV_PASSWORD);
      await ensureStudio(page, "Shots E2E Studio");
    } else {
      await signUpRobust(page, "Sasha Shotlist", uniqueEmail("shots-owner"));
      await createStudio(page, "Shots E2E Studio");
    }
    base = await createProduction(page, uniqueProductionName("Shots E2E"));
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("bulk-creates 12 shots from one paste, toast mentions the count", async () => {
    await page.goto(`${base}/shots`);
    // Fresh production → the New shots panel is inline in the empty state
    // (v2 item d) on its Generate tab; the paste lives on the Import tab.
    await page.getByRole("tab", { name: "Import" }).click();
    const textarea = page.getByLabel("Shot codes");
    await expect(textarea).toBeVisible();
    await textarea.fill(CODES.join("\n"));
    await page.getByRole("button", { name: "Create 12 shots" }).click();

    await expect(page.getByText("Created 12 shots")).toBeVisible();
    await showShotsTable(page);
    for (const code of CODES) {
      await expect(page.getByRole("link", { name: code })).toBeVisible();
    }
    await expect(page.locator("tbody tr")).toHaveCount(12);
  });

  test("re-pasting the same codes marks them all as existing", async () => {
    await page.goto(`${base}/shots`);
    await page.getByRole("button", { name: "More ways to add shots" }).click();
    await page.getByRole("menuitem", { name: "Import list…" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("tab", { name: "Import" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // One code per line: a comma-separated line is one ROW of columns now.
    await dialog.getByLabel("Shot codes").fill(CODES.join("\n"));

    // The preview is the verdict now: nothing to create, all 12 skipped.
    await expect(dialog.getByText("Create 0 shots · 12 skipped")).toBeVisible();
    await expect(dialog.getByText("exists (skip)")).toHaveCount(12);
    await expect(
      dialog.getByRole("button", { name: "Create 0 shots" }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("tbody tr")).toHaveCount(12);
  });

  test("Single shot… creates a shot with a title", async () => {
    await page.goto(`${base}/shots`);
    await page.getByRole("button", { name: "More ways to add shots" }).click();
    await page.getByRole("menuitem", { name: "Single shot…" }).click();
    await expect(
      page.getByRole("heading", { name: "New shot", exact: true }),
    ).toBeVisible();
    await page.locator("#new-shot-code").fill("SC020_SH010");
    await page.locator("#new-shot-title").fill("Hero close-up");
    await page.getByRole("button", { name: "Create shot" }).click();

    await expect(page.getByText("Created SC020_SH010")).toBeVisible();
    const row = page.locator("tbody tr").filter({ hasText: "SC020_SH010" });
    await expect(row).toBeVisible();
    await expect(row.getByText("Hero close-up")).toBeVisible();
  });

  test("N hotkey opens the New shots dialog; Single shot… inserts one", async () => {
    await page.goto(`${base}/shots`);
    await expect(page.getByRole("link", { name: "SC020_SH010" })).toBeVisible();
    await page.keyboard.press("n");
    await expect(
      page.getByRole("heading", { name: "New shots" }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("tab", { name: "Generate" }),
    ).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "More ways to add shots" }).click();
    await page.getByRole("menuitem", { name: "Single shot…" }).click();
    await expect(
      page.getByRole("heading", { name: "New shot", exact: true }),
    ).toBeVisible();
    await page.locator("#new-shot-code").fill("SC020_SH020");
    await page.getByRole("button", { name: "Create shot" }).click();
    await expect(page.getByText("Created SC020_SH020")).toBeVisible();
    await expect(page.getByRole("link", { name: "SC020_SH020" })).toBeVisible();
  });

  test("inline status change planned → generating sticks", async () => {
    await page.goto(`${base}/shots`);
    const trigger = page.getByLabel("Change status of SC010_SH010");
    await expect(trigger).toContainText("Planned");
    await trigger.click();
    await page.getByRole("option", { name: "Generating" }).click();
    await expect(trigger).toContainText("Generating");
    await page.reload();
    await expect(
      page.getByLabel("Change status of SC010_SH010"),
    ).toContainText("Generating");
  });

  test("status filter writes the URL and combines with the stage filter", async () => {
    await page.goto(`${base}/shots`);
    await expect(page.locator("tbody tr")).toHaveCount(14);

    await page
      .locator('[data-slot="select-trigger"]')
      .filter({ hasText: "Status" })
      .click();
    await page.getByRole("option", { name: "Generating" }).click();
    await expect(page).toHaveURL(/status=generating/);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "SC010_SH010" })).toBeVisible();

    await page
      .locator('[data-slot="select-trigger"]')
      .filter({ hasText: "Stage" })
      .click();
    await page.getByRole("option", { name: "Production", exact: true }).click();
    await expect(page).toHaveURL(/status=generating/);
    await expect(page).toHaveURL(/stage=production/);
    await expect(page.locator("tbody tr")).toHaveCount(1);

    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page).not.toHaveURL(/status=/);
    await expect(page.locator("tbody tr")).toHaveCount(14);
  });

  test("deep-linking a filtered URL renders the filtered table", async () => {
    await page.goto(`${base}/shots?status=generating&stage=production`);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "SC010_SH010" })).toBeVisible();
    // The status filter trigger (first select on the page — the filters row
    // sits above the table) reflects the deep-linked value.
    await expect(
      page
        .locator('[data-slot="select-trigger"]')
        .filter({ hasText: "Generating" })
        .first(),
    ).toBeVisible();
  });

  test("malformed ?scene= URL does not crash the page (regression)", async () => {
    await page.goto(`${base}/shots?scene=garbage`);
    await expect(
      page.getByText("No shots match these filters."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(14);
  });

  test("moving a no-pick shot to Approved is refused, status unchanged", async () => {
    await page.goto(`${base}/shots`);
    const trigger = page.getByLabel("Change status of SC010_SH020");
    await expect(trigger).toContainText("Planned");
    await trigger.click();
    await page.getByRole("option", { name: "Approved" }).click();
    await expect(
      page.getByText(/Pick a version before approving/),
    ).toBeVisible();
    await expect(trigger).toContainText("Planned");
    await page.reload();
    await expect(
      page.getByLabel("Change status of SC010_SH020"),
    ).toContainText("Planned");
  });

  test("due date can be set to tomorrow and cleared again (regression)", async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await page.goto(`${base}/shots`);
    const row = page.locator("tbody tr").filter({ hasText: "SC010_SH030" });
    const cellButton = row.getByLabel("Set due date for SC010_SH030");

    await cellButton.click();
    const dateInput = row.locator('input[type="date"]');
    await dateInput.fill(tomorrow);
    await dateInput.press("Escape");
    await expect(cellButton).toHaveText(tomorrow);

    // Clear it again through the same input.
    await cellButton.click();
    await row.locator('input[type="date"]').fill("");
    await row.locator('input[type="date"]').press("Escape");
    await expect(cellButton).toHaveText("Set date");

    await page.reload();
    await expect(
      page
        .locator("tbody tr")
        .filter({ hasText: "SC010_SH030" })
        .getByLabel("Set due date for SC010_SH030"),
    ).toHaveText("Set date");
  });

  test("table/grid toggle persists across reload", async () => {
    await page.goto(`${base}/shots`);
    await expect(page.locator("table")).toBeVisible();
    await page.getByRole("button", { name: "Grid view" }).click();
    await expect(
      page.getByRole("button", { name: "Grid view" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("table")).toHaveCount(0);

    await page.reload();
    await expect(
      page.getByRole("button", { name: "Grid view" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("table")).toHaveCount(0);

    // Back to table for anyone reusing this account later.
    await page.getByRole("button", { name: "Table view" }).click();
    await expect(page.locator("table")).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Table view" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("no unexpected page errors surfaced during the suite", () => {
    expect(errors).toEqual([]);
  });
});
