/**
 * v1.1.0-pilot.2 (v2) — shots / scenes / links / versions backend:
 * reserved codes and the element-slot exclusions (item b), generation-details
 * caps (item c), `shots.importRows` and the deprecated `bulkCreate` alias
 * (item d), `shots.rename`, scene code uniqueness / rename, header selects
 * that clear scene / episode, and links editable by content.edit (item e).
 *
 * Talks to the backend directly like the other suites (a session token is
 * all an attacker needs; the UI's gating is irrelevant). Not registered in
 * run.mjs yet — run standalone:
 *   node --input-type=module -e "import('./e2e/api/shots-v2.mjs').then(m=>m.run()).then(s=>import('./e2e/api/_harness.mjs').then(h=>process.exit(h.report([s])===0?0:1)))"
 */
import {
  createSuite, query, mutation, must,
  newOwner, addMember, newProduction, uploadVersion,
} from "./_harness.mjs";

export async function run() {
  const suite = createSuite("Shots v2 — import, rename, slots, scenes, links, meta");

  /* ---------------------------------------------------------------- setup */
  const owner = await newOwner("shotsv2");
  const { productionId } = await newProduction(owner.studioId, owner.token, {
    code: "SV2",
    kind: "episodic",
    episodeCount: 2,
  });
  const producer = await addMember(owner.studioId, owner.token, "producer");
  const director = await addMember(owner.studioId, owner.token, "creative_director");
  const supervisor = await addMember(owner.studioId, owner.token, "supervisor");
  const artist = await addMember(owner.studioId, owner.token, "artist");
  const viewer = await addMember(owner.studioId, owner.token, "viewer");
  const stranger = await newOwner("sv2-stranger");

  const episodes = must(await query("episodes:list", { productionId }, owner.token), "episodes");
  const ep1 = episodes.find((e) => e.number === 1);
  const ep2 = episodes.find((e) => e.number === 2);

  const sceneId = must(
    await mutation("scenes:create", { productionId, code: "SC010", episodeId: ep1._id }, owner.token),
    "scene SC010",
  );
  const shotA = must(
    await mutation(
      "shots:create",
      { productionId, code: "SC010_SH010", sceneId, assigneeId: artist.userId },
      owner.token,
    ),
    "SC010_SH010",
  );
  const shotB = must(
    await mutation("shots:create", { productionId, code: "SC010_SH020", sceneId }, owner.token),
    "SC010_SH020",
  );

  const feedCount = async (type) =>
    must(await query("activity:feed", { productionId, types: [type], limit: 200 }, owner.token), `feed ${type}`)
      .length;
  const listCodes = async (args = {}, token = owner.token) =>
    must(await query("shots:list", { productionId, ...args }, token), "shots:list").map((s) => s.code);
  const getShot = async (shotId) => must(await query("shots:get", { shotId }, owner.token), "shots:get");
  const errorOf = (r) => (r.ok ? "" : r.error);

  /* ======================= 1. reserved codes (item b) =================== */
  {
    const ch = await mutation("shots:create", { productionId, code: "CH_X" }, owner.token);
    suite.denied("shots:create refuses a CH_ code", ch);
    suite.check(
      "…with the spec's message",
      /CH_ codes are reserved for characters — create it under Characters/.test(errorOf(ch)),
      errorOf(ch).slice(0, 90),
    );
    suite.denied("shots:create refuses a LOC_ code", await mutation("shots:create", { productionId, code: "LOC_X" }, owner.token));
    suite.denied("shots:create refuses a lower-case scr_ code", await mutation("shots:create", { productionId, code: "scr_x" }, owner.token));
    suite.denied(
      "shots:bulkCreate refuses a paste containing a CH_ code",
      await mutation("shots:bulkCreate", { productionId, codes: ["SC010_SH030", "CH_Y"] }, owner.token),
    );
    suite.check(
      "…and wrote nothing (the paste rolled back)",
      !(await listCodes()).includes("SC010_SH030"),
      "",
    );
    const imp = await mutation(
      "shots:importRows",
      { productionId, rows: [{ code: "CH_Z" }], createMissingScenes: true },
      owner.token,
    );
    suite.check(
      "shots:importRows reports a CH_ row as invalid with the spec's message",
      imp.ok && imp.value.created === 0 && imp.value.invalid.length === 1 &&
        /reserved for characters/.test(imp.value.invalid[0].reason),
      imp.ok ? JSON.stringify(imp.value.invalid) : imp.error,
    );
  }

  /* ======================= 2. importRows — role matrix ================== */
  {
    const rows = [{ code: "SC010_SH900" }];
    const args = { productionId, rows, defaults: { sceneId }, createMissingScenes: false };
    suite.denied("artist cannot importRows", await mutation("shots:importRows", args, artist.token));
    suite.denied("viewer cannot importRows", await mutation("shots:importRows", args, viewer.token));
    suite.denied("a stranger cannot importRows", await mutation("shots:importRows", args, stranger.token));
    suite.denied("an anonymous caller cannot importRows", await mutation("shots:importRows", args, null));
    const sv = await mutation("shots:importRows", args, supervisor.token);
    suite.allowed("supervisor can importRows", sv);
    suite.check("…and it created the row", sv.ok && sv.value.created === 1, sv.ok ? JSON.stringify(sv.value) : "");
    suite.allowed(
      "creative director can importRows",
      await mutation("shots:importRows", { ...args, rows: [{ code: "SC010_SH910" }] }, director.token),
    );
    suite.allowed(
      "producer can importRows",
      await mutation("shots:importRows", { ...args, rows: [{ code: "SC010_SH920" }] }, producer.token),
    );
  }

  /* ======================= 3. importRows — structural limits ============ */
  {
    const big = Array.from({ length: 501 }, (_, i) => ({ code: `BIG_${String(i).padStart(4, "0")}` }));
    suite.denied(
      "501 rows are refused as a whole",
      await mutation("shots:importRows", { productionId, rows: big, createMissingScenes: false }, owner.token),
    );
    const scenes = Array.from({ length: 101 }, (_, i) => ({ code: `SCX${String(i).padStart(3, "0")}` }));
    suite.denied(
      "101 scenesToCreate are refused as a whole",
      await mutation(
        "shots:importRows",
        { productionId, rows: [{ code: "X_SH001" }], scenesToCreate: scenes, createMissingScenes: true },
        owner.token,
      ),
    );
    suite.denied(
      "a default sceneId from another production is refused",
      await mutation(
        "shots:importRows",
        {
          productionId,
          rows: [{ code: "X_SH002" }],
          defaults: { sceneId: must(await mutation("scenes:create", {
            productionId: (await newProduction(stranger.studioId, stranger.token, { code: "OTH" })).productionId,
            code: "SC001",
          }, stranger.token), "other scene") },
          createMissingScenes: false,
        },
        owner.token,
      ),
    );
    suite.denied(
      "a default assignee outside the studio is refused",
      await mutation(
        "shots:importRows",
        { productionId, rows: [{ code: "X_SH003" }], defaults: { assigneeId: stranger.userId }, createMissingScenes: false },
        owner.token,
      ),
    );
  }

  /* ======================= 4. importRows — the paste ==================== */
  {
    const before = await feedCount("shot.created");
    const r = await mutation(
      "shots:importRows",
      {
        productionId,
        rows: [
          { code: "sc020_sh010", title: "Signal room", sceneCode: "SC020" },
          { code: "SC020_SH020", sceneCode: "sc020" },
          { code: "SC020_SH010", sceneCode: "SC020" }, // duplicate in the paste
          { code: "CH_X", sceneCode: "SC020" }, // reserved
          { code: "SC030_SH010", sceneCode: "SC030", episodeNumber: 2 }, // unknown scene → created
          { code: "SC010_SH010" }, // exists already
        ],
        scenesToCreate: [{ code: "SC020", title: "Signal room", episodeId: ep1._id }],
        createMissingScenes: true,
      },
      owner.token,
    );
    suite.allowed("a mixed paste is accepted", r);
    const v = r.ok ? r.value : {};
    suite.check("created counts only the new rows", v.created === 3, `created=${v.created}`);
    suite.check(
      "duplicate-in-paste and already-existing codes are skipped",
      JSON.stringify(v.skipped) === JSON.stringify(["SC020_SH010", "SC010_SH010"]),
      JSON.stringify(v.skipped),
    );
    suite.check(
      "the reserved row is the only invalid one",
      Array.isArray(v.invalid) && v.invalid.length === 1 && v.invalid[0].code === "CH_X",
      JSON.stringify(v.invalid),
    );
    suite.check(
      "both scenes were created (explicit SC020, missing SC030)",
      JSON.stringify(v.scenesCreated) === JSON.stringify(["SC020", "SC030"]),
      JSON.stringify(v.scenesCreated),
    );
    suite.check("sceneId is unset when more than one scene is involved", v.sceneId === undefined, String(v.sceneId));
    suite.check(
      "exactly ONE shot.created activity row for the whole import",
      (await feedCount("shot.created")) - before === 1,
      "",
    );
    const feed = must(
      await query("activity:feed", { productionId, types: ["shot.created"], limit: 1 }, owner.token),
      "feed",
    );
    suite.check(
      "the summary names the scenes and the shots",
      /created 2 scenes and 3 shots/.test(feed[0]?.summary ?? ""),
      feed[0]?.summary ?? "",
    );
    const scenes = must(await query("scenes:list", { productionId }, owner.token), "scenes");
    const sc020 = scenes.find((s) => s.code === "SC020");
    const sc030 = scenes.find((s) => s.code === "SC030");
    suite.check(
      "SC020 carries the requested title and episode",
      sc020 && sc020.title === "Signal room" && sc020.episodeId === ep1._id,
      JSON.stringify({ title: sc020?.title, ep: sc020?.episodeId === ep1._id }),
    );
    suite.check(
      "SC030 took its episode from the row (EP02)",
      sc030 && sc030.episodeId === ep2._id,
      String(sc030?.episodeId === ep2._id),
    );
    suite.check(
      "scenes:list counts the scene's shots (bounded read)",
      sc020 && sc020.shotCount === 2 && sc020.shotCountCapped === false,
      `shotCount=${sc020?.shotCount} capped=${sc020?.shotCountCapped}`,
    );
    const inScene = await listCodes({ sceneId: sc020._id });
    suite.check(
      "the new shots are filed under the scene, codes upper-cased",
      inScene.includes("SC020_SH010") && inScene.includes("SC020_SH020"),
      inScene.join(","),
    );
    const titled = must(await query("shots:list", { productionId, sceneId: sc020._id }, owner.token), "list")
      .find((s) => s.code === "SC020_SH010");
    suite.check(
      "the title and the scene's episode land on the shot",
      titled?.title === "Signal room" && titled?.episode?.number === 1,
      JSON.stringify({ title: titled?.title, ep: titled?.episode?.number }),
    );

    // Same paste again: everything is skipped, nothing invalid beyond CH_X.
    const again = await mutation(
      "shots:importRows",
      {
        productionId,
        rows: [{ code: "SC020_SH010", sceneCode: "SC020" }, { code: "SC020_SH020", sceneCode: "SC020" }],
        createMissingScenes: true,
      },
      owner.token,
    );
    suite.check(
      "re-importing existing codes skips them, never errors",
      again.ok && again.value.created === 0 && again.value.skipped.length === 2 && again.value.scenesCreated.length === 0,
      again.ok ? JSON.stringify(again.value) : again.error,
    );
    suite.check(
      "…and sceneId points at the single scene involved",
      again.ok && again.value.sceneId === sc020._id,
      again.ok ? String(again.value.sceneId) : "",
    );
    suite.check(
      "…and logs NO activity row when nothing was created",
      (await feedCount("shot.created")) - before === 1,
      "",
    );
  }

  /* ======================= 5. importRows — per-row validation =========== */
  {
    const r = await mutation(
      "shots:importRows",
      {
        productionId,
        rows: [
          { code: "" },
          { code: "L".repeat(65) },
          { code: "SC040 SH010" }, // space
          { code: "SC040_SH010", title: "T".repeat(201) },
          { code: "SC040_SH020", episodeNumber: 99 },
          { code: "SC040_SH030", assigneeId: stranger.userId },
          { code: "SC040_SH040", dueDate: "24/09/2026" },
          { code: "SC040_SH050", sceneCode: "SC999" }, // unknown, creation off
          { code: "SC040_SH060", sceneCode: "SC010", assigneeId: artist.userId, dueDate: "2026-09-24", episodeNumber: 2 },
        ],
        createMissingScenes: false,
      },
      owner.token,
    );
    suite.allowed("per-row problems never fail the batch", r);
    const v = r.ok ? r.value : { invalid: [], created: 0 };
    const reasons = Object.fromEntries(v.invalid.map((i) => [i.code, i.reason]));
    suite.check("only the good row was created", v.created === 1, `created=${v.created}`);
    suite.check("8 rows came back invalid", v.invalid.length === 8, JSON.stringify(v.invalid));
    suite.check("empty code → reason", /required/i.test(reasons[""] ?? ""), reasons[""] ?? "");
    suite.check("65-char code → reason", /too long/i.test(reasons["L".repeat(65)] ?? ""), "");
    suite.check("code with a space → reason", /A–Z, 0–9/.test(reasons["SC040 SH010"] ?? ""), reasons["SC040 SH010"] ?? "");
    suite.check("201-char title → reason", /title is too long/i.test(reasons["SC040_SH010"] ?? ""), "");
    suite.check("unknown episode → reason", /unknown episode 99/i.test(reasons["SC040_SH020"] ?? ""), reasons["SC040_SH020"] ?? "");
    suite.check("assignee outside the studio → reason", /not a member/i.test(reasons["SC040_SH030"] ?? ""), "");
    suite.check("bad date → reason", /YYYY-MM-DD/.test(reasons["SC040_SH040"] ?? ""), "");
    suite.check("unknown scene with creation off → reason", /unknown scene SC999/i.test(reasons["SC040_SH050"] ?? ""), reasons["SC040_SH050"] ?? "");
    const good = must(await query("shots:list", { productionId, sceneId }, owner.token), "list").find(
      (s) => s.code === "SC040_SH060",
    );
    suite.check(
      "the good row carries assignee, due date and the row's episode over the scene's",
      good?.assignee?._id === artist.userId && good?.dueDate === "2026-09-24" && good?.episode?.number === 2,
      JSON.stringify({ assignee: good?.assignee?._id === artist.userId, due: good?.dueDate, ep: good?.episode?.number }),
    );
  }

  /* ======================= 6. importRows — defaults & notification ====== */
  {
    const unreadBefore = must(await query("notifications:list", { limit: 200 }, artist.token), "notif")
      .filter((n) => n.type === "shot_assigned").length;
    const r = await mutation(
      "shots:importRows",
      {
        productionId,
        rows: [{ code: "SC010_SH100" }, { code: "SC010_SH110" }, { code: "SC010_SH120" }],
        defaults: { sceneId, assigneeId: artist.userId, dueDate: "2026-10-01", stage: "post" },
        createMissingScenes: false,
      },
      owner.token,
    );
    suite.allowed("defaults apply to rows without their own values", r);
    suite.check("sceneId comes back for the single default scene", r.ok && r.value.sceneId === sceneId, "");
    const rows = must(await query("shots:list", { productionId, sceneId, stage: "post" }, owner.token), "list")
      .filter((s) => /^SC010_SH1[012]0$/.test(s.code));
    suite.check(
      "the three shots carry the default assignee, due date, stage and scene",
      rows.length === 3 && rows.every((s) => s.assignee?._id === artist.userId && s.dueDate === "2026-10-01" && s.stage === "post"),
      rows.map((s) => `${s.code}:${s.stage}:${s.dueDate}`).join(" "),
    );
    const notifs = must(await query("notifications:list", { limit: 200 }, artist.token), "notif")
      .filter((n) => n.type === "shot_assigned");
    suite.check(
      "the assignee gets ONE aggregated shot_assigned notification for the import",
      notifs.length - unreadBefore === 1 && /assigned you 3 shots/.test(notifs[0]?.title ?? ""),
      `${notifs.length - unreadBefore} new; latest "${notifs[0]?.title}"`,
    );
  }

  /* ======================= 7. concurrency (as integrity.mjs) ============ */
  {
    const rows = [{ code: "CC_SH001" }, { code: "CC_SH002" }];
    const [a, b] = await Promise.all([
      mutation("shots:importRows", { productionId, rows, defaults: { sceneId }, createMissingScenes: false }, owner.token),
      mutation("shots:importRows", { productionId, rows, defaults: { sceneId }, createMissingScenes: false }, producer.token),
    ]);
    const codes = await listCodes();
    suite.check(
      "two concurrent imports of the same codes create no duplicates",
      codes.filter((c) => c === "CC_SH001").length === 1 && codes.filter((c) => c === "CC_SH002").length === 1,
      "",
    );
    suite.check(
      "…and the second reports them skipped",
      a.ok && b.ok && a.value.created + b.value.created === 2 && a.value.skipped.length + b.value.skipped.length === 2,
      `a=${JSON.stringify(a.value)} b=${JSON.stringify(b.value)}`,
    );
  }

  /* ======================= 8. bulkCreate alias ========================== */
  {
    const r = await mutation("shots:bulkCreate", { productionId, codes: ["BC_SH001", " bc_sh002 ", ""], sceneId }, owner.token);
    suite.check(
      "bulkCreate (deprecated alias) still returns { created, skipped }",
      r.ok && r.value.created === 2 && Array.isArray(r.value.skipped) && r.value.skipped.length === 0,
      r.ok ? JSON.stringify(r.value) : r.error,
    );
    const again = await mutation("shots:bulkCreate", { productionId, codes: ["BC_SH001", "BC_SH002"] }, owner.token);
    suite.check(
      "bulkCreate skips codes that exist",
      again.ok && again.value.created === 0 && again.value.skipped.length === 2,
      again.ok ? JSON.stringify(again.value) : again.error,
    );
    suite.denied(
      "bulkCreate still refuses a 5,000-code paste",
      await mutation("shots:bulkCreate", { productionId, codes: Array.from({ length: 5000 }, (_, i) => `H_${i}`) }, owner.token),
    );
    suite.denied("artist cannot bulkCreate", await mutation("shots:bulkCreate", { productionId, codes: ["AR_SH001"] }, artist.token));
  }

  /* ======================= 9. element slot exclusions (item b) ========== */
  {
    const elementId = must(
      await mutation("elements:create", { productionId, kind: "character", name: "Pushistik" }, owner.token),
      "elements:create",
    );
    const element = must(await query("elements:get", { elementId }, owner.token), "elements:get");
    const concept = element.slots.find((s) => s.slot === "concept");
    const slotShotId = concept?.shotId;
    suite.check("a character has a concept slot shot", Boolean(slotShotId), JSON.stringify(element.slots?.map((s) => s.slot)));

    const def = await listCodes();
    suite.check("shots:list excludes slot shots by default", !def.some((c) => c.startsWith("CH_")), def.filter((c) => c.startsWith("CH_")).join(","));
    const excl = await listCodes({ elements: "exclude" });
    suite.check("shots:list elements:'exclude' excludes them too", !excl.some((c) => c.startsWith("CH_")), "");
    const only = await listCodes({ elements: "only" });
    suite.check(
      "shots:list elements:'only' returns just the slot shots",
      only.length >= 1 && only.every((c) => c.startsWith("CH_")) && only.includes("CH_PUSHISTIK_CONCEPT"),
      only.join(","),
    );
    const all = await listCodes({ elements: "all" });
    suite.check(
      "shots:list elements:'all' returns both",
      all.includes("CH_PUSHISTIK_CONCEPT") && all.includes("SC010_SH020"),
      "",
    );
    const onlyStage = await listCodes({ elements: "only", stage: "preproduction" });
    suite.check("the elements filter combines with the others", onlyStage.includes("CH_PUSHISTIK_CONCEPT"), onlyStage.join(","));

    const home = must(await query("productions:listForStudio", { studioId: owner.studioId }, owner.token), "home")
      .find((p) => p._id === productionId);
    suite.check(
      "productions:listForStudio does not count slot shots",
      home && home.shotCounts.total === def.length,
      `counted=${home?.shotCounts.total} listed=${def.length}`,
    );
    const hits = must(await query("search:global", { q: "CH_PUSHISTIK" }, owner.token), "search");
    suite.check("search:global skips slot shots", (hits.shots ?? []).length === 0, `${(hits.shots ?? []).length} hits`);
    const hits2 = must(await query("search:global", { q: "SC020_SH" }, owner.token), "search2");
    suite.check("…but still finds ordinary shots", (hits2.shots ?? []).length >= 2, `${(hits2.shots ?? []).length} hits`);

    suite.denied(
      "shots:update refuses a scene on a slot shot",
      await mutation("shots:update", { shotId: slotShotId, sceneId }, owner.token),
    );
    suite.denied(
      "shots:update refuses an episode on a slot shot",
      await mutation("shots:update", { shotId: slotShotId, episodeId: ep1._id }, owner.token),
    );
    suite.denied(
      "shots:update refuses clearing the scene (null) on a slot shot",
      await mutation("shots:update", { shotId: slotShotId, sceneId: null }, owner.token),
    );
    suite.allowed(
      "shots:update still edits a slot shot's other fields",
      await mutation("shots:update", { shotId: slotShotId, dueDate: "2026-10-10" }, owner.token),
    );
    const slotRename = await mutation("shots:rename", { shotId: slotShotId, code: "CH_OTHER_CONCEPT" }, owner.token);
    suite.denied("shots:rename refuses a slot shot", slotRename);
    suite.check("…pointing at the character", /rename the character instead/.test(errorOf(slotRename)), errorOf(slotRename));
  }

  /* ======================= 10. rename (item e) ========================== */
  {
    const before = await feedCount("shot.renamed");
    suite.denied(
      "artist cannot rename — even the shot assigned to them",
      await mutation("shots:rename", { shotId: shotA, code: "SC010_SH011" }, artist.token),
    );
    suite.denied("viewer cannot rename", await mutation("shots:rename", { shotId: shotA, code: "SC010_SH011" }, viewer.token));
    suite.denied("a stranger cannot rename", await mutation("shots:rename", { shotId: shotA, code: "SC010_SH011" }, stranger.token));
    suite.denied("an anonymous caller cannot rename", await mutation("shots:rename", { shotId: shotA, code: "SC010_SH011" }, null));
    suite.check(
      "…and the code is untouched after the refusals",
      (await getShot(shotA)).code === "SC010_SH010",
      "",
    );
    const sv = await mutation("shots:rename", { shotId: shotA, code: " sc010_sh015 " }, supervisor.token);
    suite.allowed("supervisor can rename", sv);
    suite.check("rename returns the normalised code", sv.ok && sv.value === "SC010_SH015", String(sv.value));
    const renamed = await getShot(shotA);
    suite.check("the shot carries the new code", renamed.code === "SC010_SH015", renamed.code);
    suite.check(
      "the old code is pushed onto formerCodes",
      JSON.stringify(renamed.formerCodes) === JSON.stringify(["SC010_SH010"]),
      JSON.stringify(renamed.formerCodes),
    );
    const feed = must(await query("activity:feed", { productionId, types: ["shot.renamed"], limit: 5 }, owner.token), "feed");
    suite.check(
      "activity shot.renamed 'renamed A → B'",
      feed.length - before === 1 && /renamed SC010_SH010 → SC010_SH015$/.test(feed[0]?.summary ?? ""),
      feed[0]?.summary ?? "",
    );
    suite.allowed("creative director can rename", await mutation("shots:rename", { shotId: shotA, code: "SC010_SH016" }, director.token));
    suite.check(
      "a second rename appends to the trail, oldest first",
      JSON.stringify((await getShot(shotA)).formerCodes) === JSON.stringify(["SC010_SH010", "SC010_SH015"]),
      "",
    );
    suite.denied(
      "rename to an existing code is refused",
      await mutation("shots:rename", { shotId: shotA, code: "SC010_SH020" }, owner.token),
    );
    suite.denied(
      "rename to an existing code is case-insensitive",
      await mutation("shots:rename", { shotId: shotA, code: "sc010_sh020" }, owner.token),
    );
    suite.denied("rename to a reserved code is refused", await mutation("shots:rename", { shotId: shotA, code: "CH_SH016" }, owner.token));
    suite.denied("rename to an empty code is refused", await mutation("shots:rename", { shotId: shotA, code: "   " }, owner.token));
    suite.denied("rename to a 65-char code is refused", await mutation("shots:rename", { shotId: shotA, code: "R".repeat(65) }, owner.token));
    const noop = await mutation("shots:rename", { shotId: shotA, code: "SC010_SH016" }, owner.token);
    suite.allowed("rename to the same code is a no-op", noop);
    suite.check(
      "…that logs nothing",
      (await feedCount("shot.renamed")) - before === 2,
      "",
    );
    const feedAll = must(await query("activity:feed", { productionId, limit: 200 }, owner.token), "feed all");
    suite.check(
      "the old code still appears in earlier activity summaries",
      feedAll.some((f) => f.summary.includes("SC010_SH010")),
      "",
    );
    // Delivered shots keep their name (the delivered filename is the record).
    const deliveredId = must(await mutation("shots:create", { productionId, code: "SC010_SH990" }, owner.token), "delivered shot");
    must(await mutation("shots:setStatus", { shotId: deliveredId, status: "delivered" }, owner.token), "deliver");
    suite.denied(
      "a delivered shot cannot be renamed",
      await mutation("shots:rename", { shotId: deliveredId, code: "SC010_SH991" }, owner.token),
    );
    suite.check(
      "search:global finds the renamed shot by its live code",
      must(await query("search:global", { q: "SC010_SH016" }, owner.token), "search").shots.some((s) => s._id === shotA),
      "",
    );
  }

  /* ======================= 11. update: scene / episode selects ========== */
  {
    const sc020 = must(await query("scenes:list", { productionId }, owner.token), "scenes").find((s) => s.code === "SC020");
    must(await mutation("scenes:update", { sceneId: sc020._id, episodeId: ep2._id }, owner.token), "scene → EP02");
    suite.allowed(
      "choosing a scene on a normal shot works",
      await mutation("shots:update", { shotId: shotB, sceneId: sc020._id }, owner.token),
    );
    let b = await getShot(shotB);
    suite.check(
      "…and sets the episode from the scene",
      b.scene?._id === sc020._id && b.episode?.number === 2,
      JSON.stringify({ scene: b.scene?.code, ep: b.episode?.number }),
    );
    suite.allowed("an explicit episode wins over the scene's", await mutation("shots:update", { shotId: shotB, sceneId, episodeId: ep2._id }, owner.token));
    b = await getShot(shotB);
    suite.check("…episode kept at EP02 under scene SC010 (EP01)", b.scene?.code === "SC010" && b.episode?.number === 2, JSON.stringify({ scene: b.scene?.code, ep: b.episode?.number }));
    suite.allowed("sceneId: null clears the scene", await mutation("shots:update", { shotId: shotB, sceneId: null }, owner.token));
    suite.allowed("episodeId: null clears the episode", await mutation("shots:update", { shotId: shotB, episodeId: null }, owner.token));
    b = await getShot(shotB);
    suite.check("the shot has no scene and no episode afterwards", b.scene === null && b.episode === null, JSON.stringify({ scene: b.scene, ep: b.episode }));
    const feed = must(await query("activity:feed", { productionId, types: ["shot.updated"], limit: 3 }, owner.token), "feed");
    suite.check(
      "clearing is recorded in the change list",
      feed.some((f) => /episode cleared/.test(f.summary)) && feed.some((f) => /scene cleared/.test(f.summary)),
      feed.map((f) => f.summary).join(" | "),
    );
    suite.denied(
      "a scene from another production is refused",
      await mutation("shots:update", { shotId: shotB, sceneId: must(await query("scenes:list", {
        productionId: must(await query("productions:listForStudio", { studioId: stranger.studioId }, stranger.token), "other prods")[0]._id,
      }, stranger.token), "other scenes")[0]._id }, owner.token),
    );
    must(await mutation("shots:update", { shotId: shotB, sceneId }, owner.token), "restore scene");
  }

  /* ======================= 12. scenes: code uniqueness & rename ========= */
  {
    suite.denied(
      "scenes:create refuses a duplicate code",
      await mutation("scenes:create", { productionId, code: "SC010" }, owner.token),
    );
    suite.denied(
      "scenes:create refuses a duplicate code in another case / with spaces",
      await mutation("scenes:create", { productionId, code: " sc010 " }, owner.token),
    );
    const sc050 = must(await mutation("scenes:create", { productionId, code: "SC050", title: "Roof" }, owner.token), "SC050");
    suite.denied(
      "scenes:update refuses a code that another scene holds",
      await mutation("scenes:update", { sceneId: sc050, code: "sc010" }, owner.token),
    );
    const before = await feedCount("scene.updated");
    suite.allowed(
      "scenes:update renames the code and title together",
      await mutation("scenes:update", { sceneId: sc050, code: "sc051", title: "Roof, night" }, owner.token),
    );
    const scenes = must(await query("scenes:list", { productionId }, owner.token), "scenes");
    suite.check("the scene shows the new code", scenes.some((s) => s._id === sc050 && s.code === "SC051"), scenes.find((s) => s._id === sc050)?.code ?? "");
    suite.check("the old code is free again", !scenes.some((s) => s.code === "SC050"), "");
    const feed = must(await query("activity:feed", { productionId, types: ["scene.updated"], limit: 3 }, owner.token), "feed");
    suite.check(
      "activity scene.updated lists the changes",
      feed.length - before === 1 && /updated scene SC050 \(code → SC051, title → "Roof, night"\)/.test(feed[0]?.summary ?? ""),
      feed[0]?.summary ?? "",
    );
    // A scene code rename leaves its shot codes alone.
    must(await mutation("scenes:update", { sceneId, code: "SC011" }, owner.token), "SC010 → SC011");
    const codes = await listCodes({ sceneId });
    suite.check(
      "renaming a scene code does NOT rename its shot codes",
      codes.includes("SC010_SH020") && !codes.some((c) => c.startsWith("SC011_")),
      codes.slice(0, 5).join(","),
    );
    must(await mutation("scenes:update", { sceneId, code: "SC010" }, owner.token), "back to SC010");
    suite.allowed("a no-op code update is fine", await mutation("scenes:update", { sceneId, code: "SC010" }, owner.token));
    suite.denied("artist cannot update a scene", await mutation("scenes:update", { sceneId, title: "nope" }, artist.token));
    suite.allowed("supervisor can update a scene", await mutation("scenes:update", { sceneId, title: "Cold open" }, supervisor.token));
    // importRows matches the renamed scene by its live code and does not recreate it.
    const r = await mutation(
      "shots:importRows",
      { productionId, rows: [{ code: "SC051_SH010", sceneCode: "SC051" }], createMissingScenes: true },
      owner.token,
    );
    suite.check(
      "importRows finds a renamed scene by its live code",
      r.ok && r.value.created === 1 && r.value.scenesCreated.length === 0 && r.value.sceneId === sc050,
      r.ok ? JSON.stringify(r.value) : r.error,
    );
  }

  /* ======================= 13. versions.updateMeta caps (item c) ======== */
  {
    const own = await uploadVersion(productionId, shotA, artist.token, "own.png");
    const other = await uploadVersion(productionId, shotA, owner.token, "other.png");
    const meta = (overrides) => ({ tool: "Midjourney", model: "v6", prompt: "Baby mammoth", seed: "42", params: "{\"ar\":\"16:9\"}", ...overrides });
    suite.denied(
      "a 20,001-character prompt is refused",
      await mutation("versions:updateMeta", { versionId: other.versionId, promptMeta: meta({ prompt: "P".repeat(20_001) }) }, owner.token),
    );
    suite.allowed(
      "a 20,000-character prompt is accepted",
      await mutation("versions:updateMeta", { versionId: other.versionId, promptMeta: meta({ prompt: "P".repeat(20_000) }) }, owner.token),
    );
    suite.denied(
      "20,001-character params are refused",
      await mutation("versions:updateMeta", { versionId: other.versionId, promptMeta: meta({ params: "{".repeat(20_001) }) }, owner.token),
    );
    for (const key of ["tool", "model", "seed"]) {
      suite.denied(
        `a 201-character ${key} is refused`,
        await mutation("versions:updateMeta", { versionId: other.versionId, promptMeta: meta({ [key]: "x".repeat(201) }) }, owner.token),
      );
    }
    suite.denied(
      "a 2,001-character note is refused",
      await mutation("versions:updateMeta", { versionId: other.versionId, note: "n".repeat(2_001) }, owner.token),
    );
    suite.allowed(
      "params are accepted with the other fields",
      await mutation("versions:updateMeta", { versionId: other.versionId, promptMeta: meta({}), note: "first pass" }, owner.token),
    );
    const versions = must(await query("versions:listForShot", { shotId: shotA }, owner.token), "versions");
    const saved = versions.find((v) => v._id === other.versionId);
    suite.check(
      "params round-trip on the version",
      saved?.promptMeta?.params === "{\"ar\":\"16:9\"}" && saved?.promptMeta?.tool === "Midjourney" && saved?.note === "first pass",
      JSON.stringify(saved?.promptMeta),
    );
    const feed = must(await query("activity:feed", { productionId, types: ["version.updated"], limit: 1 }, owner.token), "feed");
    suite.check(
      "version.updated names the fields that changed",
      /updated details on v\d+ of SC010_SH016 \(.*prompt.*note\)/.test(feed[0]?.summary ?? ""),
      feed[0]?.summary ?? "",
    );
    suite.denied(
      "viewer cannot edit details",
      await mutation("versions:updateMeta", { versionId: own.versionId, promptMeta: meta({}) }, viewer.token),
    );
    suite.denied(
      "artist cannot edit another's version details",
      await mutation("versions:updateMeta", { versionId: other.versionId, promptMeta: meta({}) }, artist.token),
    );
    suite.allowed(
      "artist can edit their own version details",
      await mutation("versions:updateMeta", { versionId: own.versionId, promptMeta: meta({ tool: "Runway" }) }, artist.token),
    );
    suite.allowed(
      "supervisor (content.edit) can edit anyone's version details",
      await mutation("versions:updateMeta", { versionId: own.versionId, note: "checked" }, supervisor.token),
    );
  }

  /* ======================= 14. external links by content.edit (item e) == */
  {
    const cd = await mutation("externalLinks:add", { productionId, kind: "figma", title: "Storyboard", url: "https://figma.com/file/x" }, director.token);
    suite.allowed("creative director can add a link (was production.manage)", cd);
    const linkId = cd.ok ? cd.value : null;
    suite.allowed(
      "creative director can edit a link",
      await mutation("externalLinks:update", { linkId, title: "Storyboard (Figma)", url: "https://figma.com/file/y" }, director.token),
    );
    const links = must(await query("externalLinks:list", { productionId }, viewer.token), "links as viewer");
    suite.check(
      "viewer reads the edited link",
      links.some((l) => l._id === linkId && l.title === "Storyboard (Figma)" && l.url === "https://figma.com/file/y"),
      JSON.stringify(links.map((l) => l.title)),
    );
    suite.allowed(
      "supervisor can add a link",
      await mutation("externalLinks:add", { productionId, kind: "sheet", title: "Heroes", url: "https://docs.google.com/spreadsheets/d/1" }, supervisor.token),
    );
    suite.denied("artist cannot add a link", await mutation("externalLinks:add", { productionId, kind: "other", title: "x", url: "https://e.example.com" }, artist.token));
    suite.denied("viewer cannot add a link", await mutation("externalLinks:add", { productionId, kind: "other", title: "x", url: "https://e.example.com" }, viewer.token));
    suite.denied("artist cannot edit a link", await mutation("externalLinks:update", { linkId, title: "nope" }, artist.token));
    suite.denied("viewer cannot remove a link", await mutation("externalLinks:remove", { linkId }, viewer.token));
    suite.denied("a stranger cannot remove a link", await mutation("externalLinks:remove", { linkId }, stranger.token));
    suite.denied(
      "a javascript: URL is still refused for a CD",
      await mutation("externalLinks:add", { productionId, kind: "other", title: "x", url: "javascript:alert(1)" }, director.token),
    );
    suite.allowed("supervisor can remove a link", await mutation("externalLinks:remove", { linkId }, supervisor.token));
    suite.check(
      "…and it is gone",
      !must(await query("externalLinks:list", { productionId }, owner.token), "links").some((l) => l._id === linkId),
      "",
    );
  }

  return suite;
}
