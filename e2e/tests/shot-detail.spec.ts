import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  bulkCreateShots,
  createProduction,
  createStudio,
  trackErrors,
  uniqueEmail,
  uploadOptions,
  PASSWORD,
} from "./helpers";

/**
 * Owner credentials. By default every run signs up a throwaway owner; set
 * E2E_EMAIL + E2E_PASSWORD to run the suite as an existing account on the
 * local deployment instead (the account is created there if it does not
 * exist yet). The member/artist account is always a fresh throwaway.
 */
const ENV_EMAIL = process.env.E2E_EMAIL;
const ENV_PASSWORD = process.env.E2E_PASSWORD;

/**
 * Local hardened replacement for helpers.signUp — that helper has two flake
 * modes under a busy dev server (both observed while building this suite):
 *  1. it clicks "New here? Create an account" before React hydration, the
 *     click is swallowed and the #name field never appears;
 *  2. the sign-up submit itself occasionally hangs with the button stuck
 *     disabled; a reload followed by signing in (or a fresh attempt) recovers.
 */
async function signUpRobust(
  page: Page,
  name: string,
  email: string,
  password: string = PASSWORD,
) {
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
    await page.fill("#password", password);
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
          await page.fill("#password", password);
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

/** Sign IN an existing account with its own password (hydration-safe). */
async function signInRobust(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await expect(async () => {
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/", { timeout: 10_000 });
  }).toPass({ timeout: 40_000 });
}

/** The signed-in user's display name, read from the Account menu. */
async function readAccountName(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Account", exact: true }).click();
  const label = page.locator('[data-slot="dropdown-menu-label"]').first();
  const name = (await label.locator("div").first().textContent())?.trim();
  await page.keyboard.press("Escape");
  if (!name) throw new Error("could not read the account name");
  return name;
}

/** Local copy of helpers.signUpInvited built on the hardened sign-up. */
async function signUpInvitedRobust(
  browser: Browser,
  email: string,
  name: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signUpRobust(page, name, email);
  return { context, page };
}

/**
 * Shot detail page: option uploads (v1/v2 cards + thumbnails), shortlist
 * toggle, discussion incl. the @mention → notification loop, Files and
 * History tabs, the inline title editor (Enter/blur save, Escape cancel),
 * and — v2 item (e)/(f) — the code rename flow, the header scene select,
 * the artist's read-only heading and the URL-addressable tabs.
 */

const SHOT = "SD010_SH010";
const RENAMED = "SD010_SH025";
const OTHER = "SD010_SH030";
const OWNER_NAME = "Dana Detail";
const MEMBER_NAME = "Mia Mention";

/**
 * Local replacement for helpers.inviteMember: that helper does
 * `dialog.getByLabel("Role").click()`, but the invite dialog's "Role" label
 * has no htmlFor/control association, so the locator never resolves and the
 * click hangs until the test times out (the .catch fallback fires too late).
 */
async function inviteMemberLocal(page: Page, email: string, roleLabel: string) {
  await page.goto("/team");
  await page.getByRole("button", { name: "Invite member" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#invite-email").fill(email);
  await dialog.locator('[data-slot="select-trigger"]').first().click();
  await page.getByRole("option", { name: roleLabel }).click();
  await dialog.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(page.getByText(email).first()).toBeVisible({ timeout: 10_000 });
}

/**
 * Open a shot page and wait for its heading. The first full load after a
 * fresh sign-in occasionally renders a skeleton shell (a Convex client race,
 * also seen when another dev-server hot-reload lands mid-navigation); one
 * reload recovers.
 */
async function openShot(page: Page, path: string, code: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(path).catch(() => {});
    const ok = await page
      .getByRole("heading", { name: code })
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (ok) return;
  }
  throw new Error(`shot page ${path} never showed heading ${code}`);
}

/** Create a scene from the header's scene select ("Create scene…"). */
async function createSceneFromHeader(page: Page, code: string) {
  const group = page.getByRole("group", { name: "Scene" });
  await group.getByRole("combobox").click();
  await page.getByRole("option", { name: /Create scene/ }).click();
  const input = group.getByPlaceholder("SC010");
  await input.fill(code);
  await input.press("Enter");
  await expect(group.getByRole("combobox")).toContainText(code, {
    timeout: 15_000,
  });
}

test.describe.serial("shot detail", () => {
  let context: BrowserContext;
  let page: Page;
  let errors: string[];
  let base: string;
  let shotPath: string;
  let shotId: string;
  let ownerName = OWNER_NAME;
  let memberContext: BrowserContext | undefined;
  let memberPage: Page;
  const memberEmail = uniqueEmail("mention-member");

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(150_000);
    context = await browser.newContext();
    page = await context.newPage();
    errors = trackErrors(page);

    if (ENV_EMAIL && ENV_PASSWORD) {
      // Run as the given account: sign in, or create it on this (local)
      // deployment when it does not exist yet.
      const signedIn = await signInRobust(page, ENV_EMAIL, ENV_PASSWORD)
        .then(() => true)
        .catch(() => false);
      if (!signedIn) await signUpRobust(page, OWNER_NAME, ENV_EMAIL, ENV_PASSWORD);
      // A brand-new account lands on the create-studio screen; an existing
      // one on its studio home.
      const needsStudio = await page
        .locator("#studio-name")
        .waitFor({ state: "visible", timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (needsStudio) await createStudio(page, "Detail E2E Studio");
      await expect(page.getByLabel("Switch studio")).toBeVisible({
        timeout: 15_000,
      });
      ownerName = await readAccountName(page);
    } else {
      await signUpRobust(page, OWNER_NAME, uniqueEmail("detail-owner"));
      await createStudio(page, "Detail E2E Studio");
    }
    base = await createProduction(page, "Detail E2E Feature");

    // One shot to work on (helpers.bulkCreateShots follows the Shots page's
    // creation UI wherever it moves). A concurrent dev-server hot-reload can
    // land the Shots page on its error shell once; a second pass recovers.
    await expect(async () => {
      await bulkCreateShots(page, base, [SHOT]);
    }).toPass({ timeout: 90_000, intervals: [1_000] });
    await expect(page.getByRole("link", { name: SHOT })).toBeVisible();
  });

  test.afterAll(async () => {
    await memberContext?.close();
    await context?.close();
  });

  test("uploading two options yields v1/v2 cards with thumbnails", async () => {
    await page.goto(`${base}/shots`);
    await page.getByRole("link", { name: SHOT }).click();
    await page.waitForURL(/\/shots\/[a-z0-9]+$/);
    shotPath = new URL(page.url()).pathname;
    shotId = shotPath.split("/").pop()!;
    await expect(page.getByRole("heading", { name: SHOT })).toBeVisible();

    await uploadOptions(page, 2);

    const v1Card = page.locator('[data-slot="card"]').filter({ hasText: "v1 ·" });
    const v2Card = page.locator('[data-slot="card"]').filter({ hasText: "v2 ·" });
    await expect(v1Card).toBeVisible();
    await expect(v2Card).toBeVisible();

    // Thumbnails render from the uploaded bytes (image uploads are their own
    // thumb) — assert the images actually load, not just exist.
    const thumb1 = page.locator('img[alt="option-1.png"]');
    const thumb2 = page.locator('img[alt="option-2.png"]');
    await expect(thumb1).toBeVisible();
    await expect(thumb2).toBeVisible();
    await expect
      .poll(() => thumb1.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
    await expect
      .poll(() => thumb2.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
  });

  test("shortlist button toggles label and state", async () => {
    const v1Card = page.locator('[data-slot="card"]').filter({ hasText: "v1 ·" });
    await expect(v1Card.getByText("Candidate")).toBeVisible();

    await v1Card.getByRole("button", { name: "Shortlist", exact: true }).click();
    await expect(
      v1Card.getByRole("button", { name: "Unshortlist" }),
    ).toBeVisible();
    await expect(v1Card.getByText("Shortlisted")).toBeVisible();

    await v1Card.getByRole("button", { name: "Unshortlist" }).click();
    await expect(
      v1Card.getByRole("button", { name: "Shortlist", exact: true }),
    ).toBeVisible();
    await expect(v1Card.getByText("Candidate")).toBeVisible();
  });

  test("posting a comment shows it in the discussion", async () => {
    await page.getByRole("tab", { name: "Discussion" }).click();
    const composer = page.getByPlaceholder(
      "Add a comment — @ to mention someone",
    );
    await composer.fill("First pass looks promising");
    await page.getByRole("button", { name: "Comment" }).click();
    await expect(page.getByText("First pass looks promising")).toBeVisible();
    await expect(page.getByText(ownerName).first()).toBeVisible();
    await expect(composer).toHaveValue("");
  });

  test("@mention notifies the mentioned member and links to the shot", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    await inviteMemberLocal(page, memberEmail, "Artist");
    ({ context: memberContext, page: memberPage } = await signUpInvitedRobust(
      browser,
      memberEmail,
      MEMBER_NAME,
    ));

    // Owner mentions the member from the discussion tab via the @ picker.
    await page.goto(shotPath);
    await page.getByRole("tab", { name: "Discussion" }).click();
    const composer = page.getByPlaceholder(
      "Add a comment — @ to mention someone",
    );
    await composer.click();
    await composer.pressSequentially("Heads up @Mia", { delay: 25 });
    const suggestion = page.getByRole("button", {
      name: new RegExp(MEMBER_NAME),
    });
    await expect(suggestion).toBeVisible({ timeout: 15_000 });
    await suggestion.click();
    await expect(composer).toHaveValue(/@Mia Mention/);
    await page.getByRole("button", { name: "Comment" }).click();
    await expect(page.getByText(`@${MEMBER_NAME}`).first()).toBeVisible();

    // The member's bell shows an unread notification naming the author…
    const bell = memberPage.getByRole("button", {
      name: "Notifications",
      exact: true,
    });
    await expect(bell.locator("span.bg-tape")).toBeVisible({
      timeout: 15_000,
    });
    await bell.click();
    const item = memberPage
      .getByRole("button")
      .filter({ hasText: `${ownerName} mentioned you` });
    await expect(item).toBeVisible();

    // …and clicking it navigates to the shot.
    await item.click();
    await memberPage.waitForURL(`**${shotPath}`);
    await expect(memberPage.getByRole("heading", { name: SHOT })).toBeVisible();
  });

  test("Files tab lists both uploaded assets with sizes", async () => {
    await page.goto(shotPath);
    await page.getByRole("tab", { name: "Files" }).click();
    const row1 = page.locator("tr").filter({ hasText: "option-1.png" });
    const row2 = page.locator("tr").filter({ hasText: "option-2.png" });
    await expect(row1).toBeVisible();
    await expect(row2).toBeVisible();
    await expect(row1.getByText(/^\d+(\.\d+)? (B|KB)$/)).toBeVisible();
    await expect(row2.getByText(/^\d+(\.\d+)? (B|KB)$/)).toBeVisible();
    // Uploads are app-storage assets.
    await expect(row1.getByText("App", { exact: true })).toBeVisible();
  });

  test("History tab shows the added v1/v2 entries", async () => {
    await page.getByRole("tab", { name: "History" }).click();
    await expect(
      page.getByText(new RegExp(`added v1 to ${SHOT}`)),
    ).toBeVisible();
    await expect(
      page.getByText(new RegExp(`added v2 to ${SHOT}`)),
    ).toBeVisible();
  });

  test("inline title saves on Enter and on blur", async () => {
    const title = page.getByLabel("Shot title");
    await title.fill("Hero close-up");
    await title.press("Enter");
    await page.waitForTimeout(600); // let the mutation flush before reloading
    await page.reload();
    await expect(page.getByRole("heading", { name: SHOT })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByLabel("Shot title")).toHaveValue("Hero close-up");

    const title2 = page.getByLabel("Shot title");
    await title2.fill("Hero close-up wide");
    await page.getByRole("tab", { name: "Options" }).click(); // blur commits
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.getByRole("heading", { name: SHOT })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByLabel("Shot title")).toHaveValue(
      "Hero close-up wide",
    );
  });

  test("Escape cancels a title edit without saving (regression)", async () => {
    const title = page.getByLabel("Shot title");
    await expect(title).toHaveValue("Hero close-up wide");
    await title.click();
    await title.fill("Discarded draft");
    await title.press("Escape");
    await expect(title).toHaveValue("Hero close-up wide");
    // If the discarded text were wrongly saved, the reactive query would
    // write it back into the input — give it time to prove itself.
    await page.waitForTimeout(800);
    await expect(title).toHaveValue("Hero close-up wide");
    await page.reload();
    await expect(page.getByRole("heading", { name: SHOT })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByLabel("Shot title")).toHaveValue(
      "Hero close-up wide",
    );
  });

  // ---- v2 item (f): URL-addressable tabs ---------------------------------

  test("?tab=discussion opens the Discussion tab and switching tabs updates the URL", async () => {
    await openShot(page, `${shotPath}?tab=discussion`, SHOT);
    await expect(page.getByRole("tab", { name: "Discussion" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.getByPlaceholder("Add a comment — @ to mention someone"),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Files" }).click();
    await expect(page).toHaveURL(/\?tab=files$/);
    await expect(page.getByRole("tab", { name: "Files" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.locator("tr").filter({ hasText: "option-1.png" }),
    ).toBeVisible();

    await page.getByRole("tab", { name: "History" }).click();
    await expect(page).toHaveURL(/\?tab=history$/);
    // The URL is the state: a reload lands on the same tab.
    await page.reload();
    await expect(page.getByRole("tab", { name: "History" })).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 20_000 },
    );

    await page.getByRole("tab", { name: "Options" }).click();
    await expect(page).toHaveURL(/\?tab=options$/);
    await expect(page.getByRole("tab", { name: "Options" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  // ---- v2 item (e): rename + re-link -------------------------------------

  test("E1 renaming the code via the heading updates heading, Shots table, ledger and History", async () => {
    test.setTimeout(120_000);
    // A pick first, so the Decisions ledger has a row that names this shot.
    await page.goto(`${base}/review/${shotId}`);
    await expect(page.locator('aside[aria-label="Version details"] span.font-mono').first()).toHaveText(
      /^v\d+$/,
      { timeout: 20_000 },
    );
    await page.keyboard.press("p");
    const pickDialog = page.locator('[role="dialog"]');
    await pickDialog.getByRole("button", { name: "Pick this version" }).click();
    await page.waitForURL(new RegExp(`${base}/review$`), { timeout: 30_000 });

    await openShot(page, shotPath, SHOT);
    // The heading is the affordance: its text is a button for content editors.
    await page.getByRole("heading", { name: SHOT }).getByRole("button").click();
    const codeInput = page.getByLabel("Shot code");
    await expect(codeInput).toBeVisible();
    await expect(codeInput).toHaveValue(SHOT);
    await codeInput.fill(RENAMED);
    await codeInput.press("Enter");

    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText(`Renaming ${SHOT} → ${RENAMED}`);
    await expect(confirm).toContainText(
      "Comments and history keep the old text; the rename is recorded.",
    );
    await confirm.getByRole("button", { name: "Rename" }).click();

    await expect(page.getByRole("heading", { name: RENAMED })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(`formerly ${SHOT}`)).toBeVisible();
    await expect(confirm).toHaveCount(0);

    // Shots table reads the live code.
    await page.goto(`${base}/shots`);
    await expect(page.getByRole("link", { name: RENAMED })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("link", { name: SHOT, exact: true })).toHaveCount(0);

    // Decisions ledger: the pick row's target label is the live code.
    await page.goto(`${base}/decisions`);
    await expect(page.getByRole("link", { name: RENAMED }).first()).toBeVisible({
      timeout: 15_000,
    });

    // History records the rename with both codes.
    await openShot(page, `${shotPath}?tab=history`, RENAMED);
    await expect(
      page.getByText(`renamed ${SHOT} → ${RENAMED}`, { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("E2 header scene select assigns another scene; the meta updates and /shots?scene= lists it", async () => {
    test.setTimeout(90_000);
    await openShot(page, shotPath, RENAMED);
    const sceneGroup = page.getByRole("group", { name: "Scene" });
    await expect(sceneGroup.getByRole("combobox")).toContainText("No scene");

    // Inline create from the header select assigns the new scene…
    await createSceneFromHeader(page, "SD020");
    // …and so does a second one; then switch back through the list.
    await createSceneFromHeader(page, "SD030");
    await sceneGroup.getByRole("combobox").click();
    await page.getByRole("option", { name: /SD020/ }).click();
    await expect(sceneGroup.getByRole("combobox")).toContainText("SD020");
    await expect(sceneGroup.getByRole("combobox")).not.toContainText("SD030");

    // Persisted, and recorded in History.
    await page.reload();
    await expect(
      page.getByRole("group", { name: "Scene" }).getByRole("combobox"),
    ).toContainText("SD020", { timeout: 20_000 });
    await page.getByRole("tab", { name: "History" }).click();
    await expect(page.getByText(/scene → SD020/).first()).toBeVisible();

    // The Shots page filtered by that scene lists the shot. The goto can race
    // the tab's router.replace above and resolve on the old document, so
    // insist on the Shots heading before touching the filter bar.
    await expect(async () => {
      await page.goto(`${base}/shots`);
      await expect(
        page.getByRole("heading", { name: /^Shots/ }),
      ).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 45_000 });
    // The trigger's text is "Scene" plus the chevron glyph — anchor the start only.
    await page.getByRole("combobox").filter({ hasText: /^Scene/ }).first().click();
    await page.getByRole("option", { name: /SD020/ }).click();
    await expect(page).toHaveURL(/[?&]scene=[a-z0-9]+/);
    await expect(page.getByRole("link", { name: RENAMED })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("E3 renaming to an existing code is refused with a toast; heading unchanged", async () => {
    test.setTimeout(90_000);
    // A second shot to collide with.
    await bulkCreateShots(page, base, [OTHER]);
    await expect(page.getByRole("link", { name: OTHER })).toBeVisible();

    await openShot(page, shotPath, RENAMED);
    // This time through the kebab.
    await page.getByRole("button", { name: "Shot code actions" }).click();
    await page.getByRole("menuitem", { name: "Rename code…" }).click();
    const codeInput = page.getByLabel("Shot code");
    await codeInput.fill(OTHER);
    await codeInput.press("Enter");
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText(`Renaming ${RENAMED} → ${OTHER}`);
    await confirm.getByRole("button", { name: "Rename" }).click();

    await expect(
      page.getByText(`Shot code ${OTHER} already exists in this production`),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: RENAMED })).toBeVisible();
    await expect(page.getByRole("heading", { name: OTHER })).toHaveCount(0);
    await expect(confirm).toHaveCount(0);
    await expect(page.getByText(`formerly ${SHOT}`)).toBeVisible();
  });

  test("E4 artist: heading not editable, scene is text, title still inline-editable", async () => {
    test.setTimeout(90_000);
    // Owner assigns the shot to the artist so the title is theirs to edit.
    await openShot(page, shotPath, RENAMED);
    await page.getByLabel("Assignee").click();
    await page.getByRole("option", { name: MEMBER_NAME }).click();
    await expect(page.getByLabel("Assignee")).toContainText(MEMBER_NAME, {
      timeout: 15_000,
    });

    await openShot(memberPage, shotPath, RENAMED);
    const heading = memberPage.getByRole("heading", { name: RENAMED });
    await expect(heading.getByRole("button")).toHaveCount(0);
    await expect(
      memberPage.getByRole("button", { name: "Shot code actions" }),
    ).toHaveCount(0);
    await heading.click();
    await expect(memberPage.getByLabel("Shot code")).toHaveCount(0);
    await expect(memberPage.getByRole("alertdialog")).toHaveCount(0);
    // The "formerly" trail is visible to everyone; the placement is text.
    await expect(memberPage.getByText(`formerly ${SHOT}`)).toBeVisible();
    await expect(memberPage.getByRole("group", { name: "Scene" })).toHaveCount(0);
    await expect(memberPage.getByText(/^SD020 · /)).toBeVisible();

    // The title is still the artist's to edit.
    const title = memberPage.getByLabel("Shot title");
    await expect(title).toBeEditable();
    await title.fill("Artist retitled");
    await title.press("Enter");
    // The owner's open page is live — the new title lands there.
    await expect(page.getByLabel("Shot title")).toHaveValue("Artist retitled", {
      timeout: 15_000,
    });
  });

  test("no unexpected page errors surfaced during the suite", () => {
    expect(errors).toEqual([]);
  });
});
