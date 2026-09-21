import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  createStudio,
  gotoStable,
  signUp,
  signIn,
  trackErrors,
  uniqueEmail,
  uploadOptions,
} from "./helpers";

/**
 * Characters (spec v2 item b, tests C1–C6): the Characters rail entry,
 * the empty-state paste, New character with the auto-derived code and the
 * duplicate-code refusal, options on the Concept phase, a pick from the
 * Review Room reflected in the list (thumb, "Picked", Final › Open) and the
 * Decisions ledger, the inline base prompt, and the rename that carries
 * through to the phase shot codes.
 *
 * Runs serially in one context. By default it signs up a throwaway owner
 * like every other spec; set E2E_EMAIL / E2E_PASSWORD to run it as an
 * existing account instead (the account is created on the local deployment
 * the first time). Either way a fresh studio (when the account has none)
 * and a fresh production are created, so the checks start from empty.
 */

test.describe.configure({ mode: "serial" });

const PROMPT =
  "Cartoon still. Baby mammoth standing on the ice. Ultra-detailed 3D rendering, gentle soft shadows.";

let context: BrowserContext;
let page: Page;
let errors: string[];
let base: string;
let characterPath: string;

/** Sign in with an explicit password (helpers.signIn hard-codes its own). */
async function trySignIn(
  page: Page,
  email: string,
  password: string,
): Promise<boolean> {
  await gotoStable(page, "/sign-in");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Sign in" }).click();
  const outcome = await Promise.race([
    page
      .waitForURL("**/", { timeout: 30_000 })
      .then(() => "ok" as const),
    page
      .getByText(/Wrong email or password/)
      .waitFor({ timeout: 30_000 })
      .then(() => "wrong" as const),
  ]).catch(() => "timeout" as const);
  return outcome === "ok";
}

/** helpers.signUp with an explicit password. */
async function signUpWith(
  page: Page,
  name: string,
  email: string,
  password: string,
) {
  await gotoStable(page, "/sign-in");
  await expect(async () => {
    await page.getByText("New here? Create an account").click();
    await expect(page.locator("#name")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await page.fill("#name", name);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/", { timeout: 45_000 });
}

/**
 * The account this run uses: E2E_EMAIL / E2E_PASSWORD when set (signed in,
 * or signed up on first use), else a throwaway owner like the other specs.
 */
async function signInAsRunner(page: Page) {
  const email = process.env.E2E_EMAIL?.trim().toLowerCase();
  const password = process.env.E2E_PASSWORD;
  if (email && password) {
    if (await trySignIn(page, email, password)) return;
    await signUpWith(page, email.split("@")[0], email, password);
    return;
  }
  const fresh = uniqueEmail("characters-owner");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await signUp(page, "Character Owner", fresh);
      return;
    } catch {
      // Under parallel-agent load the sign-up round trip can outlive the
      // helper's wait even though the account landed — check, then retry.
    }
    await page.goto("/", { waitUntil: "domcontentloaded" }).catch(() => {});
    if (!new URL(page.url()).pathname.startsWith("/sign-in")) return;
    try {
      await signIn(page, fresh);
      return;
    } catch {
      // Not created — loop for a fresh attempt.
    }
  }
  throw new Error(`could not sign up ${fresh}`);
}

/** A studio to work in: the create-studio screen for a new account, else the existing one. */
async function ensureStudio(page: Page) {
  const studioField = page.locator("#studio-name");
  const home = page.getByText("Productions").first();
  await expect(studioField.or(home)).toBeVisible({ timeout: 30_000 });
  if (await studioField.isVisible()) {
    await createStudio(page, "Characters Studio");
  }
}

/**
 * helpers.createProduction with an explicit production code: the wizard
 * suggests one from the name's initials, which collides on a second run
 * under the same account ("Code CEM is already used in this studio").
 */
async function createProductionWithCode(
  page: Page,
  name: string,
  code: string,
): Promise<string> {
  await gotoStable(page, "/new");
  await page.getByLabel(/name/i).first().fill(name);
  await page.locator("#prod-code").fill(code);
  await page.getByRole("button", { name: /Create & continue/i }).click();
  await page.getByText(/Skip for now/i).waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: /Skip for now/i }).click();
  await page
    .getByRole("button", { name: /Open production/i })
    .waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: /Open production/i }).click();
  await page.waitForURL(/\/p\/[a-z0-9]+/, { timeout: 15_000 });
  return new URL(page.url()).pathname.match(/^\/p\/[a-z0-9]+/)![0];
}

async function createProductionResilient(
  page: Page,
  name: string,
  code: string,
): Promise<string> {
  try {
    return await createProductionWithCode(page, name, code);
  } catch {
    // The wizard usually completed — recover the base path from the URL.
  }
  await page.waitForURL(/\/p\/[a-z0-9]+/, { timeout: 120_000 });
  return new URL(page.url()).pathname.match(/^\/p\/[a-z0-9]+/)![0];
}

/**
 * Open a page and wait for `ready`; a hot reload by another agent can hand
 * the first load a Next error overlay or a skeleton shell, so reload once
 * before treating a missing landmark as a failure.
 */
async function openPage(path: string, ready: () => Locator) {
  await gotoStable(page, path);
  try {
    await expect(ready()).toBeVisible({ timeout: 15_000 });
  } catch {
    await page.reload();
    await expect(ready()).toBeVisible({ timeout: 20_000 });
  }
}

const openList = async () => {
  await openPage(`${base}/characters`, () =>
    page.getByRole("heading", { name: /^Characters/ }),
  );
  await page.getByRole("button", { name: "Character table", exact: true }).click();
};
const openCharacter = () =>
  openPage(characterPath, () => page.getByLabel("Character name"));

/** The table row of a character, by name. */
function rowOf(name: string) {
  return page.locator("tbody tr").filter({
    has: page.getByRole("link", { name, exact: true }),
  });
}

/**
 * The open phase's "Open in Review Room" href. Navigating by href instead of
 * clicking: a Link's client-side navigation can stall under parallel-agent
 * dev-server load (the same trick review.spec.ts uses).
 */
async function reviewRoomHrefOnPage(): Promise<string> {
  const link = page.getByRole("link", { name: "Open in Review Room" });
  await expect(link).toBeVisible({ timeout: 15_000 });
  const href = await link.getAttribute("href");
  if (!href) throw new Error("Open in Review Room has no href");
  return href;
}

/** The right rail's focused-version header in the Review Room. */
function railVersion() {
  return page.locator('aside[aria-label="Version details"] span.font-mono').first();
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  page = await context.newPage();
  errors = trackErrors(page);
  await signInAsRunner(page);
  await ensureStudio(page);
  // Unique per run: the account may persist (E2E_EMAIL), the production must not.
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  base = await createProductionResilient(page, `Characters E2E ${stamp}`, `C${stamp}`);
});

test.afterAll(async () => {
  await context?.close();
});

test("C1 rail shows Characters; pasting names creates rows; Shots and Board stay empty", async () => {
  await gotoStable(page, base);
  const rail = page.locator("aside");
  // Characters sits with the other content items — the "Pre-production"
  // section heading above it was dropped in the v1.2 design pass.
  await expect(rail.getByRole("link", { name: "Characters" })).toBeVisible({
    timeout: 20_000,
  });
  await rail.getByRole("link", { name: "Characters" }).click();
  await page.waitForURL(/\/characters$/, { timeout: 15_000 });

  await expect(
    page.getByText(
      "No characters yet. Add one, or paste the names from your sheet.",
    ),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Character names").fill("Pushistik\nMama\nTupik");
  await page.getByRole("button", { name: "Create 3 characters" }).click();

  await expect(
    page.getByRole("heading", { name: "Characters · 3" }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Character table", exact: true }).click();
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(3);
  for (const [i, [name, code]] of [
    ["Pushistik", "PUSHISTIK"],
    ["Mama", "MAMA"],
    ["Tupik", "TUPIK"],
  ].entries()) {
    await expect(rows.nth(i)).toContainText(name);
    await expect(rows.nth(i).getByText(code, { exact: true })).toBeVisible();
    // Both phases exist, empty, and link to the detail page.
    await expect(
      rows.nth(i).getByRole("link", { name: `${name} — Concept` }),
    ).toContainText("0 options");
    await expect(
      rows.nth(i).getByRole("link", { name: `${name} — Animation` }),
    ).toContainText("0 options");
    // No pick yet: Final › Open is disabled.
    await expect(
      rows.nth(i).getByRole("button", { name: "Open" }),
    ).toBeDisabled();
  }

  // Slot shots never show up as shots: the Shots page counts 0…
  await gotoStable(page, `${base}/shots`);
  await expect(
    page.getByRole("heading", { name: /^Shots\s*0\b/ }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('main a[href*="/shots/"]')).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("CH_");

  // …and the Board has no cards in any column.
  await gotoStable(page, `${base}/board`);
  await expect(page.getByText("No shots in this stage")).toHaveCount(6, {
    timeout: 20_000,
  });
  await expect(page.locator('main a[href*="/shots/"]')).toHaveCount(0);
});

test("C2 New character derives the code, accepts an override, and refuses a duplicate", async () => {
  await openList();
  await page.getByRole("button", { name: "New character" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("#new-character-name").fill("Papa Tupik");
  await expect(dialog.locator("#new-character-code")).toHaveValue(
    "PAPA_TUPIK",
  );
  await dialog.locator("#new-character-code").fill("PAPA");
  await dialog.getByRole("button", { name: "Create character" }).click();
  await expect(dialog).toHaveCount(0, { timeout: 10_000 });

  await expect(
    page.getByRole("heading", { name: "Characters · 4" }),
  ).toBeVisible({ timeout: 15_000 });
  const papa = rowOf("Papa Tupik");
  await expect(papa.getByText("PAPA", { exact: true })).toBeVisible();

  // Hotkey N opens the same dialog; a second PAPA is refused server-side.
  await page.keyboard.press("n");
  await expect(dialog).toBeVisible();
  await dialog.locator("#new-character-name").fill("Papa Two");
  await dialog.locator("#new-character-code").fill("PAPA");
  await dialog.getByRole("button", { name: "Create character" }).click();
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: /already exists/ }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Characters · 4" }),
  ).toBeVisible();
});

test("C3 two options on Pushistik's Concept show as v1/v2; the list says 2 options · Options ready", async () => {
  await openList();
  await page.getByRole("link", { name: "Pushistik", exact: true }).click();
  await page.waitForURL(/\/characters\/[a-z0-9]+/, { timeout: 15_000 });
  characterPath = new URL(page.url()).pathname;

  await expect(page.getByLabel("Character name")).toHaveValue("Pushistik", {
    timeout: 15_000,
  });
  await expect(page.getByText("PUSHISTIK", { exact: true })).toBeVisible();
  // Concept is the phase open by default, with its slot shot code.
  await expect(page.getByRole("button", { name: /^Concept/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("CH_PUSHISTIK_CONCEPT").first()).toBeVisible();

  await uploadOptions(page, 2);
  const v1Card = page.locator('[data-slot="card"]').filter({ hasText: "v1 ·" });
  const v2Card = page.locator('[data-slot="card"]').filter({ hasText: "v2 ·" });
  await expect(v1Card).toBeVisible();
  await expect(v2Card).toBeVisible();
  await expect(page.getByLabel("Status")).toContainText("Options ready", {
    timeout: 15_000,
  });
  // The phase switcher reflects it too.
  await expect(page.getByRole("button", { name: /^Concept/ })).toContainText(
    "2 options",
  );

  // Animation is still empty and selectable through ?slot=.
  await page.getByRole("button", { name: /^Animation/ }).click();
  await expect(page).toHaveURL(/slot=animation/);
  await expect(page.getByText("CH_PUSHISTIK_ANIMATION").first()).toBeVisible();
  await expect(page.getByLabel("Status")).toContainText("Planned");

  await openList();
  const concept = rowOf("Pushistik").getByRole("link", {
    name: "Pushistik — Concept",
  });
  await expect(concept).toContainText("2 options", { timeout: 15_000 });
  await expect(concept).toContainText("Options ready");
  await expect(concept.locator('img[alt="Pushistik — Concept cover"]')).toBeVisible();

  // The Review queue lists the phase under its own "Characters" group.
  await openPage(`${base}/review`, () =>
    page.getByRole("heading", { name: "Characters" }),
  );
  const queueCard = page.getByRole("link", { name: /CH_PUSHISTIK_CONCEPT/ });
  await expect(queueCard).toBeVisible();
  await expect(queueCard).toContainText("2 options");
  await expect(queueCard).toContainText("Pushistik — Concept");
  // No ordinary shots are waiting, so there is no "Shots" group.
  await expect(page.getByRole("heading", { name: "Shots" })).toHaveCount(0);
});

test("C4 a pick in the Review Room shows the v2 thumb + Picked in the list, enables Final › Open, and lands in Decisions › Picks", async () => {
  await openCharacter();
  await gotoStable(page, await reviewRoomHrefOnPage());
  await expect(page).toHaveURL(/\/review\/[a-z0-9]+$/);
  await expect(page.locator('button[title="v2 — Candidate"]')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("CH_PUSHISTIK_CONCEPT").first()).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(railVersion()).toHaveText("v2");
  await page.keyboard.press("p");
  const dialog = page.locator('[role="dialog"]');
  await expect(
    dialog.getByText(/_CH_PUSHISTIK_CONCEPT_v2\.png$/),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Pick this version" }).click();
  // The room closes itself back to the queue after the pick.
  await page.waitForURL(new RegExp(`${base}/review$`), { timeout: 30_000 });

  // Decided: the phase leaves the Characters group and lands in Decided today.
  await openPage(`${base}/review`, () =>
    page.getByRole("heading", { name: "Decided today" }),
  );
  await expect(page.getByRole("heading", { name: "Characters" })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /CH_PUSHISTIK_CONCEPT/ }),
  ).toBeVisible();

  // The character page reflects the pick on the Concept phase.
  await openCharacter();
  await expect(page.getByRole("button", { name: /^Concept/ })).toContainText(
    "Picked",
    { timeout: 15_000 },
  );
  await expect(page.getByRole("button", { name: /^Concept/ })).toContainText(
    "v2",
  );

  // The list: v2 thumbnail, Picked pill, Final › Open enabled.
  await openList();
  const row = rowOf("Pushistik");
  const concept = row.getByRole("link", { name: "Pushistik — Concept" });
  await expect(concept.getByText("Picked", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  const thumb = concept.locator('img[alt="Pushistik — Concept v2"]');
  await expect(thumb).toBeVisible();
  await expect
    .poll(() => thumb.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  const open = row.getByRole("link", { name: "Open" });
  await expect(open).toBeVisible();
  await expect(open).toHaveAttribute("href", /^http/);
  // Other rows are untouched.
  await expect(rowOf("Mama").getByRole("button", { name: "Open" })).toBeDisabled();

  // Decisions › Picks lists the slot shot by its code.
  await gotoStable(page, `${base}/decisions`);
  await page.getByRole("button", { name: "Picks" }).click();
  await expect(
    page.locator("tbody").getByText("CH_PUSHISTIK_CONCEPT"),
  ).toBeVisible({ timeout: 15_000 });
});

test("C5 the base prompt edits inline, saves on blur, survives a reload, copies, and is in the activity feed", async () => {
  await openList();
  const row = rowOf("Pushistik");
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "Edit base prompt for Pushistik" }).click();
  const editor = page.getByLabel("Base prompt for Pushistik");
  await expect(editor).toBeVisible();
  await editor.fill(PROMPT);
  await page.getByRole("heading", { name: /^Characters/ }).click(); // blur commits
  await expect(row).toContainText("Cartoon still. Baby mammoth", {
    timeout: 10_000,
  });

  await page.reload();
  await expect(rowOf("Pushistik")).toContainText("Cartoon still. Baby mammoth", {
    timeout: 20_000,
  });

  // Copy puts the full prompt on the clipboard.
  await rowOf("Pushistik")
    .getByRole("button", { name: "Copy prompt for Pushistik" })
    .click();
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: "Copied" }),
  ).toBeVisible({ timeout: 10_000 });
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    PROMPT,
  );
  // A character without a prompt has nothing to copy.
  await expect(
    rowOf("Mama").getByRole("button", { name: "Copy prompt for Mama" }),
  ).toBeDisabled();

  // The detail page shows the same prompt and the edit is in the feed.
  await openCharacter();
  await expect(
    page.getByRole("textbox", { name: "Base prompt", exact: true }),
  ).toHaveValue(PROMPT, { timeout: 15_000 });
  await gotoStable(page, base);
  await expect(
    page.getByText(/updated character Pushistik \(base prompt\)/),
  ).toBeVisible({ timeout: 20_000 });
});

test("C6 renaming to Pushistik Jr / PUSHISTIK_JR renames the phase shots — the Review Room shows CH_PUSHISTIK_JR_CONCEPT", async () => {
  await openCharacter();
  await page.getByRole("button", { name: "Rename…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("#rename-character-name").fill("Pushistik Jr");
  await dialog.locator("#rename-character-code").fill("PUSHISTIK_JR");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0, { timeout: 10_000 });

  await expect(page.getByLabel("Character name")).toHaveValue("Pushistik Jr", {
    timeout: 15_000,
  });
  await expect(page.getByText("PUSHISTIK_JR", { exact: true })).toBeVisible();
  await expect(page.getByText("CH_PUSHISTIK_JR_CONCEPT").first()).toBeVisible();

  await gotoStable(page, await reviewRoomHrefOnPage());
  await expect(page).toHaveURL(/\/review\/[a-z0-9]+$/);
  await expect(page.getByText("CH_PUSHISTIK_JR_CONCEPT").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('button[title="v2 — Picked"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForURL(new RegExp(`${base}/review$`), { timeout: 30_000 });

  // The list carries the new name + code; the ledger keeps the pick under
  // the live code; the feed records the former code.
  await openList();
  const row = rowOf("Pushistik Jr");
  await expect(row.getByText("PUSHISTIK_JR", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(row.getByRole("link", { name: "Pushistik Jr — Concept" })).toContainText(
    "Picked",
  );
  await gotoStable(page, `${base}/decisions`);
  await page.getByRole("button", { name: "Picks" }).click();
  await expect(
    page.locator("tbody").getByText("CH_PUSHISTIK_JR_CONCEPT"),
  ).toBeVisible({ timeout: 15_000 });
  await gotoStable(page, base);
  await expect(page.getByText(/formerly CH_PUSHISTIK_CONCEPT/)).toBeVisible({
    timeout: 20_000,
  });
});

test("no unexpected page errors during the character flows", () => {
  expect(errors).toEqual([]);
});
