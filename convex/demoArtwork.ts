import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { isLocalDeployment } from "./lib/authPolicy";

const ARTWORK = [
  {
    key: "array",
    title: "The array · scale and atmosphere",
    category: "location" as const,
    colors: ["#182c3a", "#6d8590", "#d4a36a"],
    notes:
      "Hold the horizon low. Let the dishes read as silhouettes; reserve warmth for the maintenance lights.",
  },
  {
    key: "control-room",
    title: "Signal room · practical light",
    category: "lighting" as const,
    colors: ["#15272a", "#87673d", "#ddac69"],
    notes:
      "Analog texture, cyan monitor spill, one warm practical. Keep instruments readable without lifting every shadow.",
  },
  {
    key: "rooftop",
    title: "Rooftops · night language",
    category: "look" as const,
    colors: ["#152c3e", "#42708c", "#c27c43"],
    notes:
      "Use wet surfaces to carry the orange-blue contrast. Silhouette the figure against the distant city.",
  },
];

/** Explicit local demo enhancement; never touches a deployed studio. */
export const run = internalAction({
  args: { baseUrl: v.string() },
  handler: async (ctx, { baseUrl }): Promise<string> => {
    if (!isLocalDeployment(process.env))
      throw new Error("Artwork seeding is local-only");
    const url = new URL(baseUrl);
    if (
      url.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.username ||
      url.password
    ) {
      throw new Error(
        "Use the local frontend origin, e.g. http://localhost:3000",
      );
    }
    const artwork: { key: string; storageId: Id<"_storage">; bytes: number }[] =
      [];
    try {
      for (const art of ARTWORK) {
        const response = await fetch(`${url.origin}/demo/${art.key}.jpg`, {
          redirect: "error",
        });
        if (
          !response.ok ||
          !response.headers.get("content-type")?.startsWith("image/jpeg")
        )
          throw new Error(
            `Cannot load demo ${art.key}.jpg; start the frontend first`,
          );
        const blob = await response.blob();
        if (blob.size > 2_000_000)
          throw new Error("Unexpected demo artwork size");
        artwork.push({
          key: art.key,
          storageId: await ctx.storage.store(blob),
          bytes: blob.size,
        });
      }
      const changed: boolean = await ctx.runMutation(
        internal.demoArtwork.install,
        { artwork },
      );
      if (changed)
        return "Installed illustrative demo frames and three reference cards. Character placeholders and real uploads were preserved.";
      for (const art of artwork) await ctx.storage.delete(art.storageId);
      return "Demo artwork is already installed; no data changed.";
    } catch (error) {
      for (const art of artwork) await ctx.storage.delete(art.storageId);
      throw error;
    }
  },
});

export const install = internalMutation({
  args: {
    artwork: v.array(
      v.object({
        key: v.string(),
        storageId: v.id("_storage"),
        bytes: v.number(),
      }),
    ),
  },
  handler: async (ctx, { artwork }) => {
    if (!isLocalDeployment(process.env))
      throw new Error("Artwork seeding is local-only");
    const studio = await ctx.db
      .query("studios")
      .withIndex("by_slug", (q) => q.eq("slug", "aurora-north"))
      .unique();
    if (!studio) throw new Error("Run seed:run first");
    const production = (
      await ctx.db
        .query("productions")
        .withIndex("by_studio", (q) => q.eq("studioId", studio._id))
        .collect()
    ).find((p) => p.code === "SGL");
    if (!production) throw new Error("SIGNAL LOST demo production not found");
    const assets = await ctx.db
      .query("assets")
      .withIndex("by_production", (q) => q.eq("productionId", production._id))
      .collect();
    if (assets.some((a) => a.name === "demo-reference-array.jpg")) return false;
    for (const art of ARTWORK) {
      const file = artwork.find((a) => a.key === art.key);
      if (!file) throw new Error(`Missing ${art.key} artwork`);
      const assetId = await ctx.db.insert("assets", {
        productionId: production._id,
        provider: "storage",
        kind: "file",
        name: `demo-reference-${art.key}.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: file.bytes,
        storageId: file.storageId,
        thumbStorageId: file.storageId,
        uploadedBy: studio.createdBy,
      });
      await ctx.db.insert("referenceCards", {
        productionId: production._id,
        title: art.title,
        category: art.category,
        notes: `${art.notes}\n\nAI-generated illustrative demo artwork, not footage from a real production.`,
        sourceUrl:
          "https://github.com/niek-zrh/kinolab/blob/main/docs/CREATIVE-ASSETS.md",
        colors: art.colors,
        assetId,
        createdBy: studio.createdBy,
        updatedAt: Date.now(),
        archived: false,
      });
    }
    // Exact seed filenames only; no user uploads or character concept assets.
    for (const asset of assets) {
      if (
        asset.mimeType !== "image/svg+xml" ||
        !/^SGL_EP0[12]_SC\d{3}_SH\d{3}_v\d+\.svg$/.test(asset.name)
      )
        continue;
      const key =
        asset.name.includes("SC010_SH0") && /SH0[12]0/.test(asset.name)
          ? "array"
          : "control-room";
      const file = artwork.find((a) => a.key === key)!;
      await ctx.db.patch(asset._id, {
        name: asset.name.replace(/\.svg$/, ".jpg"),
        mimeType: "image/jpeg",
        sizeBytes: file.bytes,
        storageId: file.storageId,
        thumbStorageId: file.storageId,
      });
      if (asset.versionId)
        await ctx.db.patch(asset.versionId, {
          note: "AI-generated illustrative demo artwork. Reused across sample versions; not distinct takes or approved production footage.",
          promptMeta: {
            tool: "OpenAI image generation",
            prompt: `See docs/CREATIVE-ASSETS.md: ${key}. Illustrative demo, reused across versions.`,
          },
        });
    }
    return true;
  },
});
