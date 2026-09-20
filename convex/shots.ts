import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { shotStatus, stageKey } from "./schema";
import {
  assertCanForProduction,
  assertMemberForProduction,
  canEditShot,
  getMembership,
  PermissionError,
} from "./lib/permissions";
import { actorName, logActivity } from "./lib/activity";
import { notify } from "./lib/notify";
import {
  ELEMENT_SLOT_STAGE,
  isReservedCode,
  SHOT_STATUS_BY_KEY,
  STAGE_BY_KEY,
} from "./lib/domain";
import { createSceneRow, findSceneByCode, normalizeSceneCode } from "./scenes";

/** Enriched user shape shared across returns (CONTRACTS "UserRef"). */
type UserRef = { _id: Id<"users">; name: string; image?: string };

function toUserRef(user: Doc<"users"> | null): UserRef | null {
  if (!user) return null;
  return {
    _id: user._id,
    name: user.name ?? user.email ?? "Unknown",
    image: user.image,
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Codes land in filenames and Drive folders; titles are one line of text. */
const MAX_CODE_LENGTH = 64;
const MAX_TITLE_LENGTH = 200;

/**
 * Hard bound on one list() call. Convex refuses a function that reads more
 * than 4,096 documents, and this query backs the Shots page, the Board AND
 * the Overview — the old unbounded collect() bricked all three past ~4,400
 * shots. An enriched row now costs the shot plus (at most) its cover asset;
 * assignees/scenes/episodes are memoised per call, so 1,000 rows stays well
 * inside the ceiling with room for the enrichment lookups.
 */
const MAX_LIST_SHOTS = 1000;

/**
 * Per-call document memo. list() enriches up to MAX_LIST_SHOTS rows that
 * share a handful of assignees, scenes and episodes; every ctx.db.get counts
 * against the read ceiling, so each document is fetched exactly once. The
 * promise (not the document) is cached so parallel enrichment can't race two
 * reads of the same id.
 */
type EnrichCache = {
  users: Map<string, Promise<Doc<"users"> | null>>;
  scenes: Map<string, Promise<Doc<"scenes"> | null>>;
  episodes: Map<string, Promise<Doc<"episodes"> | null>>;
};

function newEnrichCache(): EnrichCache {
  return { users: new Map(), scenes: new Map(), episodes: new Map() };
}

function cachedGet<T extends "users" | "scenes" | "episodes">(
  ctx: QueryCtx,
  cache: Map<string, Promise<Doc<T> | null>>,
  id: Id<T>,
): Promise<Doc<T> | null> {
  const cached = cache.get(id);
  if (cached !== undefined) return cached;
  const pending = ctx.db.get(id);
  cache.set(id, pending);
  return pending;
}

/**
 * Highest `order` in the production (0 when empty) — one indexed read.
 * Exported for elements.ts (slot shots count up from the same value).
 */
export async function lastOrder(
  ctx: QueryCtx | MutationCtx,
  productionId: Id<"productions">,
): Promise<number> {
  const last = await ctx.db
    .query("shots")
    .withIndex("by_production_order", (q) => q.eq("productionId", productionId))
    .order("desc")
    .first();
  return last?.order ?? 0;
}

/**
 * ShotCard enrichment (CONTRACTS §shots): assignee/scene/episode lookups,
 * versionsCount read from the denormalised counter on the shot, coverThumbUrl
 * resolved from coverAsset.thumbStorageId — null-safe at every hop.
 * versionsCount defaults to 0: shots written before the counter existed carry
 * no value, and no UI call site may see undefined.
 */
async function enrichShot(
  ctx: QueryCtx,
  shot: Doc<"shots">,
  cache: EnrichCache = newEnrichCache(),
) {
  const assignee =
    shot.assigneeId !== undefined
      ? toUserRef(await cachedGet(ctx, cache.users, shot.assigneeId))
      : null;
  const sceneDoc =
    shot.sceneId !== undefined
      ? await cachedGet(ctx, cache.scenes, shot.sceneId)
      : null;
  const scene = sceneDoc
    ? { _id: sceneDoc._id, code: sceneDoc.code, title: sceneDoc.title }
    : null;
  const episodeDoc =
    shot.episodeId !== undefined
      ? await cachedGet(ctx, cache.episodes, shot.episodeId)
      : null;
  const episode = episodeDoc
    ? { _id: episodeDoc._id, number: episodeDoc.number }
    : null;
  let coverThumbUrl: string | null = null;
  if (shot.coverAssetId !== undefined) {
    const coverAsset = await ctx.db.get(shot.coverAssetId);
    if (coverAsset && coverAsset.thumbStorageId !== undefined) {
      coverThumbUrl = await ctx.storage.getUrl(coverAsset.thumbStorageId);
    }
  }
  return {
    ...shot,
    assignee,
    scene,
    episode,
    versionsCount: shot.versionsCount ?? 0,
    coverThumbUrl,
  };
}

/**
 * All filters optional & combinable. `status` narrows through the
 * by_production_status index; the rest are matched while the index streams,
 * so a filtered list never materialises the whole production and the scan
 * stops at MAX_LIST_SHOTS rows (see above — reading every shot was the
 * ceiling, not the filtering).
 * The id filters accept plain strings (they often arrive from URL params) and
 * are resolved via normalizeId — a malformed value matches nothing instead of
 * crashing the query.
 */
export const list = query({
  args: {
    productionId: v.id("productions"),
    status: v.optional(shotStatus),
    stage: v.optional(stageKey),
    sceneId: v.optional(v.string()),
    assigneeId: v.optional(v.string()),
    episodeId: v.optional(v.string()),
    // v2 item b: element slot shots (elementId set) are dropped by default so
    // the Shots page, Board, Overview and every older caller never see
    // characters; "only" is the Review queue's Characters group.
    elements: v.optional(
      v.union(v.literal("exclude"), v.literal("only"), v.literal("all")),
    ),
  },
  handler: async (ctx, args) => {
    await assertMemberForProduction(ctx, args.productionId);
    const elements = args.elements ?? "exclude";
    let sceneId: Id<"scenes"> | undefined;
    if (args.sceneId !== undefined) {
      const normalized = ctx.db.normalizeId("scenes", args.sceneId);
      if (normalized === null) return [];
      sceneId = normalized;
    }
    let assigneeId: Id<"users"> | undefined;
    if (args.assigneeId !== undefined) {
      const normalized = ctx.db.normalizeId("users", args.assigneeId);
      if (normalized === null) return [];
      assigneeId = normalized;
    }
    let episodeId: Id<"episodes"> | undefined;
    if (args.episodeId !== undefined) {
      const normalized = ctx.db.normalizeId("episodes", args.episodeId);
      if (normalized === null) return [];
      episodeId = normalized;
    }
    const status = args.status;
    const stage = args.stage;
    const stream =
      status !== undefined
        ? ctx.db
            .query("shots")
            .withIndex("by_production_status", (q) =>
              q.eq("productionId", args.productionId).eq("status", status),
            )
        : ctx.db
            .query("shots")
            .withIndex("by_production", (q) =>
              q.eq("productionId", args.productionId),
            );

    const shots: Doc<"shots">[] = [];
    for await (const shot of stream) {
      if (elements === "exclude" && shot.elementId !== undefined) continue;
      if (elements === "only" && shot.elementId === undefined) continue;
      if (stage !== undefined && shot.stage !== stage) continue;
      if (sceneId !== undefined && shot.sceneId !== sceneId) continue;
      if (assigneeId !== undefined && shot.assigneeId !== assigneeId) continue;
      if (episodeId !== undefined && shot.episodeId !== episodeId) continue;
      shots.push(shot);
      if (shots.length >= MAX_LIST_SHOTS) break;
    }
    shots.sort((a, b) => a.order - b.order);

    const cache = newEnrichCache();
    return await Promise.all(
      shots.map((shot) => enrichShot(ctx, shot, cache)),
    );
  },
});

export const get = query({
  args: { shotId: v.id("shots") },
  handler: async (ctx, args) => {
    const shot = await ctx.db.get(args.shotId);
    if (!shot) throw new ConvexError("Shot not found");
    const { production } = await assertMemberForProduction(
      ctx,
      shot.productionId,
    );
    const card = await enrichShot(ctx, shot);
    let pickedVersionIndex: number | null = null;
    if (shot.pickedVersionId !== undefined) {
      const picked = await ctx.db.get(shot.pickedVersionId);
      pickedVersionIndex = picked?.index ?? null;
    }
    return {
      ...card,
      production: {
        _id: production._id,
        name: production.name,
        code: production.code,
        timezone: production.timezone,
      },
      pickedVersionIndex,
    };
  },
});

/**
 * Validate and insert ONE shot row — the single write path behind
 * shots.create, shots.importRows (v2 item d) and the element slot shots that
 * elements.ts creates (v2 item b). Applies the code/title caps, the
 * reserved-prefix rule, the scene / episode / assignee / due-date checks, the
 * per-production uniqueness lookup and the `order` assignment. Writes NO
 * activity row: every mutation logs its own (CONTRACTS rule 1), and batch
 * callers log one row for the whole batch.
 *
 * - `elementId` + `slot` (always together) mark a slot shot. Its code is one
 *   of the reserved CH_/LOC_/SCR_ codes (see `slotShotCode`), it never has a
 *   scene or episode, and `stage` defaults to ELEMENT_SLOT_STAGE.
 * - An ordinary shot (no `elementId`) is refused a reserved code — those
 *   belong to Characters.
 * - `order` may be supplied by batch callers that read `lastOrder` once and
 *   count up; otherwise it is lastOrder + 1 (one indexed read).
 * - `studioId` is the production's studio (from assertCanForProduction);
 *   passed in so the assignee membership check costs no extra read.
 *
 * Returns the new id with the normalised (trimmed, uppercased) code.
 */
export async function createShotRow(
  ctx: MutationCtx,
  args: {
    productionId: Id<"productions">;
    studioId: Id<"studios">;
    code: string;
    title?: string;
    sceneId?: Id<"scenes">;
    episodeId?: Id<"episodes">;
    stage?: Doc<"shots">["stage"];
    assigneeId?: Id<"users">;
    dueDate?: string;
    elementId?: Id<"elements">;
    slot?: string;
    order?: number;
  },
): Promise<{ shotId: Id<"shots">; code: string }> {
  const code = args.code.trim().toUpperCase();
  if (code.length === 0) throw new ConvexError("Shot code is required");
  if (code.length > MAX_CODE_LENGTH)
    throw new ConvexError(
      `Shot code is too long — keep it to ${MAX_CODE_LENGTH} characters`,
    );
  if (args.title !== undefined && args.title.length > MAX_TITLE_LENGTH)
    throw new ConvexError(
      `Shot title is too long — keep it to ${MAX_TITLE_LENGTH} characters`,
    );
  if (args.elementId === undefined && isReservedCode(code))
    throw new ConvexError(reservedCodeMessage(code));
  if (args.elementId !== undefined) {
    if (args.slot === undefined)
      throw new ConvexError("An element shot needs a slot");
    if (args.sceneId !== undefined || args.episodeId !== undefined)
      throw new ConvexError(
        "Character slots don't belong to a scene or episode",
      );
    const element = await ctx.db.get(args.elementId);
    if (!element || element.productionId !== args.productionId)
      throw new ConvexError("Element not found in this production");
  } else if (args.slot !== undefined) {
    throw new ConvexError("Only element shots have a slot");
  }
  if (args.sceneId !== undefined) {
    const scene = await ctx.db.get(args.sceneId);
    if (!scene || scene.productionId !== args.productionId)
      throw new ConvexError("Scene not found in this production");
  }
  if (args.episodeId !== undefined) {
    const episode = await ctx.db.get(args.episodeId);
    if (!episode || episode.productionId !== args.productionId)
      throw new ConvexError("Episode not found in this production");
  }
  if (args.assigneeId !== undefined) {
    const membership = await getMembership(
      ctx,
      args.studioId,
      args.assigneeId,
    );
    if (!membership)
      throw new ConvexError("Assignee is not a member of this studio");
  }
  if (args.dueDate !== undefined && !DATE_RE.test(args.dueDate))
    throw new ConvexError("Due date must be YYYY-MM-DD");
  // Indexed lookups, not a collect of the production: at a few thousand
  // shots the scan alone exceeded Convex's read ceiling.
  const duplicate = await ctx.db
    .query("shots")
    .withIndex("by_production_code", (q) =>
      q.eq("productionId", args.productionId).eq("code", code),
    )
    .first();
  if (duplicate !== null)
    throw new ConvexError(`Shot code ${code} already exists in this production`);
  const order = args.order ?? (await lastOrder(ctx, args.productionId)) + 1;
  const shotId = await ctx.db.insert("shots", {
    productionId: args.productionId,
    code,
    title: args.title,
    sceneId: args.sceneId,
    episodeId: args.episodeId,
    status: "planned",
    stage:
      args.stage ??
      (args.elementId !== undefined ? ELEMENT_SLOT_STAGE : "production"),
    assigneeId: args.assigneeId,
    dueDate: args.dueDate,
    order,
    versionsCount: 0, // denormalised; versions.ts keeps it current
    elementId: args.elementId,
    slot: args.slot,
  });
  return { shotId, code };
}

export const create = mutation({
  args: {
    productionId: v.id("productions"),
    code: v.string(),
    title: v.optional(v.string()),
    sceneId: v.optional(v.id("scenes")),
    episodeId: v.optional(v.id("episodes")),
    stage: v.optional(stageKey),
    assigneeId: v.optional(v.id("users")),
    dueDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, production } = await assertCanForProduction(
      ctx,
      args.productionId,
      "content.edit",
    );
    const { shotId, code } = await createShotRow(ctx, {
      ...args,
      studioId: production.studioId,
    });
    await logActivity(ctx, {
      productionId: args.productionId,
      actorId: userId,
      type: "shot.created",
      targetType: "shot",
      targetId: shotId,
      summary: `${await actorName(ctx, userId)} created shot ${code}`,
    });
    return shotId;
  },
});

/**
 * A mis-paste used to be permanent: 5,000 codes went in as fast as 5, and
 * nothing could be deleted afterwards. 500 is far more than any real paste
 * and small enough that bulkRemove can undo the same batch in one call.
 */
const MAX_BULK_SHOTS = 500;
/** Scenes one import may create ("New scene" + unknown scene codes). */
const MAX_IMPORT_SCENES = 100;
/** Import rows: A–Z, 0–9, _ and - after trim + uppercase. */
const IMPORT_CODE_RE = /^[A-Z0-9_-]+$/;

const importRowValidator = v.object({
  code: v.string(),
  title: v.optional(v.string()),
  sceneCode: v.optional(v.string()),
  episodeNumber: v.optional(v.number()),
  assigneeId: v.optional(v.id("users")),
  dueDate: v.optional(v.string()),
});

const importDefaultsValidator = v.object({
  sceneId: v.optional(v.id("scenes")),
  episodeId: v.optional(v.id("episodes")),
  stage: v.optional(stageKey),
  assigneeId: v.optional(v.id("users")),
  dueDate: v.optional(v.string()),
});

const importSceneValidator = v.object({
  code: v.string(),
  title: v.optional(v.string()),
  episodeId: v.optional(v.id("episodes")),
});

type ImportRow = {
  code: string;
  title?: string;
  sceneCode?: string;
  episodeNumber?: number;
  assigneeId?: Id<"users">;
  dueDate?: string;
};

type ImportArgs = {
  productionId: Id<"productions">;
  rows: ImportRow[];
  defaults?: {
    sceneId?: Id<"scenes">;
    episodeId?: Id<"episodes">;
    stage?: Doc<"shots">["stage"];
    assigneeId?: Id<"users">;
    dueDate?: string;
  };
  scenesToCreate?: { code: string; title?: string; episodeId?: Id<"episodes"> }[];
  createMissingScenes: boolean;
};

type ImportResult = {
  created: number;
  skipped: string[];
  invalid: { code: string; reason: string }[];
  scenesCreated: string[];
  sceneId?: Id<"scenes">;
};

/** The reserved-prefix refusal, worded per prefix (CONTRACTS §shots.ts). */
function reservedCodeMessage(code: string): string {
  const prefix = code.slice(0, code.indexOf("_") + 1);
  return prefix === "CH_"
    ? "CH_ codes are reserved for characters — create it under Characters"
    : `${prefix} codes are reserved for pre-production elements`;
}

/**
 * THE batch create path (v2 item d) behind shots.importRows and the deprecated
 * bulkCreate alias. Structural problems throw (row / scene caps, defaults that
 * don't belong to the production); per-row problems come back in `invalid`
 * and never fail the batch; codes already taken come back in `skipped`.
 *
 * Reads are bounded: episodes are read once (≤ 200 per production),
 * assignees / scenes are memoised per distinct value, and each created row
 * costs createShotRow's validation reads (≤ 4) plus one insert — 500 rows
 * stay under the 4,096-document ceiling. `lastOrder` is read once and
 * counted up. ONE activity row for the whole batch and one aggregated
 * `shot_assigned` notification per assignee (never for the actor).
 */
async function importRowsImpl(
  ctx: MutationCtx,
  args: ImportArgs,
): Promise<ImportResult> {
  const { userId, production } = await assertCanForProduction(
    ctx,
    args.productionId,
    "content.edit",
  );
  if (args.rows.length > MAX_BULK_SHOTS)
    throw new ConvexError(
      `That's ${args.rows.length} rows — paste at most ${MAX_BULK_SHOTS} at a time`,
    );
  const scenesToCreate = args.scenesToCreate ?? [];
  if (scenesToCreate.length > MAX_IMPORT_SCENES)
    throw new ConvexError(
      `That's ${scenesToCreate.length} scenes — create at most ${MAX_IMPORT_SCENES} in one import`,
    );

  // Defaults come from the dialog's own selects: a bad one is a bug, not a
  // row problem, so it fails the call.
  const defaults = args.defaults ?? {};
  if (defaults.sceneId !== undefined) {
    const scene = await ctx.db.get(defaults.sceneId);
    if (!scene || scene.productionId !== args.productionId)
      throw new ConvexError("Scene not found in this production");
  }
  if (defaults.episodeId !== undefined) {
    const episode = await ctx.db.get(defaults.episodeId);
    if (!episode || episode.productionId !== args.productionId)
      throw new ConvexError("Episode not found in this production");
  }
  if (defaults.assigneeId !== undefined) {
    const membership = await getMembership(
      ctx,
      production.studioId,
      defaults.assigneeId,
    );
    if (!membership)
      throw new ConvexError("Assignee is not a member of this studio");
  }
  if (defaults.dueDate !== undefined && !DATE_RE.test(defaults.dueDate))
    throw new ConvexError("Due date must be YYYY-MM-DD");

  // Episodes by number — one bounded read (productions cap episodeCount).
  const episodesByNumber = new Map<number, Doc<"episodes">>();
  for await (const episode of ctx.db
    .query("episodes")
    .withIndex("by_production", (q) =>
      q.eq("productionId", args.productionId),
    )) {
    episodesByNumber.set(episode.number, episode);
  }

  // Scenes by code, memoised; `null` = known not to exist.
  const sceneByCode = new Map<string, Doc<"scenes"> | null>();
  const resolveScene = async (
    code: string,
  ): Promise<Doc<"scenes"> | null> => {
    const cached = sceneByCode.get(code);
    if (cached !== undefined) return cached;
    const scene = await findSceneByCode(ctx, args.productionId, code);
    sceneByCode.set(code, scene);
    return scene;
  };
  const scenesCreated: string[] = [];
  let sceneOrder: number | null = null; // read lazily, only when creating
  const createScene = async (input: {
    code: string;
    title?: string;
    episodeId?: Id<"episodes">;
  }): Promise<Doc<"scenes">> => {
    if (scenesCreated.length >= MAX_IMPORT_SCENES)
      throw new ConvexError(
        `This import would create more than ${MAX_IMPORT_SCENES} scenes — split it up`,
      );
    if (sceneOrder === null) {
      // Same bounded scan scenes.create uses, done once per import.
      let max = 0;
      let scanned = 0;
      for await (const scene of ctx.db
        .query("scenes")
        .withIndex("by_production", (q) =>
          q.eq("productionId", args.productionId),
        )) {
        if (scene.order > max) max = scene.order;
        scanned += 1;
        if (scanned >= 500) break;
      }
      sceneOrder = max;
    }
    sceneOrder += 1;
    const { sceneId, code } = await createSceneRow(ctx, {
      productionId: args.productionId,
      code: input.code,
      title: input.title,
      episodeId: input.episodeId,
      order: sceneOrder,
    });
    const scene = await ctx.db.get(sceneId);
    if (!scene) throw new ConvexError("Scene could not be created");
    sceneByCode.set(code, scene);
    scenesCreated.push(code);
    return scene;
  };

  // Explicit scenes first ("New scene" in the Generate tab). An existing code
  // is used as is — the dialog may race another editor creating it.
  for (const input of scenesToCreate) {
    const code = normalizeSceneCode(input.code);
    if (code.length === 0) throw new ConvexError("Scene code is required");
    if (input.episodeId !== undefined) {
      const episode = await ctx.db.get(input.episodeId);
      if (!episode || episode.productionId !== args.productionId)
        throw new ConvexError("Episode not found in this production");
    }
    if ((await resolveScene(code)) === null) await createScene(input);
  }

  // Assignee membership, memoised per distinct id.
  const assigneeKnown = new Map<string, boolean>();
  const assigneeIsMember = async (id: Id<"users">): Promise<boolean> => {
    const cached = assigneeKnown.get(id);
    if (cached !== undefined) return cached;
    const membership = await getMembership(ctx, production.studioId, id);
    assigneeKnown.set(id, membership !== null);
    return membership !== null;
  };
  if (defaults.assigneeId !== undefined)
    assigneeKnown.set(defaults.assigneeId, true);

  const taken = new Set<string>();
  const skipped: string[] = [];
  const invalid: { code: string; reason: string }[] = [];
  const scenesInvolved = new Set<Id<"scenes">>();
  const assignedShots = new Map<
    string,
    { assigneeId: Id<"users">; shotIds: Id<"shots">[]; codes: string[] }
  >();
  let order = await lastOrder(ctx, args.productionId);
  let created = 0;

  for (const row of args.rows) {
    const code = row.code.trim().toUpperCase();
    const fail = (reason: string) => {
      invalid.push({ code: code || row.code, reason });
    };
    if (code.length === 0) {
      fail("Shot code is required");
      continue;
    }
    if (code.length > MAX_CODE_LENGTH) {
      fail(`Shot code is too long — keep it to ${MAX_CODE_LENGTH} characters`);
      continue;
    }
    if (isReservedCode(code)) {
      fail(reservedCodeMessage(code));
      continue;
    }
    if (!IMPORT_CODE_RE.test(code)) {
      fail("Shot codes use A–Z, 0–9, _ and - only");
      continue;
    }
    const title =
      row.title !== undefined && row.title.trim().length > 0
        ? row.title.trim()
        : undefined;
    if (title !== undefined && title.length > MAX_TITLE_LENGTH) {
      fail(`Shot title is too long — keep it to ${MAX_TITLE_LENGTH} characters`);
      continue;
    }
    // Episode: the row's number, else the scene's, else the default.
    let episodeId = defaults.episodeId;
    let rowEpisodeId: Id<"episodes"> | undefined;
    if (row.episodeNumber !== undefined) {
      const episode = episodesByNumber.get(row.episodeNumber);
      if (!episode) {
        fail(`Unknown episode ${row.episodeNumber}`);
        continue;
      }
      rowEpisodeId = episode._id;
      episodeId = episode._id;
    }
    // Scene: the row's code (existing, or created when allowed), else the
    // default.
    let sceneId = defaults.sceneId;
    const sceneCode =
      row.sceneCode !== undefined ? normalizeSceneCode(row.sceneCode) : "";
    if (sceneCode.length > 0) {
      let scene = await resolveScene(sceneCode);
      if (scene === null) {
        if (!args.createMissingScenes) {
          fail(`Unknown scene ${sceneCode}`);
          continue;
        }
        scene = await createScene({
          code: sceneCode,
          episodeId: rowEpisodeId ?? defaults.episodeId,
        });
      }
      sceneId = scene._id;
      if (rowEpisodeId === undefined && scene.episodeId !== undefined)
        episodeId = scene.episodeId;
    }
    const assigneeId = row.assigneeId ?? defaults.assigneeId;
    if (assigneeId !== undefined && !(await assigneeIsMember(assigneeId))) {
      fail("Assignee is not a member of this studio");
      continue;
    }
    const dueDate = row.dueDate ?? defaults.dueDate;
    if (dueDate !== undefined && !DATE_RE.test(dueDate)) {
      fail("Due date must be YYYY-MM-DD");
      continue;
    }
    if (sceneId !== undefined) scenesInvolved.add(sceneId);
    if (taken.has(code)) {
      skipped.push(code);
      continue;
    }
    const duplicate = await ctx.db
      .query("shots")
      .withIndex("by_production_code", (q) =>
        q.eq("productionId", args.productionId).eq("code", code),
      )
      .first();
    if (duplicate !== null) {
      skipped.push(code);
      taken.add(code);
      continue;
    }
    taken.add(code);
    order += 1;
    const { shotId } = await createShotRow(ctx, {
      productionId: args.productionId,
      studioId: production.studioId,
      code,
      title,
      sceneId,
      episodeId,
      stage: defaults.stage,
      assigneeId,
      dueDate,
      order,
    });
    created += 1;
    if (assigneeId !== undefined && assigneeId !== userId) {
      const entry = assignedShots.get(assigneeId) ?? {
        assigneeId,
        shotIds: [],
        codes: [],
      };
      entry.shotIds.push(shotId);
      entry.codes.push(code);
      assignedShots.set(assigneeId, entry);
    }
  }

  if (created > 0 || scenesCreated.length > 0) {
    const actor = await actorName(ctx, userId);
    const shotsPart = `${created} shot${created === 1 ? "" : "s"}`;
    const summary =
      scenesCreated.length === 0
        ? `${actor} created ${shotsPart}`
        : scenesCreated.length === 1
          ? `${actor} created scene ${scenesCreated[0]} and ${shotsPart}`
          : `${actor} created ${scenesCreated.length} scenes and ${shotsPart}`;
    await logActivity(ctx, {
      productionId: args.productionId,
      actorId: userId,
      type: "shot.created",
      targetType: "production",
      targetId: args.productionId,
      summary,
      data: { created, skipped, invalid, scenesCreated },
    });
    for (const entry of assignedShots.values()) {
      const n = entry.shotIds.length;
      await notify(ctx, {
        userId: entry.assigneeId,
        actorId: userId,
        productionId: args.productionId,
        type: "shot_assigned",
        title:
          n === 1
            ? `${actor} assigned you ${entry.codes[0]}`
            : `${actor} assigned you ${n} shots`,
        body:
          n === 1
            ? undefined
            : entry.codes.slice(0, 5).join(", ") + (n > 5 ? ", …" : ""),
        href:
          n === 1
            ? `/p/${args.productionId}/shots/${entry.shotIds[0]}`
            : `/p/${args.productionId}/shots?assignee=${entry.assigneeId}`,
      });
    }
  }

  const sceneIds = [...scenesInvolved];
  return {
    created,
    skipped,
    invalid,
    scenesCreated,
    sceneId: sceneIds.length === 1 ? sceneIds[0] : undefined,
  };
}

/**
 * Batch create from the "New shots" dialog (Generate and Import tabs) —
 * CONTRACTS §shots.ts `importRows`. See importRowsImpl for the rules.
 */
export const importRows = mutation({
  args: {
    productionId: v.id("productions"),
    rows: v.array(importRowValidator),
    defaults: v.optional(importDefaultsValidator),
    scenesToCreate: v.optional(v.array(importSceneValidator)),
    createMissingScenes: v.boolean(),
  },
  handler: async (ctx, args): Promise<ImportResult> => {
    return await importRowsImpl(ctx, args);
  },
});

/**
 * DEPRECATED (v2): kept one release as an alias of importRows for callers
 * still passing `{ productionId, codes, sceneId?, episodeId? }`. Keeps the
 * old contract of refusing the whole paste on a bad code (the mutation rolls
 * back, so nothing is written) and returns `{ created, skipped }`.
 */
export const bulkCreate = mutation({
  args: {
    productionId: v.id("productions"),
    codes: v.array(v.string()),
    sceneId: v.optional(v.id("scenes")),
    episodeId: v.optional(v.id("episodes")),
  },
  handler: async (ctx, args) => {
    if (args.codes.length > MAX_BULK_SHOTS)
      throw new ConvexError(
        `That's ${args.codes.length} shots — paste at most ${MAX_BULK_SHOTS} at a time`,
      );
    const result = await importRowsImpl(ctx, {
      productionId: args.productionId,
      rows: args.codes
        .filter((code) => code.trim().length > 0)
        .map((code) => ({ code })),
      defaults: { sceneId: args.sceneId, episodeId: args.episodeId },
      createMissingScenes: false,
    });
    if (result.invalid.length > 0)
      throw new ConvexError(result.invalid[0].reason);
    return { created: result.created, skipped: result.skipped };
  },
});

export const update = mutation({
  args: {
    shotId: v.id("shots"),
    title: v.optional(v.string()),
    // null clears the scene / episode (v2 shot-header selects); an id sets it.
    sceneId: v.optional(v.union(v.id("scenes"), v.null())),
    assigneeId: v.optional(v.id("users")),
    // null clears the due date; a string sets it (YYYY-MM-DD).
    dueDate: v.optional(v.union(v.string(), v.null())),
    order: v.optional(v.number()),
    episodeId: v.optional(v.union(v.id("episodes"), v.null())),
  },
  handler: async (ctx, args) => {
    const shot = await ctx.db.get(args.shotId);
    if (!shot) throw new ConvexError("Shot not found");
    const { userId, member, production } = await assertMemberForProduction(
      ctx,
      shot.productionId,
    );
    if (!canEditShot(member, shot, userId))
      throw new PermissionError("You can't edit this shot");
    // Slot shots (v2 item b) never belong to a scene or episode.
    if (
      shot.elementId !== undefined &&
      (args.sceneId !== undefined || args.episodeId !== undefined)
    )
      throw new ConvexError(
        "Character slots don't belong to a scene or episode",
      );

    const patch: {
      title?: string;
      sceneId?: Id<"scenes"> | undefined;
      assigneeId?: Id<"users">;
      dueDate?: string | undefined;
      order?: number;
      episodeId?: Id<"episodes"> | undefined;
    } = {};
    const changes: string[] = [];

    if (args.title !== undefined && args.title !== shot.title) {
      if (args.title.length > MAX_TITLE_LENGTH)
        throw new ConvexError(
          `Shot title is too long — keep it to ${MAX_TITLE_LENGTH} characters`,
        );
      patch.title = args.title;
      changes.push(`title → "${args.title}"`);
    }
    // Resolved before the episode block: choosing a scene sets the episode
    // from the scene unless the call names one itself.
    let episodeFromScene: Id<"episodes"> | undefined;
    if (args.sceneId === null) {
      if (shot.sceneId !== undefined) {
        patch.sceneId = undefined; // explicit undefined removes the field
        changes.push("scene cleared");
      }
    } else if (args.sceneId !== undefined && args.sceneId !== shot.sceneId) {
      const scene = await ctx.db.get(args.sceneId);
      if (!scene || scene.productionId !== shot.productionId)
        throw new ConvexError("Scene not found in this production");
      patch.sceneId = args.sceneId;
      changes.push(`scene → ${scene.code}`);
      episodeFromScene = scene.episodeId;
    }
    let newAssigneeId: Id<"users"> | undefined;
    if (args.assigneeId !== undefined && args.assigneeId !== shot.assigneeId) {
      const membership = await getMembership(
        ctx,
        production.studioId,
        args.assigneeId,
      );
      if (!membership)
        throw new ConvexError("Assignee is not a member of this studio");
      const assigneeUser = await ctx.db.get(args.assigneeId);
      patch.assigneeId = args.assigneeId;
      newAssigneeId = args.assigneeId;
      changes.push(
        `assignee → ${assigneeUser?.name ?? assigneeUser?.email ?? "Unknown"}`,
      );
    }
    if (args.dueDate === null) {
      // Patching with an explicit undefined removes the field.
      if (shot.dueDate !== undefined) {
        patch.dueDate = undefined;
        changes.push("due date cleared");
      }
    } else if (args.dueDate !== undefined && args.dueDate !== shot.dueDate) {
      if (!DATE_RE.test(args.dueDate))
        throw new ConvexError("Due date must be YYYY-MM-DD");
      patch.dueDate = args.dueDate;
      changes.push(`due → ${args.dueDate}`);
    }
    if (args.order !== undefined && args.order !== shot.order) {
      patch.order = args.order;
      changes.push("order");
    }
    if (args.episodeId === null) {
      if (shot.episodeId !== undefined) {
        patch.episodeId = undefined;
        changes.push("episode cleared");
      }
    } else {
      const nextEpisodeId = args.episodeId ?? episodeFromScene;
      if (nextEpisodeId !== undefined && nextEpisodeId !== shot.episodeId) {
        const episode = await ctx.db.get(nextEpisodeId);
        if (!episode || episode.productionId !== shot.productionId)
          throw new ConvexError("Episode not found in this production");
        patch.episodeId = nextEpisodeId;
        changes.push(
          `episode → EP${String(episode.number).padStart(2, "0")}`,
        );
      }
    }

    if (changes.length === 0) return;
    await ctx.db.patch(shot._id, patch);

    const actor = await actorName(ctx, userId);
    await logActivity(ctx, {
      productionId: shot.productionId,
      actorId: userId,
      type: "shot.updated",
      targetType: "shot",
      targetId: shot._id,
      summary: `${actor} updated ${shot.code} (${changes.join(", ")})`,
    });

    if (newAssigneeId !== undefined) {
      await notify(ctx, {
        userId: newAssigneeId,
        actorId: userId,
        productionId: shot.productionId,
        type: "shot_assigned",
        title: `${actor} assigned you ${shot.code}`,
        body: shot.title,
        href: `/p/${shot.productionId}/shots/${shot._id}`,
      });
    }
  },
});

/**
 * Rename a shot's code (v2 item e). content.edit only — never the assigned
 * artist. Refused on element slot shots (the character owns those codes), on
 * delivered shots (the delivered filename is the record), and on reserved
 * prefixes; unique per production; a no-op when unchanged. The old code goes
 * onto `formerCodes` (oldest first). Comments and activity summaries keep the
 * old text; the ledger, search and the Review Room read the live code; future
 * picks use the new canonical name. Drive folders and already-filed Approved
 * files are NOT renamed (Drive dormant; rename job parked). No notification.
 * Returns the normalised new code.
 */
export const rename = mutation({
  args: { shotId: v.id("shots"), code: v.string() },
  handler: async (ctx, args) => {
    const shot = await ctx.db.get(args.shotId);
    if (!shot) throw new ConvexError("Shot not found");
    const { userId } = await assertCanForProduction(
      ctx,
      shot.productionId,
      "content.edit",
    );
    if (shot.elementId !== undefined)
      throw new ConvexError(
        "This is a character slot — rename the character instead",
      );
    if (shot.status === "delivered")
      throw new ConvexError("Delivered shots can't be renamed");
    const code = args.code.trim().toUpperCase();
    if (code.length === 0) throw new ConvexError("Shot code is required");
    if (code.length > MAX_CODE_LENGTH)
      throw new ConvexError(
        `Shot code is too long — keep it to ${MAX_CODE_LENGTH} characters`,
      );
    if (isReservedCode(code)) throw new ConvexError(reservedCodeMessage(code));
    if (code === shot.code) return code;
    const duplicate = await ctx.db
      .query("shots")
      .withIndex("by_production_code", (q) =>
        q.eq("productionId", shot.productionId).eq("code", code),
      )
      .first();
    if (duplicate !== null)
      throw new ConvexError(`Shot code ${code} already exists in this production`);
    await ctx.db.patch(shot._id, {
      code,
      formerCodes: [...(shot.formerCodes ?? []), shot.code],
    });
    await logActivity(ctx, {
      productionId: shot.productionId,
      actorId: userId,
      type: "shot.renamed",
      targetType: "shot",
      targetId: shot._id,
      summary: `${await actorName(ctx, userId)} renamed ${shot.code} → ${code}`,
      data: { from: shot.code, to: code },
    });
    return code;
  },
});

export const setStatus = mutation({
  args: { shotId: v.id("shots"), status: shotStatus },
  handler: async (ctx, args) => {
    const shot = await ctx.db.get(args.shotId);
    if (!shot) throw new ConvexError("Shot not found");
    const { userId, member } = await assertMemberForProduction(
      ctx,
      shot.productionId,
    );
    if (!canEditShot(member, shot, userId, args.status))
      throw new PermissionError("You can't move this shot to that status");
    if (args.status === shot.status) return;
    // Spec §6 invariants.
    if (args.status === "approved" && shot.pickedVersionId === undefined)
      throw new ConvexError("Pick a version before approving this shot");
    if (args.status === "delivered") {
      const delivery = await ctx.db
        .query("stageInstances")
        .withIndex("by_production", (q) =>
          q.eq("productionId", shot.productionId),
        )
        .filter((q) => q.eq(q.field("stage"), "delivery"))
        .unique();
      if (delivery !== null && delivery.gateStatus === "rejected")
        throw new ConvexError(
          "The delivery gate is rejected — resolve it before delivering shots",
        );
    }
    await ctx.db.patch(shot._id, { status: args.status });
    await logActivity(ctx, {
      productionId: shot.productionId,
      actorId: userId,
      type: "shot.status_changed",
      targetType: "shot",
      targetId: shot._id,
      summary: `${await actorName(ctx, userId)} moved ${shot.code} to ${SHOT_STATUS_BY_KEY[args.status].label}`,
      data: { from: shot.status, to: args.status },
    });
  },
});

export const setStage = mutation({
  args: { shotId: v.id("shots"), stage: stageKey },
  handler: async (ctx, args) => {
    const shot = await ctx.db.get(args.shotId);
    if (!shot) throw new ConvexError("Shot not found");
    const { userId } = await assertCanForProduction(
      ctx,
      shot.productionId,
      "content.edit",
    );
    if (args.stage === shot.stage) return;
    await ctx.db.patch(shot._id, { stage: args.stage });
    await logActivity(ctx, {
      productionId: shot.productionId,
      actorId: userId,
      type: "shot.stage_changed",
      targetType: "shot",
      targetId: shot._id,
      summary: `${await actorName(ctx, userId)} moved ${shot.code} to ${STAGE_BY_KEY[args.stage].label}`,
      data: { from: shot.stage, to: args.stage },
    });
  },
});

/**
 * Deletes one shot if nothing hangs off it, otherwise returns the reason it
 * can't go — mirrors scenes.remove refusing while shots still reference the
 * scene. Versions are the decision record, so a shot with options (or with a
 * pick already recorded) has to be emptied deliberately first. The shot's
 * comments and asset rows go with it — they can only dangle otherwise — but
 * activity rows stay: the daily report counts them (reports.ts) and history
 * should keep the fact that the shot existed. Exported for elements.remove,
 * which applies the same rules to each slot shot.
 */
export async function removeShotIfSafe(
  ctx: MutationCtx,
  shot: Doc<"shots">,
): Promise<string | null> {
  const version = await ctx.db
    .query("versions")
    .withIndex("by_shot", (q) => q.eq("shotId", shot._id))
    .first();
  if (version !== null) return "it still has options";
  if (shot.pickedVersionId !== undefined) return "it has a picked version";
  const comments = await ctx.db
    .query("comments")
    .withIndex("by_target", (q) =>
      q.eq("targetType", "shot").eq("targetId", shot._id),
    )
    .collect();
  for (const comment of comments) await ctx.db.delete(comment._id);
  // No versions means no asset here backs one; these are loose files/links.
  // The Convex storage blobs and Drive files themselves are left alone.
  const assets = await ctx.db
    .query("assets")
    .withIndex("by_shot", (q) => q.eq("shotId", shot._id))
    .collect();
  for (const asset of assets) await ctx.db.delete(asset._id);
  await ctx.db.delete(shot._id);
  return null;
}

export const remove = mutation({
  args: { shotId: v.id("shots") },
  handler: async (ctx, args) => {
    const shot = await ctx.db.get(args.shotId);
    if (!shot) return; // already gone — deleting twice is not an error
    const { userId } = await assertCanForProduction(
      ctx,
      shot.productionId,
      "content.edit",
    );
    const blocked = await removeShotIfSafe(ctx, shot);
    if (blocked !== null)
      throw new ConvexError(
        `Can't delete ${shot.code} — ${blocked}. Set it to Killed instead, or remove its options first.`,
      );
    await logActivity(ctx, {
      productionId: shot.productionId,
      actorId: userId,
      type: "shot.removed",
      targetType: "shot",
      targetId: shot._id,
      summary: `${await actorName(ctx, userId)} removed shot ${shot.code}`,
    });
  },
});

/**
 * The undo for a mis-pasted bulkCreate: same per-shot safety rule as remove,
 * shots that aren't safe come back in `skipped` instead of failing the batch.
 * ONE activity row for the whole batch, like bulkCreate.
 */
export const bulkRemove = mutation({
  args: {
    productionId: v.id("productions"),
    shotIds: v.array(v.id("shots")),
  },
  handler: async (ctx, args) => {
    const { userId } = await assertCanForProduction(
      ctx,
      args.productionId,
      "content.edit",
    );
    if (args.shotIds.length > MAX_BULK_SHOTS)
      throw new ConvexError(
        `That's ${args.shotIds.length} shots — delete at most ${MAX_BULK_SHOTS} at a time`,
      );
    let removed = 0;
    const skipped: string[] = [];
    for (const shotId of args.shotIds) {
      const shot = await ctx.db.get(shotId);
      if (!shot) continue; // already gone
      // content.edit was checked for one production only.
      if (shot.productionId !== args.productionId)
        throw new ConvexError("Those shots aren't all in this production");
      const blocked = await removeShotIfSafe(ctx, shot);
      if (blocked !== null) {
        skipped.push(shot.code);
        continue;
      }
      removed += 1;
    }
    if (removed > 0) {
      await logActivity(ctx, {
        productionId: args.productionId,
        actorId: userId,
        type: "shot.removed",
        targetType: "production",
        targetId: args.productionId,
        summary: `${await actorName(ctx, userId)} removed ${removed} shot${removed === 1 ? "" : "s"}`,
        data: skipped.length > 0 ? { skipped } : undefined,
      });
    }
    return { removed, skipped };
  },
});
