import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  bulkCreateShots,
  createProduction,
  createStudio,
  PASSWORD,
  signIn,
  signUp,
  signUpInvited,
  trackErrors,
  uniqueEmail,
  uploadOptions,
} from "./helpers";

/**
 * Appearance (spec v2 §(a)): dark by default, Light/System as a per-device
 * preference (`kinolab-theme`), the Review Room held dark regardless, the
 * two controls bound to one state, Settings open to every role, no console
 * noise in either theme, and a both-theme screenshot pass.
 * Serial — one owner, studio and production carry through T1–T7.
 */

test.describe.configure({ mode: "serial" });

const STORAGE_KEY = "kinolab-theme";
const DARK_BG = "rgb(11, 13, 17)"; // --background in .dark
const LIGHT_BG = "rgb(247, 245, 240)"; // --background in :root
const DARK_POPOVER = "rgb(18, 22, 29)"; // --popover in .dark
const SHOT_CODE = "THM010_SH010";
const SCREENSHOT_DIR = path.join(process.cwd(), "e2e", "screenshots");

let ownerEmail: string;
let base: string;
let roomPath: string;
let context: BrowserContext;
let page: Page;
let sharedBrowser: Browser;
let artistContext: BrowserContext | undefined;

const bodyBackground = (p: Page) =>
  p.evaluate(() => getComputedStyle(document.body).backgroundColor);
const htmlClass = (p: Page) =>
  p.evaluate(() => document.documentElement.className);

/** A new context with the preference pre-seeded, as a returning device. */
async function contextWithTheme(theme: string) {
  const ctx = await sharedBrowser.newContext();
  await ctx.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // blocked storage → the app falls back to dark; nothing to seed
      }
    },
    [STORAGE_KEY, theme],
  );
  return ctx;
}

/**
 * goto that survives the half-authenticated first load after a fresh sign-in
 * (see permissions.spec.ts): the shell shows only its skeleton until the
 * Convex client has its token, and one more load recovers.
 */
async function gotoLoaded(p: Page, url: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await p.goto(url).catch(() => undefined);
    const ready = await p
      .getByLabel("Switch studio")
      .waitFor({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (ready) return;
  }
  throw new Error(`app shell never loaded at ${url}`);
}

/**
 * signIn with a fallback: under parallel-agent load the auth round trip can
 * outlive the shared helper's 20s wait even though the session landed (the
 * sign-in page ends with window.location.assign("/")). Same shape as
 * review.spec.ts's signUpResilient.
 */
async function signInResilient(p: Page, email: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await signIn(p, email);
      return;
    } catch {
      // Fall through: check whether we are in fact signed in.
    }
    const landed = await p
      .waitForURL("**/", { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (landed) return;
    await p.goto("/", { waitUntil: "domcontentloaded" }).catch(() => undefined);
    if (!new URL(p.url()).pathname.startsWith("/sign-in")) return;
  }
  throw new Error(`could not sign in ${email}`);
}

/**
 * Local copy of helpers.inviteMember (the shared helper's Role lookup hangs —
 * see the note in permissions.spec.ts).
 */
async function inviteMemberLocal(p: Page, email: string, roleLabel: string) {
  await p.goto("/team");
  await p.getByRole("button", { name: /Invite member/i }).click();
  const dialog = p.locator('[role="dialog"]');
  await dialog.locator("#invite-email").fill(email);
  await dialog.getByRole("combobox").click();
  await p.getByRole("option", { name: roleLabel, exact: true }).click();
  await dialog.getByRole("button", { name: "Invite" }).click();
  await expect(p.getByText(email).first()).toBeVisible({ timeout: 10_000 });
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  sharedBrowser = browser;
  const setup = await browser.newContext();
  const setupPage = await setup.newPage();
  ownerEmail = uniqueEmail("theme-owner");
  await signUp(setupPage, "Thea Owner", ownerEmail);
  await createStudio(setupPage, "Theme Studio");
  base = await createProduction(setupPage, "Theme Feature");
  await bulkCreateShots(setupPage, base, [SHOT_CODE]);
  const shotHref = await setupPage
    .getByRole("link", { name: SHOT_CODE })
    .first()
    .getAttribute("href");
  if (!shotHref) throw new Error("shot link missing");
  await setupPage.goto(shotHref);
  await uploadOptions(setupPage, 2);
  roomPath = `${base}/review/${shotHref.split("/").pop()!}`;
  await setup.close();
});

test.afterAll(async () => {
  await context?.close();
  await artistContext?.close();
});

test("T1 a fresh device opens dark", async () => {
  context = await sharedBrowser.newContext();
  page = await context.newPage();
  await signInResilient(page, ownerEmail);
  await expect(page.getByText("Productions").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  expect(await bodyBackground(page)).toBe(DARK_BG);
  expect(
    await page.evaluate(() => document.documentElement.style.colorScheme),
  ).toBe("dark");
});

test("T2 Settings › Appearance › Light sticks across a reload", async () => {
  await page.goto(`${base}/settings`);
  const group = page.getByRole("radiogroup", { name: "Appearance" });
  await expect(group).toBeVisible();
  // The card comes first, above Details.
  const firstSection = page.locator("main section").first();
  await expect(firstSection).toHaveAttribute("id", "appearance");
  await expect(
    page.getByText("The Review Room is always dark for colour judgement."),
  ).toBeVisible();

  await group.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  await expect(page.locator("html")).toHaveClass(/\blight\b/);
  expect(await bodyBackground(page)).toBe(LIGHT_BG);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  ).toBe("light");

  await page.reload();
  await expect(page.getByRole("radiogroup", { name: "Appearance" })).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  expect(await bodyBackground(page)).toBe(LIGHT_BG);
  await expect(
    page.getByRole("radiogroup", { name: "Appearance" }).getByRole("radio", { name: "Light" }),
  ).toHaveAttribute("aria-checked", "true");
});

test("T3 under Light the Review Room and its dialogs are dark; leaving restores Light", async () => {
  await page.goto(roomPath);
  const room = page.locator("div.dark > div.fixed").first();
  await expect(room).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('button[title="v1 — Candidate"]')).toBeVisible({
    timeout: 15_000,
  });
  // The document itself is held dark, not just the room's subtree.
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  expect(
    await room.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe(DARK_BG);
  // The preference is untouched by the hold.
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  ).toBe("light");

  await page.keyboard.press("x");
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog.getByRole("heading", { name: "Reject v1" })).toBeVisible();
  // Portalled outside the room, yet dark through html.dark.
  await expect(page.locator("html.dark [role='dialog']")).toHaveCount(1);
  expect(
    await dialog.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe(DARK_POPOVER);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // Esc leaves the room → the chosen theme comes back.
  await page.keyboard.press("Escape");
  await page.waitForURL(new RegExp(`${base}/review$`), { timeout: 15_000 });
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  expect(await bodyBackground(page)).toBe(LIGHT_BG);
});

test("T4 the avatar menu writes the same preference the Settings control reads", async () => {
  await page.goto(`${base}/settings`);
  await expect(
    page
      .getByRole("radiogroup", { name: "Appearance" })
      .getByRole("radio", { name: "Light" }),
  ).toHaveAttribute("aria-checked", "true");

  await page.getByLabel("Account").click();
  const menu = page.locator('[data-slot="dropdown-menu-content"]');
  await expect(menu.getByText("Appearance")).toBeVisible();
  await menu.getByRole("menuitemradio", { name: "Dark" }).click();

  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect(
    page
      .getByRole("radiogroup", { name: "Appearance" })
      .getByRole("radio", { name: "Dark" }),
  ).toHaveAttribute("aria-checked", "true");
  expect(await bodyBackground(page)).toBe(DARK_BG);

  // And System is offered in both places.
  await page.getByLabel("Account").click();
  await expect(menu.getByRole("menuitemradio", { name: "System" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("T5 an artist sees Settings in the rail, with Appearance and nothing to manage", async () => {
  const artistEmail = uniqueEmail("theme-artist");
  await inviteMemberLocal(page, artistEmail, "Artist");

  const invited = await signUpInvited(sharedBrowser, artistEmail, "Arlo Artist");
  artistContext = invited.context;
  const artist = invited.page;
  await expect(artist.getByLabel("Switch studio")).toContainText(
    "Theme Studio",
    { timeout: 15_000 },
  );
  await artist.goto(base);
  const rail = artist.locator("aside");
  await expect(rail.getByRole("link", { name: "Settings" })).toBeVisible({
    timeout: 15_000,
  });
  await rail.getByRole("link", { name: "Settings" }).click();
  await artist.waitForURL(/\/settings$/);

  await expect(artist.getByRole("heading", { name: "Settings" })).toBeVisible();
  const first = artist.locator("main section").first();
  await expect(first).toHaveAttribute("id", "appearance");
  await expect(
    artist.getByRole("radiogroup", { name: "Appearance" }),
  ).toBeVisible();
  // No manager cards, no editing controls, no link management.
  await expect(artist.locator("#stages")).toHaveCount(0);
  await expect(artist.locator("#drive")).toHaveCount(0);
  await expect(artist.locator("#prod-name")).toHaveCount(0);
  await expect(artist.getByRole("button", { name: "Add link" })).toHaveCount(0);
  await expect(artist.getByText("Drive hub")).toHaveCount(0);

  // The preference is personal: the artist's choice does not leak.
  await artist
    .getByRole("radiogroup", { name: "Appearance" })
    .getByRole("radio", { name: "Light" })
    .click();
  await expect(artist.locator("html")).not.toHaveClass(/\bdark\b/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
});

test("T6 no console errors or hydration warnings on sign-in and Overview in either theme", async () => {
  test.setTimeout(120_000);
  for (const theme of ["dark", "light"] as const) {
    const ctx = await contextWithTheme(theme);
    const p = await ctx.newPage();
    const errors = trackErrors(p);
    p.on("console", (msg) => {
      if (msg.type() === "warning" && /hydrat/i.test(msg.text())) {
        errors.push(`HYDRATION: ${msg.text().slice(0, 200)}`);
      }
    });
    await p.goto("/sign-in");
    await expect(p.locator("#email")).toBeVisible();
    await expect(p.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
    expect(await bodyBackground(p)).toBe(theme === "dark" ? DARK_BG : LIGHT_BG);

    await p.fill("#email", ownerEmail);
    await p.fill("#password", PASSWORD);
    await p.getByRole("button", { name: "Sign in" }).click();
    await p.waitForURL("**/", { timeout: 20_000 });
    await gotoLoaded(p, base);
    await expect(p.getByRole("heading", { name: "Overview" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(p.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
    await p.waitForTimeout(500);
    expect(errors, `${theme}: ${errors.join(" | ")}`).toEqual([]);
    await ctx.close();
  }
});

test("T7 both-theme screenshots land in e2e/screenshots/{theme}/", async () => {
  test.setTimeout(180_000);
  for (const theme of ["dark", "light"] as const) {
    const dir = path.join(SCREENSHOT_DIR, theme);
    await mkdir(dir, { recursive: true });
    const ctx = await contextWithTheme(theme);
    const p = await ctx.newPage();
    await p.goto("/sign-in");
    await expect(p.locator("#email")).toBeVisible();
    await p.screenshot({ path: path.join(dir, "sign-in.png") });
    await signInResilient(p, ownerEmail);
    const routes: [string, string][] = [
      ["overview", base],
      ["board", `${base}/board`],
      ["shots", `${base}/shots`],
      ["storyboard", `${base}/storyboard`],
      ["references", `${base}/references`],
      ["characters", `${base}/characters`],
      ["review", `${base}/review`],
      ["settings", `${base}/settings`],
    ];
    for (const [name, url] of routes) {
      await gotoLoaded(p, url);
      await p.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => undefined);
      await p.waitForTimeout(400);
      await p.screenshot({ path: path.join(dir, `${name}.png`) });
    }
    await gotoLoaded(p, roomPath);
    await expect(p.locator('button[title="v1 — Candidate"]')).toBeVisible({
      timeout: 15_000,
    });
    await p.screenshot({ path: path.join(dir, "review-room.png") });
    await ctx.close();
  }
});
