/**
 * Regenerate the screenshots the in-app guide (/help) shows.
 *
 *   pnpm dev                  # app + a seeded local backend
 *   node scripts/capture-help.mjs
 *
 * Captures into public/help/ against the seeded Aurora North demo, so the
 * guide can be refreshed after a UI change instead of drifting. Only the
 * files app/(app)/help/page.tsx actually references are taken — anything
 * else would rot unnoticed.
 *
 * Env: HELP_BASE (default http://localhost:3000), HELP_EMAIL, HELP_PASSWORD.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.HELP_BASE ?? "http://localhost:3000";
const EMAIL = process.env.HELP_EMAIL ?? "producer@demo.slate";
const PASSWORD = process.env.HELP_PASSWORD ?? "slate-qa-password-1";
const OUT = "public/help";

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const problems = [];
page.on("pageerror", (e) => problems.push(String(e).slice(0, 200)));

/** Wait for real content: a reload re-bootstraps the Convex auth token. */
async function settle() {
  await page
    .locator('[aria-label="Switch studio"]')
    .waitFor({ state: "visible", timeout: 30_000 });
  await page
    .waitForFunction(
      () => document.querySelectorAll(".animate-pulse").length === 0,
      null,
      { timeout: 20_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(900);
}

async function snap(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("  " + name);
}

/** Rail links carry count badges, so match on the prefix. */
const rail = (name) =>
  page
    .locator("aside")
    .first()
    .getByRole("link", { name: new RegExp("^" + name) })
    .first();

// A click before hydration submits the form as a plain GET, so retry.
let signedIn = false;
for (let attempt = 0; attempt < 5 && !signedIn; attempt++) {
  await page.goto(`${BASE}/sign-in`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  signedIn = await page
    .waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
}
if (!signedIn) throw new Error(`could not sign in as ${EMAIL}`);
await settle();
await snap("02-productions");

await page.getByText("SIGNAL LOST").first().click();
await page.waitForURL(/\/p\//, { timeout: 20_000 });
await settle();

await rail("My work").click();
await settle();
await snap("03-my-work");

await rail("Board").click();
await settle();
await snap("05-board");

await rail("Shots").click();
await settle();
await snap("06-shots-sheet");

await page.getByText("SC010_SH020").first().click();
await page.waitForURL(/\/shots\/[a-z0-9]+/, { timeout: 20_000 });
await settle();
await snap("08-shot-options");

await rail("Review").click();
await settle();
await page.locator("a[href*='/review/']").first().click();
await page.waitForURL(/\/review\/[a-z0-9]+$/, { timeout: 20_000 });
await page.waitForTimeout(1800);
await page.keyboard.press("3");
await page.waitForTimeout(1200);
await snap("11-review-compare");
await page.keyboard.press("1");
await page.waitForTimeout(400);
for (let i = 0; i < 3; i++) await page.keyboard.press("=");
await page.waitForTimeout(800);
await snap("12-review-zoom");
await page.keyboard.press("Escape");
await page.waitForURL(/\/review$/, { timeout: 20_000 });
await settle();

await rail("Decisions").click();
await settle();
await snap("14-decisions");

console.log(problems.length ? `page errors: ${problems.join(" | ")}` : "no page errors");
await browser.close();
