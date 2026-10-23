import { mkdir } from "node:fs/promises";
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
  gotoLoaded,
  inviteMember,
  signUp,
  signUpInvited,
  trackErrors,
  uniqueEmail,
} from "./helpers";

/**
 * Top-bar production switcher (components/app/production-switcher.tsx):
 * lists the studio's productions with their codes, checks the current one,
 * keeps the section you are in when you switch, offers "All productions"
 * to everyone and "New production" only to owners/producers, and fits a
 * phone-width header.
 */
test.describe.serial("production switcher", () => {
  let context: BrowserContext;
  let page: Page;
  let errors: string[] = [];
  let artistContext: BrowserContext | undefined;
  let artistPage: Page | undefined;
  // "/p/{id}" of each production; the wizard derives the code from initials.
  let A = "";
  let B = "";
  const A_NAME = "Alpha Reel";
  const A_CODE = "AR";
  const B_NAME = "Beta Reel";
  const B_CODE = "BR";
  const artistEmail = uniqueEmail("switcher-artist");

  const trigger = (p: Page): Locator =>
    p.getByRole("button", { name: "Switch production" });
  const openMenu = async (p: Page): Promise<Locator> => {
    await trigger(p).click();
    const menu = p.getByRole("menu");
    await expect(menu).toBeVisible();
    return menu;
  };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(150_000);
    context = await browser.newContext();
    page = await context.newPage();
    errors = trackErrors(page);
    await signUp(page, "Sam Switcher", uniqueEmail("switcher-owner"));
    await createStudio(page, "Switcher Studio E2E");
    A = await createProduction(page, A_NAME);
    B = await createProduction(page, B_NAME);
  });

  test.afterAll(async () => {
    await Promise.all([context?.close(), artistContext?.close()]);
  });

  test("lists both productions with codes, checks the current one, and keeps the section", async () => {
    await gotoLoaded(page, `${A}/shots`);
    await expect(trigger(page)).toContainText(A_CODE);
    await expect(trigger(page)).toContainText(A_NAME);

    const menu = await openMenu(page);
    const alpha = menu.getByRole("menuitem", { name: new RegExp(A_NAME) });
    const beta = menu.getByRole("menuitem", { name: new RegExp(B_NAME) });
    await expect(alpha).toBeVisible();
    await expect(beta).toBeVisible();
    await expect(alpha).toContainText(A_CODE);
    await expect(beta).toContainText(B_CODE);
    // The current production carries the check mark; the other does not.
    await expect(alpha.locator("svg.lucide-check")).toHaveCount(1);
    await expect(beta.locator("svg.lucide-check")).toHaveCount(0);

    await beta.click();
    await page.waitForURL(new RegExp(`${B}/shots$`), { timeout: 15_000 });
    await expect(trigger(page)).toContainText(B_CODE);
    await expect(trigger(page)).toContainText(B_NAME);

    // The check moved with the switch.
    const reopened = await openMenu(page);
    await expect(
      reopened
        .getByRole("menuitem", { name: new RegExp(B_NAME) })
        .locator("svg.lucide-check"),
    ).toHaveCount(1);
    await expect(
      reopened
        .getByRole("menuitem", { name: new RegExp(A_NAME) })
        .locator("svg.lucide-check"),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(reopened).toBeHidden();
  });

  test("from the overview, switching lands on the other overview", async () => {
    await gotoLoaded(page, B);
    const menu = await openMenu(page);
    await menu.getByRole("menuitem", { name: new RegExp(A_NAME) }).click();
    await page.waitForURL(new RegExp(`${A}$`), { timeout: 15_000 });
    await expect(trigger(page)).toContainText(A_CODE);
  });

  test("All productions goes home, and an owner sees New production", async () => {
    await gotoLoaded(page, `${A}/shots`);
    const menu = await openMenu(page);
    await expect(
      menu.getByRole("menuitem", { name: "New production" }),
    ).toBeVisible();
    await menu.getByRole("menuitem", { name: "All productions" }).click();
    await page.waitForURL(/\/$/, { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe("/");
    // Outside a production the trigger reads "All productions" and nothing is checked.
    await expect(trigger(page)).toHaveText(/All productions/);
    const home = await openMenu(page);
    await expect(home.locator("svg.lucide-check")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(home).toBeHidden();

    expect(errors.filter((e) => e.startsWith("PAGEERROR"))).toEqual([]);
  });

  test("an artist sees both productions but no New production", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    await inviteMember(page, artistEmail, "Artist");
    ({ context: artistContext, page: artistPage } = await signUpInvited(
      browser,
      artistEmail,
      "Avery Artist",
    ));
    await gotoLoaded(artistPage, `${A}/shots`);
    const menu = await openMenu(artistPage);
    await expect(
      menu.getByRole("menuitem", { name: new RegExp(A_NAME) }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: new RegExp(B_NAME) }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "All productions" }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "New production" }),
    ).toHaveCount(0);
    // Switching works for the artist too and keeps the section.
    await menu.getByRole("menuitem", { name: new RegExp(B_NAME) }).click();
    await artistPage.waitForURL(new RegExp(`${B}/shots$`), { timeout: 15_000 });
  });

  test("the header fits a 390px-wide phone viewport without horizontal overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoLoaded(page, `${A}/shots`);
    await expect(trigger(page)).toBeVisible();
    await page.waitForLoadState("networkidle").catch(() => undefined);

    await mkdir("test-results", { recursive: true });
    await page.screenshot({
      path: "test-results/production-switcher-390.png",
      fullPage: false,
    });

    const widths = await page.evaluate(() => {
      const header = document.querySelector("header");
      return {
        documentScrollWidth: document.documentElement.scrollWidth,
        headerScrollWidth: header?.scrollWidth ?? 0,
        headerClientWidth: header?.clientWidth ?? 0,
        headerRight: header?.getBoundingClientRect().right ?? 0,
      };
    });
    expect(widths.documentScrollWidth).toBeLessThanOrEqual(390);
    expect(widths.headerScrollWidth).toBeLessThanOrEqual(widths.headerClientWidth);
    expect(widths.headerRight).toBeLessThanOrEqual(390);
    // The account menu at the far right is still reachable on the phone.
    const account = page.getByRole("button", { name: "Account", exact: true });
    await expect(account).toBeVisible();
    const box = (await account.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  });
});
