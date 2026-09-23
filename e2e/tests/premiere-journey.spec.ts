import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  bulkCreateShots,
  createProduction,
  createStudio,
  gotoLoaded,
  gotoStable,
  inviteMember,
  showShotsTable,
  signUp,
  signUpInvited,
  trackErrors,
  uniqueEmail,
  uploadOptions,
} from "./helpers";

/**
 * The whole life of a shot, in one run (v1.7).
 *
 * Every other spec proves one screen behaves. This one asks the question a
 * studio actually cares about: can a production go from "we have nothing" to
 * "this is delivered" without a person getting stuck? It walks the lifecycle
 * in order, as two real people — a producer who sets the work up and decides,
 * and an artist who makes the options — and fails on the first step where the
 * product cannot carry them forward.
 *
 * It also captures the screenshots used by the in-app guide's step-by-step
 * (`/help`), so the walkthrough people read is generated from a run that
 * actually passed rather than assembled by hand.
 */

const SHOTS = ["SC010_SH010", "SC010_SH020", "SC010_SH030"];
const HERO = SHOTS[0];
const JOURNEY_DIR = "public/help/journey";

let context: BrowserContext;
let page: Page; // the producer
let artistContext: BrowserContext | undefined;
let artistPage: Page | undefined;
let errors: string[];
let artistErrors: string[] = [];
let base: string;
let artistEmail: string;

/** One numbered still per lifecycle step, for the guide. */
async function step(p: Page, name: string) {
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${JOURNEY_DIR}/${name}.png` });
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  mkdirSync(JOURNEY_DIR, { recursive: true });
  context = await browser.newContext();
  page = await context.newPage();
  errors = trackErrors(page);
  await signUp(page, "Journey Producer", uniqueEmail("journey-owner"));
  await createStudio(page, "Premiere Pictures");
});

test.afterAll(async () => {
  await artistContext?.close();
  await context?.close();
});

test("1 · a producer starts a production", async () => {
  test.setTimeout(120_000);
  base = await createProduction(page, "THE LONG WAY HOME");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible({
    timeout: 20_000,
  });
  await step(page, "01-production-created");
});

test("2 · the shot list goes in", async () => {
  test.setTimeout(120_000);
  await bulkCreateShots(page, base, SHOTS);
  await gotoLoaded(page, `${base}/shots`);
  for (const code of SHOTS) {
    await expect(page.getByText(code).first()).toBeVisible({ timeout: 20_000 });
  }
  await step(page, "02-shot-list");
});

test("3 · an artist is invited and joins", async ({ browser }) => {
  test.setTimeout(120_000);
  artistEmail = uniqueEmail("journey-artist");
  await inviteMember(page, artistEmail, "Artist");
  const joined = await signUpInvited(browser, artistEmail, "Journey Artist");
  artistContext = joined.context;
  artistPage = joined.page;
  artistErrors = trackErrors(artistPage);
  // The invite attaches on first sign-in: the artist lands in the studio
  // rather than on the create-a-studio screen.
  await expect(artistPage.getByLabel("Switch studio")).toBeVisible({
    timeout: 30_000,
  });
  await step(page, "03-team-invited");
});

test("4 · the producer assigns the work", async () => {
  test.setTimeout(120_000);
  await gotoLoaded(page, `${base}/shots`);
  await showShotsTable(page);
  await page.getByRole("combobox", { name: `Assign ${HERO}` }).click();
  await page.getByRole("option", { name: "Journey Artist" }).click();
  await expect(
    page.getByRole("combobox", { name: `Assign ${HERO}` }),
  ).toContainText("Journey Artist", { timeout: 15_000 });
  await step(page, "04-assigned");
});

test("5 · the artist sees it on My work", async () => {
  test.setTimeout(120_000);
  const artist = artistPage!;
  await gotoLoaded(artist, `${base}/my-work`);
  await expect(artist.getByRole("heading", { name: "My work" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(artist.getByText(HERO).first()).toBeVisible({ timeout: 20_000 });
  await step(artist, "05-my-work");
});

test("6 · the artist uploads options", async () => {
  test.setTimeout(180_000);
  const artist = artistPage!;
  await gotoLoaded(artist, `${base}/shots`);
  await artist.getByText(HERO).first().click();
  await artist.waitForURL(/\/shots\/[a-z0-9]+/, { timeout: 20_000 });
  await uploadOptions(artist, 3);
  await expect(artist.getByText("v3").first()).toBeVisible({ timeout: 30_000 });
  await step(artist, "06-options-uploaded");
});

test("7 · the shot reaches the review queue", async () => {
  test.setTimeout(120_000);
  // Options landing moves the shot to "Options ready" on its own.
  await gotoLoaded(page, `${base}/review`);
  await expect(page.getByText(HERO).first()).toBeVisible({ timeout: 30_000 });
  await step(page, "07-review-queue");
});

test("8 · the producer compares and picks", async () => {
  test.setTimeout(120_000);
  await page.locator("a[href*='/review/']").first().click();
  await page.waitForURL(/\/review\/[a-z0-9]+$/, { timeout: 20_000 });
  // Compare two up, then decide.
  await page.keyboard.press("2");
  await page.waitForTimeout(800);
  await step(page, "08-review-room");
  await page.keyboard.press("p");
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog.getByRole("button", { name: "Pick this version" })).toBeVisible({
    timeout: 15_000,
  });
  await dialog.getByRole("button", { name: "Pick this version" }).click();
  // The room returns to the queue once the pick lands.
  await page.waitForURL(new RegExp(`${base}/review$`), { timeout: 30_000 });
  await step(page, "09-picked");
});

test("9 · the decision is on the record", async () => {
  test.setTimeout(120_000);
  await gotoLoaded(page, `${base}/decisions`);
  await expect(page.getByRole("heading", { name: "Decisions" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(HERO).first()).toBeVisible({ timeout: 20_000 });
  await step(page, "10-decisions");
});

test("10 · a stage gate is signed off", async () => {
  test.setTimeout(180_000);
  // The producer has to be an approver before a gate can be decided.
  await gotoLoaded(page, `${base}/settings`);
  const stages = page.locator("#stages");
  await expect(stages.getByText("Stages & gates")).toBeVisible({ timeout: 20_000 });
  const noApprovers = stages.getByRole("button", { name: "No approvers" });
  const before = await noApprovers.count();
  await noApprovers.first().click();
  await expect(page.getByText("Gate approvers — Development")).toBeVisible();
  await page.getByRole("checkbox").first().click();
  await expect(noApprovers).toHaveCount(before - 1, { timeout: 15_000 });
  await page.keyboard.press("Escape");

  await gotoLoaded(page, `${base}/board`);
  const dev = page.getByRole("region", { name: "Development", exact: true });
  await expect(dev).toBeVisible({ timeout: 20_000 });
  await dev.getByRole("button", { name: "Development menu" }).click();
  await page.getByRole("menuitem", { name: "Request sign-off", exact: true }).click();
  await expect(dev.getByText("Gate requested")).toBeVisible({ timeout: 15_000 });
  await dev.getByRole("button", { name: "Development menu" }).click();
  await page.getByRole("menuitem", { name: /Approve gate/ }).click();
  const approve = page.getByRole("dialog");
  await approve.getByRole("button", { name: "Approve gate" }).click();
  await expect(dev.getByText("Gate approved")).toBeVisible({ timeout: 15_000 });
  await step(page, "11-gate-approved");
});

test("11 · delivery QC runs against the template", async () => {
  test.setTimeout(180_000);
  await gotoLoaded(page, `${base}/qc`);
  await expect(page.getByRole("heading", { name: "Delivery QC" })).toBeVisible({
    timeout: 20_000,
  });
  const seed = page.getByRole("button", {
    name: /Seed the standard TV-delivery template/,
  });
  if (await seed.isVisible().catch(() => false)) {
    await seed.click();
    await expect(page.getByText("25 checks")).toBeVisible({ timeout: 20_000 });
  }
  await page.getByRole("button", { name: "New QC run" }).first().click();
  const runDialog = page.getByRole("dialog");
  // The run needs a name before it will start — "Start QC run" stays
  // disabled until one is typed.
  await runDialog.locator("#qc-run-name").fill("Delivery master · pass 1");
  await runDialog.getByRole("button", { name: "Start QC run" }).click();
  await page.waitForURL(/\/qc\/[a-z0-9]+$/, { timeout: 20_000 });
  await expect(page.getByText("QC in progress")).toBeVisible({ timeout: 20_000 });
  await step(page, "12-qc-run");
});

test("12 · the day is reported and published", async () => {
  test.setTimeout(120_000);
  await gotoLoaded(page, `${base}/reports`);
  await expect(page.getByRole("heading", { name: "Daily reports" })).toBeVisible({
    timeout: 20_000,
  });
  const generate = page.getByRole("button", { name: "Generate now" }).first();
  await expect(generate).toBeVisible({ timeout: 20_000 });
  await generate.click();
  await expect(page.getByText(/Report generated for today/i)).toBeVisible({
    timeout: 30_000,
  });
  const publish = page.getByRole("button", { name: "Publish report" }).first();
  if (await publish.isVisible().catch(() => false)) {
    await publish.click();
    await page.waitForTimeout(1500);
  }
  await step(page, "13-daily-report");
});

test("13 · the production record can leave with the film", async () => {
  test.setTimeout(120_000);
  await gotoLoaded(page, `${base}/decisions`);
  // The provenance export is the artifact a delivery hands over: every
  // prompt, seed, file identity and decision.
  await expect(
    page.getByRole("button", { name: /Export provenance/i }).first(),
  ).toBeVisible({ timeout: 20_000 });
  await step(page, "14-provenance");
});

test("14 · nothing broke along the way", async () => {
  expect(errors, `producer console errors:\n${errors.join("\n")}`).toEqual([]);
  expect(
    artistErrors,
    `artist console errors:\n${artistErrors.join("\n")}`,
  ).toEqual([]);
});
