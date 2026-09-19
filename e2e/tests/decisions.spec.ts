import { readFile } from "node:fs/promises";
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
  PASSWORD,
  trackErrors,
  uniqueEmail,
  uploadOptions,
} from "./helpers";
import { parseDelimited } from "../../lib/csv";

/**
 * The owner account. With KINOLAB_E2E_EMAIL / KINOLAB_E2E_PASSWORD set the
 * suite runs as that person's own account (signing it up on this deployment
 * the first time, signing in afterwards); otherwise it creates a throwaway
 * owner like every other spec. Credentials never live in the repo.
 */
const OWNER_EMAIL = process.env.KINOLAB_E2E_EMAIL;
const OWNER_PASSWORD = process.env.KINOLAB_E2E_PASSWORD;

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

/** The display name the app uses for the signed-in account (ledger, activity). */
async function readAccountName(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Account" }).click();
  const label = page.locator('[data-slot="dropdown-menu-label"]').first();
  await expect(label).toBeVisible();
  const name = (await label.locator("div").first().innerText()).trim();
  await page.keyboard.press("Escape");
  await expect(label).toBeHidden();
  return name;
}

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

/** Column order of the provenance export (CONTRACTS.md §exports.ts). */
const PROVENANCE_COLUMNS = [
  "studio_name",
  "production_code",
  "production_name",
  "target_type",
  "target_code",
  "target_title",
  "slot",
  "scene_code",
  "episode",
  "version",
  "version_id",
  "version_status",
  "created_at",
  "created_at_local",
  "created_by_name",
  "created_by_email",
  "tool",
  "model",
  "prompt",
  "seed",
  "params",
  "note",
  "file_name",
  "file_mime",
  "file_size_bytes",
  "file_md5",
  "file_provider",
  "file_location",
  "file_missing",
  "approved_file_name",
  "decision",
  "decided_at",
  "decided_by_name",
  "decided_by_email",
  "decision_note",
  "details_last_edited_at",
  "details_last_edited_by",
];

/**
 * Local copy of helpers.signUp — the shared helper clicks the sign-up toggle
 * before hydration can attach its handler, losing the click. Retry until the
 * create-account form appears. (Same issue noted in wizard.spec.ts.)
 */
async function signUpSafe(page: Page, name: string, email: string) {
  await page.goto("/sign-in");
  await expect(async () => {
    await page.getByText("New here? Create an account").click();
    await expect(page.locator("#name")).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 45_000 });
  await page.fill("#name", name);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/", { timeout: 45_000 });
}

/**
 * Decisions ledger (spec F9).
 *
 * Builds one pick (review room) + one decided gate (approver = owner set in
 * Settings, approved with a note on the Decisions page), then verifies the
 * ledger rows, the scope filter chips and the CSV export.
 */
test.describe.serial("decisions ledger", () => {
  let context: BrowserContext;
  let page: Page;
  let errors: string[] = [];
  let base = "";

  // The owner's display name — read back from the account when the suite
  // runs as a persistent account (its name may differ from the default).
  let OWNER = "Dana Decider";
  const PROD = uniqueProductionName("Decisions Feature");
  const SHOT = "SC010_SH010";
  const SHOT2 = "SC010_SH020";
  const GATE_NOTE = "Ship it, story locked";
  const PICK_NOTE = "Best composition of the two";
  // Multi-line, with the delimiter and quotes — the verbatim round-trip case.
  const PROMPT = `wide shot, dusk, "rain-soaked" street\n=hero walks toward camera, 35mm`;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000); // signup can stall when other suites hammer the dev server
    context = await browser.newContext();
    page = await context.newPage();
    errors = trackErrors(page);
    if (OWNER_EMAIL && OWNER_PASSWORD) {
      await signInOrUp(page, {
        email: OWNER_EMAIL,
        password: OWNER_PASSWORD,
        name: OWNER,
      });
      await ensureStudio(page, "Decision Studio E2E");
      OWNER = await readAccountName(page);
    } else {
      await signUpSafe(page, OWNER, uniqueEmail("decisions-owner"));
      await createStudio(page, "Decision Studio E2E");
    }
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("build state: approve a gate (owner as approver) and pick a version", async () => {
    test.setTimeout(120_000); // long build flow; shared dev server can be slow under load
    base = await createProduction(page, PROD);

    // Owner becomes gate approver for Development via Settings.
    await page.goto(`${base}/settings`);
    await page
      .locator("#stages")
      .getByRole("button", { name: "No approvers" })
      .first()
      .click();
    await expect(page.getByText("Gate approvers — Development")).toBeVisible();
    const checkbox = page.locator('[role="checkbox"]').first();
    await checkbox.click();
    await expect(checkbox).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await expect(page.locator("#stages").getByText(OWNER).first()).toBeVisible();

    // Request sign-off from the board.
    await page.goto(`${base}/board`);
    await page.getByRole("button", { name: "Development menu" }).click();
    await page.getByRole("menuitem", { name: "Request sign-off" }).click();
    await expect(
      page.getByText("Sign-off requested for Development").first(),
    ).toBeVisible();

    // Approve with a note from the Decisions page ("Needs your decision").
    await page.goto(`${base}/decisions`);
    await expect(page.getByText("Needs your decision")).toBeVisible();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await page.getByLabel("Note (optional)").fill(GATE_NOTE);
    await page.getByRole("button", { name: "Approve gate" }).click();
    await expect(page.getByText("Gate approved").first()).toBeVisible();

    // One shot, two options, pick v1 in the review room.
    await createShotsViaImport(page, base, [SHOT]);
    await page.getByRole("link", { name: SHOT }).click();
    await page.waitForURL(/\/shots\/[a-z0-9]+/);
    const shotId = page.url().match(/\/shots\/([a-z0-9]+)/)![1];
    await uploadOptions(page, 2);

    await page.goto(`${base}/review/${shotId}`);
    await expect(page.getByText("v1").first()).toBeVisible();
    await page.keyboard.press("p");
    await expect(
      page.getByRole("button", { name: "Pick this version" }),
    ).toBeVisible();
    await page.getByPlaceholder("Why this one? (optional)").fill(PICK_NOTE);
    await page.getByRole("button", { name: "Pick this version" }).click();
    await expect(page.getByText("v1 picked").first()).toBeVisible();
    await page.waitForURL(new RegExp(`${base}/review$`));
  });

  test("ledger shows the Pick and Gate rows with actor and notes", async () => {
    await page.goto(`${base}/decisions`);

    const gateRow = page
      .getByRole("row")
      .filter({ hasText: "Gate: Development" });
    await expect(gateRow).toHaveCount(1);
    await expect(gateRow.getByText("Gate", { exact: true })).toBeVisible();
    await expect(gateRow.getByText("Approved")).toBeVisible();
    await expect(gateRow.getByText(OWNER)).toBeVisible();
    await expect(gateRow.getByText(GATE_NOTE)).toBeVisible();

    const pickRow = page.getByRole("row").filter({ hasText: SHOT });
    await expect(pickRow).toHaveCount(1);
    await expect(pickRow.getByText("Pick", { exact: true })).toBeVisible();
    await expect(pickRow.getByText("Approved")).toBeVisible();
    await expect(pickRow.getByText(OWNER)).toBeVisible();
    await expect(pickRow.getByText(PICK_NOTE)).toBeVisible();
  });

  test("scope filter chips narrow the ledger (Gates → only gate rows)", async () => {
    await page.goto(`${base}/decisions`);
    await expect(page.locator("tbody tr")).toHaveCount(2);

    await page.getByRole("button", { name: "Gates" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(
      page.locator("tbody").getByText("Gate: Development"),
    ).toBeVisible();
    await expect(page.locator("tbody").getByText(SHOT)).toHaveCount(0);

    // Picks chip shows only the pick.
    await page.getByRole("button", { name: "Picks" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody").getByText(SHOT)).toBeVisible();

    await page.getByRole("button", { name: "All" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(2);
  });

  test("CSV export downloads {code}-decisions.csv with header + data rows", async () => {
    await page.goto(`${base}/decisions`);
    await expect(page.locator("tbody tr")).toHaveCount(2);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/-decisions\.csv$/);

    const filePath = await download.path();
    const content = await readFile(filePath, "utf8");
    const lines = content.trim().split(/\r?\n/);
    expect(lines[0]).toBe(
      "decidedAt,scope,target,status,requestedBy,approver,note",
    );
    expect(lines.length).toBeGreaterThanOrEqual(3); // header + pick + gate
    expect(content).toContain(SHOT);
    expect(content).toContain("Gate: Development");

    const pageErrors = errors.filter((e) => e.startsWith("PAGEERROR"));
    expect(pageErrors).toEqual([]);
  });

  test("Export provenance downloads a verbatim CSV — BOM, spec columns, one row per version — and logs it", async () => {
    test.setTimeout(150_000);
    // A second shot with two options, and a multi-line prompt on its v2 set
    // through the Generation details dialog.
    await createShotsViaImport(page, base, [SHOT2]);
    await page.getByRole("link", { name: SHOT2 }).click();
    await page.waitForURL(/\/shots\/[a-z0-9]+/);
    await uploadOptions(page, 2);
    const v2Card = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "v2 ·" });
    await v2Card.getByRole("button", { name: "Edit details" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#gd-tool").fill("Midjourney");
    await dialog.locator("#gd-prompt").fill(PROMPT);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Details saved").first()).toBeVisible();
    await expect(dialog).toBeHidden();

    await gotoStable(page, `${base}/decisions`);
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export provenance (CSV)" })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      /^[^_]+_provenance_\d{4}-\d{2}-\d{2}\.csv$/,
    );
    await expect(page.getByText("Provenance exported — 4 rows")).toBeVisible();

    const content = await readFile((await download.path())!, "utf8");
    // UTF-8 BOM, CRLF, every cell quoted (the header included).
    expect(content.charCodeAt(0)).toBe(0xfeff);
    expect(content).toContain("\r\n");
    expect(content.slice(1)).toMatch(/^"studio_name","production_code",/);

    const rows = parseDelimited(content);
    expect(rows[0]).toEqual(PROVENANCE_COLUMNS);
    const data = rows.slice(1);
    expect(data).toHaveLength(4); // 2 shots × 2 options
    const col = (name: string) => PROVENANCE_COLUMNS.indexOf(name);
    const row = (code: string, version: string) => {
      const found = data.find(
        (r) => r[col("target_code")] === code && r[col("version")] === version,
      );
      expect(found, `${code} v${version}`).toBeDefined();
      return found!;
    };
    for (const r of data) expect(r).toHaveLength(PROVENANCE_COLUMNS.length);

    // Verbatim: the multi-line prompt with quotes, comma and a formula-lead
    // line comes back exactly as typed — no `'` guard, nothing collapsed.
    const edited = row(SHOT2, "2");
    expect(edited[col("prompt")]).toBe(PROMPT);
    expect(edited[col("tool")]).toBe("Midjourney");
    expect(edited[col("target_type")]).toBe("shot");
    expect(edited[col("created_by_name")]).toBe(OWNER);
    expect(edited[col("file_name")]).toBe("option-2.png");
    expect(edited[col("file_provider")]).toBe("storage");
    expect(edited[col("file_location")]).toMatch(/^app storage:/);
    expect(edited[col("file_missing")]).toBe("false");
    expect(edited[col("details_last_edited_by")]).toBe(OWNER);
    expect(edited[col("details_last_edited_at")]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(edited[col("decision")]).toBe("");

    // The pick and the version it superseded, decided by the owner.
    const picked = row(SHOT, "1");
    expect(picked[col("version_status")]).toBe("picked");
    expect(picked[col("decision")]).toBe("picked");
    expect(picked[col("decision_note")]).toBe(PICK_NOTE);
    expect(picked[col("decided_by_name")]).toBe(OWNER);
    expect(picked[col("approved_file_name")]).toMatch(/_v1\.png$/);
    const superseded = row(SHOT, "2");
    expect(superseded[col("decision")]).toBe("rejected");
    expect(superseded[col("decision_note")]).toBe("superseded by v1");
    // Newest first.
    expect(data[0][col("target_code")]).toBe(SHOT2);

    // Logged as `export.generated` — visible in the production's activity.
    await gotoStable(page, base);
    await expect(
      page.getByText(`${OWNER} exported provenance (4 rows)`),
    ).toBeVisible({ timeout: 20_000 });

    const pageErrors = errors.filter((e) => e.startsWith("PAGEERROR"));
    expect(pageErrors).toEqual([]);
  });
});
