import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  createProduction,
  createStudio,
  PASSWORD,
  signIn,
  trackErrors,
  uniqueEmail,
  uploadOptions,
} from "./helpers";

/**
 * Board: six fixed stage columns, native HTML5 drag between stages, the
 * stage-gate sign-off flow (request → reject-with-note → approve), and the
 * v2 editable/zoomable card (spec f): card menu (status / assignee / due
 * date), ?tab= deep links, Picked chip, cover thumbnails with the
 * Compact | Cards toggle, column-title links and role gating.
 *
 * Owner account: by default a throwaway sign-up like every other spec. Set
 * E2E_EMAIL + E2E_PASSWORD to run as an existing local account instead (it is
 * signed up with those credentials on first use); the run then creates a
 * fresh production in that account's studio and invites two throwaway
 * members into it.
 */

const OWNER_EMAIL = process.env.E2E_EMAIL;
const OWNER_PASSWORD = process.env.E2E_PASSWORD;

/**
 * Deterministically wait until /sign-in is hydrated: React attaches its
 * internal __reactProps$ key to DOM nodes once handlers are wired up. A blind
 * click before that point is lost. Under concurrent compile load the dev
 * server can also serve a corrupt JS chunk that kills hydration for that
 * load entirely — a reload fetches a good one.
 */
async function waitForSignInHydration(page: Page) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const hydrated = await page
      .waitForFunction(
        () => {
          const btns = Array.from(document.querySelectorAll("button"));
          const btn = btns.find((x) =>
            (x.textContent || "").includes("New here? Create an account"),
          );
          return (
            !!btn && Object.keys(btn).some((k) => k.startsWith("__reactProps"))
          );
        },
        undefined,
        { timeout: 10_000 },
      )
      .then(() => true)
      .catch(() => false);
    if (hydrated) return;
    await page.reload().catch(() => {});
  }
  throw new Error("sign-in page never hydrated");
}

/**
 * Hydration-safe sign-up with a sign-in fallback: under parallel-agent load
 * the auth roundtrip can outlive the wait even though the account was
 * created, or the first load after sign-up can land half-authenticated
 * (blank shell). Retry until the signed-in app is actually there.
 *
 * "There" is EITHER the studio switcher OR the create-studio form: a brand
 * new account has no studio, so the shell renders <CreateStudio /> and no
 * switcher exists to wait for. Waiting only for the switcher meant a fresh
 * sign-up could never succeed and every board test died in beforeAll.
 */
async function signUpResilient(page: Page, name: string, email: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
      await waitForSignInHydration(page);
      await page.getByText("New here? Create an account").click();
      await expect(page.locator("#name")).toBeVisible({ timeout: 10_000 });
      await page.fill("#name", name);
      await page.fill("#email", email);
      await page.fill("#password", PASSWORD);
      await page.getByRole("button", { name: "Create account" }).click();
      await page.waitForURL("**/", { timeout: 30_000 });
    } catch {
      // Fall through: the account may exist anyway — check by signing in.
    }
    const signedIn = await page
      .locator('#studio-name, [aria-label="Switch studio"]')
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (signedIn) return;
    // Half-authenticated or bounced: a plain reload of / usually recovers,
    // otherwise sign in with the credentials we just created.
    await page.goto("/", { waitUntil: "domcontentloaded" }).catch(() => {});
    if (
      await page
        .locator('#studio-name, [aria-label="Switch studio"]')
        .first()
        .waitFor({ state: "visible", timeout: 10_000 })
        .then(() => true)
        .catch(() => false)
    )
      return;
    try {
      await signIn(page, email);
      if (
        await page
          .locator('#studio-name, [aria-label="Switch studio"]')
          .first()
          .waitFor({ state: "visible", timeout: 10_000 })
          .then(() => true)
          .catch(() => false)
      )
        return;
    } catch {
      // Account presumably never got created — loop for a fresh sign-up.
    }
  }
  throw new Error(`could not sign up ${email}`);
}

/** Sign in with an explicit password; false when the credentials are refused. */
async function signInWithPassword(
  page: Page,
  email: string,
  password: string,
): Promise<boolean> {
  await page.goto("/sign-in");
  await expect(page.locator("#email")).toBeVisible({ timeout: 20_000 });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Sign in" }).click();
  return page
    .waitForURL((url) => !url.pathname.startsWith("/sign-in"), {
      timeout: 20_000,
    })
    .then(() => true)
    .catch(() => false);
}

/** Sign up with an explicit password (first run of a named local account). */
async function signUpWithPassword(
  page: Page,
  name: string,
  email: string,
  password: string,
) {
  await page.goto("/sign-in");
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
 * createProduction with a fallback: the shared helper's final waitForURL can
 * expire while the client-side navigation is still in flight under load.
 */
async function createProductionResilient(
  page: Page,
  name: string,
): Promise<string> {
  try {
    return await createProduction(page, name);
  } catch {
    // The wizard usually completed — recover the base path from the URL.
  }
  await page.waitForURL(/\/p\/[a-z0-9]+/, { timeout: 120_000 });
  return new URL(page.url()).pathname.match(/^\/p\/[a-z0-9]+/)![0];
}

/**
 * Full-page navigation that survives the shared dev server: a goto can die
 * with ERR_ABORTED when another agent's hot reload lands mid-navigation, or
 * stall on "load" for minutes while the server recompiles. Bounded waits on
 * DOMContentLoaded, retried, so one stall cannot eat a whole test budget.
 */
async function gotoResilient(page: Page, path: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded", timeout: 30_000 });
      return;
    } catch (e) {
      lastError = e;
      await page.waitForTimeout(500);
    }
  }
  throw lastError;
}

/**
 * Local fix for helpers.bulkCreateShots: the "New shots" dialog now keeps
 * both tab panels mounted, so /^Create \d+ shots?$/ matches the Generate
 * tab's disabled submit as well as the Import tab's live one (strict-mode
 * violation). Scope to the enabled button inside the Import panel.
 */
async function createShotsViaImport(page: Page, base: string, codes: string[]) {
  await gotoResilient(page, `${base}/shots`);
  const openButton = page.getByRole("button", { name: "New shots", exact: true });
  try {
    await openButton.waitFor({ timeout: 20_000 });
  } catch {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await openButton.waitFor({ timeout: 20_000 });
  }
  await openButton.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Import" }).click();
  const codesBox = dialog.getByLabel("Shot codes");
  await codesBox.fill(codes.join("\n"));
  await dialog
    .getByRole("button", { name: /^Create \d+ shots?$/, disabled: false })
    .click();
  // Wait for the modal to fully close so its overlay can't swallow clicks.
  await dialog.waitFor({ state: "detached", timeout: 10_000 });
  await expect(page.getByText(codes[codes.length - 1]).first()).toBeVisible({
    timeout: 15_000,
  });
}

/** Invite an email into the current studio from /team (scoped to the dialog). */
async function inviteMemberLocal(page: Page, email: string, roleLabel: string) {
  await gotoResilient(page, "/team");
  await page.getByRole("button", { name: /Invite member/i }).click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.locator("#invite-email").fill(email);
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: roleLabel, exact: true }).click();
  await dialog.getByRole("button", { name: "Invite" }).click();
  await expect(page.getByText(email).first()).toBeVisible({ timeout: 10_000 });
}

/**
 * Full-page navigation for a signed-in throwaway member. The first load after
 * a fresh sign-up can land half-authenticated (blank shell) or bounce to
 * /sign-in; reload or sign in again until the top bar is there.
 */
async function gotoSignedIn(page: Page, email: string, path: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const navigated = await page
      .goto(path)
      .then(() => true)
      .catch(() => false);
    if (!navigated) continue;
    if (/\/sign-in/.test(page.url())) {
      await expect(page.locator("#email")).toBeVisible({ timeout: 10_000 });
      await page.fill("#email", email);
      await page.fill("#password", PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL("**/", { timeout: 10_000 }).catch(() => {});
      continue;
    }
    const topbarVisible = await page
      .getByLabel("Switch studio")
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (topbarVisible) return;
  }
  throw new Error(`Could not reach ${path} signed in as ${email}`);
}

test.describe.configure({ mode: "serial" });

const COLUMN_LABELS = [
  "Development",
  "Pre-Production",
  "Previews & Review",
  "Production",
  "Post-Production",
  "Final Edit & Delivery",
] as const;

const CODES = ["SC010_SH010", "SC010_SH020", "SC010_SH030"];

// Unique per run: the wizard derives the production code from the name's
// initials, and codes are unique per studio (matters for a reused account).
const RUN_TAG = Date.now().toString(36).slice(-5).toUpperCase();
const PRODUCTION_NAME = `Board ${RUN_TAG.split("").join(" ")}`;

let context: BrowserContext;
let page: Page;
let errors: string[];
let base: string;
let artistContext: BrowserContext | undefined;
let viewerContext: BrowserContext | undefined;

const artistEmail = uniqueEmail("board-artist");
const viewerEmail = uniqueEmail("board-viewer");
// Unique per run: on a reused account the studio keeps earlier runs' members,
// and the Assign submenu lists them all by name.
const ARTIST_NAME = `Arlo Artist ${RUN_TAG}`;
const VIEWER_NAME = `Vera Viewer ${RUN_TAG}`;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(420_000);
  context = await browser.newContext();
  page = await context.newPage();
  errors = trackErrors(page);
  if (OWNER_EMAIL && OWNER_PASSWORD) {
    const signedIn = await signInWithPassword(page, OWNER_EMAIL, OWNER_PASSWORD);
    if (!signedIn)
      await signUpWithPassword(page, "Niek", OWNER_EMAIL, OWNER_PASSWORD);
    // A fresh account lands on the create-studio screen; an existing one on
    // its studio home.
    await page
      .locator('#studio-name, [aria-label="Switch studio"]')
      .first()
      .waitFor({ timeout: 30_000 });
    if (await page.locator("#studio-name").isVisible())
      await createStudio(page, "Board Studio");
  } else {
    await signUpResilient(page, "Board Owner", uniqueEmail("board-owner"));
    await createStudio(page, "Board Studio");
  }
  base = await createProductionResilient(page, PRODUCTION_NAME);
  await createShotsViaImport(page, base, CODES);
});

test.afterAll(async () => {
  await Promise.race([
    Promise.allSettled([
      viewerContext?.close(),
      artistContext?.close(),
      context?.close(),
    ]),
    new Promise((resolve) => setTimeout(resolve, 15_000)),
  ]);
});

function column(name: string): Locator {
  return page.getByRole("region", { name, exact: true });
}

/** The card for a shot code — a focusable div; its code/title are the links. */
function cardFor(code: string, on: Page = page): Locator {
  return on.locator(`[data-shot-card="${code}"]`);
}

/** Open a card's ⋯ menu (the button is hover/focus-revealed). */
async function openCardMenu(code: string, on: Page = page) {
  const card = cardFor(code, on);
  await card.hover();
  await card.getByRole("button", { name: `Actions for ${code}` }).click();
  await expect(on.getByRole("menu").first()).toBeVisible();
}

/**
 * Native HTML5 drag-and-drop. Playwright's dragTo drives real input events
 * (works for HTML5 dnd in Chromium); if the card did not move we fall back to
 * dispatching DragEvents with a shared DataTransfer, which exercises the same
 * app handlers (dragstart sets application/x-slate-shot, drop reads it).
 */
async function dragCardToColumn(card: Locator, target: Locator, code: string) {
  await card.dragTo(target).catch(() => undefined);
  await page.waitForTimeout(500);
  const moved = await target.getByText(code, { exact: true }).count();
  if (moved > 0) return;

  const src = await card.elementHandle();
  const tgt = await target.elementHandle();
  if (!src || !tgt) throw new Error("drag: element handles not available");
  await page.evaluate(
    ([source, dest]) => {
      const dt = new DataTransfer();
      const rect = dest.getBoundingClientRect();
      const at = {
        clientX: Math.floor(rect.x + rect.width / 2),
        clientY: Math.floor(rect.y + rect.height / 2),
      };
      const opts = { bubbles: true, cancelable: true, composed: true };
      source.dispatchEvent(
        new DragEvent("dragstart", { ...opts, dataTransfer: dt }),
      );
      dest.dispatchEvent(
        new DragEvent("dragenter", { ...opts, dataTransfer: dt, ...at }),
      );
      dest.dispatchEvent(
        new DragEvent("dragover", { ...opts, dataTransfer: dt, ...at }),
      );
      dest.dispatchEvent(
        new DragEvent("drop", { ...opts, dataTransfer: dt, ...at }),
      );
      source.dispatchEvent(
        new DragEvent("dragend", { ...opts, dataTransfer: dt }),
      );
    },
    [src, tgt] as const,
  );
}

test("renders the six fixed stage columns with every shot in Production", async () => {
  await gotoResilient(page, `${base}/board`);
  for (const label of COLUMN_LABELS) {
    await expect(column(label)).toBeVisible({ timeout: 15_000 });
  }
  // All three shots land in the Production column by default.
  const production = column("Production");
  for (const code of CODES) {
    await expect(production.getByText(code, { exact: true })).toBeVisible();
  }
  // The other five columns are empty.
  for (const label of COLUMN_LABELS) {
    if (label === "Production") continue;
    await expect(
      column(label).getByText("No shots in this stage"),
    ).toBeVisible();
  }
});

test("dragging a card from Production to Post-Production persists across reload", async () => {
  await gotoResilient(page, `${base}/board`);
  const production = column("Production");
  const post = column("Post-Production");
  await expect(
    production.getByText(CODES[0], { exact: true }),
  ).toBeVisible({ timeout: 15_000 });

  const card = production.locator(`[data-shot-card="${CODES[0]}"]`);
  await dragCardToColumn(card, post, CODES[0]);

  // Optimistic move lands the card in Post immediately.
  await expect(post.getByText(CODES[0], { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    production.getByText(CODES[0], { exact: true }),
  ).toHaveCount(0);

  // Server persisted it — the move survives a full reload.
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(
    column("Post-Production").getByText(CODES[0], { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    column("Production").getByText(CODES[0], { exact: true }),
  ).toHaveCount(0);
});

test("gate flow: request sign-off, reject requires a note, approve marks stage done", async () => {
  test.setTimeout(120_000);

  // --- Settings: make the owner a Development gate approver -----------------
  await gotoResilient(page, `${base}/settings`);
  const stages = page.locator("#stages");
  await expect(stages.getByText("Stages & gates")).toBeVisible({
    timeout: 15_000,
  });
  // Rows are in stage order — the first "No approvers" trigger is Development.
  const noApprovers = stages.getByRole("button", { name: "No approvers" });
  const before = await noApprovers.count();
  await noApprovers.first().click();
  await expect(
    page.getByText("Gate approvers — Development"),
  ).toBeVisible();
  // Tick the first member with an account (the owner on a fresh studio).
  await page.getByRole("checkbox").first().click();
  await expect(noApprovers).toHaveCount(before - 1, { timeout: 10_000 });
  await page.keyboard.press("Escape");

  // --- Board: request sign-off ---------------------------------------------
  await gotoResilient(page, `${base}/board`);
  const dev = column("Development");
  await expect(dev).toBeVisible({ timeout: 15_000 });
  await expect(dev.getByText("Gate open")).toBeVisible();

  await dev.getByRole("button", { name: "Development menu" }).click();
  await page.getByRole("menuitem", { name: "Request sign-off", exact: true }).click();
  await expect(dev.getByText("Gate requested")).toBeVisible({
    timeout: 10_000,
  });

  // --- Reject: confirm disabled until a note is typed ----------------------
  await dev.getByRole("button", { name: "Development menu" }).click();
  await page.getByRole("menuitem", { name: /Reject gate/ }).click();
  const rejectDialog = page.getByRole("dialog");
  await expect(
    rejectDialog.getByText("Reject gate — Development"),
  ).toBeVisible();
  const rejectButton = rejectDialog.getByRole("button", {
    name: "Reject gate",
  });
  await expect(rejectButton).toBeDisabled();
  await rejectDialog.locator("#gate-note").fill("Opening beat needs work");
  await expect(rejectButton).toBeEnabled();
  await rejectButton.click();
  await expect(dev.getByText("Gate rejected")).toBeVisible({
    timeout: 10_000,
  });

  // --- Request again, then approve (note optional) -------------------------
  await dev.getByRole("button", { name: "Development menu" }).click();
  await page.getByRole("menuitem", { name: "Request sign-off", exact: true }).click();
  await expect(dev.getByText("Gate requested")).toBeVisible({
    timeout: 10_000,
  });

  await dev.getByRole("button", { name: "Development menu" }).click();
  await page.getByRole("menuitem", { name: /Approve gate/ }).click();
  const approveDialog = page.getByRole("dialog");
  await expect(
    approveDialog.getByText("Approve gate — Development"),
  ).toBeVisible();
  // Note stays empty — it is optional for an approval.
  await approveDialog.getByRole("button", { name: "Approve gate" }).click();
  await expect(dev.getByText("Gate approved")).toBeVisible({
    timeout: 10_000,
  });
  // Approving the gate also completes the stage.
  await expect(dev.getByText("Done", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
});

// ---------------------------------------------------------------------------
// v2 (spec f): editable, zoomable cards
// ---------------------------------------------------------------------------

test("F1 card menu → Status → In review updates the pill live, persists, and shows in History", async () => {
  test.setTimeout(90_000);
  const code = CODES[1];
  await gotoResilient(page, `${base}/board`);
  await expect(cardFor(code)).toBeVisible({ timeout: 15_000 });

  await openCardMenu(code);
  await page.getByRole("menuitem", { name: "Status", exact: true }).click();
  await page.getByRole("menuitem", { name: "In review", exact: true }).click();

  // Optimistic: the pill flips without a reload…
  const pill = cardFor(code).getByRole("button", {
    name: `Change status of ${code}`,
  });
  await expect(pill).toContainText("In review");

  // …and the server agreed — it survives a full reload.
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(
    cardFor(code).getByRole("button", { name: `Change status of ${code}` }),
  ).toContainText("In review", { timeout: 15_000 });

  // The change is on the shot's History tab (menu → History deep link).
  await openCardMenu(code);
  await page.getByRole("menuitem", { name: "History", exact: true }).click();
  await page.waitForURL(/\/shots\/[a-z0-9]+\?tab=history$/, {
    timeout: 15_000,
  });
  await page.getByRole("tab", { name: "History" }).click();
  await expect(
    page.getByText(new RegExp(`moved ${code} to In review`)),
  ).toBeVisible({ timeout: 15_000 });
});

test("F4 Approved on a shot without a pick → server refusal toast, pill unchanged", async () => {
  const code = CODES[1];
  await gotoResilient(page, `${base}/board`);
  await expect(cardFor(code)).toBeVisible({ timeout: 15_000 });

  // The status pill opens the same Status list as the menu.
  await cardFor(code)
    .getByRole("button", { name: `Change status of ${code}` })
    .click();
  await page.getByRole("menuitem", { name: "Approved", exact: true }).click();

  await expect(
    page.getByText("Pick a version before approving this shot"),
  ).toBeVisible({ timeout: 10_000 });
  const pill = cardFor(code).getByRole("button", {
    name: `Change status of ${code}`,
  });
  await expect(pill).toContainText("In review");
  await expect(pill).not.toContainText("Approved");
});

test("F3 due-date popover: set shows the chip, Clear removes it", async () => {
  const code = CODES[1];
  await gotoResilient(page, `${base}/board`);
  const card = cardFor(code);
  await expect(card).toBeVisible({ timeout: 15_000 });

  const dueChip = card.getByRole("button", { name: `Due date of ${code}` });
  await card.hover();
  await dueChip.click();
  await page.getByLabel("Due date", { exact: true }).fill("2026-09-24");
  await expect(dueChip).toContainText("24 Sep", { timeout: 10_000 });
  await page.keyboard.press("Escape");

  // Persisted: still there after a reload.
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(
    cardFor(code).getByRole("button", { name: `Due date of ${code}` }),
  ).toContainText("24 Sep", { timeout: 15_000 });

  // Clear from the same popover (opened from the card menu this time).
  await openCardMenu(code);
  await page.getByRole("menuitem", { name: /Due date/ }).click();
  await expect(page.getByLabel("Due date", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(
    cardFor(code).getByRole("button", { name: `Due date of ${code}` }),
  ).not.toContainText("24 Sep", { timeout: 10_000 });
});

let shotId: string; // SC010_SH020, once it has options

test("F5 '4 options' → ?tab=options; menu Discussion → ?tab=discussion; Picked chip → Review Room", async () => {
  test.setTimeout(150_000);
  const code = CODES[1];

  // Give the shot four options (the owner uploads on the shot page).
  await gotoResilient(page, `${base}/board`);
  await cardFor(code).getByRole("link", { name: code, exact: true }).click();
  await page.waitForURL(/\/shots\/[a-z0-9]+$/, { timeout: 15_000 });
  shotId = new URL(page.url()).pathname.split("/").pop()!;
  await uploadOptions(page, 4);

  // "4 options" deep-links into the Options tab.
  await gotoResilient(page, `${base}/board`);
  await cardFor(code).getByRole("link", { name: "4 options" }).click();
  await page.waitForURL(new RegExp(`/shots/${shotId}\\?tab=options$`), {
    timeout: 15_000,
  });
  await expect(page.getByRole("tab", { name: /^Options/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // Menu → Discussion opens the Discussion tab.
  await gotoResilient(page, `${base}/board`);
  await openCardMenu(code);
  await page.getByRole("menuitem", { name: "Discussion", exact: true }).click();
  await page.waitForURL(new RegExp(`/shots/${shotId}\\?tab=discussion$`), {
    timeout: 15_000,
  });
  await expect(
    page.getByRole("tab", { name: /^Discussion/ }),
  ).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });

  // Pick v1 in the Review Room, then the card grows a Picked chip → the room.
  await gotoResilient(page, `${base}/review/${shotId}`);
  await expect(page.getByText("v1").first()).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("p");
  const dialog = page.locator('[role="dialog"]');
  await dialog.getByRole("button", { name: "Pick this version" }).click();
  await page.waitForURL(new RegExp(`${base}/review$`), { timeout: 30_000 });

  await gotoResilient(page, `${base}/board`);
  const chip = cardFor(code).getByRole("link", { name: /^Picked/ });
  await expect(chip).toBeVisible({ timeout: 15_000 });
  await chip.click();
  await page.waitForURL(new RegExp(`/review/${shotId}$`), { timeout: 15_000 });
});

test("F9 cover thumbnail shows on a shot with options; Compact hides it and persists", async () => {
  const code = CODES[1];
  await gotoResilient(page, `${base}/board`);
  const thumb = () => cardFor(code).getByRole("img", { name: `${code} cover` });
  await expect(thumb()).toBeVisible({ timeout: 15_000 });
  // A shot without options has no strip.
  await expect(
    cardFor(CODES[2]).getByRole("img", { name: `${CODES[2]} cover` }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Compact" }).click();
  await expect(thumb()).toHaveCount(0);

  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(cardFor(code)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Compact" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(thumb()).toHaveCount(0);

  await page.getByRole("button", { name: "Cards" }).click();
  await expect(thumb()).toBeVisible();
});

test("F6 column title → /shots?stage=production lists only that stage", async () => {
  await gotoResilient(page, `${base}/board`);
  const production = column("Production");
  await expect(production).toBeVisible({ timeout: 15_000 });
  await production
    .getByRole("link", { name: "Production", exact: true })
    .click();
  await page.waitForURL(/\/shots\?stage=production$/, { timeout: 15_000 });
  // SH020 + SH030 are in Production; SH010 was dragged to Post.
  await expect(page.getByText(CODES[1], { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(CODES[2], { exact: true }).first()).toBeVisible();
  await expect(page.getByText(CODES[0], { exact: true })).toHaveCount(0);
});

test("F2 assign from the card notifies the member; F8 artist gets the menu only on own shots, viewer none", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const code = CODES[2];

  await inviteMemberLocal(page, artistEmail, "Artist");
  await inviteMemberLocal(page, viewerEmail, "Viewer");

  // The artist claims the invite so they exist as an assignable member.
  artistContext = await browser.newContext();
  const artistPage = await artistContext.newPage();
  await signUpResilient(artistPage, ARTIST_NAME, artistEmail);
  await expect(artistPage.getByLabel("Switch studio")).toBeVisible({
    timeout: 20_000,
  });

  // --- F2: owner assigns from the card menu ---------------------------------
  await gotoResilient(page, `${base}/board`);
  await expect(cardFor(code)).toBeVisible({ timeout: 15_000 });
  await openCardMenu(code);
  await page.getByRole("menuitem", { name: "Assign to", exact: true }).click();
  await page.getByRole("menuitem", { name: new RegExp(ARTIST_NAME) }).click();
  // Avatar appears (initials fallback), and it survives a reload.
  const avatar = cardFor(code).getByRole("button", { name: `Assign ${code}` });
  await expect(avatar).toContainText("AA");
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(
    cardFor(code).getByRole("button", { name: `Assign ${code}` }),
  ).toContainText("AA", { timeout: 15_000 });

  // The member got a shot_assigned notification in their bell.
  await gotoSignedIn(artistPage, artistEmail, `${base}/board`);
  await artistPage.getByRole("button", { name: "Notifications" }).click();
  await expect(
    artistPage.getByText(`assigned you ${code}`),
  ).toBeVisible({ timeout: 15_000 });
  await artistPage.keyboard.press("Escape");

  // --- F8: artist — menu only on own shot, working statuses only ------------
  await expect(cardFor(code, artistPage)).toBeVisible({ timeout: 15_000 });
  await expect(
    artistPage.getByRole("button", { name: `Actions for ${code}` }),
  ).toHaveCount(1);
  await expect(
    artistPage.getByRole("button", { name: `Actions for ${CODES[0]}` }),
  ).toHaveCount(0);
  await expect(
    artistPage.getByRole("button", { name: `Actions for ${CODES[1]}` }),
  ).toHaveCount(0);
  // No stage-status selects or gate menus either (permissions.spec asserts the same).
  // Scoped to `main`: the rail's own collapse / customise controls are
  // also labelled "… menu" and are not a stage's menu.
  await expect(
    artistPage.locator('main [aria-label$=" menu"]'),
  ).toHaveCount(0);

  await openCardMenu(code, artistPage);
  await artistPage
    .getByRole("menuitem", { name: "Status", exact: true })
    .click();
  await expect(
    artistPage.getByRole("menuitem", { name: "In review", exact: true }),
  ).toBeVisible();
  await expect(
    artistPage.getByRole("menuitem", { name: "Approved", exact: true }),
  ).toHaveCount(0);
  await expect(
    artistPage.getByRole("menuitem", { name: "Delivered", exact: true }),
  ).toHaveCount(0);
  // Artists can actually move their own shot along the working statuses.
  await artistPage.getByRole("menuitem", { name: "Generating", exact: true }).click();
  await expect(
    cardFor(code, artistPage).getByRole("button", {
      name: `Change status of ${code}`,
    }),
  ).toContainText("Generating", { timeout: 10_000 });

  // --- F8: viewer — no menu anywhere, links still work ---------------------
  viewerContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();
  await signUpResilient(viewerPage, VIEWER_NAME, viewerEmail);
  await expect(viewerPage.getByLabel("Switch studio")).toBeVisible({
    timeout: 20_000,
  });
  await gotoSignedIn(viewerPage, viewerEmail, `${base}/board`);
  await expect(cardFor(code, viewerPage)).toBeVisible({ timeout: 15_000 });
  await expect(
    viewerPage.getByRole("button", { name: /^Actions for / }),
  ).toHaveCount(0);
  await expect(
    viewerPage.locator('[aria-label^="Change status of"]'),
  ).toHaveCount(0);
  await expect(viewerPage.locator('[aria-label^="Assign "]')).toHaveCount(0);
  await expect(viewerPage.locator('[aria-label^="Due date of"]')).toHaveCount(0);
  await viewerPage
    .getByRole("link", { name: CODES[1], exact: true })
    .click();
  await viewerPage.waitForURL(new RegExp(`/shots/${shotId}$`), {
    timeout: 15_000,
  });
});

test("no unexpected page errors during the board flows", () => {
  expect(errors).toEqual([]);
});
