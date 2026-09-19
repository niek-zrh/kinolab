import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { elementKind } from "./schema";
import {
  assertCanForProduction,
  assertMemberForProduction,
} from "./lib/permissions";
import { actorName, logActivity } from "./lib/activity";
import { createShotRow } from "./shots";
import {
  deriveElementCode,
  ELEMENT_KIND_LABELS,
  isValidElementCode,
  MAX_BULK_ELEMENTS,
  MAX_ELEMENT_BASE_PROMPT_LENGTH,
  MAX_ELEMENT_CODE_LENGTH,
  MAX_ELEMENT_DESCRIPTION_LENGTH,
  MAX_ELEMENT_NAME_LENGTH,
  MAX_LIST_ELEMENTS,
  SLOT_LABELS,
  SLOTS_BY_KIND,
  slotShotCode,
  slotTitle,
} from "./lib/domain";
import type { ElementKind, ElementSlot } from "./lib/domain";

/**
 * Pre-production elements (v2 item b, CONTRACTS §elements.ts): characters
 * now, locations and scripts later. An element owns one "slot shot" per
 * SLOTS_BY_KIND[kind] — a `shots` row with `elementId` + `slot`, code
 * `CH_{CODE}_{SLOT}`, stage preproduction, no scene/episode — so uploads,
 * Options, the one-pick invariant, the Review Room, comments, history, the
 * ledger, notifications and the daily report work on it unchanged. Every
 * shot row is inserted through shots.createShotRow (CONTRACTS rule 4).
 */

/* ------------------------------------------------------------------------ */
/* Shapes                                                                    */
/* ------------------------------------------------------------------------ */

/** One phase of an element, enriched for the Characters list (CONTRACTS). */
export type SlotView = {
  slot: ElementSlot;
  shotId: Id<"shots">;
  status: Doc<"shots">["status"];
  versionsCount: number;
  pickedVersionIndex: number | null;
  /**
   * Thumbnail of the slot's cover (first option). Resolved only while the
   * slot has no pick: the list shows picked-or-cover, and skipping the cover
   * lookup once a pick exists is what keeps 300 elements × 2 slots inside
   * the 4,096-document read ceiling (≤ 4 reads per slot either way).
   */
  coverThumbUrl: string | null;
  pickedThumbUrl: string | null;
  pickedFileUrl: string | null;
  /** The picked version's prompt; without a pick, the latest version's. */
  latestPrompt: string | null;
};

export type ElementRow = Doc<"elements"> & { slots: SlotView[] };

function isElementSlot(slot: string): slot is ElementSlot {
  return Object.prototype.hasOwnProperty.call(SLOT_LABELS, slot);
}

/** "character" / "location" / "script" for error messages and summaries. */
function kindLabel(kind: ElementKind): string {
  return ELEMENT_KIND_LABELS[kind].singular.toLowerCase();
}

function kindLabelCap(kind: ElementKind): string {
  return ELEMENT_KIND_LABELS[kind].singular;
}

/* ------------------------------------------------------------------------ */
/* Validation                                                                */
/* ------------------------------------------------------------------------ */

function normaliseName(raw: string, kind: ElementKind): string {
  const name = raw.trim();
  if (name.length === 0)
    throw new ConvexError(`${kindLabelCap(kind)} name is required`);
  if (name.length > MAX_ELEMENT_NAME_LENGTH)
    throw new ConvexError(
      `${kindLabelCap(kind)} name is too long — keep it to ${MAX_ELEMENT_NAME_LENGTH} characters`,
    );
  return name;
}

/**
 * The code to store: the given one (trimmed, uppercased, validated) or, when
 * none was given and `deriveFrom` is set, the derivation from the name. An
 * empty derivation (a Cyrillic-only name) means the code must be typed.
 */
function normaliseCode(raw: string | undefined, deriveFrom?: string): string {
  const given = raw?.trim() ?? "";
  if (given.length > 0) {
    const code = given.toUpperCase();
    if (!isValidElementCode(code))
      throw new ConvexError(
        code.length > MAX_ELEMENT_CODE_LENGTH
          ? `Code is too long — keep it to ${MAX_ELEMENT_CODE_LENGTH} characters`
          : "Codes use A–Z, 0–9 and _",
      );
    return code;
  }
  const derived = deriveFrom !== undefined ? deriveElementCode(deriveFrom) : "";
  if (derived.length === 0)
    throw new ConvexError("Code is required — codes use A–Z, 0–9 and _");
  return derived;
}

/** Trimmed text or undefined when blank (blank clears the field on update). */
function normaliseText(
  raw: string,
  max: number,
  label: string,
): string | undefined {
  const text = raw.trim();
  if (text.length > max)
    throw new ConvexError(`${label} is too long — keep it to ${max} characters`);
  return text.length === 0 ? undefined : text;
}

/* ------------------------------------------------------------------------ */
/* Lookups                                                                   */
/* ------------------------------------------------------------------------ */

async function codeTaken(
  ctx: QueryCtx | MutationCtx,
  productionId: Id<"productions">,
  kind: ElementKind,
  code: string,
): Promise<boolean> {
  const hit = await ctx.db
    .query("elements")
    .withIndex("by_production_kind_code", (q) =>
      q.eq("productionId", productionId).eq("kind", kind).eq("code", code),
    )
    .first();
  return hit !== null;
}

/**
 * Rows examined while looking for the highest `order` of a kind. A
 * production holds a few dozen characters; past this many the next order may
 * tie an existing one, which only affects sort order, never correctness.
 */
const MAX_ORDER_SCAN = 2000;

/** Highest `order` among the production's elements of `kind` (0 when none). */
async function maxElementOrder(
  ctx: QueryCtx | MutationCtx,
  productionId: Id<"productions">,
  kind: ElementKind,
): Promise<number> {
  let max = 0;
  let scanned = 0;
  for await (const element of ctx.db
    .query("elements")
    .withIndex("by_production_kind_code", (q) =>
      q.eq("productionId", productionId).eq("kind", kind),
    )) {
    if (element.order > max) max = element.order;
    scanned += 1;
    if (scanned >= MAX_ORDER_SCAN) break;
  }
  return max;
}

/**
 * Highest shot `order` in the production (0 when empty) — one indexed read,
 * the same lookup shots.ts keeps private as `lastOrder`. Batch callers read
 * it once and count up through createShotRow's `order` argument.
 */
async function lastShotOrder(
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

/** An element's slot shots — a handful of rows through `by_element`. */
async function slotShotsOf(
  ctx: QueryCtx | MutationCtx,
  elementId: Id<"elements">,
): Promise<Doc<"shots">[]> {
  return await ctx.db
    .query("shots")
    .withIndex("by_element", (q) => q.eq("elementId", elementId))
    .collect();
}

/**
 * `{ elementId, slot }` for a slot shot, null for an ordinary shot (or an
 * unknown id). For the shot-page redirect and notification hrefs
 * (CONTRACTS rule 7): `/p/{pid}/shots/{slotShotId}` →
 * `/p/{pid}/characters/{elementId}?slot={slot}`.
 */
export async function elementForShot(
  ctx: QueryCtx | MutationCtx,
  shotId: Id<"shots">,
): Promise<{ elementId: Id<"elements">; slot: ElementSlot } | null> {
  const shot = await ctx.db.get(shotId);
  if (
    !shot ||
    shot.elementId === undefined ||
    shot.slot === undefined ||
    !isElementSlot(shot.slot)
  )
    return null;
  return { elementId: shot.elementId, slot: shot.slot };
}

/* ------------------------------------------------------------------------ */
/* Enrichment (list / get)                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Per-call storage URL memo — the same trick as assets.ts: an image upload
 * reuses its file as its thumbnail, so pickedThumbUrl and pickedFileUrl are
 * usually one lookup, and each getUrl counts against the read ceiling.
 */
type UrlCache = Map<Id<"_storage">, Promise<string | null>>;

function cachedUrl(
  ctx: QueryCtx,
  cache: UrlCache,
  storageId: Id<"_storage">,
): Promise<string | null> {
  const cached = cache.get(storageId);
  if (cached !== undefined) return cached;
  const pending = ctx.storage.getUrl(storageId);
  cache.set(storageId, pending);
  return pending;
}

/** fileUrl per provider — keep in step with versions.enrichAsset. */
async function fileUrlOf(
  ctx: QueryCtx,
  cache: UrlCache,
  asset: Doc<"assets">,
): Promise<string | null> {
  if (asset.provider === "storage" && asset.storageId !== undefined)
    return await cachedUrl(ctx, cache, asset.storageId);
  if (asset.provider === "gdrive") return asset.webViewLink ?? null;
  if (asset.provider === "url") return asset.url ?? null;
  return null;
}

async function slotView(
  ctx: QueryCtx,
  slot: ElementSlot,
  shot: Doc<"shots">,
  urls: UrlCache,
): Promise<SlotView> {
  const versionsCount = shot.versionsCount ?? 0;
  let pickedVersionIndex: number | null = null;
  let pickedThumbUrl: string | null = null;
  let pickedFileUrl: string | null = null;
  let coverThumbUrl: string | null = null;
  let latestPrompt: string | null = null;

  if (shot.pickedVersionId !== undefined) {
    const picked = await ctx.db.get(shot.pickedVersionId);
    if (picked) {
      pickedVersionIndex = picked.index;
      latestPrompt = picked.promptMeta?.prompt ?? null;
      const asset =
        picked.primaryAssetId !== undefined
          ? await ctx.db.get(picked.primaryAssetId)
          : null;
      if (asset) {
        pickedThumbUrl =
          asset.thumbStorageId !== undefined
            ? await cachedUrl(ctx, urls, asset.thumbStorageId)
            : null;
        pickedFileUrl = await fileUrlOf(ctx, urls, asset);
      }
    }
  }

  if (pickedVersionIndex === null) {
    // No pick: the cover (first option) stands in, and the newest option's
    // prompt is the one worth showing.
    if (shot.coverAssetId !== undefined) {
      const cover = await ctx.db.get(shot.coverAssetId);
      if (cover && cover.thumbStorageId !== undefined)
        coverThumbUrl = await cachedUrl(ctx, urls, cover.thumbStorageId);
    }
    if (versionsCount > 0) {
      const latest = await ctx.db
        .query("versions")
        .withIndex("by_shot", (q) => q.eq("shotId", shot._id))
        .order("desc")
        .first();
      latestPrompt = latest?.promptMeta?.prompt ?? null;
    }
  }

  return {
    slot,
    shotId: shot._id,
    status: shot.status,
    versionsCount,
    pickedVersionIndex,
    coverThumbUrl,
    pickedThumbUrl,
    pickedFileUrl,
    latestPrompt,
  };
}

/** Slots in SLOTS_BY_KIND order; a slot whose shot is missing is left out. */
async function enrichElement(
  ctx: QueryCtx,
  element: Doc<"elements">,
  urls: UrlCache,
): Promise<ElementRow> {
  const shots = await slotShotsOf(ctx, element._id);
  const bySlot = new Map(shots.map((shot) => [shot.slot, shot] as const));
  const slots = await Promise.all(
    SLOTS_BY_KIND[element.kind].flatMap((slot) => {
      const shot = bySlot.get(slot);
      return shot ? [slotView(ctx, slot, shot, urls)] : [];
    }),
  );
  return { ...element, slots };
}

/* ------------------------------------------------------------------------ */
/* Queries                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Elements of one kind, by `order`. Streams the `by_production_kind_code`
 * prefix (only that kind is read) and stops at MAX_LIST_ELEMENTS (300): an
 * enriched row costs the element, its slot shots and ≤ 4 reads per slot, so
 * the cap stays under the 4,096-document read ceiling with room to spare.
 * At the cap the first 300 in index (code) order come back.
 */
export const list = query({
  args: { productionId: v.id("productions"), kind: elementKind },
  handler: async (ctx, args): Promise<ElementRow[]> => {
    await assertMemberForProduction(ctx, args.productionId);
    const elements: Doc<"elements">[] = [];
    for await (const element of ctx.db
      .query("elements")
      .withIndex("by_production_kind_code", (q) =>
        q.eq("productionId", args.productionId).eq("kind", args.kind),
      )) {
      elements.push(element);
      if (elements.length >= MAX_LIST_ELEMENTS) break;
    }
    elements.sort(
      (a, b) => a.order - b.order || a._creationTime - b._creationTime,
    );
    const urls: UrlCache = new Map();
    return await Promise.all(
      elements.map((element) => enrichElement(ctx, element, urls)),
    );
  },
});

export const get = query({
  args: { elementId: v.id("elements") },
  handler: async (ctx, args) => {
    const element = await ctx.db.get(args.elementId);
    if (!element) throw new ConvexError("Element not found");
    const { production } = await assertMemberForProduction(
      ctx,
      element.productionId,
    );
    const row = await enrichElement(ctx, element, new Map());
    return {
      ...row,
      production: {
        _id: production._id,
        name: production.name,
        code: production.code,
        timezone: production.timezone,
      },
    };
  },
});

/* ------------------------------------------------------------------------ */
/* The single insert path                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Insert one element and its slot shots — the shared path behind `create`,
 * `bulkCreate` and the demo seed. Inputs are already validated and the code
 * already known to be free; `order` is the element's position among its kind
 * and `firstShotOrder` the `order` of its first slot shot (batch callers read
 * `lastShotOrder` once and count up by `slots.length`). Writes NO activity
 * row — the calling mutation logs its own (CONTRACTS rule 1).
 */
export async function insertElementWithSlots(
  ctx: MutationCtx,
  args: {
    productionId: Id<"productions">;
    studioId: Id<"studios">;
    kind: ElementKind;
    name: string;
    code: string;
    description?: string;
    basePrompt?: string;
    order: number;
    createdBy: Id<"users">;
    firstShotOrder: number;
  },
): Promise<{
  elementId: Id<"elements">;
  slots: { slot: ElementSlot; shotId: Id<"shots">; code: string }[];
}> {
  const elementId = await ctx.db.insert("elements", {
    productionId: args.productionId,
    kind: args.kind,
    name: args.name,
    code: args.code,
    description: args.description,
    basePrompt: args.basePrompt,
    order: args.order,
    createdBy: args.createdBy,
  });
  const slots: { slot: ElementSlot; shotId: Id<"shots">; code: string }[] =
    [];
  let order = args.firstShotOrder;
  for (const slot of SLOTS_BY_KIND[args.kind]) {
    const { shotId, code } = await createShotRow(ctx, {
      productionId: args.productionId,
      studioId: args.studioId,
      code: slotShotCode(args.kind, args.code, slot),
      title: slotTitle(args.name, slot),
      elementId,
      slot,
      order,
    });
    order += 1;
    slots.push({ slot, shotId, code });
  }
  return { elementId, slots };
}

/* ------------------------------------------------------------------------ */
/* Mutations                                                                 */
/* ------------------------------------------------------------------------ */

export const create = mutation({
  args: {
    productionId: v.id("productions"),
    kind: elementKind,
    name: v.string(),
    code: v.optional(v.string()),
    description: v.optional(v.string()),
    basePrompt: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"elements">> => {
    const { userId, production } = await assertCanForProduction(
      ctx,
      args.productionId,
      "content.edit",
    );
    const name = normaliseName(args.name, args.kind);
    const code = normaliseCode(args.code, name);
    const description =
      args.description !== undefined
        ? normaliseText(
            args.description,
            MAX_ELEMENT_DESCRIPTION_LENGTH,
            "Description",
          )
        : undefined;
    const basePrompt =
      args.basePrompt !== undefined
        ? normaliseText(
            args.basePrompt,
            MAX_ELEMENT_BASE_PROMPT_LENGTH,
            "Base prompt",
          )
        : undefined;
    if (await codeTaken(ctx, args.productionId, args.kind, code))
      throw new ConvexError(
        `${kindLabelCap(args.kind)} code ${code} already exists`,
      );
    const order = (await maxElementOrder(ctx, args.productionId, args.kind)) + 1;
    const firstShotOrder = (await lastShotOrder(ctx, args.productionId)) + 1;
    const { elementId } = await insertElementWithSlots(ctx, {
      productionId: args.productionId,
      studioId: production.studioId,
      kind: args.kind,
      name,
      code,
      description,
      basePrompt,
      order,
      createdBy: userId,
      firstShotOrder,
    });
    await logActivity(ctx, {
      productionId: args.productionId,
      actorId: userId,
      type: "element.created",
      targetType: "element",
      targetId: elementId,
      summary: `${await actorName(ctx, userId)} created ${kindLabel(args.kind)} ${name}`,
      data: { kind: args.kind, code },
    });
    return elementId;
  },
});

/**
 * Attempts at a free code before a name is given up on: MAMA, MAMA_2, …
 * MAMA_51. Each miss past the in-memory set costs one indexed read, so a
 * paste of one repeated name stays at one read per row while a table that
 * already holds fifty variants can't run the mutation into the read ceiling.
 */
const MAX_CODE_SUFFIX_TRIES = 50;

/** `base`, else `base_2`, `base_3`… (kept within 32 chars); null when spent. */
async function freeCode(
  ctx: MutationCtx,
  productionId: Id<"productions">,
  kind: ElementKind,
  base: string,
  taken: Set<string>,
): Promise<string | null> {
  let candidate = base;
  for (let n = 2; n <= MAX_CODE_SUFFIX_TRIES + 1; n += 1) {
    if (
      !taken.has(candidate) &&
      !(await codeTaken(ctx, productionId, kind, candidate))
    )
      return candidate;
    const suffix = `_${n}`;
    candidate = `${base
      .slice(0, MAX_ELEMENT_CODE_LENGTH - suffix.length)
      .replace(/_+$/, "")}${suffix}`;
  }
  return null;
}

/**
 * One name per array entry (the client splits the pasted text). Trims, drops
 * blanks, derives codes; a code collision — inside the paste or with the
 * table — gets `_2`, `_3`…; a name whose derivation is empty (Cyrillic only)
 * comes back in `skipped` so the person can add it with a typed code. ONE
 * activity row for the whole batch, like shots.bulkCreate.
 */
export const bulkCreate = mutation({
  args: {
    productionId: v.id("productions"),
    kind: elementKind,
    names: v.array(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ created: number; skipped: string[] }> => {
    const { userId, production } = await assertCanForProduction(
      ctx,
      args.productionId,
      "content.edit",
    );
    if (args.names.length > MAX_BULK_ELEMENTS)
      throw new ConvexError(
        `That's ${args.names.length} names — paste at most ${MAX_BULK_ELEMENTS} at a time`,
      );
    // Validated before anything is written so the message can name what to
    // fix instead of leaving a half-created paste behind.
    const names: string[] = [];
    for (const raw of args.names) {
      const name = raw.trim();
      if (name.length === 0) continue;
      if (name.length > MAX_ELEMENT_NAME_LENGTH)
        throw new ConvexError(
          `"${name.slice(0, 20)}…" is too long — keep names to ${MAX_ELEMENT_NAME_LENGTH} characters`,
        );
      names.push(name);
    }
    const taken = new Set<string>();
    let order = await maxElementOrder(ctx, args.productionId, args.kind);
    let shotOrder = await lastShotOrder(ctx, args.productionId);
    let created = 0;
    const skipped: string[] = [];
    for (const name of names) {
      const base = deriveElementCode(name);
      if (base.length === 0) {
        skipped.push(name);
        continue;
      }
      const code = await freeCode(ctx, args.productionId, args.kind, base, taken);
      if (code === null) {
        skipped.push(name);
        continue;
      }
      taken.add(code);
      order += 1;
      const { slots } = await insertElementWithSlots(ctx, {
        productionId: args.productionId,
        studioId: production.studioId,
        kind: args.kind,
        name,
        code,
        order,
        createdBy: userId,
        firstShotOrder: shotOrder + 1,
      });
      shotOrder += slots.length;
      created += 1;
    }
    if (created > 0) {
      const labels = ELEMENT_KIND_LABELS[args.kind];
      await logActivity(ctx, {
        productionId: args.productionId,
        actorId: userId,
        type: "element.created",
        targetType: "production",
        targetId: args.productionId,
        summary: `${await actorName(ctx, userId)} created ${created} ${(created === 1 ? labels.singular : labels.plural).toLowerCase()}`,
        data: skipped.length > 0 ? { kind: args.kind, skipped } : { kind: args.kind },
      });
    }
    return { created, skipped };
  },
});

export const update = mutation({
  args: {
    elementId: v.id("elements"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    description: v.optional(v.string()),
    basePrompt: v.optional(v.string()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const element = await ctx.db.get(args.elementId);
    if (!element) throw new ConvexError("Element not found");
    const { userId } = await assertCanForProduction(
      ctx,
      element.productionId,
      "content.edit",
    );
    const kind = element.kind;

    const patch: {
      name?: string;
      code?: string;
      description?: string | undefined;
      basePrompt?: string | undefined;
      order?: number;
    } = {};
    const changes: string[] = [];

    let name = element.name;
    if (args.name !== undefined) {
      const next = normaliseName(args.name, kind);
      if (next !== element.name) {
        patch.name = next;
        name = next;
        changes.push(`name → "${next}"`);
      }
    }
    let code = element.code;
    if (args.code !== undefined) {
      const next = normaliseCode(args.code);
      if (next !== element.code) {
        if (await codeTaken(ctx, element.productionId, kind, next))
          throw new ConvexError(
            `${kindLabelCap(kind)} code ${next} already exists`,
          );
        patch.code = next;
        code = next;
      }
    }
    if (args.description !== undefined) {
      const next = normaliseText(
        args.description,
        MAX_ELEMENT_DESCRIPTION_LENGTH,
        "Description",
      );
      if (next !== element.description) {
        // Patching with an explicit undefined removes the field.
        patch.description = next;
        changes.push("description");
      }
    }
    if (args.basePrompt !== undefined) {
      const next = normaliseText(
        args.basePrompt,
        MAX_ELEMENT_BASE_PROMPT_LENGTH,
        "Base prompt",
      );
      if (next !== element.basePrompt) {
        patch.basePrompt = next;
        changes.push("base prompt");
      }
    }
    if (args.order !== undefined && args.order !== element.order) {
      patch.order = args.order;
      changes.push("order");
    }

    // A code change renames EVERY slot shot in this same transaction (the
    // old code goes on its formerCodes trail); a name change re-titles them.
    const nameChanged = patch.name !== undefined;
    const codeChanged = patch.code !== undefined;
    if (nameChanged || codeChanged) {
      const former: string[] = [];
      for (const shot of await slotShotsOf(ctx, element._id)) {
        if (shot.slot === undefined || !isElementSlot(shot.slot)) continue;
        const shotPatch: {
          code?: string;
          formerCodes?: string[];
          title?: string;
        } = {};
        if (codeChanged) {
          const nextCode = slotShotCode(kind, code, shot.slot);
          const clash = await ctx.db
            .query("shots")
            .withIndex("by_production_code", (q) =>
              q.eq("productionId", element.productionId).eq("code", nextCode),
            )
            .first();
          if (clash !== null && clash._id !== shot._id)
            throw new ConvexError(
              `Shot code ${nextCode} already exists in this production`,
            );
          shotPatch.code = nextCode;
          shotPatch.formerCodes = [...(shot.formerCodes ?? []), shot.code];
          former.push(shot.code);
        }
        if (nameChanged) shotPatch.title = slotTitle(name, shot.slot);
        await ctx.db.patch(shot._id, shotPatch);
      }
      if (codeChanged)
        changes.push(
          former.length > 0
            ? `code → ${code}, formerly ${former.join(", ")}`
            : `code → ${code}`,
        );
    }

    if (changes.length === 0) return null;
    await ctx.db.patch(element._id, patch);
    await logActivity(ctx, {
      productionId: element.productionId,
      actorId: userId,
      type: "element.updated",
      targetType: "element",
      targetId: element._id,
      summary: `${await actorName(ctx, userId)} updated ${kindLabel(kind)} ${element.name} (${changes.join("; ")})`,
      data: { changes },
    });
    return null;
  },
});

/**
 * The shots.remove rules for one slot shot: versions (or a recorded pick)
 * block the delete; otherwise the shot's dangling comments and asset rows go
 * with it and its activity rows stay (reports count on them). Mirrors the
 * private `removeShotIfSafe` in shots.ts.
 */
async function slotShotBlocked(
  ctx: MutationCtx,
  shot: Doc<"shots">,
): Promise<boolean> {
  if (shot.pickedVersionId !== undefined) return true;
  const version = await ctx.db
    .query("versions")
    .withIndex("by_shot", (q) => q.eq("shotId", shot._id))
    .first();
  return version !== null;
}

async function deleteSlotShot(
  ctx: MutationCtx,
  shot: Doc<"shots">,
): Promise<void> {
  const comments = await ctx.db
    .query("comments")
    .withIndex("by_target", (q) =>
      q.eq("targetType", "shot").eq("targetId", shot._id),
    )
    .collect();
  for (const comment of comments) await ctx.db.delete(comment._id);
  // No versions means no asset here backs one; these are loose files/links.
  // The storage blobs themselves are left alone, as shots.remove leaves them.
  const assets = await ctx.db
    .query("assets")
    .withIndex("by_shot", (q) => q.eq("shotId", shot._id))
    .collect();
  for (const asset of assets) await ctx.db.delete(asset._id);
  await ctx.db.delete(shot._id);
}

export const remove = mutation({
  args: { elementId: v.id("elements") },
  handler: async (ctx, args) => {
    const element = await ctx.db.get(args.elementId);
    if (!element) return null; // already gone — deleting twice is not an error
    const { userId } = await assertCanForProduction(
      ctx,
      element.productionId,
      "content.edit",
    );
    const slotShots = await slotShotsOf(ctx, element._id);
    for (const shot of slotShots) {
      if (await slotShotBlocked(ctx, shot))
        throw new ConvexError(
          `This ${kindLabel(element.kind)} has options — remove them first`,
        );
    }
    for (const shot of slotShots) await deleteSlotShot(ctx, shot);
    await ctx.db.delete(element._id);
    await logActivity(ctx, {
      productionId: element.productionId,
      actorId: userId,
      type: "element.removed",
      targetType: "element",
      targetId: element._id,
      summary: `${await actorName(ctx, userId)} removed ${kindLabel(element.kind)} ${element.name}`,
      data: {
        kind: element.kind,
        code: element.code,
        slotShots: slotShots.map((shot) => shot.code),
      },
    });
    return null;
  },
});
