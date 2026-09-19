/**
 * Provenance export (v2 item c): `exports:provenanceRows` and
 * `exports:logProvenanceExport`.
 *
 * Runs standalone (`node e2e/api/exports.mjs`, dev backend running) and
 * exports `run()` in the same shape as the other suites so run.mjs can pick
 * it up. Three axes, mirroring the suite split:
 *   authz       production.manage only, cross-tenant and anonymous refused
 *   integrity   pagination ends cleanly, one row per version newest-first,
 *               the column list, slot-shot rows, picks, edits, the log row
 *   validation  numItems / rowCount bounds
 */
import { pathToFileURL } from "node:url";
import {
  CONVEX_URL, createSuite, report, query, mutation, must,
  newOwner, addMember, newProduction, uploadVersion,
} from "./_harness.mjs";

/** The spec's column list, in order — the header of the CSV. */
const COLUMNS = [
  "studio_name", "production_code", "production_name",
  "target_type", "target_code", "target_title", "slot", "scene_code", "episode",
  "version", "version_id", "version_status",
  "created_at", "created_at_local", "created_by_name", "created_by_email",
  "tool", "model", "prompt", "seed", "params", "note",
  "file_name", "file_mime", "file_size_bytes", "file_md5", "file_provider",
  "file_location", "file_missing", "approved_file_name",
  "decision", "decided_at", "decided_by_name", "decided_by_email", "decision_note",
  "details_last_edited_at", "details_last_edited_by",
];

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const LOCAL_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

/** Page through provenanceRows until done; returns { pages, rows }. */
async function exportAll(productionId, token, numItems) {
  const pages = [];
  let cursor = null;
  for (let i = 0; i < 50; i += 1) {
    const page = must(
      await query("exports:provenanceRows", { productionId, cursor, numItems }, token),
      `provenanceRows page ${i + 1}`,
    );
    pages.push(page);
    if (page.done) break;
    cursor = page.cursor;
  }
  return { pages, rows: pages.flatMap((p) => p.rows) };
}

export async function run() {
  const suite = createSuite("Provenance export — authz, integrity & validation");

  /* ---------------------------------------------------------------- setup */
  const owner = await newOwner("exports");
  const { productionId } = await newProduction(owner.studioId, owner.token, {
    name: "Export Test",
    code: "EXP",
    kind: "episodic",
    episodeCount: 1,
  });
  const producer = await addMember(owner.studioId, owner.token, "producer");
  const director = await addMember(owner.studioId, owner.token, "creative_director");
  const supervisor = await addMember(owner.studioId, owner.token, "supervisor");
  const artist = await addMember(owner.studioId, owner.token, "artist");
  const viewer = await addMember(owner.studioId, owner.token, "viewer");
  const stranger = await newOwner("exports-stranger");

  const episodes = must(await query("episodes:list", { productionId }, owner.token), "episodes");
  const episodeId = episodes[0]?._id;
  const sceneId = must(
    await mutation("scenes:create", { productionId, code: "SC010", episodeId }, owner.token),
    "scene",
  );
  const shotA = must(
    await mutation(
      "shots:create",
      { productionId, code: "SC010_SH010", sceneId, episodeId },
      owner.token,
    ),
    "shot A",
  );
  const shotB = must(
    await mutation(
      "shots:create",
      { productionId, code: "SC010_SH020", sceneId, episodeId },
      owner.token,
    ),
    "shot B",
  );

  /* ============================ 1. empty production ====================== */
  {
    const empty = await query("exports:provenanceRows", { productionId }, owner.token);
    suite.check(
      "an empty production exports no rows and is done at once (header-only file)",
      empty.ok && empty.value.rows.length === 0 && empty.value.done === true && empty.value.cursor === null,
      empty.ok ? JSON.stringify(empty.value) : empty.error,
    );
  }

  /* ============================ 2. fixture: six versions ================= */
  // 2 shots × 2 options + 1 character concept slot × 2 = 6 (the spec's
  // decisions.spec fixture). Uploads run sequentially so creation order — and
  // therefore the export's newest-first order — is deterministic.
  const a1 = await uploadVersion(productionId, shotA, artist.token, "a1.png");
  const a2 = await uploadVersion(productionId, shotA, artist.token, "a2.png");
  const b1 = await uploadVersion(productionId, shotB, owner.token, "b1.png");
  const b2 = await uploadVersion(productionId, shotB, owner.token, "b2.png");

  // Character slot (elements.ts, item b). When that module is not deployed
  // yet the slot checks fail with a clear detail and the two remaining
  // versions land on a third ordinary shot so the pagination fixture stays
  // at six.
  let slotShotId = null;
  let slotVersions = [];
  const elementCreate = await mutation(
    "elements:create",
    { productionId, kind: "character", name: "Pushistik" },
    owner.token,
  );
  if (elementCreate.ok) {
    const element = must(
      await query("elements:get", { elementId: elementCreate.value }, owner.token),
      "elements:get",
    );
    const concept = (element.slots ?? []).find((s) => s.slot === "concept");
    slotShotId = concept?.shotId ?? null;
  }
  if (slotShotId !== null) {
    slotVersions = [
      await uploadVersion(productionId, slotShotId, artist.token, "ch1.png"),
      await uploadVersion(productionId, slotShotId, owner.token, "ch2.png"),
    ];
  } else {
    const shotC = must(
      await mutation("shots:create", { productionId, code: "SC010_SH030", sceneId }, owner.token),
      "shot C (fallback)",
    );
    slotVersions = [
      await uploadVersion(productionId, shotC, artist.token, "c1.png"),
      await uploadVersion(productionId, shotC, owner.token, "c2.png"),
    ];
  }
  const allVersionIds = [a1, a2, b1, b2, ...slotVersions].map((v) => v.versionId);

  // Decisions and an edit, so every column family has a non-empty case.
  must(await mutation("versions:pick", { versionId: a1.versionId, note: "best hands" }, owner.token), "pick a1");
  must(
    await mutation(
      "versions:updateMeta",
      {
        versionId: b1.versionId,
        promptMeta: {
          tool: "Midjourney",
          model: "v6",
          prompt: "line one\nline two, with a comma and \"quotes\"",
          seed: "12345",
          params: "--ar 16:9",
        },
        note: "edited note",
      },
      producer.token,
    ),
    "updateMeta b1",
  );
  // A decision after the edit: the newest activity row for b1 is then not
  // the edit, so the by_target scan has to look past it.
  must(await mutation("versions:shortlist", { versionId: b1.versionId }, owner.token), "shortlist b1");

  /* ============================ 3. authz ================================= */
  for (const [label, token] of [
    ["an artist", artist.token],
    ["a creative director", director.token],
    ["a supervisor", supervisor.token],
    ["a viewer", viewer.token],
    ["a stranger from another studio", stranger.token],
    ["an anonymous caller", null],
  ]) {
    suite.denied(
      `${label} cannot read exports:provenanceRows`,
      await query("exports:provenanceRows", { productionId }, token),
    );
    suite.denied(
      `${label} cannot write exports:logProvenanceExport`,
      await mutation("exports:logProvenanceExport", { productionId, rowCount: 1 }, token),
    );
  }
  suite.allowed(
    "a producer can read exports:provenanceRows",
    await query("exports:provenanceRows", { productionId }, producer.token),
  );
  suite.allowed(
    "the owner can read exports:provenanceRows",
    await query("exports:provenanceRows", { productionId }, owner.token),
  );

  /* ============================ 4. integrity ============================= */
  const { pages, rows } = await exportAll(productionId, producer.token, 2);
  suite.check(
    "numItems 2 over 6 versions ends with done=true after 3 pages",
    pages.length === 3 && pages[2].done === true && pages[2].cursor === null,
    `${pages.length} pages; last done=${pages[pages.length - 1]?.done} cursor=${pages[pages.length - 1]?.cursor}`,
  );
  suite.check(
    "pages before the last carry a cursor and are not done",
    pages.slice(0, -1).every((p) => p.done === false && typeof p.cursor === "string"),
    pages.slice(0, -1).map((p) => `done=${p.done}`).join(" "),
  );
  suite.check(
    "one row per version — 6 rows, no duplicates, nothing missing",
    rows.length === 6 &&
      new Set(rows.map((r) => r.version_id)).size === 6 &&
      allVersionIds.every((id) => rows.some((r) => r.version_id === id)),
    `${rows.length} rows, ${new Set(rows.map((r) => r.version_id)).size} distinct`,
  );
  suite.check(
    "rows come newest first across pages",
    rows.every((r, i) => i === 0 || rows[i - 1].created_at >= r.created_at),
    rows.map((r) => r.created_at.slice(11, 23)).join(" > "),
  );
  suite.check(
    "the last uploaded version is the first row",
    rows[0]?.version_id === slotVersions[1].versionId,
    `first=${rows[0]?.target_code} v${rows[0]?.version}`,
  );
  suite.check(
    "the page carries the spec's column list, in order (the CSV header)",
    pages.every((p) => JSON.stringify(p.columns) === JSON.stringify(COLUMNS)),
    pages[0] ? `${pages[0].columns?.length} columns` : "no pages",
  );
  // Convex sorts object keys on the wire, so a row is checked as a key SET
  // against the column list; the order comes from `columns` above.
  suite.check(
    "every row has exactly the spec's columns, every cell a string",
    rows.every(
      (r) =>
        JSON.stringify(Object.keys(r).sort()) === JSON.stringify([...COLUMNS].sort()) &&
        Object.values(r).every((cell) => typeof cell === "string"),
    ),
    rows[0] ? `${Object.keys(rows[0]).length} keys` : "no rows",
  );

  // Full-page run for the row-level checks.
  const full = must(await query("exports:provenanceRows", { productionId }, producer.token), "full page");
  const byId = new Map(full.rows.map((r) => [r.version_id, r]));
  const rowA1 = byId.get(a1.versionId);
  const rowA2 = byId.get(a2.versionId);
  const rowB1 = byId.get(b1.versionId);
  const rowB2 = byId.get(b2.versionId);
  suite.check(
    "a single page of the default size returns all 6 rows and is done",
    full.rows.length === 6 && full.done === true,
    `${full.rows.length} rows done=${full.done}`,
  );

  suite.check(
    "studio and production identity on every row",
    full.rows.every(
      (r) => r.production_code === "EXP" && r.production_name === "Export Test" && r.studio_name.length > 0,
    ),
    rowA1 ? `${rowA1.studio_name} / ${rowA1.production_code} / ${rowA1.production_name}` : "no row",
  );
  suite.check(
    "a shot version reads target_type shot with its code, scene and episode",
    rowA2?.target_type === "shot" &&
      rowA2?.target_code === "SC010_SH010" &&
      rowA2?.slot === "" &&
      rowA2?.scene_code === "SC010" &&
      rowA2?.episode === (episodeId ? "EP01" : ""),
    rowA2 ? `${rowA2.target_type} ${rowA2.target_code} scene=${rowA2.scene_code} ep=${rowA2.episode}` : "no row",
  );
  suite.check(
    "version number and status are strings from the version",
    rowA2?.version === "2" && rowA2?.version_status === "rejected" && rowB2?.version_status === "candidate",
    `a2=v${rowA2?.version}/${rowA2?.version_status} b2=${rowB2?.version_status}`,
  );
  suite.check(
    "created_at is ISO 8601 UTC and created_at_local is 'YYYY-MM-DD HH:mm'",
    full.rows.every((r) => ISO_RE.test(r.created_at) && LOCAL_RE.test(r.created_at_local)),
    rowA1 ? `${rowA1.created_at} / ${rowA1.created_at_local}` : "no row",
  );
  suite.check(
    "created_by carries the uploader's name and email",
    rowA1?.created_by_email === artist.email &&
      rowA1?.created_by_name === "artist user" &&
      rowB1?.created_by_email === owner.email,
    `a1 by ${rowA1?.created_by_name} <${rowA1?.created_by_email}>`,
  );

  // Files (harness uploads an 8×8 PNG into app storage).
  suite.check(
    "file columns describe the uploaded storage asset",
    rowA1?.file_name === "a1.png" &&
      rowA1?.file_mime === "image/png" &&
      /^\d+$/.test(rowA1?.file_size_bytes ?? "") &&
      rowA1?.file_provider === "storage" &&
      rowA1?.file_location.startsWith("app storage:") &&
      rowA1?.file_missing === "false",
    rowA1
      ? `${rowA1.file_name} ${rowA1.file_mime} ${rowA1.file_size_bytes}B ${rowA1.file_provider} ${rowA1.file_location} missing=${rowA1.file_missing}`
      : "no row",
  );

  // Decisions: the pick, its superseded sibling, and the canonical name.
  const expectedApproved = episodeId ? "EXP_EP01_SC010_SH010_v1.png" : "EXP_SC010_SH010_v1.png";
  suite.check(
    "the picked version shows decision picked, decider, note and the canonical approved filename",
    rowA1?.version_status === "picked" &&
      rowA1?.decision === "picked" &&
      ISO_RE.test(rowA1?.decided_at ?? "") &&
      rowA1?.decided_by_email === owner.email &&
      rowA1?.decision_note === "best hands" &&
      rowA1?.approved_file_name === expectedApproved,
    rowA1
      ? `${rowA1.decision} by ${rowA1.decided_by_name} '${rowA1.decision_note}' → ${rowA1.approved_file_name}`
      : "no row",
  );
  suite.check(
    "the superseded sibling shows decision rejected with the supersede note and no approved name",
    rowA2?.decision === "rejected" &&
      rowA2?.decision_note === "superseded by v1" &&
      rowA2?.decided_by_email === owner.email &&
      rowA2?.approved_file_name === "",
    rowA2 ? `${rowA2.decision} '${rowA2.decision_note}' approved='${rowA2.approved_file_name}'` : "no row",
  );
  suite.check(
    "an undecided version has empty decision columns",
    rowB2?.decision === "" &&
      rowB2?.decided_at === "" &&
      rowB2?.decided_by_name === "" &&
      rowB2?.decided_by_email === "" &&
      rowB2?.decision_note === "",
    rowB2 ? JSON.stringify([rowB2.decision, rowB2.decided_at, rowB2.decided_by_name]) : "no row",
  );

  // Generation details, verbatim — including the multi-line prompt.
  suite.check(
    "generation details round-trip verbatim (multi-line prompt, tool, model, seed, params, note)",
    rowB1?.tool === "Midjourney" &&
      rowB1?.model === "v6" &&
      rowB1?.prompt === "line one\nline two, with a comma and \"quotes\"" &&
      rowB1?.seed === "12345" &&
      rowB1?.params === "--ar 16:9" &&
      rowB1?.note === "edited note",
    rowB1 ? JSON.stringify([rowB1.tool, rowB1.model, rowB1.prompt, rowB1.seed, rowB1.params, rowB1.note]) : "no row",
  );
  suite.check(
    "details_last_edited_* come from the newest version.updated row, even behind a later decision",
    ISO_RE.test(rowB1?.details_last_edited_at ?? "") && rowB1?.details_last_edited_by === "producer user",
    rowB1 ? `${rowB1.details_last_edited_at} by ${rowB1.details_last_edited_by}` : "no row",
  );
  suite.check(
    "a never-edited version has empty details_last_edited_* columns",
    rowA1?.details_last_edited_at === "" && rowA1?.details_last_edited_by === "" && rowA1?.tool === "",
    rowA1 ? JSON.stringify([rowA1.details_last_edited_at, rowA1.details_last_edited_by]) : "no row",
  );

  // Slot shot (character) rows.
  const slotRows = slotVersions.map((v) => byId.get(v.versionId)).filter(Boolean);
  suite.check(
    "a slot-shot version appears with target_type character, the element's code and name, and its slot",
    slotShotId !== null &&
      slotRows.length === 2 &&
      slotRows.every(
        (r) =>
          r.target_type === "character" &&
          r.target_code === "PUSHISTIK" &&
          r.target_title === "Pushistik" &&
          r.slot === "concept" &&
          r.scene_code === "" &&
          r.episode === "",
      ),
    slotShotId === null
      ? `elements:create unavailable — ${elementCreate.error}`
      : slotRows.map((r) => `${r.target_type}/${r.target_code}/${r.slot}`).join(" "),
  );

  /* ============================ 5. the log row ========================== */
  suite.allowed(
    "a producer can log the export",
    await mutation("exports:logProvenanceExport", { productionId, rowCount: 6 }, producer.token),
  );
  {
    const feed = must(
      await query("activity:feed", { productionId, types: ["export.generated"] }, owner.token),
      "feed",
    );
    const row = feed.find((f) => f.targetId === productionId);
    suite.check(
      "the feed shows 'exported provenance (6 rows)' under export.generated",
      row !== undefined &&
        row.type === "export.generated" &&
        row.targetType === "production" &&
        row.summary === "producer user exported provenance (6 rows)",
      row ? row.summary : `${feed.length} export.generated rows`,
    );
  }

  /* ============================ 6. validation =========================== */
  suite.denied(
    "numItems 401 is refused",
    await query("exports:provenanceRows", { productionId, numItems: 401 }, producer.token),
  );
  suite.denied(
    "numItems 0 is refused",
    await query("exports:provenanceRows", { productionId, numItems: 0 }, producer.token),
  );
  suite.denied(
    "a fractional numItems is refused",
    await query("exports:provenanceRows", { productionId, numItems: 2.5 }, producer.token),
  );
  suite.allowed(
    "numItems 400 (the cap) is accepted",
    await query("exports:provenanceRows", { productionId, numItems: 400 }, producer.token),
  );
  suite.denied(
    "a stale or garbage cursor is refused rather than restarting silently",
    await query("exports:provenanceRows", { productionId, cursor: "not-a-cursor" }, producer.token),
  );
  suite.denied(
    "a negative rowCount is refused",
    await mutation("exports:logProvenanceExport", { productionId, rowCount: -1 }, producer.token),
  );
  suite.denied(
    "a fractional rowCount is refused",
    await mutation("exports:logProvenanceExport", { productionId, rowCount: 2.5 }, producer.token),
  );

  return suite;
}

/* ------------------------------ standalone -------------------------------- */
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const health = await fetch(`${CONVEX_URL}/version`).catch(() => null);
  if (!health || !health.ok) {
    console.error(`Cannot reach the Convex backend at ${CONVEX_URL}. Start the dev servers first (pnpm dev).`);
    process.exit(2);
  }
  console.log(`\n── Provenance export ${"─".repeat(42)}`);
  let suite;
  try {
    suite = await run();
  } catch (err) {
    console.error(`\n!! suite could not run: ${err.message}`);
    process.exit(1);
  }
  process.exit(report([suite]) === 0 ? 0 : 1);
}
