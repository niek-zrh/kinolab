import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  createProduction,
  createStudio,
  gotoStable,
  signUp,
  trackErrors,
  uniqueEmail,
  uploadOptions,
} from "./helpers";

/**
 * Generation details (spec v2 item c): the "Edit details" dialog on an
 * option card saves tool / model / prompt / seed / params through
 * versions.updateMeta, the tool badge appears on the card, the Review Room
 * rail shows the same details under "Generation details" (Copy copies the
 * prompt), and an artist sees Edit only on their own upload.
 */

const SHOT = "GD010_SH010";
const TOOL = "Midjourney";
const MODEL = "v6.1";
const SEED = "82931";
const PARAMS = "--ar 16:9 --stylize 250";
const PROMPT_LINE_1 = "wide shot, dusk, rain-soaked street, neon reflections";
const PROMPT = `${PROMPT_LINE_1}\nhero walks toward camera, "no umbrella", 35mm`;
const ARTIST_NAME = "Arlo Artist";
const ARTIST_TOOL = "Runway";

/**
 * The owner account. With KINOLAB_E2E_EMAIL / KINOLAB_E2E_PASSWORD set the
 * suite runs as that person's own account (signing it up on this deployment
 * the first time, signing in afterwards); otherwise it creates a throwaway
 * owner like every other spec. Credentials never live in the repo.
 */
const OWNER_EMAIL = process.env.KINOLAB_E2E_EMAIL;
const OWNER_PASSWORD = process.env.KINOLAB_E2E_PASSWORD;
const OWNER_FALLBACK_NAME = "Gemma Generator";
/** Name used only when the persistent account has to be created here. */
const OWNER_ACCOUNT_NAME = "Niek";

async function landed(page: Page, timeout: number): Promise<boolean> {
  return page
    .waitForURL("**/", { timeout })
    .then(() => true)
    .catch(() => false);
}

/** Sign in as a persistent account, creating it on this deployment if needed. */
async function signInOrUp(
  page: Page,
  account: { email: string; password: string; name: string },
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await gotoStable(page, "/sign-in");
    await page.locator("#email").waitFor({ timeout: 20_000 });
    await page.fill("#email", account.email);
    await page.fill("#password", account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    if (await landed(page, 20_000)) return;
    // Not on this deployment yet — create it with the same credentials.
    await page
      .getByText("New here? Create an account")
      .click({ timeout: 5_000 })
      .catch(() => undefined);
    const form = await page
      .locator("#name")
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (!form) continue;
    await page.fill("#name", account.name);
    await page.fill("#email", account.email);
    await page.fill("#password", account.password);
    await page.getByRole("button", { name: "Create account" }).click();
    if (await landed(page, 45_000)) return;
  }
  throw new Error(`could not sign in or create ${account.email}`);
}

/** A persistent account already has a studio after its first run. */
async function ensureStudio(page: Page, name: string) {
  const studioField = page.locator("#studio-name");
  const home = page.getByText("Productions").first();
  await expect(studioField.or(home)).toBeVisible({ timeout: 20_000 });
  if (await studioField.isVisible()) await createStudio(page, name);
}

/** The display name the app uses for the signed-in account (activity, cards). */
async function readAccountName(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Account" }).click();
  const label = page.locator('[data-slot="dropdown-menu-label"]').first();
  await expect(label).toBeVisible();
  const name = (await label.locator("div").first().innerText()).trim();
  await page.keyboard.press("Escape");
  await expect(label).toBeHidden();
  return name;
}

/** Signs the owner in (own account or throwaway) and returns their name. */
async function setUpOwner(page: Page): Promise<string> {
  if (OWNER_EMAIL && OWNER_PASSWORD) {
    await signInOrUp(page, {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
      name: OWNER_ACCOUNT_NAME,
    });
    await ensureStudio(page, "Generation Details Studio");
    return readAccountName(page);
  }
  await signUp(page, OWNER_FALLBACK_NAME, uniqueEmail("gendetails-owner"));
  await createStudio(page, "Generation Details Studio");
  return OWNER_FALLBACK_NAME;
}

/**
 * Local replacement for helpers.inviteMember (same reason as shot-detail.spec:
 * the invite dialog's Role label has no control association, so the shared
 * helper's label lookup never resolves).
 */
async function inviteMemberLocal(page: Page, email: string, roleLabel: string) {
  await gotoStable(page, "/team");
  await page.getByRole("button", { name: "Invite member" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#invite-email").fill(email);
  await dialog.locator('[data-slot="select-trigger"]').first().click();
  await page.getByRole("option", { name: roleLabel }).click();
  await dialog.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(page.getByText(email).first()).toBeVisible({ timeout: 10_000 });
}

const PNG_GREEN =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAG0lEQVR4nGNk+M/wn4GBgYGJAQYwMTAwMAAAJgIBFQnZ0dEAAAAASUVORK5CYII=";

/**
 * Production codes are unique per studio and a persistent account keeps its
 * studio between runs, so every run names its production with a fresh tag
 * (the wizard derives the code from the initials: "GDK7Q2").
 */
function uniqueProductionName(prefix: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const tag = Array.from(
    { length: 4 },
    () => chars[Math.floor(Math.random() * chars.length)],
  );
  return `${prefix} ${tag.join(" ")}`;
}

/**
 * Local copy of helpers.bulkCreateShots ("New shots" › Import, v2 item d)
 * scoped to the Import tab panel: both tab panels can be mounted at once, and
 * an unscoped `Create N shots` lookup then matches the Generate tab's button
 * too (strict-mode violation).
 */
async function createShotsViaImport(page: Page, base: string, codes: string[]) {
  await gotoStable(page, `${base}/shots`);
  const openButton = page.getByRole("button", { name: "New shots", exact: true });
  try {
    await openButton.waitFor({ timeout: 20_000 });
  } catch {
    await page.reload(); // recover from a mid-compile chunk error / skeleton shell
    await openButton.waitFor({ timeout: 20_000 });
  }
  await openButton.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Import" }).click();
  const panel = dialog.getByRole("tabpanel", { name: "Import" });
  await panel.getByLabel("Shot codes").fill(codes.join("\n"));
  await panel.getByRole("button", { name: /^Create \d+ shots?$/ }).click();
  await dialog.waitFor({ state: "detached", timeout: 10_000 });
  await expect(page.getByText(codes[codes.length - 1]).first()).toBeVisible({
    timeout: 15_000,
  });
}

function card(page: Page, index: number) {
  return page.locator('[data-slot="card"]').filter({ hasText: `v${index} ·` });
}

test.describe.serial("generation details", () => {
  let context: BrowserContext;
  let page: Page;
  let errors: string[] = [];
  let ownerName = "";
  let base = "";
  let shotPath = "";
  let shotId = "";
  let artistContext: BrowserContext | undefined;
  const artistEmail = uniqueEmail("gendetails-artist");

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(180_000);
    context = await browser.newContext();
    page = await context.newPage();
    errors = trackErrors(page);
    ownerName = await setUpOwner(page);
    base = await createProduction(
      page,
      uniqueProductionName("Generation Details"),
    );
    await createShotsViaImport(page, base, [SHOT]);
    await page.getByRole("link", { name: SHOT }).click();
    await page.waitForURL(/\/shots\/[a-z0-9]+$/);
    shotPath = new URL(page.url()).pathname;
    shotId = shotPath.match(/\/shots\/([a-z0-9]+)$/)![1];
    await uploadOptions(page, 2);
  });

  test.afterAll(async () => {
    await artistContext?.close();
    await context?.close();
  });

  test("Edit details on v1 saves tool, model, prompt, seed and params; the tool badge appears", async () => {
    await gotoStable(page, shotPath);
    const v1 = card(page, 1);
    await expect(v1).toBeVisible({ timeout: 20_000 });
    await v1.getByRole("button", { name: "Edit details" }).click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: /Generation details/ }),
    ).toBeVisible();
    await expect(
      dialog.getByText("so anyone can regenerate this option"),
    ).toBeVisible();
    await dialog.locator("#gd-tool").fill(TOOL);
    await dialog.locator("#gd-model").fill(MODEL);
    await dialog.locator("#gd-prompt").fill(PROMPT);
    await dialog.locator("#gd-seed").fill(SEED);
    await dialog.locator("#gd-params").fill(PARAMS);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Details saved").first()).toBeVisible();
    await expect(dialog).toBeHidden();

    // The tool badge on v1 only — v2 stays untouched.
    await expect(v1.getByText(TOOL, { exact: true })).toBeVisible();
    await expect(card(page, 2).getByText(TOOL, { exact: true })).toHaveCount(0);

    // Reopening shows what was saved (params included — the field the old
    // upload popover never had).
    await v1.getByRole("button", { name: "Edit details" }).click();
    await expect(dialog.locator("#gd-tool")).toHaveValue(TOOL);
    await expect(dialog.locator("#gd-model")).toHaveValue(MODEL);
    await expect(dialog.locator("#gd-prompt")).toHaveValue(PROMPT);
    await expect(dialog.locator("#gd-seed")).toHaveValue(SEED);
    await expect(dialog.locator("#gd-params")).toHaveValue(PARAMS);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("the edit is logged in the shot's history", async () => {
    await page.getByRole("tab", { name: "History" }).click();
    await expect(
      page.getByText(
        new RegExp(`${ownerName} updated details on v1 of ${SHOT}`),
      ),
    ).toBeVisible();
  });

  test("the Review Room rail shows the details under 'Generation details'; Copy copies the prompt", async () => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await gotoStable(page, `${base}/review/${shotId}`);
    await expect(
      page.getByRole("heading", { name: "Generation details" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(PROMPT_LINE_1)).toBeVisible();
    await expect(page.getByText(TOOL, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(MODEL, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(SEED, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(PARAMS, { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Copy prompt" }).click();
    await expect(page.getByText("Prompt copied").first()).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(PROMPT);

    // The rail's Edit button opens the same dialog, prefilled.
    await page.getByRole("button", { name: "Edit details" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("#gd-model")).toHaveValue(MODEL);
    await dialog.locator("#gd-model").fill(`${MODEL} raw`);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Details saved").first()).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByText(`${MODEL} raw`, { exact: true }).first(),
    ).toBeVisible();
    // Saving never left the room.
    expect(new URL(page.url()).pathname).toBe(`${base}/review/${shotId}`);
  });

  test("an artist sees Edit details only on their own upload", async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    await inviteMemberLocal(page, artistEmail, "Artist");
    artistContext = await browser.newContext();
    const artistPage = await artistContext.newPage();
    await signUp(artistPage, ARTIST_NAME, artistEmail);

    await gotoStable(artistPage, shotPath);
    await expect(
      artistPage.getByRole("heading", { name: SHOT }),
    ).toBeVisible({ timeout: 20_000 });
    await artistPage
      .locator('input[type="file"]')
      .first()
      .setInputFiles([
        {
          name: "artist-option.png",
          mimeType: "image/png",
          buffer: Buffer.from(PNG_GREEN, "base64"),
        },
      ]);
    const v3 = card(artistPage, 3);
    await expect(v3).toBeVisible({ timeout: 30_000 });

    // Own upload: editable. The owner's v1/v2: no Edit button at all.
    await expect(v3.getByRole("button", { name: "Edit details" })).toBeVisible();
    await expect(
      card(artistPage, 1).getByRole("button", { name: "Edit details" }),
    ).toHaveCount(0);
    await expect(
      card(artistPage, 2).getByRole("button", { name: "Edit details" }),
    ).toHaveCount(0);

    await v3.getByRole("button", { name: "Edit details" }).click();
    const dialog = artistPage.getByRole("dialog");
    await dialog.locator("#gd-tool").fill(ARTIST_TOOL);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(artistPage.getByText("Details saved").first()).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(v3.getByText(ARTIST_TOOL, { exact: true })).toBeVisible();

    // The owner (content.edit) can edit everyone's, the artist's included.
    await gotoStable(page, shotPath);
    await expect(
      card(page, 3).getByRole("button", { name: "Edit details" }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("no unexpected page errors surfaced during the suite", () => {
    expect(errors).toEqual([]);
  });
});
