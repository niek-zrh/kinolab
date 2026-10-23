import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  bulkCreateShots,
  createProduction,
  createStudio,
  gotoLoaded,
  inviteMember,
  signUp,
  signUpInvited,
  trackErrors,
  uniqueEmail,
  uploadOptions,
} from "./helpers";

/**
 * Comment ownership (comments.edit / comments.remove): the author edits and
 * deletes their own comments from the Review Room rail and the shot's
 * Discussion tab, a non-author member sees the comments without the
 * controls, and the History tab keeps the activity row with its quote
 * replaced by "(comment deleted)".
 *
 * Several comments render several "Edit comment" / "Delete comment"
 * buttons, so every control lookup is scoped to the comment's own list
 * item — an unscoped lookup is a strict-mode violation by design.
 */
test.describe.serial("comment edit and delete", () => {
  let context: BrowserContext;
  let page: Page;
  let errors: string[] = [];
  let artistContext: BrowserContext | undefined;
  let artistPage: Page | undefined;
  let base = "";
  let shotPath = "";
  let shotId = "";

  const SHOT = "SC010_SH010";
  const artistEmail = uniqueEmail("comments-artist");
  // Review Room (version comments).
  const DRAFT = "First draft of the note";
  const REVISED = "Second draft of the note, now final";
  const RAIL_KEEP = "Hold on the wide a beat longer";
  // Discussion tab (shot comments).
  const DISCUSS_KEEP = "Keep this one for the artist";
  const DISCUSS_GONE = "Lighting needs a second pass";

  /** The comment's own list item: the only safe scope for its controls. */
  const commentItem = (p: Page, text: string): Locator =>
    p.getByRole("listitem").filter({ hasText: text });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(150_000);
    context = await browser.newContext();
    page = await context.newPage();
    errors = trackErrors(page);
    await signUp(page, "Casey Commenter", uniqueEmail("comments-owner"));
    await createStudio(page, "Comment Studio E2E");
    base = await createProduction(page, "Comment Threads");
    await bulkCreateShots(page, base, [SHOT]);
    shotPath = (await page
      .getByRole("link", { name: SHOT })
      .getAttribute("href"))!;
    shotId = shotPath.split("/").pop()!;
    await gotoLoaded(page, shotPath);
    await uploadOptions(page, 1);
  });

  test.afterAll(async () => {
    await Promise.all([context?.close(), artistContext?.close()]);
  });

  test("Review Room: the author edits a comment and sees the (edited) marker", async () => {
    await gotoLoaded(page, `${base}/review/${shotId}`);
    const composer = page.getByRole("textbox", { name: "Review comment" });
    await expect(composer).toBeVisible({ timeout: 20_000 });

    for (const text of [DRAFT, RAIL_KEEP]) {
      await composer.fill(text);
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(commentItem(page, text)).toBeVisible();
      await expect(composer).toHaveValue("");
    }
    // Two own comments → two controls each; unscoped lookups would be ambiguous.
    await expect(page.getByRole("button", { name: "Edit comment" })).toHaveCount(2);
    await expect(
      page.getByRole("button", { name: "Delete comment" }),
    ).toHaveCount(2);

    await commentItem(page, DRAFT)
      .getByRole("button", { name: "Edit comment" })
      .click();
    // While editing, the body (and the hasText anchor with it) is replaced
    // by the form, so re-anchor the row on its editor instead.
    const editor = page.getByRole("textbox", { name: "Edit comment" });
    await expect(editor).toHaveValue(DRAFT);
    const editing = page.getByRole("listitem").filter({ has: editor });
    await expect(editing).toHaveCount(1);
    // The row's own Edit/Delete controls are swapped out; the other row keeps its pair.
    await expect(editing.getByRole("button", { name: "Edit comment" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit comment" })).toHaveCount(1);
    await editor.fill(REVISED);
    await editing.getByRole("button", { name: "Save", exact: true }).click();

    const edited = commentItem(page, REVISED);
    await expect(edited).toBeVisible();
    await expect(edited.getByText("(edited)")).toBeVisible();
    await expect(edited.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByText(DRAFT, { exact: true })).toHaveCount(0);
    // The untouched comment carries no marker.
    await expect(commentItem(page, RAIL_KEEP).getByText("(edited)")).toHaveCount(0);

    // The edit survives a reload (persisted, not optimistic).
    await page.reload();
    await expect(commentItem(page, REVISED).getByText("(edited)")).toBeVisible({
      timeout: 20_000,
    });
  });

  test("Review Room: Delete asks for confirmation, Cancel keeps it, Delete removes it", async () => {
    const item = commentItem(page, REVISED);
    await expect(item).toBeVisible();

    // Cancel path first: nothing changes.
    await item.getByRole("button", { name: "Delete comment" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Delete this comment?")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(item).toBeVisible();

    await item.getByRole("button", { name: "Delete comment" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(REVISED, { exact: true })).toHaveCount(0);
    // The other comment is untouched.
    await expect(commentItem(page, RAIL_KEEP)).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete comment" })).toHaveCount(1);
  });

  test("Discussion tab: the author deletes a second comment through the same confirm flow", async () => {
    await gotoLoaded(page, `${shotPath}?tab=discussion`);
    const composer = page.getByPlaceholder("Add a comment — @ to mention someone");
    await expect(composer).toBeVisible({ timeout: 20_000 });

    for (const text of [DISCUSS_KEEP, DISCUSS_GONE]) {
      await composer.fill(text);
      await page.getByRole("button", { name: "Comment", exact: true }).click();
      await expect(commentItem(page, text)).toBeVisible();
      await expect(composer).toHaveValue("");
    }
    await expect(page.getByRole("button", { name: "Edit comment" })).toHaveCount(2);

    const item = commentItem(page, DISCUSS_GONE);
    await item.getByRole("button", { name: "Delete comment" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(DISCUSS_GONE, { exact: true })).toHaveCount(0);
    await expect(commentItem(page, DISCUSS_KEEP)).toBeVisible();

    // Gone for good, not just hidden locally.
    await page.reload();
    await expect(commentItem(page, DISCUSS_KEEP)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(DISCUSS_GONE, { exact: true })).toHaveCount(0);
  });

  test("History tab keeps the activity rows but reads (comment deleted)", async () => {
    await gotoLoaded(page, `${shotPath}?tab=history`);
    const history = page.getByRole("tabpanel", { name: "History" });
    // The shot comment that was deleted…
    await expect(
      history.getByText(
        new RegExp(`commented on ${SHOT} — \\(comment deleted\\)$`),
      ),
    ).toBeVisible({ timeout: 20_000 });
    // …and the version comment, edited first and then deleted: the row
    // quotes neither the original nor the edited text.
    await expect(
      history.getByText(
        new RegExp(`commented on v1 of ${SHOT} — \\(comment deleted\\)$`),
      ),
    ).toBeVisible();
    await expect(history.getByText(DRAFT)).toHaveCount(0);
    await expect(history.getByText(REVISED)).toHaveCount(0);
    await expect(history.getByText(DISCUSS_GONE)).toHaveCount(0);
    // The surviving comments still quote their bodies.
    await expect(history.getByText(`"${DISCUSS_KEEP}"`)).toBeVisible();
    await expect(history.getByText(`"${RAIL_KEEP}"`)).toBeVisible();
  });

  test("a non-author member sees the comments but no Edit/Delete controls", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    await inviteMember(page, artistEmail, "Artist");
    ({ context: artistContext, page: artistPage } = await signUpInvited(
      browser,
      artistEmail,
      "Avery Artist",
    ));
    const artistErrors = trackErrors(artistPage);

    // Discussion tab: the owner's comment is readable, the controls are not there.
    await gotoLoaded(artistPage, `${shotPath}?tab=discussion`);
    await expect(commentItem(artistPage, DISCUSS_KEEP)).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      artistPage.getByRole("button", { name: "Edit comment" }),
    ).toHaveCount(0);
    await expect(
      artistPage.getByRole("button", { name: "Delete comment" }),
    ).toHaveCount(0);

    // Review Room rail: same rule for version comments.
    await gotoLoaded(artistPage, `${base}/review/${shotId}`);
    await expect(commentItem(artistPage, RAIL_KEEP)).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      artistPage.getByRole("button", { name: "Edit comment" }),
    ).toHaveCount(0);
    await expect(
      artistPage.getByRole("button", { name: "Delete comment" }),
    ).toHaveCount(0);

    // The artist's own comment does get the controls — ownership, not role.
    const ARTIST_NOTE = "Artist here, noted";
    await artistPage.getByRole("textbox", { name: "Review comment" }).fill(ARTIST_NOTE);
    await artistPage.getByRole("button", { name: "Send", exact: true }).click();
    const own = commentItem(artistPage, ARTIST_NOTE);
    await expect(own.getByRole("button", { name: "Edit comment" })).toBeVisible();
    await expect(
      commentItem(artistPage, RAIL_KEEP).getByRole("button", { name: "Edit comment" }),
    ).toHaveCount(0);

    expect(artistErrors.filter((e) => e.startsWith("PAGEERROR"))).toEqual([]);
    expect(errors.filter((e) => e.startsWith("PAGEERROR"))).toEqual([]);
  });
});
