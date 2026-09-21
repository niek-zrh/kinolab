import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";
import {
  bulkCreateShots,
  createProduction,
  createStudio,
  gotoStable,
  signUp,
  uniqueEmail,
  uploadOptions,
} from "./helpers";

test.describe.configure({ mode: "serial" });
let context: BrowserContext;
let page: Page;
let base: string;
let shotPath: string;
const browserErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  context = await browser.newContext();
  page = await context.newPage();
  page.on("pageerror", (e) => browserErrors.push(e.message));
  await signUp(page, "Creative Lead", uniqueEmail("creative-e2e"));
  await createStudio(page, "Creative Studio");
  base = await createProduction(page, "Night Window");
  await bulkCreateShots(page, base, ["SC010_SH010", "SC010_SH020"]);
  shotPath = (await page
    .getByRole("link", { name: "SC010_SH010" })
    .getAttribute("href"))!;
  await gotoStable(page, shotPath);
  await uploadOptions(page, 1);
});
test.afterAll(async () => {
  await context?.close();
});

test("storyboard shows real artwork and opens its shot", async () => {
  await gotoStable(page, `${base}/storyboard`);
  await expect(
    page.getByRole("heading", { name: "Storyboard", exact: true }),
  ).toBeVisible();
  const frame = page
    .locator("main")
    .getByRole("link")
    .filter({ hasText: "SC010_SH010" });
  await expect(frame.locator("img")).toBeVisible();
  await page.getByLabel("Search storyboard").fill("SC010_SH020");
  await expect(page.locator(".storyboard-grid > a")).toHaveCount(1);
  await page.getByLabel("Search storyboard").fill("");
  await frame.click();
  await expect(page).toHaveURL(new RegExp(shotPath + "$"));
});

test("reference board saves artwork, palette, and credits across reload", async () => {
  await gotoStable(page, `${base}/references`);
  await page
    .getByRole("button", { name: "Add reference", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Dawn lighting study");
  await dialog.getByLabel("Department / category").selectOption("lighting");
  await dialog
    .getByLabel("Creative direction")
    .fill("Cool shadows; warm windows. Preserve detail in the blacks.");
  await dialog.getByLabel(/Palette/).fill("#172a3a, #e4b378");
  await dialog
    .getByLabel("Source / credit URL")
    .fill("https://example.com/artwork");
  await dialog.getByRole("button", { name: "Select option-1.png" }).click();
  await dialog.getByRole("button", { name: "Save reference" }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  const card = page.getByRole("article", { name: "Dawn lighting study" });
  await expect(card.getByRole("img")).toBeVisible();
  await expect(card).toContainText("Cool shadows");
  await expect(
    card.getByRole("button", { name: "Copy color #172a3a" }),
  ).toBeVisible();
  await expect(
    card.getByRole("link", { name: "Source / credit" }),
  ).toHaveAttribute("href", "https://example.com/artwork");
});

test("reference editing, filtering, archive, and restore persist", async () => {
  await page.getByRole("button", { name: "Edit Dawn lighting study" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Title", { exact: true })
    .fill("Night lighting study");
  await page.getByRole("button", { name: "Save reference" }).click();
  const card = page.getByRole("article", { name: "Night lighting study" });
  await expect(card).toBeVisible();
  await page
    .getByRole("group", { name: "Reference category" })
    .getByRole("button", { name: "Characters", exact: true })
    .click();
  await expect(card).toHaveCount(0);
  await page
    .getByRole("group", { name: "Reference category" })
    .getByRole("button", { name: "Lighting", exact: true })
    .click();
  await expect(card).toBeVisible();
  await page
    .getByRole("button", { name: "Archive Night lighting study" })
    .click();
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await expect(card).toBeVisible();
  await page
    .getByRole("button", { name: "Restore Night lighting study" })
    .click();
  await page.getByRole("button", { name: "Show active", exact: true }).click();
  await expect(card).toBeVisible();
});

test("characters open as a visual gallery and retain the editable table", async () => {
  await gotoStable(page, `${base}/characters`);
  await page.getByLabel("Character names").fill("Ada\nMilo");
  await page.getByRole("button", { name: "Create 2 characters" }).click();
  await expect(
    page.getByRole("article", { name: "Ada", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Character table", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.reload();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Character gallery", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(2);
});

test("video plays; timestamped feedback seeks, resolves, and reopens", async () => {
  await gotoStable(page, shotPath);
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(path.resolve("e2e/fixtures/review.mp4"));
  await expect(page.getByText("v2").first()).toBeVisible({ timeout: 30_000 });
  const shotId = shotPath.split("/").pop();
  await gotoStable(page, `${base}/review/${shotId}`);
  await page.locator('button[title="v2 — Candidate"]').click();
  const video = page.getByLabel("Video version 2");
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute("poster", /^http/);
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
    .toBeGreaterThan(0);
  // Real decoding and seek events, using a three-second original test fixture.
  await video.evaluate(async (el: HTMLVideoElement) => {
    el.muted = true;
    await el.play();
  });
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeGreaterThan(0);
  await video.evaluate((el: HTMLVideoElement) => {
    el.pause();
    el.currentTime = 1.25;
  });
  await page.getByRole("button", { name: "Attach 00:01.250" }).click();
  await page.getByLabel("Review comment").fill("Hold this beat longer");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("Hold this beat longer", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.locator('button[title="v2 — Candidate"]').click();
  await page.getByRole("button", { name: "Seek to 00:01.250" }).click();
  await expect
    .poll(() =>
      page
        .getByLabel("Video version 2")
        .evaluate((el: HTMLVideoElement) => el.currentTime),
    )
    .toBeCloseTo(1.25, 1);
  await page
    .getByRole("button", { name: "Resolve comment: Hold this beat longer" })
    .click();
  await expect(page.getByText("All feedback resolved.")).toBeVisible();
  await page.getByRole("button", { name: "Show resolved" }).click();
  await page
    .getByRole("button", { name: "Reopen comment: Hold this beat longer" })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Resolve comment: Hold this beat longer",
    }),
  ).toBeVisible();
});

test("storyboard print mode hides navigation and keeps the frames", async () => {
  await gotoStable(page, `${base}/storyboard`);
  await page.emulateMedia({ media: "print" });
  try {
    await expect(
      page.getByRole("button", { name: "Print board" }),
    ).not.toBeVisible();
    await expect(page.locator(".storyboard-grid > a")).toHaveCount(2);
    await expect(page.locator(".storyboard-grid img").first()).toBeVisible();
  } finally {
    await page.emulateMedia({ media: "screen" });
  }
});

test("new creative screens fit a phone and the navigation remains usable", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const screen of ["storyboard", "references", "characters"]) {
    await gotoStable(page, `${base}/${screen}`);
    await expect(page.getByLabel("Production navigation")).toBeVisible();
    await expect(page.locator("main h1")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  }
  await page.getByLabel("Production navigation").selectOption("/storyboard");
  await expect(page).toHaveURL(/\/storyboard$/);
  await gotoStable(page, `${base}/review/${shotPath.split("/").pop()}`);
  await page.locator('button[title="v2 — Candidate"]').click();
  await expect(page.getByLabel("Video version 2")).toBeVisible();
  await expect(page.getByLabel("Review comment")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("creative workflows have no browser runtime errors", () => {
  expect(browserErrors).toEqual([]);
});
