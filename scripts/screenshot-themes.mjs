// Both-theme screenshot pass (spec v2 §(a) requirement 10).
//
// Signs up a throwaway user against the running dev server, creates a studio
// and a production with a few shots and options, then walks every route in
// BOTH themes and saves PNGs to e2e/screenshots/{theme}/{route}.png (the
// directory is gitignored). Based on the e2e/qa-flow.mjs patterns.
//
//   pnpm dev            # :3000 + local convex
//   node scripts/screenshot-themes.mjs
//
// Env: BASE (default http://localhost:3000), OUT (default e2e/screenshots).
// A route that does not exist yet (Characters, until item (b) lands) is still
// captured — the error boundary is a screen too — and logged as such.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? path.join(process.cwd(), "e2e", "screenshots");
const THEMES = ["dark", "light"];
const STORAGE_KEY = "kinolab-theme";
const PASSWORD = "slate-qa-password-1";

const png = (which) =>
  Buffer.from(
    {
      red: "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAGklEQVR4nGP8z8Dwn4GBgYGJAQowMTAwMAAAJgYBLZ01WQAAAABJRU5ErkJggg==",
      blue: "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAG0lEQVR4nGNkYPj/n4GBgYGJAQYwMzAwMAAAJgIBFeXY+MAAAAAASUVORK5CYII=",
    }[which],
    "base64",
  );

const errors = [];
let step = "start";
const fail = (msg) => {
  throw new Error(`[step: ${step}] ${msg}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
// Every entry names the route it happened on, so a chunk that fails to parse
// mid-hot-reload can be told apart from a real page bug.
const where = () => {
  try {
    return new URL(page.url()).pathname;
  } catch {
    return "?";
  }
};
page.on("pageerror", (err) =>
  errors.push(`PAGEERROR @${where()}: ${String(err).slice(0, 160)}`),
);
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("Failed to load resource"))
    errors.push(`@${where()}: ${m.text().slice(0, 160)}`);
});

const settle = async () => {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(500);
};

/** Apply a theme the way a returning device would: storage + reload. */
async function useTheme(theme) {
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, theme],
  );
  await page.reload();
  await settle();
  const cls = await page.evaluate(() => document.documentElement.className);
  if (!cls.split(" ").includes(theme)) fail(`html class is "${cls}", wanted ${theme}`);
}

// ---------------------------------------------------------------------------
// 1. Sign-in page in both themes (only reachable while signed out)
// ---------------------------------------------------------------------------
step = "sign-in";
for (const theme of THEMES) await mkdir(path.join(OUT, theme), { recursive: true });
await page.goto(`${BASE}/sign-in`);
await settle();
for (const theme of THEMES) {
  await useTheme(theme);
  await page.screenshot({ path: path.join(OUT, theme, "sign-in.png") });
  console.log(`📸 ${theme}/sign-in`);
}

// ---------------------------------------------------------------------------
// 2. Throwaway user → studio → production (wizard) → shots → options
// ---------------------------------------------------------------------------
step = "signup";
// Hydration-safe (same as e2e/tests/helpers.ts signUp): the toggle is a React
// handler, so keep clicking until the name field actually appears.
for (let attempt = 0; attempt < 10; attempt++) {
  await page.getByText("New here? Create an account").click().catch(() => undefined);
  if (await page.locator("#name").isVisible().catch(() => false)) break;
  await page.waitForTimeout(500);
}
await page.fill("#name", "Theme Tester");
await page.fill("#email", `theme-${Date.now()}@slate.test`);
await page.fill("#password", PASSWORD);
await page.getByRole("button", { name: "Create account" }).click();
await page.waitForURL(`${BASE}/`, { timeout: 30_000 });

step = "create-studio";
await page.fill("#studio-name", "Theme Lab");
await page.getByRole("button", { name: "Create studio" }).click();
await page.getByText("Productions").first().waitFor({ timeout: 15_000 });

step = "wizard";
await page.goto(`${BASE}/new`);
await page.getByLabel(/name/i).first().fill("Signal Lost");
await page.getByRole("button", { name: /Create & continue/i }).click();
await page.getByText(/Skip for now/i).waitFor({ timeout: 15_000 });
await page.getByRole("button", { name: /Skip for now/i }).click();
await page.getByRole("button", { name: /Open production/i }).waitFor({ timeout: 10_000 });
await page.getByRole("button", { name: /Open production/i }).click();
await page.waitForURL(/\/p\/[a-z0-9]+/, { timeout: 15_000 });
const prodUrl = new URL(page.url()).pathname.match(/^\/p\/[a-z0-9]+/)[0];
console.log("production:", prodUrl);

step = "shots";
const CODES = ["SC010_SH010", "SC010_SH020", "SC010_SH030"];
await page.goto(`${BASE}${prodUrl}/shots`);
await settle();
{
  // Empty-state inline form (today) or the "Paste codes"/Import dialog (item d).
  const inline = page.getByLabel("Shot codes");
  if (await inline.count()) {
    await inline.first().fill(CODES.join("\n"));
    await page.getByRole("button", { name: /Create \d+ shots?/i }).first().click();
  } else {
    await page.getByRole("button", { name: /paste|import|new shots/i }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("textarea").first().fill(CODES.join("\n"));
    await dialog.getByRole("button", { name: /create|import/i }).first().click();
    await dialog.waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined);
  }
  await page.getByText(CODES[CODES.length - 1]).first().waitFor({ timeout: 15_000 });
}

step = "upload";
const shotHref = await page.getByRole("link", { name: CODES[0] }).first().getAttribute("href");
if (!shotHref) fail("shot link missing");
await page.goto(`${BASE}${shotHref}`);
await settle();
await page.locator('input[type="file"]').first().setInputFiles([
  { name: "option-a.png", mimeType: "image/png", buffer: png("red") },
  { name: "option-b.png", mimeType: "image/png", buffer: png("blue") },
]);
await page.getByText("v2").first().waitFor({ timeout: 30_000 });
const shotId = shotHref.split("/").pop();
const roomPath = `${prodUrl}/review/${shotId}`;

// A second shot with a pick so the board/decisions/ledger have content.
step = "pick";
await page.goto(`${BASE}${roomPath}`);
await page.locator('button[title="v1 — Candidate"]').waitFor({ timeout: 15_000 });
await page.keyboard.press("s");
await page.waitForTimeout(600);

// ---------------------------------------------------------------------------
// 3. Walk every route in both themes
// ---------------------------------------------------------------------------
const shot = async (theme, name) => {
  await page.screenshot({ path: path.join(OUT, theme, `${name}.png`) });
  console.log(`📸 ${theme}/${name}`);
};
/**
 * Full loads sometimes stall on the shell skeleton: the first load after a
 * sign-in can land half-authenticated (see e2e/tests/permissions.spec.ts), and
 * while other work hot-reloads the dev server a chunk can arrive half-written
 * ("SyntaxError: Invalid or unexpected token") so the page never hydrates.
 * One more load recovers both; the shell's studio switcher is the tell.
 */
const gotoLoaded = async (url) => {
  if (url.startsWith("/drive")) {
    // Outside the app shell — nothing to wait for.
    await page.goto(`${BASE}${url}`).catch(() => undefined);
    return;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(`${BASE}${url}`).catch(() => undefined);
    const ready = await page
      .getByLabel("Switch studio")
      .waitFor({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (ready) return;
    console.log(`  (shell did not mount at ${url}, reloading)`);
  }
};
const visit = async (theme, name, url, opts = {}) => {
  step = `${theme}/${name}`;
  await gotoLoaded(url);
  await settle();
  if (opts.before) await opts.before().catch((e) => console.log(`  (${name}: ${e.message.split("\n")[0]})`));
  await page.waitForTimeout(300);
  await shot(theme, name);
};

for (const theme of THEMES) {
  step = `theme ${theme}`;
  await page.goto(`${BASE}${prodUrl}`);
  await settle();
  await useTheme(theme);

  await visit(theme, "overview", prodUrl);
  await visit(theme, "board", `${prodUrl}/board`);
  await visit(theme, "shots-table", `${prodUrl}/shots`);
  await visit(theme, "shots-grid", `${prodUrl}/shots`, {
    before: () => page.getByRole("button", { name: /grid/i }).first().click({ timeout: 3_000 }),
  });
  await visit(theme, "new-shots-dialog", `${prodUrl}/shots`, {
    before: () =>
      page
        .getByRole("button", { name: /new shots|paste codes|import|add shots/i })
        .first()
        .click({ timeout: 3_000 }),
  });
  await page.keyboard.press("Escape");

  for (const tab of ["Options", "Discussion", "Files", "History"]) {
    await visit(theme, `shot-${tab.toLowerCase()}`, shotHref, {
      before: () => page.getByRole("tab", { name: new RegExp(tab, "i") }).click({ timeout: 3_000 }),
    });
  }

  await visit(theme, "review-queue", `${prodUrl}/review`);
  await visit(theme, "review-room", roomPath, {
    before: () => page.locator('button[title^="v1"]').waitFor({ timeout: 15_000 }),
  });
  await visit(theme, "review-room-pick-dialog", roomPath, {
    before: async () => {
      await page.locator('button[title^="v1"]').waitFor({ timeout: 15_000 });
      await page.keyboard.press("p");
      await page.getByRole("dialog").waitFor({ timeout: 5_000 });
    },
  });
  await page.keyboard.press("Escape");

  await visit(theme, "files", `${prodUrl}/files`);
  await visit(theme, "decisions", `${prodUrl}/decisions`);
  await visit(theme, "reports", `${prodUrl}/reports`, {
    before: () => page.getByRole("button", { name: /Generate now/i }).first().click({ timeout: 3_000 }),
  });
  await visit(theme, "reports-detail", `${prodUrl}/reports`, {
    before: () => page.getByRole("link", { name: /report|\d{4}-\d{2}-\d{2}/i }).first().click({ timeout: 3_000 }),
  });
  await visit(theme, "qc", `${prodUrl}/qc`, {
    before: () => page.getByRole("button", { name: /Seed the standard/i }).click({ timeout: 3_000 }),
  });
  await visit(theme, "qc-run", `${prodUrl}/qc`, {
    before: async () => {
      const run = page.getByRole("link", { name: /Master|run/i }).first();
      if (await run.count()) {
        await run.click({ timeout: 3_000 });
      } else {
        await page.getByRole("button", { name: /New QC run/i }).first().click({ timeout: 3_000 });
        await page.locator('[role="dialog"] input').first().fill("EP01 — TV Master v1");
        await page.locator('[role="dialog"]').getByRole("button", { name: /Start QC run/i }).click();
        await page.waitForURL(/qc\/[a-z0-9]+/, { timeout: 15_000 });
      }
      await settle();
    },
  });
  await visit(theme, "settings", `${prodUrl}/settings`);
  await visit(theme, "team", "/team");
  await visit(theme, "wizard", "/new");
  await visit(theme, "studio-home", "/");
  await visit(theme, "characters", `${prodUrl}/characters`);
  await visit(theme, "characters-detail", `${prodUrl}/characters/missing`);
  await visit(theme, "drive-connected", "/drive/connected?status=error&reason=access_denied");

  await visit(theme, "notifications", prodUrl, {
    before: () => page.getByRole("button", { name: /notifications/i }).first().click({ timeout: 3_000 }),
  });
  await page.keyboard.press("Escape");
  await visit(theme, "command-palette", prodUrl, {
    before: async () => {
      await page.getByRole("button", { name: /Search/i }).first().click({ timeout: 3_000 });
      await page.getByRole("dialog").waitFor({ timeout: 5_000 });
      await page.keyboard.type("SC010");
      await page.waitForTimeout(500);
    },
  });
  await page.keyboard.press("Escape");
  await visit(theme, "keyboard-overlay", prodUrl, {
    before: async () => {
      await page.locator("body").click({ position: { x: 700, y: 500 } });
      await page.keyboard.press("?");
      await page.getByRole("dialog").waitFor({ timeout: 5_000 });
    },
  });
  await page.keyboard.press("Escape");
  await visit(theme, "avatar-menu", prodUrl, {
    before: async () => {
      await page.getByLabel("Account").click({ timeout: 3_000 });
      await page.locator('[data-slot="dropdown-menu-content"]').waitFor({ timeout: 5_000 });
    },
  });
  await page.keyboard.press("Escape");
}

console.log(`\nDONE → ${OUT}. Console errors (${errors.length}):`);
for (const e of [...new Set(errors)].slice(0, 20)) console.log(" - " + e);
await browser.close();
