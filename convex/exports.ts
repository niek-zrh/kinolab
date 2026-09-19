import { ConvexError, v } from "convex/values";
import { formatInTimeZone } from "date-fns-tz";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { assertCanForProduction } from "./lib/permissions";
import { actorName, logActivity } from "./lib/activity";
import {
  canonicalApprovedName,
  episodeToken,
  extensionFor,
} from "./lib/domain";

/**
 * Provenance export (spec v2 item c, CONTRACTS §exports.ts). A producer
 * downloads, per production, one row per version — every prompt and every
 * provenance fact (who made what, with which tool/model/seed, when, from
 * which file, who decided) — for legal use. The client paginates
 * `provenanceRows`, writes the CSV (lib/csv.ts, verbatim cells, BOM, CRLF)
 * and calls `logProvenanceExport` once the download starts.
 */

/**
 * Hard cap on the versions one call turns into rows. Convex refuses a
 * function that reads more than 4,096 documents, so the page size is set by
 * the per-row enrichment cost, not by taste. Read budget for one page of
 * MAX_PAGE_ROWS rows (every lookup below is memoised per call, promise-cached
 * so parallel rows share one read):
 *
 *   versions          400      the page itself
 *   assets          ≤ 400      one per version (no storage.getUrl — the
 *                              file_location cell is the storageId itself)
 *   shots           ≤ 400      memoised; ~3 versions per shot in practice
 *   scene + episode ≤ 2/row    memoised; a page touches a few dozen scenes
 *   or element      ≤ 1/row    memoised; slot shots carry no scene/episode
 *   creator/decider ≤ 2/row    memoised; bounded by the team size
 *   details edit    the version's activity rows newer than its last
 *                   `version.updated` row (all of them when never edited):
 *                   typically 1–3 (added + decisions), read via
 *                   activity.by_target newest-first
 *   editor          ≤ 1/row    memoised, same user cache
 *
 * Typical page: 400 + 400 + ~150 + ~50 + ~50 + ~1,000 ≈ 2,100 reads; a page
 * where every version sits on its own shot in its own scene is ≈ 2,500. The
 * only data-dependent term is the activity trail: it is exact rather than
 * capped (a capped scan would silently blank details_last_edited_* on a
 * much-toggled version — this file is evidence), so a pathological trail
 * (hundreds of shortlist toggles on one version) fails the page loudly
 * instead, and the client can retry with a smaller `numItems`.
 */
const MAX_PAGE_ROWS = 400;

/** One export row. Every value is a string (CSV cells, verbatim). */
export type ProvenanceRow = {
  studio_name: string;
  production_code: string;
  production_name: string;
  target_type: string; // "shot" | "character" | "location"
  target_code: string;
  target_title: string;
  slot: string;
  scene_code: string;
  episode: string; // "EP01" | ""
  version: string; // "3"
  version_id: string;
  version_status: string; // candidate | shortlisted | picked | rejected
  created_at: string; // ISO 8601 UTC
  created_at_local: string; // production tz "YYYY-MM-DD HH:mm"
  created_by_name: string;
  created_by_email: string;
  tool: string;
  model: string;
  prompt: string;
  seed: string;
  params: string;
  note: string;
  file_name: string;
  file_mime: string;
  file_size_bytes: string;
  file_md5: string;
  file_provider: string; // storage | gdrive | url | ""
  file_location: string; // Drive webViewLink | "app storage:{storageId}" | url
  file_missing: string; // "true" | "false"
  approved_file_name: string; // canonical name when picked
  decision: string; // picked | rejected | ""
  decided_at: string; // ISO 8601 UTC
  decided_by_name: string;
  decided_by_email: string;
  decision_note: string;
  details_last_edited_at: string; // ISO 8601 UTC
  details_last_edited_by: string;
};

/**
 * Column order of the CSV, exactly as the spec lists it. The client writes
 * the header from this list and reads each row's cells in this order, so the
 * row object's key order never matters.
 */
export const PROVENANCE_COLUMNS: (keyof ProvenanceRow)[] = [
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

// ---------------------------------------------------------------------------
// Per-call document memo — the promise (not the document) is cached so rows
// enriched in parallel share one read of a shot, scene, episode, element or
// user. Same trick as the enrich caches in shots.list and approvals.ledger.
// ---------------------------------------------------------------------------

type DocCache<T extends TableNames> = Map<string, Promise<Doc<T> | null>>;

type ExportCache = {
  shots: DocCache<"shots">;
  scenes: DocCache<"scenes">;
  episodes: DocCache<"episodes">;
  elements: DocCache<"elements">;
  users: DocCache<"users">;
};

function newExportCache(): ExportCache {
  return {
    shots: new Map(),
    scenes: new Map(),
    episodes: new Map(),
    elements: new Map(),
    users: new Map(),
  };
}

function cachedGet<T extends TableNames>(
  ctx: QueryCtx,
  cache: DocCache<T>,
  id: Id<T>,
): Promise<Doc<T> | null> {
  const cached = cache.get(id);
  if (cached !== undefined) return cached;
  const pending = ctx.db.get(id);
  cache.set(id, pending);
  return pending;
}

function iso(ts: number): string {
  return new Date(ts).toISOString();
}

function userName(user: Doc<"users"> | null): string {
  return user?.name ?? user?.email ?? "Unknown";
}

function userEmail(user: Doc<"users"> | null): string {
  return user?.email ?? "";
}

/**
 * date-fns-tz throws a RangeError on a zone it does not know (reports.ts has
 * the same guard). Timezones are validated on write now, but rows written
 * before that can still hold a bad one — say so in plain language instead of
 * a bare "Server Error", and never emit a file with blank local times.
 */
function assertUsableTimezone(production: Doc<"productions">): void {
  try {
    formatInTimeZone(Date.now(), production.timezone, "yyyy-MM-dd HH:mm");
  } catch {
    throw new ConvexError(
      `Production "${production.name}" has an invalid timezone ("${production.timezone}"). Fix it in production settings before exporting.`,
    );
  }
}

async function buildRow(
  ctx: QueryCtx,
  version: Doc<"versions">,
  studio: Doc<"studios">,
  production: Doc<"productions">,
  cache: ExportCache,
): Promise<ProvenanceRow> {
  const shot = await cachedGet(ctx, cache.shots, version.shotId);

  // Target: the shot, or — for a slot shot — the element it belongs to.
  let targetType = "shot";
  let targetCode = shot?.code ?? "";
  let targetTitle = shot?.title ?? "";
  const slot = shot?.slot ?? "";
  if (shot?.elementId !== undefined) {
    const element = await cachedGet(ctx, cache.elements, shot.elementId);
    if (element) {
      targetType = element.kind;
      targetCode = element.code;
      targetTitle = element.name;
    }
  }

  // Scene / episode: ordinary shots only (slot shots carry neither).
  const scene =
    shot?.sceneId !== undefined
      ? await cachedGet(ctx, cache.scenes, shot.sceneId)
      : null;
  const episode =
    shot?.episodeId !== undefined
      ? await cachedGet(ctx, cache.episodes, shot.episodeId)
      : null;

  const asset =
    version.primaryAssetId !== undefined
      ? await ctx.db.get(version.primaryAssetId)
      : null;
  let fileLocation = "";
  if (asset) {
    if (asset.provider === "gdrive") fileLocation = asset.webViewLink ?? "";
    else if (asset.provider === "storage")
      fileLocation =
        asset.storageId !== undefined ? `app storage:${asset.storageId}` : "";
    else fileLocation = asset.url ?? "";
  }
  // Missing: no asset at all, flagged missing by the Drive sync, or an asset
  // row with nothing to point at (storage row without storageId after a
  // tables-only restore, link without url).
  const fileMissing = !asset || asset.missing === true || fileLocation === "";

  const creator = await cachedGet(ctx, cache.users, version.createdBy);
  const decider =
    version.decidedBy !== undefined
      ? await cachedGet(ctx, cache.users, version.decidedBy)
      : null;

  // Newest `version.updated` row for this version — the last details edit.
  // activity.by_target streams the version's own trail newest-first; the
  // filter stops the scan at the first edit row (see the read budget above).
  const lastEdit = await ctx.db
    .query("activity")
    .withIndex("by_target", (q) =>
      q.eq("targetType", "version").eq("targetId", version._id),
    )
    .order("desc")
    .filter((q) => q.eq(q.field("type"), "version.updated"))
    .first();
  const editor =
    lastEdit !== null && lastEdit.productionId === production._id
      ? await cachedGet(ctx, cache.users, lastEdit.actorId)
      : null;

  const approvedFileName =
    version.status === "picked" && shot
      ? canonicalApprovedName({
          productionCode: production.code,
          ...(episode ? { episodeNumber: episode.number } : {}),
          shotCode: shot.code,
          versionIndex: version.index,
          extension: extensionFor(asset?.name ?? "", asset?.mimeType),
        })
      : "";

  const decision =
    version.status === "picked" || version.status === "rejected"
      ? version.status
      : "";

  return {
    studio_name: studio.name,
    production_code: production.code,
    production_name: production.name,
    target_type: targetType,
    target_code: targetCode,
    target_title: targetTitle,
    slot,
    scene_code: scene?.code ?? "",
    episode: episode ? episodeToken(episode.number) : "",
    version: String(version.index),
    version_id: version._id,
    version_status: version.status,
    created_at: iso(version._creationTime),
    created_at_local: formatInTimeZone(
      version._creationTime,
      production.timezone,
      "yyyy-MM-dd HH:mm",
    ),
    created_by_name: userName(creator),
    created_by_email: userEmail(creator),
    tool: version.promptMeta?.tool ?? "",
    model: version.promptMeta?.model ?? "",
    prompt: version.promptMeta?.prompt ?? "",
    seed: version.promptMeta?.seed ?? "",
    params: version.promptMeta?.params ?? "",
    note: version.note ?? "",
    file_name: asset?.name ?? "",
    file_mime: asset?.mimeType ?? "",
    file_size_bytes:
      asset?.sizeBytes !== undefined ? String(asset.sizeBytes) : "",
    file_md5: asset?.md5 ?? "",
    file_provider: asset?.provider ?? "",
    file_location: fileLocation,
    file_missing: fileMissing ? "true" : "false",
    approved_file_name: approvedFileName,
    decision,
    decided_at: version.decidedAt !== undefined ? iso(version.decidedAt) : "",
    decided_by_name: decider ? userName(decider) : "",
    decided_by_email: decider ? userEmail(decider) : "",
    decision_note: version.decisionNote ?? "",
    details_last_edited_at:
      lastEdit !== null && editor !== null ? iso(lastEdit._creationTime) : "",
    details_last_edited_by: editor !== null ? userName(editor) : "",
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * One page of provenance rows, newest version first. Feed `cursor` back in
 * until `done` is true. `numItems` defaults to (and is capped at)
 * MAX_PAGE_ROWS — see the read budget on that constant.
 *
 * `columns` is the CSV header in spec order: Convex sorts object keys on the
 * wire, so a row's own key order cannot carry it, and the client must not
 * import this server module to get PROVENANCE_COLUMNS.
 */
export const provenanceRows = query({
  args: {
    productionId: v.id("productions"),
    cursor: v.optional(v.union(v.string(), v.null())),
    numItems: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    rows: ProvenanceRow[];
    cursor: string | null;
    done: boolean;
    columns: (keyof ProvenanceRow)[];
  }> => {
    const { production } = await assertCanForProduction(
      ctx,
      args.productionId,
      "production.manage",
    );
    const numItems = args.numItems ?? MAX_PAGE_ROWS;
    if (
      !Number.isInteger(numItems) ||
      numItems < 1 ||
      numItems > MAX_PAGE_ROWS
    ) {
      throw new ConvexError(
        `numItems must be a whole number between 1 and ${MAX_PAGE_ROWS}`,
      );
    }
    assertUsableTimezone(production);
    const studio = await ctx.db.get(production.studioId);
    if (!studio) throw new ConvexError("Studio not found");

    // Index order within the productionId prefix is _creationTime, so
    // .order("desc") is newest-first without a post-sort, and the cursor
    // resumes exactly where the previous page stopped.
    const page = await ctx.db
      .query("versions")
      .withIndex("by_production", (q) =>
        q.eq("productionId", args.productionId),
      )
      .order("desc")
      .paginate({ cursor: args.cursor ?? null, numItems });

    // `.paginate` does not look ahead: a table of exactly 6 rows read 2 at a
    // time comes back as three full pages and a fourth empty one. The client
    // paginates in a loop with a progress toast, so settle `done` here with
    // one small lookahead: the rows at or older than this page's last
    // creation time, one more than the page holds at that instant. If every
    // row that comes back is already on the page, nothing follows. Exact even
    // if two versions ever share a _creationTime, and ≤ 2 reads per page.
    let done = page.isDone;
    const last = page.page[page.page.length - 1];
    if (!done && last !== undefined) {
      const tied = new Set(
        page.page
          .filter((row) => row._creationTime === last._creationTime)
          .map((row) => row._id),
      );
      const beyond = await ctx.db
        .query("versions")
        .withIndex("by_production", (q) =>
          q
            .eq("productionId", args.productionId)
            .lte("_creationTime", last._creationTime),
        )
        .order("desc")
        .take(tied.size + 1);
      done = beyond.every((row) => tied.has(row._id));
    } else if (!done) {
      done = true; // an empty page has nothing to continue from
    }

    const cache = newExportCache();
    const rows = await Promise.all(
      page.page.map((version) =>
        buildRow(ctx, version, studio, production, cache),
      ),
    );
    return {
      rows,
      cursor: done ? null : page.continueCursor,
      done,
      columns: PROVENANCE_COLUMNS,
    };
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Row counts beyond this are not an export, they are a bug in the caller. */
const MAX_LOGGED_ROW_COUNT = 10_000_000;

/**
 * Records that a provenance export was generated — called by the client once
 * the download starts (the rows themselves come from a query, which cannot
 * write). Activity `export.generated`, targetType "production"; no
 * notification.
 */
export const logProvenanceExport = mutation({
  args: { productionId: v.id("productions"), rowCount: v.number() },
  handler: async (ctx, args) => {
    const { userId, production } = await assertCanForProduction(
      ctx,
      args.productionId,
      "production.manage",
    );
    if (
      !Number.isInteger(args.rowCount) ||
      args.rowCount < 0 ||
      args.rowCount > MAX_LOGGED_ROW_COUNT
    ) {
      throw new ConvexError("rowCount must be a whole number of rows");
    }
    const name = await actorName(ctx, userId);
    const noun = args.rowCount === 1 ? "row" : "rows";
    await logActivity(ctx, {
      productionId: production._id,
      actorId: userId,
      type: "export.generated",
      targetType: "production",
      targetId: production._id,
      summary: `${name} exported provenance (${args.rowCount} ${noun})`,
      data: { rowCount: args.rowCount },
    });
    return null;
  },
});
