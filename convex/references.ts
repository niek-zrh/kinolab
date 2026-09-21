import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  assertCanForProduction,
  assertMemberForProduction,
  roleHas,
} from "./lib/permissions";
import { actorName, logActivity } from "./lib/activity";
import { enrichAsset } from "./versions";

const category = v.union(
  v.literal("look"),
  v.literal("character"),
  v.literal("location"),
  v.literal("costume"),
  v.literal("lighting"),
);
const fields = {
  title: v.string(),
  notes: v.string(),
  category,
  assetId: v.optional(v.id("assets")),
  sourceUrl: v.optional(v.string()),
  colors: v.array(v.string()),
};

export const list = query({
  args: {
    productionId: v.id("productions"),
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, { productionId, archived = false }) => {
    await assertMemberForProduction(ctx, productionId);
    const rows = await ctx.db
      .query("referenceCards")
      .withIndex("by_production_archived", (q) =>
        q.eq("productionId", productionId).eq("archived", archived),
      )
      .order("desc")
      .take(301);
    return {
      capped: rows.length > 300,
      cards: await Promise.all(
        rows.slice(0, 300).map(async (card) => {
          const asset = card.assetId ? await ctx.db.get(card.assetId) : null;
          return {
            ...card,
            asset:
              asset?.productionId === productionId
                ? await enrichAsset(ctx, asset)
                : null,
          };
        }),
      ),
    };
  },
});

export const save = mutation({
  args: {
    productionId: v.id("productions"),
    cardId: v.optional(v.id("referenceCards")),
    ...fields,
  },
  handler: async (ctx, args) => {
    const { userId, member } = await assertCanForProduction(
      ctx,
      args.productionId,
      "version.create",
    );
    const existing = args.cardId ? await ctx.db.get(args.cardId) : null;
    if (
      args.cardId &&
      (!existing || existing.productionId !== args.productionId)
    )
      throw new ConvexError("Reference not found in this production");
    if (
      existing &&
      existing.createdBy !== userId &&
      !roleHas(member.role, "content.edit")
    )
      throw new ConvexError(
        "Only the creator or an editor can change this reference",
      );
    const title = args.title.trim();
    const notes = args.notes.trim();
    if (!title || title.length > 120)
      throw new ConvexError("Use a title of 1–120 characters");
    if (notes.length > 4000)
      throw new ConvexError("Keep reference notes under 4,000 characters");
    if (
      args.colors.length > 6 ||
      args.colors.some((c) => !/^#[0-9a-fA-F]{6}$/.test(c))
    )
      throw new ConvexError("Use up to six hex colors, such as #ff6b2c");
    const sourceUrl = args.sourceUrl?.trim() || undefined;
    if (sourceUrl) {
      let valid = false;
      try {
        const url = new URL(sourceUrl);
        valid =
          ["http:", "https:"].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          sourceUrl.length <= 2000;
      } catch {
        /* validated below */
      }
      if (!valid)
        throw new ConvexError(
          "Source must be an http or https URL without credentials",
        );
    }
    if (args.assetId) {
      const asset = await ctx.db.get(args.assetId);
      if (
        !asset ||
        asset.productionId !== args.productionId ||
        !asset.mimeType?.startsWith("image/")
      )
        throw new ConvexError("Choose an image from this production's library");
    }
    const data = {
      title,
      notes,
      category: args.category,
      assetId: args.assetId,
      sourceUrl,
      colors: args.colors,
      updatedAt: Date.now(),
    };
    const id = existing
      ? existing._id
      : await ctx.db.insert("referenceCards", {
          ...data,
          productionId: args.productionId,
          createdBy: userId,
          archived: false,
        });
    if (existing) await ctx.db.patch(id, data);
    await logActivity(ctx, {
      productionId: args.productionId,
      actorId: userId,
      type: existing ? "reference.updated" : "reference.created",
      targetType: "reference",
      targetId: id,
      summary: `${await actorName(ctx, userId)} ${existing ? "updated" : "added"} reference “${title}”`,
    });
    return id;
  },
});

export const setArchived = mutation({
  args: { cardId: v.id("referenceCards"), archived: v.boolean() },
  handler: async (ctx, { cardId, archived }) => {
    const card = await ctx.db.get(cardId);
    if (!card) throw new ConvexError("Reference not found");
    const { userId, member } = await assertCanForProduction(
      ctx,
      card.productionId,
      "version.create",
    );
    if (card.createdBy !== userId && !roleHas(member.role, "content.edit"))
      throw new ConvexError(
        "Only the creator or an editor can archive this reference",
      );
    if (card.archived === archived) return;
    await ctx.db.patch(cardId, { archived, updatedAt: Date.now() });
    await logActivity(ctx, {
      productionId: card.productionId,
      actorId: userId,
      type: archived ? "reference.archived" : "reference.restored",
      targetType: "reference",
      targetId: cardId,
      summary: `${await actorName(ctx, userId)} ${archived ? "archived" : "restored"} reference “${card.title}”`,
    });
  },
});
