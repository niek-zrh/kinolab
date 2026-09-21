import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  createProduction,
  createStudio,
  gotoLoaded,
  gotoStable,
  trackErrors,
  uniqueEmail,
  PASSWORD,
  showShotsTable,
} from "./helpers";

/**
 * New shots dialog (spec v2 item d: Generate + Import) and the Edit scene
 * sheet (item e, E5). Acceptance tests D1–D7 + E5.
 *
 * One throwaway owner/studio/production shared by the whole serial suite —
 * or, when E2E_EMAIL / E2E_PASSWORD are set, that account (signed in, or
 * signed up with those credentials on a fresh local deployment) and its
 * existing studio. Credentials come from the environment, never the repo.
 */

const ENV_EMAIL = process.env.E2E_EMAIL;
const ENV_PASSWORD = process.env.E2E_PASSWORD;

/** Local hardened sign-up (same flake modes as shots.spec.ts's copy). */
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

/** Sign in as the configured account; sign it up when it does not exist yet. */
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
 * createProduction with recovery (as board.spec.ts): under parallel-agent
 * load the wizard's Drive step can outlive the helper's wait even though the
 * production was created — pick the flow up where it stands, else retry.
 */
async function createProductionResilient(page: Page, name: string): Promise<string> {
  const basePath = () => new URL(page.url()).pathname.match(/^\/p\/[a-z0-9]+/)![0];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await createProduction(page, name);
    } catch {
      // Fall through: see how far the wizard got.
    }
    if (/\/p\/[a-z0-9]+/.test(page.url())) return basePath();
    const skip = page.getByRole("button", { name: /Skip for now/i });
    const open = page.getByRole("button", { name: /Open production/i });
    const skipVisible = await skip
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (skipVisible) await skip.click().catch(() => undefined);
    const openVisible = await open
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (openVisible) {
      await open.click();
      await page.waitForURL(/\/p\/[a-z0-9]+/, { timeout: 30_000 });
      return basePath();
    }
  }
  throw new Error(`production wizard did not complete for ${name}`);
}

/** Local copy of helpers.inviteMember scoped to the dialog (see permissions.spec.ts). */
async function inviteMemberLocal(page: Page, email: string, roleLabel: string) {
  await gotoLoaded(page, "/team");
  await page.getByRole("button", { name: /Invite member/i }).click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.locator("#invite-email").fill(email);
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: roleLabel, exact: true }).click();
  await dialog.getByRole("button", { name: "Invite" }).click();
  await expect(page.getByText(email).first()).toBeVisible({ timeout: 10_000 });
}

async function signUpInvited(
  browser: Browser,
  email: string,
  name: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signUpRobust(page, name, email);
  return { context, page };
}

/** The Scene filter trigger (its textContent carries the icon's hidden glyph, so substring-match). */
const sceneTrigger = (page: Page) =>
  page.locator('[data-slot="select-trigger"]').filter({ hasText: "Scene" });

test.describe.serial("new shots dialog + scene sheet", () => {
  let context: BrowserContext;
  let page: Page;
  let errors: string[];
  let base: string;
  let sceneId: string; // SC020, created in D1
  let artistContext: BrowserContext | undefined;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(120_000);
    context = await browser.newContext();
    page = await context.newPage();
    errors = trackErrors(page);
    if (ENV_EMAIL && ENV_PASSWORD) {
      await signInWithPassword(page, ENV_EMAIL, ENV_PASSWORD);
      await ensureStudio(page, "Import E2E Studio");
    } else {
      await signUpRobust(page, "Ilya Importer", uniqueEmail("import-owner"));
      await createStudio(page, "Import E2E Studio");
    }
    base = await createProductionResilient(page, uniqueProductionName("Import"));
  });

  test.afterAll(async () => {
    await artistContext?.close();
    await context?.close();
  });

  test("D1 Generate: new scene SC020, 5 shots from 10 step 10, 3 titles", async () => {
    await page.goto(`${base}/shots`);
    // Fresh production → the panel is inline in the empty state, on Generate.
    const generateTab = page.getByRole("tab", { name: "Generate" });
    await expect(generateTab).toHaveAttribute("aria-selected", "true");
    // No scenes yet → "New scene" is the default.
    await expect(
      page.getByRole("button", { name: "New scene" }),
    ).toHaveAttribute("aria-pressed", "true");

    await page.locator("#gen-scene-code").fill("SC020");
    await page.locator("#gen-scene-title").fill("Signal room");
    await expect(page.locator("#gen-count")).toHaveValue("5");
    await page.locator("#gen-start").fill("10");
    await page.locator("#gen-step").fill("10");
    await page.locator("#gen-titles").fill("Wide\nMid\nClose");

    const preview = page.getByRole("list", { name: "Shot code preview" });
    await expect(preview.getByRole("listitem")).toHaveCount(5);
    await expect(preview.getByRole("listitem").first()).toHaveText("SC020_SH010");
    await expect(preview.getByRole("listitem").last()).toHaveText("SC020_SH050");
    await expect(page.getByText("5 shots", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Create 5 shots in SC020" }).click();
    await expect(page.getByText("Created 5 shots in SC020")).toBeVisible();
    await expect(page).toHaveURL(/scene=/);
    sceneId = new URL(page.url()).searchParams.get("scene")!;
    expect(sceneId).toBeTruthy();

    await showShotsTable(page);
    await expect(page.locator("tbody tr")).toHaveCount(5);
    const row = (code: string) =>
      page.locator("tbody tr").filter({ hasText: code });
    await expect(row("SC020_SH010").getByText("Wide")).toBeVisible();
    await expect(row("SC020_SH020").getByText("Mid")).toBeVisible();
    await expect(row("SC020_SH030").getByText("Close")).toBeVisible();
    await expect(row("SC020_SH040").getByText("—").first()).toBeVisible();
  });

  test("D2 Generate into a scene with 2 existing codes skips them", async () => {
    await page.goto(`${base}/shots`);
    await page.getByRole("button", { name: "New shots", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("tab", { name: "Generate" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // Scenes exist now → "Existing scene" is the default.
    await expect(
      dialog.getByRole("button", { name: "Existing scene" }),
    ).toHaveAttribute("aria-pressed", "true");
    await dialog.getByRole("combobox", { name: "Scene" }).click();
    await page.getByRole("option", { name: /SC020/ }).click();

    await dialog.locator("#gen-count").fill("5");
    await dialog.locator("#gen-start").fill("40");
    await dialog.locator("#gen-step").fill("10");

    await expect(dialog.getByText("2 of 5 already exist")).toBeVisible();
    await expect(dialog.getByText("exists — will be skipped")).toHaveCount(2);
    await dialog.getByRole("button", { name: "Create 3 shots in SC020" }).click();

    await expect(
      page.getByText("Created 3 shots in SC020 · skipped 2 existing"),
    ).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`scene=${sceneId}`));
    await expect(page.locator("tbody tr")).toHaveCount(8);
    await expect(page.getByRole("link", { name: "SC020_SH080" })).toBeVisible();
  });

  test("D3 step 0 and a pattern without {N} block submit; count 201 is clamped", async () => {
    await page.goto(`${base}/shots`);
    await page.getByRole("button", { name: "New shots", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Scene" }).click();
    await page.getByRole("option", { name: /SC020/ }).click();
    const submit = dialog.getByRole("button", { name: /^Create \d+ shots?/ });

    await dialog.locator("#gen-step").fill("0");
    await expect(dialog.getByText("Step must be ≥ 1")).toBeVisible();
    await expect(submit).toBeDisabled();
    await dialog.locator("#gen-step").fill("10");
    await expect(dialog.getByText("Step must be ≥ 1")).toHaveCount(0);

    await dialog.getByRole("button", { name: "Customise pattern" }).click();
    await dialog.locator("#gen-pattern").fill("{SCENE}_SH");
    await expect(dialog.getByText("Pattern needs {N}")).toBeVisible();
    await expect(submit).toBeDisabled();
    await dialog.getByRole("button", { name: "Reset" }).click();
    await expect(dialog.locator("#gen-pattern")).toHaveValue("{SCENE}_SH{N:3}");
    await expect(dialog.getByText("Pattern needs {N}")).toHaveCount(0);

    await dialog.locator("#gen-count").fill("201");
    await expect(dialog.locator("#gen-count")).toHaveValue("200");
    await expect(dialog.getByText(/clamped/)).toBeVisible();
    await expect(submit).toBeEnabled();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("D4 Import paste: header row, duplicate, reserved code, new scene", async () => {
    await page.goto(`${base}/shots`);
    await page.getByRole("button", { name: "More ways to add shots" }).click();
    await page.getByRole("menuitem", { name: "Import list…" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("tab", { name: "Import" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await dialog.getByLabel("Shot codes").fill(
      [
        "Code\tTitle\tScene",
        "SC020_SH090\tNinety\tSC020",
        "SC020_SH090\tAgain\tSC020",
        "CH_X\tBad\tSC020",
        "SC030_SH010\tOpening\tSC030",
      ].join("\n"),
    );

    const rows = dialog.locator("tbody tr");
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText("ok");
    await expect(rows.nth(1)).toContainText("duplicate in paste (skip)");
    await expect(rows.nth(2)).toContainText("invalid code");
    await expect(rows.nth(3)).toContainText("unknown scene → will be created");
    await expect(
      dialog.getByText("Create 2 shots · 1 new scene · 1 skipped · 1 invalid"),
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Create 2 shots" }).click();
    await expect(page.getByText(/^Created 2 shots · scene SC030/)).toBeVisible();
    await expect(dialog).toHaveCount(0);

    // The new scene is in the scene filter, and filtering by it works.
    await sceneTrigger(page).click();
    await page.getByRole("option", { name: /SC030/ }).click();
    await expect(page).toHaveURL(/scene=/);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "SC030_SH010" })).toBeVisible();
  });

  test("D5 Import a CSV file: a quoted title with a comma survives", async () => {
    await page.goto(`${base}/shots`);
    await page.getByRole("button", { name: "More ways to add shots" }).click();
    await page.getByRole("menuitem", { name: "Import list…" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "shots.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        'Code,Title,Scene\r\nSC030_SH020,"Wide, then push in",SC030\r\n',
      ),
    });
    await expect(dialog.getByLabel("Shot codes")).toHaveValue(/Wide, then push in/);
    const rows = dialog.locator("tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Wide, then push in");
    await expect(rows.first()).toContainText("ok");

    await dialog.getByRole("button", { name: "Create 1 shot" }).click();
    await expect(page.getByText("Created 1 shot", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/scene=/);
    const row = page.locator("tbody tr").filter({ hasText: "SC030_SH020" });
    await expect(row.getByText("Wide, then push in")).toBeVisible();
  });

  test("D6 N opens the dialog on Generate; Esc closes it", async () => {
    await page.goto(`${base}/shots`);
    await expect(page.getByRole("link", { name: "SC020_SH010" })).toBeVisible();
    await page.keyboard.press("n");
    await expect(page.getByRole("heading", { name: "New shots" })).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("tab", { name: "Generate" }),
    ).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("D7 an artist sees no New shots button and no scene pencil", async ({
    browser,
  }) => {
    const artistEmail = uniqueEmail("import-artist");
    await inviteMemberLocal(page, artistEmail, "Artist");
    const artist = await signUpInvited(browser, artistEmail, "Arlo Artist");
    artistContext = artist.context;
    await gotoLoaded(artist.page, `${base}/shots?scene=${sceneId}`);
    await expect(
      artist.page.getByRole("link", { name: "SC020_SH010" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(artist.page.getByRole("button", { name: "New shots" })).toHaveCount(0);
    await expect(
      artist.page.getByRole("button", { name: /Edit scene/ }),
    ).toHaveCount(0);
    await expect(artist.page.getByRole("tab", { name: "Generate" })).toHaveCount(0);
  });

  test("E5 Edit scene sheet: title, Figma URL and code SC020 → SC021", async () => {
    await page.goto(`${base}/shots?scene=${sceneId}`);
    await page.getByRole("button", { name: "Edit scene SC020" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: "Edit scene SC020" })).toBeVisible();
    await expect(sheet.locator("#edit-scene-title")).toHaveValue("Signal room");
    await sheet.locator("#edit-scene-title").fill("Signal room v2");
    await sheet.locator("#edit-scene-figma").fill("https://www.figma.com/file/abc123/board");
    await sheet.locator("#edit-scene-code").fill("SC021");
    await expect(sheet.getByText("Shot codes are not renamed")).toBeVisible();
    await sheet.getByRole("button", { name: "Save scene" }).click();

    await expect(page.getByText("Scene SC020 is now SC021")).toBeVisible();
    await expect(sheet).toHaveCount(0);
    await expect(
      page.locator('[data-slot="select-trigger"]').filter({ hasText: "SC021" }),
    ).toBeVisible();
    // Shot codes are untouched by a scene code change.
    await expect(page.getByRole("link", { name: "SC020_SH010" })).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(9);

    await gotoStable(page, base);
    await expect(
      page.getByText(/updated scene SC020 \(code → SC021, title → "Signal room v2"/),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("no unexpected page errors surfaced during the suite", () => {
    expect(errors).toEqual([]);
  });
});
