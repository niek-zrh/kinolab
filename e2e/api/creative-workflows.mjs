import { readFileSync } from "node:fs";
import {
  createSuite,
  newOwner,
  newProduction,
  addMember,
  mutation,
  query,
  must,
  uploadVersion,
} from "./_harness.mjs";

export async function run() {
  const suite = createSuite("Creative workflows — references & timed feedback");
  const owner = await newOwner("creative");
  const artist = await addMember(owner.studioId, owner.token, "artist");
  const artist2 = await addMember(
    owner.studioId,
    owner.token,
    "artist",
    "other-artist",
  );
  const viewer = await addMember(owner.studioId, owner.token, "viewer");
  const other = await newOwner("creative-foreign");
  const { productionId } = await newProduction(owner.studioId, owner.token);
  const { productionId: otherProduction } = await newProduction(
    other.studioId,
    other.token,
  );
  const shotId = must(
    await mutation(
      "shots:create",
      { productionId, code: "SC010_SH010" },
      owner.token,
    ),
    "shot",
  );
  const version = await uploadVersion(productionId, shotId, artist.token);
  const assets = must(
    await query("assets:listForProduction", { productionId }, artist.token),
    "assets",
  );
  const assetId = assets[0]._id;
  const draft = {
    productionId,
    title: "Dawn exterior",
    notes: "Cool shadows, warm practicals",
    category: "lighting",
    colors: ["#102030", "#f0b060"],
    assetId,
    sourceUrl: "https://example.com/credit",
  };
  const saved = await mutation("references:save", draft, artist.token);
  suite.allowed("artist can pin artwork and a palette", saved);
  const cardId = must(saved, "reference");
  const list = async (token = owner.token, archived = false) =>
    query("references:list", { productionId, archived }, token);
  const card = must(await list(), "list").cards[0];
  suite.check(
    "reference preserves artwork, notes, and source",
    card.asset._id === assetId &&
      card.notes === draft.notes &&
      card.sourceUrl === draft.sourceUrl &&
      card.colors.length === 2,
  );
  suite.allowed(
    "viewers can read the reference board",
    await list(viewer.token),
  );
  suite.denied("anonymous cannot read references", await list(null));
  suite.denied(
    "another studio cannot read references",
    await list(other.token),
  );
  suite.denied(
    "viewers cannot create references",
    await mutation("references:save", draft, viewer.token),
  );
  suite.denied(
    "artist cannot edit a colleague's reference",
    await mutation("references:save", { ...draft, cardId }, artist2.token),
  );
  suite.allowed(
    "creator can edit their reference",
    await mutation(
      "references:save",
      { ...draft, cardId, notes: "Revised direction" },
      artist.token,
    ),
  );
  suite.allowed(
    "editor can edit any reference",
    await mutation(
      "references:save",
      { ...draft, cardId, title: "Approved direction" },
      owner.token,
    ),
  );
  suite.denied(
    "card cannot be moved across productions",
    await mutation(
      "references:save",
      { ...draft, productionId: otherProduction, cardId },
      other.token,
    ),
  );
  suite.denied(
    "foreign library asset is refused",
    await mutation(
      "references:save",
      { ...draft, productionId: otherProduction },
      other.token,
    ),
  );
  for (const [name, patch] of [
    ["blank title", { title: "  " }],
    ["long title", { title: "x".repeat(121) }],
    ["long notes", { notes: "x".repeat(4001) }],
    ["invalid palette", { colors: ["red"] }],
    ["oversized palette", { colors: Array(7).fill("#000000") }],
    ["script URL", { sourceUrl: "javascript:alert(1)" }],
    [
      "embedded credentials",
      { sourceUrl: "https://user:password@example.com" },
    ],
  ])
    suite.denied(
      name + " is refused",
      await mutation("references:save", { ...draft, ...patch }, artist.token),
    );
  suite.denied(
    "another artist cannot archive a reference",
    await mutation(
      "references:setArchived",
      { cardId, archived: true },
      artist2.token,
    ),
  );
  suite.denied(
    "viewer cannot archive a reference",
    await mutation(
      "references:setArchived",
      { cardId, archived: true },
      viewer.token,
    ),
  );
  suite.allowed(
    "creator can archive a reference",
    await mutation(
      "references:setArchived",
      { cardId, archived: true },
      artist.token,
    ),
  );
  suite.check(
    "archive is reversible and removes the card from active view",
    must(await list(), "active").cards.length === 0 &&
      must(await list(owner.token, true), "archived").cards.length === 1,
  );
  suite.allowed(
    "editor can restore the reference",
    await mutation(
      "references:setArchived",
      { cardId, archived: false },
      owner.token,
    ),
  );
  suite.check(
    "archive never deletes original artwork",
    must(
      await query("assets:listForProduction", { productionId }, owner.token),
      "assets",
    ).some((a) => a._id === assetId),
  );

  const uploadUrl = must(
    await mutation(
      "versions:generateUploadUrl",
      { productionId },
      artist.token,
    ),
    "video upload URL",
  );
  const bytes = readFileSync(
    new URL("../fixtures/review.mp4", import.meta.url),
  );
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "video/mp4" },
    body: bytes,
  });
  const { storageId } = await response.json();
  const video = must(
    await mutation(
      "versions:addFromUpload",
      {
        shotId,
        storageId,
        name: "review.mp4",
        mimeType: "video/mp4",
        sizeBytes: bytes.length,
      },
      artist.token,
    ),
    "video",
  );
  const note = {
    productionId,
    targetType: "version",
    targetId: video.versionId,
    body: "Hold this beat longer",
    mentions: [],
    timeSeconds: 1.25,
  };
  const commentId = must(
    await mutation("comments:add", note, viewer.token),
    "timestamp comment",
  );
  const comments = () =>
    query(
      "comments:list",
      { targetType: "version", targetId: video.versionId },
      owner.token,
    );
  suite.check(
    "review feedback preserves fractional playback time",
    must(await comments(), "comments")[0].timeSeconds === 1.25,
  );
  for (const timeSeconds of [-1, 86401])
    suite.denied(
      "invalid timestamp is refused: " + timeSeconds,
      await mutation("comments:add", { ...note, timeSeconds }, viewer.token),
    );
  suite.denied(
    "timestamps cannot attach to a still image",
    await mutation(
      "comments:add",
      { ...note, targetId: version.versionId },
      viewer.token,
    ),
  );
  suite.denied(
    "timestamps cannot attach to a shot thread",
    await mutation(
      "comments:add",
      { ...note, targetType: "shot", targetId: shotId },
      viewer.token,
    ),
  );
  suite.denied(
    "missing comment targets are refused",
    await mutation(
      "comments:add",
      { ...note, targetId: "missing-target" },
      viewer.token,
    ),
  );
  suite.denied(
    "oversized comment is refused",
    await mutation(
      "comments:add",
      { ...note, body: "x".repeat(8001) },
      viewer.token,
    ),
  );
  suite.denied(
    "another studio cannot add timed feedback",
    await mutation("comments:add", note, other.token),
  );
  suite.denied(
    "another artist cannot resolve someone else's feedback",
    await mutation("comments:resolve", { commentId }, artist.token),
  );
  suite.allowed(
    "author can resolve feedback",
    await mutation("comments:resolve", { commentId }, viewer.token),
  );
  suite.check(
    "resolved marker persists",
    must(await comments(), "resolved")[0].resolvedAt !== undefined,
  );
  suite.allowed(
    "editor can reopen feedback",
    await mutation(
      "comments:resolve",
      { commentId, resolved: false },
      owner.token,
    ),
  );
  const reopened = must(await comments(), "reopened")[0];
  suite.check(
    "reopening preserves body and timestamp",
    reopened.resolvedAt === undefined &&
      reopened.body === note.body &&
      reopened.timeSeconds === 1.25,
  );
  return suite;
}
