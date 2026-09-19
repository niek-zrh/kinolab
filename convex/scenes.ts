import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertCanForProduction,
  assertMemberForProduction,
} from "./lib/permissions";
import { actorName, logActivity } from "./lib/activity";

/**
 * Read bounds for list(). Convex refuses a function that reads more than
 * 4,096 documents; the old list() collect()ed every shot of every scene to
 * count them, which is the same unbounded read shots.list was cured of.
 * Nothing on screen shows the count itself (the Shots page uses the rows for
 * the scene filter), so the count saturates: at most SCENE_SHOT_COUNT_CAP
 * reads per scene and SCENE_SHOT_READ_BUDGET across the call.
 * Worst case: MAX_LIST_SCENES + SCENE_SHOT_READ_BUDGET = 3,500 documents.
 */
const MAX_LIST_SCENES = 500;
const SCENE_SHOT_COUNT_CAP = 50;
const SCENE_SHOT_READ_BUDGET = 3000;

/** Scene codes live in shot codes and Drive folder names — one line, short. */
const MAX_SCENE_CODE_LENGTH = 32;
const MAX_SCENE_TITLE_LENGTH = 200;

/**
 * Scenes ordered by `order`, each with `shotCount` (CONTRACTS §scenes).
 * `shotCount` saturates at SCENE_SHOT_COUNT_CAP (see above) — `shotCountCapped`
 * says when it did. Slot shots never carry a sceneId, so they are never
 * counted here.
 */
export const list = query({
  args: {
    productionId: v.id("productions"),
    episodeId: v.optional(v.id("episodes")),
  },
  handler: async (ctx, args) => {
    await assertMemberForProduction(ctx, args.productionId);
    const scenes: Doc<"scenes">[] = [];
    for await (const scene of ctx.db
      .query("scenes")
      .withIndex("by_production", (q) =>
        q.eq("productionId", args.productionId),
      )) {
      if (args.episodeId !== undefined && scene.episodeId !== args.episodeId)
        continue;
      scenes.push(scene);
      if (scenes.length >= MAX_LIST_SCENES) break;
    }
    scenes.sort((a, b) => a.order - b.order);
    let budget = SCENE_SHOT_READ_BUDGET;
    const rows: (Doc<"scenes"> & {
      shotCount: number;
      shotCountCapped: boolean;
    })[] = [];
    for (const scene of scenes) {
      const cap = Math.min(SCENE_SHOT_COUNT_CAP, budget);
      const shots =
        cap > 0
          ? await ctx.db
              .query("shots")
              .withIndex("by_scene", (q) => q.eq("sceneId", scene._id))
              .take(cap)
          : [];
      budget -= shots.length;
      rows.push({
        ...scene,
        shotCount: shots.length,
        shotCountCapped: shots.length >= cap,
      });
    }
    return rows;
  },
});

/** Trim + uppercase, the way every scene code is stored. */
export function normalizeSceneCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * The scene a code refers to, or null. Scene codes are unique per production
 * since v2, but data restored from before that may carry duplicates: those
 * resolve to the first by `order` with a warning in the deployment log.
 */
export async function findSceneByCode(
  ctx: QueryCtx | MutationCtx,
  productionId: Id<"productions">,
  code: string,
): Promise<Doc<"scenes"> | null> {
  const matches = await ctx.db
    .query("scenes")
    .withIndex("by_production_code", (q) =>
      q.eq("productionId", productionId).eq("code", normalizeSceneCode(code)),
    )
    .collect(); // one row unless the data predates the uniqueness rule
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    matches.sort((a, b) => a.order - b.order);
    console.warn(
      `scenes: ${matches.length} scenes share code ${matches[0].code} in production ${productionId}; using the first by order`,
    );
  }
  return matches[0];
}

/** Highest `order` in the production (0 when empty), bounded like list(). */
async function lastSceneOrder(
  ctx: MutationCtx,
  productionId: Id<"productions">,
): Promise<number> {
  let max = 0;
  let scanned = 0;
  for await (const scene of ctx.db
    .query("scenes")
    .withIndex("by_production", (q) => q.eq("productionId", productionId))) {
    if (scene.order > max) max = scene.order;
    scanned += 1;
    if (scanned >= MAX_LIST_SCENES) break;
  }
  return max;
}

/**
 * Validate and insert ONE scene — the single write path behind scenes.create
 * and shots.importRows (v2 item d, "create missing scenes"). Normalises the
 * code, applies the caps, checks the episode belongs to the production and
 * enforces per-production code uniqueness on `by_production_code`. Writes NO
 * activity row: the calling mutation logs its own (CONTRACTS rule 1).
 * `order` may be supplied by batch callers that read `lastSceneOrder` once
 * and count up; otherwise it is max + 1.
 */
export async function createSceneRow(
  ctx: MutationCtx,
  args: {
    productionId: Id<"productions">;
    code: string;
    title?: string;
    episodeId?: Id<"episodes">;
    figmaUrl?: string;
    description?: string;
    order?: number;
  },
): Promise<{ sceneId: Id<"scenes">; code: string }> {
  const code = normalizeSceneCode(args.code);
  if (code.length === 0) throw new ConvexError("Scene code is required");
  if (code.length > MAX_SCENE_CODE_LENGTH)
    throw new ConvexError(
      `Scene code is too long — keep it to ${MAX_SCENE_CODE_LENGTH} characters`,
    );
  if (args.title !== undefined && args.title.length > MAX_SCENE_TITLE_LENGTH)
    throw new ConvexError(
      `Scene title is too long — keep it to ${MAX_SCENE_TITLE_LENGTH} characters`,
    );
  if (args.episodeId !== undefined) {
    const episode = await ctx.db.get(args.episodeId);
    if (!episode || episode.productionId !== args.productionId)
      throw new ConvexError("Episode not found in this production");
  }
  const duplicate = await ctx.db
    .query("scenes")
    .withIndex("by_production_code", (q) =>
      q.eq("productionId", args.productionId).eq("code", code),
    )
    .first();
  if (duplicate !== null)
    throw new ConvexError(
      `Scene code ${code} already exists in this production`,
    );
  const order =
    args.order ?? (await lastSceneOrder(ctx, args.productionId)) + 1;
  const sceneId = await ctx.db.insert("scenes", {
    productionId: args.productionId,
    episodeId: args.episodeId,
    code,
    title: args.title,
    order,
    figmaUrl: args.figmaUrl,
    description: args.description,
  });
  return { sceneId, code };
}

export const create = mutation({
  args: {
    productionId: v.id("productions"),
    episodeId: v.optional(v.id("episodes")),
    code: v.string(),
    title: v.optional(v.string()),
    figmaUrl: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await assertCanForProduction(
      ctx,
      args.productionId,
      "content.edit",
    );
    const { sceneId, code } = await createSceneRow(ctx, args);
    await logActivity(ctx, {
      productionId: args.productionId,
      actorId: userId,
      type: "scene.created",
      targetType: "scene",
      targetId: sceneId,
      summary: `${await actorName(ctx, userId)} created scene ${code}`,
    });
    return sceneId;
  },
});

/**
 * `code` (v2 item e): same normalisation and uniqueness as create. A scene
 * code change does NOT rename the scene's shot codes — the edit sheet says so
 * explicitly (SHOULD: an opt-in cascade with preview).
 */
export const update = mutation({
  args: {
    sceneId: v.id("scenes"),
    code: v.optional(v.string()),
    title: v.optional(v.string()),
    figmaUrl: v.optional(v.string()),
    description: v.optional(v.string()),
    order: v.optional(v.number()),
    episodeId: v.optional(v.id("episodes")),
  },
  handler: async (ctx, args) => {
    const scene = await ctx.db.get(args.sceneId);
    if (!scene) throw new ConvexError("Scene not found");
    const { userId } = await assertCanForProduction(
      ctx,
      scene.productionId,
      "content.edit",
    );
    const patch: {
      code?: string;
      title?: string;
      figmaUrl?: string;
      description?: string;
      order?: number;
      episodeId?: Id<"episodes">;
    } = {};
    const changes: string[] = [];
    if (args.code !== undefined) {
      const code = normalizeSceneCode(args.code);
      if (code.length === 0) throw new ConvexError("Scene code is required");
      if (code.length > MAX_SCENE_CODE_LENGTH)
        throw new ConvexError(
          `Scene code is too long — keep it to ${MAX_SCENE_CODE_LENGTH} characters`,
        );
      if (code !== scene.code) {
        const duplicate = await ctx.db
          .query("scenes")
          .withIndex("by_production_code", (q) =>
            q.eq("productionId", scene.productionId).eq("code", code),
          )
          .first();
        if (duplicate !== null)
          throw new ConvexError(
            `Scene code ${code} already exists in this production`,
          );
        patch.code = code;
        changes.push(`code → ${code}`);
      }
    }
    if (args.title !== undefined && args.title !== scene.title) {
      if (args.title.length > MAX_SCENE_TITLE_LENGTH)
        throw new ConvexError(
          `Scene title is too long — keep it to ${MAX_SCENE_TITLE_LENGTH} characters`,
        );
      patch.title = args.title;
      changes.push(`title → "${args.title}"`);
    }
    if (args.figmaUrl !== undefined && args.figmaUrl !== scene.figmaUrl) {
      patch.figmaUrl = args.figmaUrl;
      changes.push("Figma link");
    }
    if (
      args.description !== undefined &&
      args.description !== scene.description
    ) {
      patch.description = args.description;
      changes.push("description");
    }
    if (args.order !== undefined && args.order !== scene.order) {
      patch.order = args.order;
      changes.push("order");
    }
    if (args.episodeId !== undefined && args.episodeId !== scene.episodeId) {
      const episode = await ctx.db.get(args.episodeId);
      if (!episode || episode.productionId !== scene.productionId)
        throw new ConvexError("Episode not found in this production");
      patch.episodeId = args.episodeId;
      changes.push(`episode → EP${String(episode.number).padStart(2, "0")}`);
    }
    if (changes.length === 0) return;
    await ctx.db.patch(scene._id, patch);
    await logActivity(ctx, {
      productionId: scene.productionId,
      actorId: userId,
      type: "scene.updated",
      targetType: "scene",
      targetId: scene._id,
      // The old code names the scene the reader knows; the change list
      // carries the new one.
      summary: `${await actorName(ctx, userId)} updated scene ${scene.code} (${changes.join(", ")})`,
      data: patch.code !== undefined ? { from: scene.code, to: patch.code } : undefined,
    });
  },
});

export const remove = mutation({
  args: { sceneId: v.id("scenes") },
  handler: async (ctx, args) => {
    const scene = await ctx.db.get(args.sceneId);
    if (!scene) return;
    const { userId } = await assertCanForProduction(
      ctx,
      scene.productionId,
      "content.edit",
    );
    const referencingShot = await ctx.db
      .query("shots")
      .withIndex("by_scene", (q) => q.eq("sceneId", scene._id))
      .first();
    if (referencingShot !== null)
      throw new ConvexError(
        "This scene still has shots — reassign or remove them first",
      );
    await ctx.db.delete(scene._id);
    await logActivity(ctx, {
      productionId: scene.productionId,
      actorId: userId,
      type: "scene.removed",
      targetType: "scene",
      targetId: scene._id,
      summary: `${await actorName(ctx, userId)} removed scene ${scene.code}`,
    });
  },
});
