/**
 * Elements (Characters, v2 item b): the six-role matrix for `elements.*`,
 * the slot-shot invariants, and the input limits.
 *
 * Runs standalone against the dev backend:  node e2e/api/elements.mjs
 * (also exports `run()` for e2e/api/run.mjs).
 *
 * A few checks assert what the v2 shots.ts must do on slot shots
 * (`shots.list` `elements` filter, `shots.update` scene refusal,
 * `shots.rename` refusal). They fail — and only they — until that lands.
 */
import { pathToFileURL } from "node:url";
import {
  CONVEX_URL, createSuite, query, mutation, must, report,
  newOwner, addMember, newProduction, uploadVersion,
} from "./_harness.mjs";

/** The call must have been refused AND the refusal must match `re`. */
function refusedWith(suite, name, result, re) {
  return suite.check(
    name,
    !result.ok && re.test(result.error),
    result.ok
      ? "ALLOWED — the server permitted this"
      : `refused: ${result.error.slice(0, 90)}`,
  );
}

export async function run() {
  const suite = createSuite("Elements — characters, slot shots & limits");

  /* ---------------------------------------------------------------- setup */
  const owner = await newOwner("elements");
  const { productionId } = await newProduction(owner.studioId, owner.token, { code: "ELM" });
  const supervisor = await addMember(owner.studioId, owner.token, "supervisor");
  const artist = await addMember(owner.studioId, owner.token, "artist");
  const viewer = await addMember(owner.studioId, owner.token, "viewer");
  const stranger = await newOwner("elements-other");

  const createCharacter = async (args, token = owner.token) =>
    mutation("elements:create", { productionId, kind: "character", ...args }, token);
  const listCharacters = async (token = owner.token) =>
    must(await query("elements:list", { productionId, kind: "character" }, token), "elements:list");
  const feed = async (types) =>
    must(await query("activity:feed", { productionId, types, limit: 50 }, owner.token), "feed");

  /* ====================== 1. authorization ============================== */
  suite.denied("an artist cannot create a character", await createCharacter({ name: "Nope" }, artist.token));
  suite.denied("a viewer cannot create a character", await createCharacter({ name: "Nope" }, viewer.token));
  suite.denied(
    "an artist cannot paste characters",
    await mutation("elements:bulkCreate", { productionId, kind: "character", names: ["A", "B"] }, artist.token),
  );
  suite.denied(
    "a viewer cannot paste characters",
    await mutation("elements:bulkCreate", { productionId, kind: "character", names: ["A", "B"] }, viewer.token),
  );
  const supCreate = await createCharacter({ name: "Sup Char" }, supervisor.token);
  suite.allowed("a supervisor can create a character (content.edit)", supCreate);
  const supElementId = supCreate.ok ? supCreate.value : null;
  if (supElementId) {
    suite.denied(
      "an artist cannot update a character",
      await mutation("elements:update", { elementId: supElementId, basePrompt: "x" }, artist.token),
    );
    suite.denied(
      "a viewer cannot update a character",
      await mutation("elements:update", { elementId: supElementId, basePrompt: "x" }, viewer.token),
    );
    suite.allowed(
      "a supervisor can update a character",
      await mutation("elements:update", { elementId: supElementId, basePrompt: "supervisor prompt" }, supervisor.token),
    );
    suite.denied(
      "an artist cannot remove a character",
      await mutation("elements:remove", { elementId: supElementId }, artist.token),
    );
    suite.denied(
      "a viewer cannot remove a character",
      await mutation("elements:remove", { elementId: supElementId }, viewer.token),
    );
    // Cross-studio: a member of another studio sees nothing and changes nothing.
    suite.denied(
      "cross-studio elements:get is refused",
      await query("elements:get", { elementId: supElementId }, stranger.token),
    );
    suite.denied(
      "cross-studio elements:list is refused",
      await query("elements:list", { productionId, kind: "character" }, stranger.token),
    );
    suite.denied(
      "cross-studio elements:update is refused",
      await mutation("elements:update", { elementId: supElementId, name: "Hijack" }, stranger.token),
    );
    suite.denied(
      "cross-studio elements:create is refused",
      await createCharacter({ name: "Hijack" }, stranger.token),
    );
    suite.denied(
      "cross-studio elements:remove is refused",
      await mutation("elements:remove", { elementId: supElementId }, stranger.token),
    );
    suite.denied(
      "elements:list without a session is refused",
      await query("elements:list", { productionId, kind: "character" }),
    );
    suite.allowed(
      "a viewer can read the characters list",
      await query("elements:list", { productionId, kind: "character" }, viewer.token),
    );
    suite.allowed(
      "a viewer can read one character",
      await query("elements:get", { elementId: supElementId }, viewer.token),
    );
    const supRow = must(await query("elements:get", { elementId: supElementId }, owner.token), "sup get");
    const supConcept = supRow.slots.find((s) => s.slot === "concept");
    if (supConcept) {
      const upload = await uploadVersion(productionId, supConcept.shotId, artist.token, "artist.png").then(
        (v) => ({ ok: true, value: v }),
        (err) => ({ ok: false, error: err.message }),
      );
      suite.allowed("an artist can upload an option to a character slot (version.create)", upload);
      suite.denied(
        "an unassigned artist cannot change a slot's status",
        await mutation("shots:setStatus", { shotId: supConcept.shotId, status: "in_review" }, artist.token),
      );
      must(
        await mutation("shots:update", { shotId: supConcept.shotId, assigneeId: artist.userId }, owner.token),
        "assign slot",
      );
      suite.allowed(
        "the assigned artist can change that slot's status (canEditShot)",
        await mutation("shots:setStatus", { shotId: supConcept.shotId, status: "in_review" }, artist.token),
      );
      suite.denied(
        "a supervisor cannot remove a character whose slot has options",
        await mutation("elements:remove", { elementId: supElementId }, supervisor.token),
      );
    }
  }
  {
    const tmp = await createCharacter({ name: "Sup Temp" }, supervisor.token);
    if (tmp.ok)
      suite.allowed(
        "a supervisor can remove a character with no options",
        await mutation("elements:remove", { elementId: tmp.value }, supervisor.token),
      );
  }

  /* ====================== 2. create → slot shots ======================== */
  let pushistikId = null;
  let concept = null;
  let animation = null;
  {
    const created = await createCharacter({ name: "Pushistik", basePrompt: "Cartoon still. Baby mammoth on the ice." });
    suite.allowed("create derives the code from the name", created);
    if (created.ok) {
      pushistikId = created.value;
      const row = must(await query("elements:get", { elementId: pushistikId }, owner.token), "get");
      suite.check("the derived code is PUSHISTIK", row.code === "PUSHISTIK", `code=${row.code}`);
      suite.check(
        "a character owns exactly one slot shot per phase, Concept then Animation",
        row.slots.map((s) => s.slot).join(",") === "concept,animation",
        row.slots.map((s) => s.slot).join(","),
      );
      suite.check("get carries the production ref", row.production?.code === "ELM", `production=${row.production?.code}`);
      concept = row.slots.find((s) => s.slot === "concept") ?? null;
      animation = row.slots.find((s) => s.slot === "animation") ?? null;
      if (concept && animation) {
        const c = must(await query("shots:get", { shotId: concept.shotId }, owner.token), "concept shot");
        const a = must(await query("shots:get", { shotId: animation.shotId }, owner.token), "animation shot");
        suite.check("the Concept slot shot is coded CH_PUSHISTIK_CONCEPT", c.code === "CH_PUSHISTIK_CONCEPT", c.code);
        suite.check("the Animation slot shot is coded CH_PUSHISTIK_ANIMATION", a.code === "CH_PUSHISTIK_ANIMATION", a.code);
        suite.check(
          "slot shots carry elementId + slot",
          c.elementId === pushistikId && c.slot === "concept" && a.elementId === pushistikId && a.slot === "animation",
          `elementId=${c.elementId} slot=${c.slot}`,
        );
        suite.check(
          "slot shots sit in Pre-Production, planned, titled '{name} — Concept'",
          c.stage === "preproduction" && c.status === "planned" && c.title === "Pushistik — Concept",
          `stage=${c.stage} status=${c.status} title=${c.title}`,
        );
        suite.check(
          "slot shots have no scene and no episode",
          c.sceneId === undefined && c.episodeId === undefined && c.scene === null && c.episode === null,
          `sceneId=${c.sceneId} episodeId=${c.episodeId}`,
        );
        suite.check("a fresh slot has 0 options and no pick", concept.versionsCount === 0 && concept.pickedVersionIndex === null, "");
      }
      const created_rows = await feed(["element.created"]);
      suite.check(
        "element.created reads '… created character Pushistik'",
        created_rows.some((r) => r.targetId === pushistikId && /created character Pushistik$/.test(r.summary)),
        created_rows.map((r) => r.summary).slice(0, 3).join(" | "),
      );
    }
  }

  /* ====================== 3. exclusion from shot lists ================== */
  // These depend on the v2 shots.ts (`elements` filter on shots.list).
  {
    const dflt = await query("shots:list", { productionId }, owner.token);
    suite.check(
      "shots:list hides slot shots by default",
      dflt.ok && !dflt.value.some((s) => s.elementId !== undefined),
      dflt.ok ? `${dflt.value.filter((s) => s.elementId !== undefined).length} slot rows leaked` : dflt.error,
    );
    const only = await query("shots:list", { productionId, elements: "only" }, owner.token);
    suite.check(
      "shots:list { elements: 'only' } returns just the slot shots",
      only.ok && only.value.length > 0 && only.value.every((s) => s.elementId !== undefined) &&
        only.value.some((s) => s.code === "CH_PUSHISTIK_CONCEPT"),
      only.ok ? `${only.value.length} rows` : only.error,
    );
    const all = await query("shots:list", { productionId, elements: "all" }, owner.token);
    suite.check(
      "shots:list { elements: 'all' } includes Pushistik's two slot shots",
      all.ok && all.value.filter((s) => s.elementId === pushistikId).length === 2,
      all.ok ? `${all.value.filter((s) => s.elementId === pushistikId).length} rows` : all.error,
    );
  }

  /* ====================== 4. reserved codes ============================= */
  refusedWith(suite, "shots:create { code: 'CH_X' } is refused — reserved for characters",
    await mutation("shots:create", { productionId, code: "CH_X" }, owner.token), /reserved/i);
  refusedWith(suite, "the reserved-prefix rule is case-insensitive (ch_x)",
    await mutation("shots:create", { productionId, code: "ch_x" }, owner.token), /reserved/i);
  refusedWith(suite, "LOC_ is reserved too",
    await mutation("shots:create", { productionId, code: "LOC_A" }, owner.token), /reserved/i);
  {
    // A paste may refuse the whole batch or report the row — never create it.
    const bulk = await mutation("shots:bulkCreate", { productionId, codes: ["ELM_SH001", "CH_BULK"] }, owner.token);
    suite.check(
      "a shot paste never creates a CH_ code",
      !bulk.ok || bulk.value.created <= 1,
      bulk.ok ? JSON.stringify(bulk.value) : `refused: ${bulk.error.slice(0, 70)}`,
    );
  }
  {
    const shots = must(await query("shots:list", { productionId }, owner.token), "shots");
    suite.check(
      "no ordinary shot carries a reserved code",
      !shots.some((s) => s.elementId === undefined && /^(CH|LOC|SCR)_/.test(s.code)),
      shots.filter((s) => s.elementId === undefined).map((s) => s.code).join(","),
    );
  }

  /* ====================== 5. codes & names ============================== */
  refusedWith(suite, "a duplicate character code is refused",
    await createCharacter({ name: "Other", code: "PUSHISTIK" }), /already exists/i);
  refusedWith(suite, "a duplicate derived code is refused",
    await createCharacter({ name: "pushistik" }), /already exists/i);
  {
    const dupName = await createCharacter({ name: "Pushistik", code: "PUSHISTIK_TWIN" });
    suite.allowed("duplicate names are allowed when the codes differ", dupName);
    if (dupName.ok) must(await mutation("elements:remove", { elementId: dupName.value }, owner.token), "cleanup twin");
  }
  refusedWith(suite, "a Cyrillic-only name needs a typed code",
    await createCharacter({ name: "Пушистик" }), /Code is required/i);
  {
    const ru = await createCharacter({ name: "Пушистик", code: "PUSHISTIK_RU" });
    suite.allowed("a Cyrillic name with a typed code is accepted", ru);
    if (ru.ok) {
      const row = must(await query("elements:get", { elementId: ru.value }, owner.token), "ru get");
      suite.check("the Cyrillic name round-trips and the code is kept", row.name === "Пушистик" && row.code === "PUSHISTIK_RU", `${row.name}/${row.code}`);
      const c = row.slots.find((s) => s.slot === "concept");
      const shot = c ? must(await query("shots:get", { shotId: c.shotId }, owner.token), "ru shot") : null;
      suite.check("its slot title keeps the Cyrillic name", shot?.title === "Пушистик — Concept", shot?.title ?? "");
      must(await mutation("elements:remove", { elementId: ru.value }, owner.token), "cleanup ru");
    }
  }
  {
    const lower = await createCharacter({ name: "Lower", code: "lower_case" });
    suite.allowed("a lower-case typed code is accepted", lower);
    if (lower.ok) {
      const row = must(await query("elements:get", { elementId: lower.value }, owner.token), "lower get");
      suite.check("…and stored upper-cased", row.code === "LOWER_CASE", row.code);
      must(await mutation("elements:remove", { elementId: lower.value }, owner.token), "cleanup lower");
    }
  }
  {
    const [r1, r2] = await Promise.all([
      createCharacter({ name: "Race", code: "RACE" }),
      createCharacter({ name: "Race", code: "RACE" }, supervisor.token),
    ]);
    const rows = (await listCharacters()).filter((e) => e.code === "RACE");
    suite.check(
      "two concurrent creates of one code yield exactly one character",
      rows.length === 1 && (r1.ok !== r2.ok),
      `count=${rows.length} r1=${r1.ok} r2=${r2.ok}`,
    );
    for (const row of rows) must(await mutation("elements:remove", { elementId: row._id }, owner.token), "cleanup race");
  }

  /* ====================== 6. options, prompts, pick ===================== */
  if (pushistikId && concept) {
    const v1 = await uploadVersion(productionId, concept.shotId, owner.token, "v1.png");
    const v2 = await uploadVersion(productionId, concept.shotId, owner.token, "v2.png");
    must(await mutation("versions:updateMeta", { versionId: v1.versionId, promptMeta: { prompt: "prompt one" } }, owner.token), "meta v1");
    must(await mutation("versions:updateMeta", { versionId: v2.versionId, promptMeta: { prompt: "prompt two" } }, owner.token), "meta v2");
    let row = (await listCharacters()).find((e) => e._id === pushistikId);
    let c = row?.slots.find((s) => s.slot === "concept");
    suite.check("after two uploads the Concept slot counts 2 options", c?.versionsCount === 2, `versionsCount=${c?.versionsCount}`);
    suite.check("…and moved to Options ready", c?.status === "options_ready", `status=${c?.status}`);
    suite.check("…shows the cover thumbnail while nothing is picked", typeof c?.coverThumbUrl === "string" && c.pickedThumbUrl === null, `cover=${c?.coverThumbUrl ? "url" : c?.coverThumbUrl}`);
    suite.check("…and the latest option's prompt", c?.latestPrompt === "prompt two", `latestPrompt=${c?.latestPrompt}`);
    suite.check("the Animation slot is untouched", row?.slots.find((s) => s.slot === "animation")?.versionsCount === 0, "");

    must(await mutation("versions:pick", { versionId: v1.versionId, note: "the look" }, owner.token), "pick v1");
    row = (await listCharacters()).find((e) => e._id === pushistikId);
    c = row?.slots.find((s) => s.slot === "concept");
    suite.check("after a pick the slot reports pickedVersionIndex 1", c?.pickedVersionIndex === 1 && c?.status === "picked", `picked=${c?.pickedVersionIndex} status=${c?.status}`);
    suite.check("…with a picked thumbnail and file URL", typeof c?.pickedThumbUrl === "string" && typeof c?.pickedFileUrl === "string", `thumb=${!!c?.pickedThumbUrl} file=${!!c?.pickedFileUrl}`);
    suite.check("…and the picked option's prompt", c?.latestPrompt === "prompt one", `latestPrompt=${c?.latestPrompt}`);
    const ledger = must(await query("approvals:ledger", { productionId, scope: "version" }, owner.token), "ledger");
    suite.check("the pick lands in the approvals ledger", ledger.some((r) => r.targetId === v1.versionId), `${ledger.length} rows`);
    const shot = must(await query("shots:get", { shotId: concept.shotId }, owner.token), "shot after pick");
    suite.check("shots:get on the slot agrees (pickedVersionIndex 1)", shot.pickedVersionIndex === 1, `${shot.pickedVersionIndex}`);
  }

  /* ====================== 7. update: rename & re-code =================== */
  if (pushistikId && concept && animation) {
    const before = (await feed(["element.updated"])).length;
    suite.allowed("an unchanged update is a no-op", await mutation("elements:update", { elementId: pushistikId, name: "Pushistik" }, owner.token));
    suite.check("…that logs nothing", (await feed(["element.updated"])).length === before, "");

    suite.allowed(
      "the base prompt can be edited",
      await mutation("elements:update", { elementId: pushistikId, basePrompt: "Cartoon still. Baby mammoth, fluffier." }, owner.token),
    );
    const promptRows = await feed(["element.updated"]);
    suite.check(
      "element.updated reads '… updated character Pushistik (base prompt)'",
      promptRows.some((r) => r.targetId === pushistikId && /updated character Pushistik \(base prompt\)$/.test(r.summary)),
      promptRows[0]?.summary ?? "",
    );

    suite.allowed(
      "rename + re-code in one call",
      await mutation("elements:update", { elementId: pushistikId, name: "Pushistik Jr", code: "PUSHISTIK_JR" }, owner.token),
    );
    const row = must(await query("elements:get", { elementId: pushistikId }, owner.token), "get after rename");
    suite.check("the element carries the new name and code", row.name === "Pushistik Jr" && row.code === "PUSHISTIK_JR", `${row.name}/${row.code}`);
    const c = must(await query("shots:get", { shotId: concept.shotId }, owner.token), "concept after rename");
    const a = must(await query("shots:get", { shotId: animation.shotId }, owner.token), "animation after rename");
    suite.check(
      "every slot shot is re-coded in the same transaction",
      c.code === "CH_PUSHISTIK_JR_CONCEPT" && a.code === "CH_PUSHISTIK_JR_ANIMATION",
      `${c.code} / ${a.code}`,
    );
    suite.check(
      "the old codes go on each slot shot's formerCodes trail",
      (c.formerCodes ?? []).join(",") === "CH_PUSHISTIK_CONCEPT" && (a.formerCodes ?? []).join(",") === "CH_PUSHISTIK_ANIMATION",
      `${c.formerCodes} / ${a.formerCodes}`,
    );
    suite.check("slot shots are re-titled", c.title === "Pushistik Jr — Concept" && a.title === "Pushistik Jr — Animation", `${c.title} / ${a.title}`);
    suite.check("the slot shot's options survive the rename", c.versionsCount === 2 && c.pickedVersionIndex === 1, `versions=${c.versionsCount}`);
    const renameRows = await feed(["element.updated"]);
    suite.check(
      "element.updated names the former slot code",
      renameRows.some((r) => r.targetId === pushistikId && /formerly CH_PUSHISTIK_CONCEPT/.test(r.summary)),
      renameRows[0]?.summary ?? "",
    );
    const same = await query("shots:list", { productionId }, owner.token);
    void same;

    // Collisions.
    const mama = await createCharacter({ name: "Mama" });
    suite.allowed("a second character (Mama)", mama);
    if (mama.ok) {
      refusedWith(suite, "elements:update to a code another character holds is refused",
        await mutation("elements:update", { elementId: mama.value, code: "PUSHISTIK_JR" }, owner.token), /already exists/i);
      refusedWith(suite, "elements:update to an invalid code is refused",
        await mutation("elements:update", { elementId: mama.value, code: "MAMA MAMMOTH" }, owner.token), /A–Z|characters/i);
      refusedWith(suite, "elements:update to an empty code is refused",
        await mutation("elements:update", { elementId: mama.value, code: "  " }, owner.token), /required/i);
      const still = must(await query("elements:get", { elementId: mama.value }, owner.token), "mama");
      suite.check("a refused re-code leaves the element and its slots untouched", still.code === "MAMA", still.code);
    }

    // Slot shots are not ordinary shots (v2 shots.ts).
    const sceneId = must(await mutation("scenes:create", { productionId, code: "SC010" }, owner.token), "scene");
    refusedWith(suite, "shots:update { sceneId } on a slot shot is refused",
      await mutation("shots:update", { shotId: concept.shotId, sceneId }, owner.token), /slot|scene|character/i);
    refusedWith(suite, "shots:rename on a slot shot is refused ('rename the character instead')",
      await mutation("shots:rename", { shotId: concept.shotId, code: "SC010_SH010" }, owner.token), /character/i);
    const afterScene = must(await query("shots:get", { shotId: concept.shotId }, owner.token), "concept after scene");
    suite.check("the slot shot still has no scene", afterScene.sceneId === undefined, `sceneId=${afterScene.sceneId}`);
    suite.allowed(
      "shots:setStatus works on a slot shot (the character page uses it)",
      await mutation("shots:setStatus", { shotId: animation.shotId, status: "generating" }, owner.token),
    );

    /* ==================== 8. remove ===================================== */
    refusedWith(suite, "a character with options cannot be removed",
      await mutation("elements:remove", { elementId: pushistikId }, owner.token), /has options/i);
    if (mama.ok) {
      const mamaRow = must(await query("elements:get", { elementId: mama.value }, owner.token), "mama row");
      const mamaSlots = mamaRow.slots.map((s) => s.shotId);
      suite.allowed("a character with no options can be removed", await mutation("elements:remove", { elementId: mama.value }, owner.token));
      suite.denied("…after which it is gone", await query("elements:get", { elementId: mama.value }, owner.token));
      const gone = await Promise.all(mamaSlots.map((shotId) => query("shots:get", { shotId }, owner.token)));
      suite.check("…together with its slot shots", gone.every((g) => !g.ok), gone.map((g) => (g.ok ? "still there" : "gone")).join(","));
      suite.check("…and it no longer appears in the list", !(await listCharacters()).some((e) => e._id === mama.value), "");
      suite.allowed("removing it twice is not an error", await mutation("elements:remove", { elementId: mama.value }, owner.token));
      const removed = await feed(["element.removed"]);
      suite.check(
        "element.removed reads '… removed character Mama'",
        removed.some((r) => r.targetId === mama.value && /removed character Mama$/.test(r.summary)),
        removed[0]?.summary ?? "",
      );
      const createdRows = await feed(["element.created"]);
      suite.check("the removed character's creation stays in the activity feed", createdRows.some((r) => r.targetId === mama.value), "");
    }
  }

  /* ====================== 9. bulk paste ================================= */
  {
    const before = (await feed(["element.created"])).length;
    const bulk = await mutation(
      "elements:bulkCreate",
      { productionId, kind: "character", names: ["Tupik", "Morzh", " Tupik ", "Пушистик", "   ", "Papa Tupik"] },
      owner.token,
    );
    suite.allowed("paste names → characters", bulk);
    if (bulk.ok) {
      suite.check("created 4, skipped the Cyrillic-only name", bulk.value.created === 4 && bulk.value.skipped.join(",") === "Пушистик", JSON.stringify(bulk.value));
      const rows = await listCharacters();
      const codes = rows.map((e) => e.code);
      suite.check(
        "collisions get _2 (TUPIK, TUPIK_2), spaces become _ (PAPA_TUPIK)",
        ["TUPIK", "TUPIK_2", "MORZH", "PAPA_TUPIK"].every((c) => codes.includes(c)),
        codes.join(","),
      );
      suite.check("every pasted character owns both slots", rows.filter((e) => ["TUPIK", "TUPIK_2", "MORZH", "PAPA_TUPIK"].includes(e.code)).every((e) => e.slots.length === 2), "");
      const orders = rows.map((e) => e.order);
      suite.check("the list is ordered and orders are unique", orders.every((o, i) => i === 0 || o > orders[i - 1]), orders.join(","));
      const after = await feed(["element.created"]);
      suite.check("one activity row for the whole paste ('… created 4 characters')", after.length === before + 1 && /created 4 characters$/.test(after[0].summary), after[0]?.summary ?? "");
      const tupik2 = rows.find((e) => e.code === "TUPIK_2");
      const slot = tupik2 ? must(await query("shots:get", { shotId: tupik2.slots[0].shotId }, owner.token), "tupik2 slot") : null;
      suite.check("the suffixed code flows into the slot shot code", slot?.code === "CH_TUPIK_2_CONCEPT", slot?.code ?? "");
    }
    const empty = await mutation("elements:bulkCreate", { productionId, kind: "character", names: [] }, owner.token);
    suite.check("an empty paste creates nothing and is not an error", empty.ok && empty.value.created === 0, empty.ok ? "" : empty.error);
  }

  /* ====================== 10. other kinds =============================== */
  {
    const loc = await mutation("elements:create", { productionId, kind: "location", name: "Ice Field" }, owner.token);
    suite.allowed("a location can be created (no UI yet, same rules)", loc);
    if (loc.ok) {
      const row = must(await query("elements:get", { elementId: loc.value }, owner.token), "loc");
      const shot = row.slots[0] ? must(await query("shots:get", { shotId: row.slots[0].shotId }, owner.token), "loc slot") : null;
      suite.check("a location has one Concept slot coded LOC_ICE_FIELD_CONCEPT", row.slots.length === 1 && shot?.code === "LOC_ICE_FIELD_CONCEPT", `${row.slots.length} slots, ${shot?.code}`);
      suite.check("kinds are separate namespaces in the list", !(await listCharacters()).some((e) => e._id === loc.value), "");
      const clash = await createCharacter({ name: "Ice Field" });
      suite.allowed("a character may reuse a location's code (unique per kind)", clash);
      if (clash.ok) must(await mutation("elements:remove", { elementId: clash.value }, owner.token), "cleanup clash");
      must(await mutation("elements:remove", { elementId: loc.value }, owner.token), "cleanup loc");
    }
    const scr = await mutation("elements:create", { productionId, kind: "script", name: "Draft 1" }, owner.token);
    suite.allowed("a script can be created", scr);
    if (scr.ok) {
      const row = must(await query("elements:get", { elementId: scr.value }, owner.token), "scr");
      suite.check("a script owns no slot shots", row.slots.length === 0, `${row.slots.length}`);
      must(await mutation("elements:remove", { elementId: scr.value }, owner.token), "cleanup scr");
    }
  }

  /* ====================== 11. limits & hostile input ==================== */
  refusedWith(suite, "a 121-character name is refused", await createCharacter({ name: "N".repeat(121) }), /too long/i);
  {
    const max = await createCharacter({ name: "M".repeat(120), code: "MAX_NAME" });
    suite.allowed("a 120-character name is accepted", max);
    if (max.ok) must(await mutation("elements:remove", { elementId: max.value }, owner.token), "cleanup max");
  }
  refusedWith(suite, "an empty name is refused", await createCharacter({ name: "   " }), /required/i);
  refusedWith(suite, "a 4,001-character base prompt is refused", await createCharacter({ name: "Long Prompt", basePrompt: "P".repeat(4001) }), /too long/i);
  refusedWith(suite, "a 2,001-character description is refused", await createCharacter({ name: "Long Desc", description: "D".repeat(2001) }), /too long/i);
  refusedWith(suite, "a 33-character code is refused", await createCharacter({ name: "Long Code", code: "C".repeat(33) }), /too long/i);
  refusedWith(suite, "a code with a space is refused", await createCharacter({ name: "Bad Code", code: "PAPA TUPIK" }), /A–Z/);
  refusedWith(suite, "a code with a hyphen is refused", await createCharacter({ name: "Bad Code", code: "PAPA-TUPIK" }), /A–Z/);
  refusedWith(suite, "a 100,000-character name is refused", await createCharacter({ name: "X".repeat(100_000) }), /too long/i);
  if (pushistikId)
    refusedWith(suite, "a 4,001-character base prompt is refused on update",
      await mutation("elements:update", { elementId: pushistikId, basePrompt: "P".repeat(4001) }, owner.token), /too long/i);
  refusedWith(suite, "a 201-name paste is refused",
    await mutation("elements:bulkCreate", { productionId, kind: "character", names: Array.from({ length: 201 }, (_, i) => `Bulk ${i}`) }, owner.token),
    /at most 200/i);
  refusedWith(suite, "a paste with a 121-character line is refused",
    await mutation("elements:bulkCreate", { productionId, kind: "character", names: ["Fine", "L".repeat(121)] }, owner.token),
    /too long/i);
  {
    // The full cap in one call: 200 names → 200 elements + 400 slot shots.
    const { productionId: capProduction } = await newProduction(owner.studioId, owner.token, { code: "ELMCAP", name: "Cap" });
    const cap = await mutation(
      "elements:bulkCreate",
      { productionId: capProduction, kind: "character", names: Array.from({ length: 200 }, (_, i) => `Cap ${i}`) },
      owner.token,
    );
    suite.allowed("a 200-name paste (the cap) succeeds in one call", cap);
    if (cap.ok) {
      const rows = must(await query("elements:list", { productionId: capProduction, kind: "character" }, owner.token), "cap list");
      suite.check("…and the list returns all 200 with their slots", rows.length === 200 && rows.every((e) => e.slots.length === 2), `${rows.length} rows`);
    }
  }

  return suite;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const health = await fetch(`${CONVEX_URL}/version`).catch(() => null);
  if (!health || !health.ok) {
    console.error(`Cannot reach the Convex backend at ${CONVEX_URL}. Start the dev servers first (pnpm dev), or set CONVEX_URL.`);
    process.exit(2);
  }
  console.log(`\n── Elements ${"─".repeat(52)}`);
  const suite = await run();
  process.exit(report([suite]) === 0 ? 0 : 1);
}
