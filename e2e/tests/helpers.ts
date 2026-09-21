import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * Shared helpers for the Kinolab E2E suite. Every spec creates its own
 * throwaway users/studios (multi-tenant isolation keeps them invisible to
 * real accounts), so specs can run in parallel against one dev server.
 */

export const PASSWORD = "slate-e2e-password-1";

/**
 * `page.goto` that survives a navigation already in flight. The sign-in page
 * finishes with `window.location.assign("/")` and the middleware redirects on
 * top of that, so a goto issued into either one dies with
 * "net::ERR_ABORTED; maybe frame was detached" — a harness race, not a product
 * bug, and the single most common source of flakes in this suite.
 */
export async function gotoStable(page: Page, path: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ok = await page
      .goto(path)
      .then(() => true)
      .catch(() => false);
    if (ok) return;
    await page.waitForTimeout(400);
  }
  // Out of retries: let a genuine navigation failure surface as itself.
  await page.goto(path);
}


let counter = 0;
export function uniqueEmail(tag: string): string {
  counter += 1;
  return `${tag}-${Date.now()}-${counter}@e2e.slate`;
}

/** Sign UP a brand-new user; lands on / (create-studio screen or studio home). */
export async function signUp(page: Page, name: string, email: string) {
  await gotoStable(page, "/sign-in");
  // Hydration-safe: retry the toggle until the name field actually appears.
  await expect(async () => {
    await page.getByText("New here? Create an account").click();
    await expect(page.locator("#name")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await page.fill("#name", name);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/", { timeout: 45_000 });
}

/** Sign IN an existing user. */
export async function signIn(page: Page, email: string) {
  await gotoStable(page, "/sign-in");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/", { timeout: 20_000 });
}

export async function createStudio(page: Page, name: string) {
  await page.fill("#studio-name", name);
  await page.getByRole("button", { name: "Create studio" }).click();
  await expect(page.getByText("Productions").first()).toBeVisible({ timeout: 15_000 });
}

/**
 * Create a production through the wizard (skipping the Drive step) and
 * return its base URL path ("/p/{id}").
 */
export async function createProduction(
  page: Page,
  name: string,
  opts: { episodic?: boolean; episodes?: number } = {},
): Promise<string> {
  await gotoStable(page, "/new");
  await page.getByLabel(/name/i).first().fill(name);
  if (opts.episodic) {
    await page.getByRole("button", { name: /episodic/i }).click();
    if (opts.episodes) {
      await page.getByLabel(/episode/i).fill(String(opts.episodes));
    }
  }
  await page.getByRole("button", { name: /Create & continue/i }).click();
  await page.getByText(/Skip for now/i).waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: /Skip for now/i }).click();
  await page.getByRole("button", { name: /Open production/i }).waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: /Open production/i }).click();
  await page.waitForURL(/\/p\/[a-z0-9]+/, { timeout: 15_000 });
  const url = new URL(page.url());
  const base = url.pathname.match(/^\/p\/[a-z0-9]+/)![0];
  return base;
}

/**
 * `goto` for a signed-in user that survives the half-authenticated first
 * load: the middleware accepts the session cookie but the Convex client has
 * no token yet, so the app shell shows only its skeleton. One reload
 * recovers; a second failure is a real problem and surfaces as an error.
 */
export async function gotoLoaded(page: Page, url: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(url).catch(() => undefined);
    const ready = await page
      .getByLabel("Switch studio")
      .waitFor({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (ready) return;
  }
  throw new Error(`app shell never loaded at ${url}`);
}

/**
 * Bulk-create shots from codes on the Shots tab through "New shots" › Import
 * (v2 item d): open the dialog, switch to the Import tab, paste one code per
 * line, submit. Everything is scoped to the dialog so the empty state's
 * inline copy of the same panel can never be confused with it.
 */
export async function bulkCreateShots(page: Page, base: string, codes: string[]) {
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
  await dialog.getByLabel("Shot codes").fill(codes.join("\n"));
  // The dialog keeps BOTH tab panels mounted, so /^Create \d+ shots?$/ also
  // matches the Generate tab's disabled submit (strict-mode violation).
  // Scope to the enabled one, which is the Import panel's.
  await dialog
    .getByRole("button", { name: /^Create \d+ shots?$/, disabled: false })
    .click();
  // Wait for the modal to fully close so its overlay can't swallow clicks.
  await dialog.waitFor({ state: "detached", timeout: 10_000 });
  await expect(page.getByText(codes[codes.length - 1]).first()).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Switch the Shots page to the table. The contact sheet is the default view
 * since v1.3, so a spec that asserts on `tbody tr` or the table's own row
 * controls has to ask for the table rather than assume it. Idempotent: the
 * toggle is a plain button and clicking the active one is a no-op.
 */
export async function showShotsTable(page: Page) {
  const button = page.getByRole("button", { name: "Table view" });
  await button.waitFor({ timeout: 20_000 });
  await button.click();
  await expect(page.locator("table")).toBeVisible({ timeout: 15_000 });
}

const PNG_RED =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAGklEQVR4nGP8z8Dwn4GBgYGJAQowMTAwMAAAJgYBLZ01WQAAAABJRU5ErkJggg==";
const PNG_BLUE =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAG0lEQVR4nGNkYPj/n4GBgYGJAQYwMzAwMAAAJgIBFeXY+MAAAAAASUVORK5CYII=";

/** Upload n placeholder images as versions on the CURRENT shot-detail page. */
export async function uploadOptions(page: Page, n: number) {
  const files = Array.from({ length: n }, (_, i) => ({
    name: `option-${i + 1}.png`,
    mimeType: "image/png",
    buffer: Buffer.from(i % 2 === 0 ? PNG_RED : PNG_BLUE, "base64"),
  }));
  await page.locator('input[type="file"]').first().setInputFiles(files);
  await expect(page.getByText(`v${n}`).first()).toBeVisible({ timeout: 30_000 });
}

/**
 * Invite an email to the CURRENT user's studio from the /team page.
 * rolelabel: "Producer" | "Creative Director" | "Supervisor" | "Artist" | "Viewer"
 */
export async function inviteMember(page: Page, email: string, roleLabel: string) {
  await gotoStable(page, "/team");
  await page.getByRole("button", { name: /Invite member/i }).click();
  await page.fill("#invite-email", email);
  const dialog = page.locator('[role="dialog"]');
  await dialog.getByRole("combobox", { name: "Role" }).click();
  await page.getByRole("option", { name: roleLabel, exact: true }).click();
  await dialog.getByRole("button", { name: "Invite" }).click();
  await expect(page.getByText(email).first()).toBeVisible({ timeout: 10_000 });
}

/** New context + page signed up as an invited member (claims the invite). */
export async function signUpInvited(
  browser: Browser,
  email: string,
  name: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signUp(page, name, email);
  return { context, page };
}

/** Collect console/page errors; assert none at the end of a spec. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`PAGEERROR: ${String(err).slice(0, 200)}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Convex mutation rejections surface as console errors by design when
      // a test intentionally triggers a server refusal; filter those.
      if (text.includes("[CONVEX")) return;
      if (text.includes("Failed to load resource")) return;
      errors.push(text.slice(0, 200));
    }
  });
  return errors;
}
