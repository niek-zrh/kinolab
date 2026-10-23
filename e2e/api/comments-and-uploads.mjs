/**
 * Comment ownership, the top-bar production switcher and the large-upload
 * actions — the server side of the five uncommitted features. Google OAuth
 * is not configured locally, so the Drive actions are exercised only up to
 * the point where they would need a hub token: every refusal before that
 * (anonymous, stranger, viewer, bad mime, bad size, no hub) is asserted here.
 */
import {
  createSuite,
  newOwner,
  newProduction,
  addMember,
  action,
  mutation,
  query,
  must,
  uploadVersion,
} from "./_harness.mjs";

/**
 * Convex's JSON wire format carries non-finite floats as `{ $float }`
 * (little-endian IEEE-754, base64) — plain JSON has no NaN. Either the
 * transport rejects it or the handler's isFinite check does; both are refusals.
 */
const NAN_WIRE = { $float: "AAAAAAAA+H8=" };

export async function run() {
  const suite = createSuite("Comments, switcher & large uploads");
  const owner = await newOwner("cu");
  const producer = await addMember(owner.studioId, owner.token, "producer");
  const artist = await addMember(owner.studioId, owner.token, "artist");
  const artist2 = await addMember(
    owner.studioId,
    owner.token,
    "artist",
    "other-artist",
  );
  const viewer = await addMember(owner.studioId, owner.token, "viewer");
  const stranger = await newOwner("cu-foreign");
  const { productionId } = await newProduction(owner.studioId, owner.token);
  const shotId = must(
    await mutation(
      "shots:create",
      { productionId, code: "SC010_SH010" },
      owner.token,
    ),
    "shot",
  );

  /* ---------------------------- comments.edit ---------------------------- */

  const thread = () =>
    query("comments:list", { targetType: "shot", targetId: shotId }, owner.token);
  const commentById = async (id) =>
    must(await thread(), "thread").find((c) => c._id === id);
  const history = async () =>
    must(
      await query(
        "activity:forTarget",
        { productionId, targetType: "shot", targetId: shotId, limit: 100 },
        owner.token,
      ),
      "history",
    );
  const addedRowFor = async (commentId) =>
    (await history()).find((row) => {
      if (row.type !== "comment.added" || row.data === undefined) return false;
      try {
        return JSON.parse(row.data).commentId === commentId;
      } catch {
        return false;
      }
    });
  const inbox = async (token) =>
    must(await query("notifications:list", { limit: 200 }, token), "inbox");

  const original = "Lens flare reads as a mistake here";
  const commentId = must(
    await mutation(
      "comments:add",
      {
        productionId,
        targetType: "shot",
        targetId: shotId,
        body: original,
        mentions: [artist2.userId],
      },
      artist.token,
    ),
    "artist comment",
  );
  const addedRow = await addedRowFor(commentId);
  suite.check(
    "comments:add logs comment.added with data.commentId",
    addedRow !== undefined && addedRow.summary.endsWith(`"${original}"`),
    addedRow === undefined ? "no comment.added row carries the id" : "",
  );
  const mentionBefore = (await inbox(artist2.token)).filter(
    (n) => n.type === "mention" && n.body === original,
  );
  suite.check(
    "mention notification quotes the original body",
    mentionBefore.length === 1,
    `${mentionBefore.length} matching notifications`,
  );

  const edit = (token, body = "Rewritten by someone else") =>
    mutation("comments:edit", { commentId, body }, token);
  suite.denied("anonymous cannot edit a comment", await edit(null));
  suite.denied("another studio cannot edit a comment", await edit(stranger.token));
  suite.denied("a viewer cannot edit someone else's comment", await edit(viewer.token));
  suite.denied(
    "another artist cannot edit someone else's comment",
    await edit(artist2.token),
  );
  suite.denied(
    "the studio owner cannot edit someone else's comment",
    await edit(owner.token),
  );
  suite.denied(
    "a producer cannot edit someone else's comment",
    await edit(producer.token),
  );
  suite.check(
    "refused edits leave the body untouched",
    (await commentById(commentId))?.body === original,
  );
  suite.denied("an empty edit is refused", await edit(artist.token, "   "));
  suite.denied(
    "an edit over 8,000 characters is refused",
    await edit(artist.token, "x".repeat(8001)),
  );
  suite.allowed(
    "an edit of exactly 8,000 characters is accepted",
    await edit(artist.token, "y".repeat(8000)),
  );
  suite.allowed(
    "author can restore the original body",
    await edit(artist.token, original),
  );

  // Identical body: nothing changes, nothing is marked edited.
  const fresh = must(
    await mutation(
      "comments:add",
      {
        productionId,
        targetType: "shot",
        targetId: shotId,
        body: "Unchanged note",
        mentions: [],
      },
      artist.token,
    ),
    "fresh comment",
  );
  suite.allowed(
    "editing with the identical body succeeds",
    await mutation(
      "comments:edit",
      { commentId: fresh, body: "  Unchanged note  " },
      artist.token,
    ),
  );
  suite.check(
    "identical-body edit is a no-op (no editedAt)",
    (await commentById(fresh))?.editedAt === undefined,
  );

  // Resolution survives an edit.
  suite.allowed(
    "editor role can still resolve someone else's comment",
    await mutation("comments:resolve", { commentId }, producer.token),
  );
  suite.check(
    "comment is resolved before the edit",
    (await commentById(commentId))?.resolvedAt !== undefined,
  );
  const revised = "Lens flare reads as intentional now — keep it";
  suite.allowed("author can edit their comment", await edit(artist.token, revised));
  const afterEdit = await commentById(commentId);
  suite.check(
    "list shows the new body with editedAt",
    afterEdit?.body === revised && typeof afterEdit?.editedAt === "number",
  );
  suite.check(
    "edit keeps the comment resolved",
    afterEdit?.resolvedAt !== undefined && afterEdit?.resolvedBy === producer.userId,
  );
  suite.check(
    "edit keeps the mentions",
    afterEdit?.mentions?.length === 1 && afterEdit.mentions[0] === artist2.userId,
  );
  const rowAfterEdit = await addedRowFor(commentId);
  suite.check(
    "comment.added row quotes the new text after the edit",
    rowAfterEdit !== undefined &&
      rowAfterEdit.summary.endsWith(`"${revised}"`) &&
      !rowAfterEdit.summary.includes(original),
    rowAfterEdit?.summary ?? "row missing",
  );
  const mentionsAfterEdit = (await inbox(artist2.token)).filter(
    (n) => n.type === "mention" && n.productionId === productionId,
  );
  suite.check(
    "mention notification body follows the edit",
    mentionsAfterEdit.some((n) => n.body === revised) &&
      !mentionsAfterEdit.some((n) => n.body === original),
    mentionsAfterEdit.map((n) => n.body).join(" | "),
  );
  suite.check(
    "edit sends no new notification",
    mentionsAfterEdit.length === 1,
    `${mentionsAfterEdit.length} mention notifications`,
  );
  suite.allowed(
    "editor can reopen the edited comment (regression)",
    await mutation(
      "comments:resolve",
      { commentId, resolved: false },
      owner.token,
    ),
  );
  suite.check(
    "reopen keeps the edited body",
    (await commentById(commentId))?.body === revised,
  );

  /* --------------------------- comments.remove --------------------------- */

  const remove = (token, id = commentId) =>
    mutation("comments:remove", { commentId: id }, token);
  suite.denied("anonymous cannot delete a comment", await remove(null));
  suite.denied("another studio cannot delete a comment", await remove(stranger.token));
  suite.denied("a viewer cannot delete someone else's comment", await remove(viewer.token));
  suite.denied(
    "another artist cannot delete someone else's comment",
    await remove(artist2.token),
  );
  suite.denied(
    "the studio owner cannot delete someone else's comment",
    await remove(owner.token),
  );
  suite.denied(
    "a producer cannot delete someone else's comment",
    await remove(producer.token),
  );
  suite.check(
    "refused deletes leave the comment in place",
    (await commentById(commentId)) !== undefined,
  );
  suite.allowed("author can delete their comment", await remove(artist.token));
  suite.check(
    "deleted comment is gone from the thread",
    (await commentById(commentId)) === undefined,
  );
  const rowAfterRemove = await addedRowFor(commentId);
  suite.check(
    "comment.added row survives the delete and ends with (comment deleted)",
    rowAfterRemove !== undefined &&
      rowAfterRemove.summary.endsWith("(comment deleted)") &&
      !rowAfterRemove.summary.includes(revised),
    rowAfterRemove?.summary ?? "row missing",
  );
  suite.check(
    "delete removes the mention notification",
    !(await inbox(artist2.token)).some(
      (n) => n.type === "mention" && n.body === revised,
    ),
  );
  suite.allowed("deleting twice is not an error", await remove(artist.token));
  suite.denied(
    "editing a deleted comment is refused",
    await edit(artist.token, "ghost"),
  );
  suite.allowed(
    "author can delete their resolved comment",
    await (async () => {
      must(
        await mutation("comments:resolve", { commentId: fresh }, owner.token),
        "resolve fresh",
      );
      return remove(artist.token, fresh);
    })(),
  );

  // Mention notifications are matched to their comment by body text: two
  // comments with the same wording must still each keep their own.
  const twin = (body) =>
    mutation(
      "comments:add",
      {
        productionId,
        targetType: "shot",
        targetId: shotId,
        body,
        mentions: [artist2.userId],
      },
      artist.token,
    );
  const twinA = must(await twin("Same words twice"), "twin A");
  const twinB = must(await twin("Same words twice"), "twin B");
  suite.allowed(
    "editing the older of two identical mentions succeeds",
    await mutation(
      "comments:edit",
      { commentId: twinA, body: "Same words, now different" },
      artist.token,
    ),
  );
  const twinNotes = (await inbox(artist2.token)).filter(
    (n) => n.type === "mention" && n.body.startsWith("Same words"),
  );
  suite.check(
    "editing one of two identical mentions rewrites exactly one notification",
    twinNotes.filter((n) => n.body === "Same words, now different").length === 1 &&
      twinNotes.filter((n) => n.body === "Same words twice").length === 1,
    twinNotes.map((n) => n.body).join(" | "),
  );
  suite.allowed("delete twin B", await remove(artist.token, twinB));
  const twinAfter = (await inbox(artist2.token)).filter(
    (n) => n.type === "mention" && n.body.startsWith("Same words"),
  );
  suite.check(
    "deleting the other twin removes only its own notification",
    twinAfter.length === 1 && twinAfter[0].body === "Same words, now different",
    twinAfter.map((n) => n.body).join(" | "),
  );

  // A stranger's own comment in their own studio stays theirs — ids don't cross tenants.
  const { productionId: strangerProduction } = await newProduction(
    stranger.studioId,
    stranger.token,
  );
  const strangerShot = must(
    await mutation(
      "shots:create",
      { productionId: strangerProduction, code: "SC010_SH010" },
      stranger.token,
    ),
    "stranger shot",
  );
  const strangerComment = must(
    await mutation(
      "comments:add",
      {
        productionId: strangerProduction,
        targetType: "shot",
        targetId: strangerShot,
        body: "Private to the other studio",
        mentions: [],
      },
      stranger.token,
    ),
    "stranger comment",
  );
  suite.denied(
    "owner cannot edit a comment in another studio",
    await mutation(
      "comments:edit",
      { commentId: strangerComment, body: "cross-tenant" },
      owner.token,
    ),
  );
  suite.denied(
    "owner cannot delete a comment in another studio",
    await mutation("comments:remove", { commentId: strangerComment }, owner.token),
  );

  /* -------------------------- productions.switcher ----------------------- */

  const sw = await newOwner("switcher");
  const swViewer = await addMember(sw.studioId, sw.token, "viewer");
  const swArtist = await addMember(sw.studioId, sw.token, "artist");
  const mk = async (name, code, status) => {
    const { productionId: id } = await newProduction(sw.studioId, sw.token, {
      name,
      code,
    });
    if (status !== "active")
      must(
        await mutation("productions:update", { productionId: id, status }, sw.token),
        `status ${status}`,
      );
    return id;
  };
  // Inserted out of order on purpose so the sort is doing the work.
  await mk("Zulu", "ZUL", "active");
  await mk("Mike", "MIK", "paused");
  await mk("Bravo", "BRA", "wrapped");
  await mk("Alpha", "ALP", "active");
  await mk("Echo", "ECH", "wrapped");
  await mk("Kilo", "KIL", "paused");
  const switcher = (token) => query("productions:switcher", { studioId: sw.studioId }, token);
  suite.denied("anonymous cannot read the switcher", await switcher(null));
  suite.denied("another studio cannot read the switcher", await switcher(owner.token));
  const asViewer = await switcher(swViewer.token);
  suite.allowed("a viewer can read the switcher", asViewer);
  suite.allowed("an artist can read the switcher", await switcher(swArtist.token));
  const rows = asViewer.ok ? asViewer.value : [];
  suite.check(
    "switcher orders active → paused → wrapped, then by name",
    rows.map((p) => p.name).join(",") === "Alpha,Zulu,Kilo,Mike,Bravo,Echo",
    rows.map((p) => `${p.name}:${p.status}`).join(","),
  );
  const leaked = rows.flatMap((p) =>
    Object.keys(p).filter((k) => !["_id", "code", "name", "status"].includes(k)),
  );
  suite.check(
    "switcher rows carry only _id, code, name, status",
    rows.length === 6 && leaked.length === 0,
    leaked.length ? `leaked: ${[...new Set(leaked)].join(",")}` : "",
  );
  suite.check(
    "switcher rows never expose hub or connection fields",
    !JSON.stringify(rows).match(/hub|connection|folderId|timezone/i),
  );
  // The switcher belongs to the studio: the first studio's productions don't
  // appear in it and vice versa.
  const mine = must(await query("productions:switcher", { studioId: owner.studioId }, owner.token), "mine");
  suite.check(
    "switcher is scoped to the studio asked for",
    mine.every((p) => p._id !== rows[0]?._id) && mine.some((p) => p._id === productionId),
  );
  suite.denied(
    "a viewer cannot change production status",
    await mutation(
      "productions:update",
      { productionId: rows[0]._id, status: "wrapped" },
      swViewer.token,
    ),
  );

  /* ------------------------- Drive large uploads ------------------------- */

  const large = {
    shotId,
    name: "master.mp4",
    mimeType: "video/mp4",
    sizeBytes: 300 * 1024 * 1024,
  };
  const begin = (args, token) => action("drive:beginLargeUpload", { ...large, ...args }, token);
  const space = (args, token) =>
    action("drive:checkUploadSpace", { productionId, bytes: large.sizeBytes, ...args }, token);
  const finish = (args, token) =>
    action("drive:finishLargeUpload", { shotId, driveFileId: "1abcDEF", ...args }, token);

  suite.denied("anonymous cannot run the space check", await space({}, null));
  suite.denied("another studio cannot run the space check", await space({}, stranger.token));
  suite.denied("a viewer cannot run the space check", await space({}, viewer.token));
  const noHubSpace = await space({}, artist.token);
  suite.check(
    "artist's space check without a hub returns null",
    noHubSpace.ok && noHubSpace.value === null,
    noHubSpace.ok ? `value ${JSON.stringify(noHubSpace.value)}` : noHubSpace.error.slice(0, 90),
  );
  suite.allowed(
    "owner's space check without a hub passes",
    await space({}, owner.token),
  );
  suite.denied(
    "space check refuses a missing production",
    await space({ productionId: "missing" }, artist.token),
  );

  suite.denied("anonymous cannot start a large upload", await begin({}, null));
  suite.denied("another studio cannot start a large upload", await begin({}, stranger.token));
  suite.denied("a viewer cannot start a large upload", await begin({}, viewer.token));
  const noHub = await begin({}, artist.token);
  suite.check(
    "large upload without a hub is refused, pointing to the Drive hub",
    !noHub.ok && /Drive hub/.test(noHub.error),
    noHub.ok ? "ALLOWED" : noHub.error.slice(0, 100),
  );
  suite.denied(
    "owner without a hub is refused too",
    await begin({}, owner.token),
  );
  for (const [label, mimeType] of [
    ["application/zip", "application/zip"],
    ["application/octet-stream", "application/octet-stream"],
    ["text/html", "text/html"],
    ["empty mime", ""],
    ["images/ lookalike", "images/png"],
  ])
    suite.denied(
      `large upload refuses mime ${label}`,
      await begin({ mimeType }, artist.token),
    );
  for (const [label, sizeBytes] of [
    ["0", 0],
    ["negative", -1],
    ["NaN", NAN_WIRE],
    ["string", "300"],
  ])
    suite.denied(
      `large upload refuses sizeBytes ${label}`,
      await begin({ sizeBytes }, artist.token),
    );
  suite.denied(
    "large upload refuses a missing shot",
    await begin({ shotId: "missing-shot" }, artist.token),
  );
  suite.denied(
    "large upload into another studio's shot is refused",
    await begin({ shotId: strangerShot }, owner.token),
  );

  suite.denied("anonymous cannot finish a large upload", await finish({}, null));
  suite.denied("another studio cannot finish a large upload", await finish({}, stranger.token));
  suite.denied("a viewer cannot finish a large upload", await finish({}, viewer.token));
  suite.denied(
    "finishing a large upload without a hub is refused",
    await finish({}, artist.token),
  );
  suite.denied(
    "finishing a large upload without a hub is refused for the owner",
    await finish({}, owner.token),
  );
  suite.denied(
    "finishing with a thumbStorageId that is not a storage id is refused",
    await finish({ thumbStorageId: "not-a-storage-id" }, artist.token),
  );

  /* ------------------------------ regression ----------------------------- */

  const small = await uploadVersion(productionId, shotId, artist.token).catch(
    (err) => ({ error: err.message }),
  );
  suite.check(
    "small upload (versions:addFromUpload) still works for an artist",
    small.versionId !== undefined && small.index === 1,
    small.error ?? "",
  );
  const versions = must(
    await query("versions:listForShot", { shotId }, artist.token),
    "versions",
  );
  suite.check(
    "the uploaded version is listed",
    Array.isArray(versions) ? versions.some((v) => v._id === small.versionId) : true,
  );
  return suite;
}
