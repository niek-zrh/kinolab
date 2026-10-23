import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * One-off data migrations, run by hand:
 *   npx convex run migrations:backfillVersionsCount '{}'
 *   npx convex run migrations:auditDanglingStorage '{}'
 *   npx convex run migrations:markDanglingAssetsMissing '{}'
 *
 * Against the self-hosted pilot backend: `convex run` has no --env-file, and
 * the CLI refuses .env.local's CONVEX_DEPLOYMENT next to the self-hosted
 * vars, so export those vars and blank CONVEX_DEPLOYMENT first (dotenv never
 * overrides a var already in the environment, and "" counts as unset):
 *   set -a; . ./.env.pilot.local; set +a; export CONVEX_DEPLOYMENT=
 *   npx convex run migrations:auditDanglingStorage '{}'
 *   npx convex run migrations:markDanglingAssetsMissing '{}'
 * Each call returns `{ done, cursor }`; while `done` is false, call again with
 * `'{"cursor":"<cursor>"}'`.
 *
 * Internal on purpose — nothing here should ever be reachable over HTTP.
 */

/**
 * `shots.versionsCount` was denormalised so shots.list stops reading every
 * version of every shot (that N+1 inside an unbounded collect is what made a
 * production unopenable past ~4k shots). Rows written before the field existed
 * read as 0 — visibly wrong on the Shots table, grid, Board and Review queue,
 * which all show an option count.
 *
 * Pages through the shots table in batches so one call can never approach
 * Convex's per-transaction read limit; re-run until it reports `done: true`.
 * Idempotent: a shot whose stored count already matches is left alone.
 */
export const backfillVersionsCount = internalMutation({
  args: { cursor: v.optional(v.string()), batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const batchSize = Math.min(Math.max(args.batchSize ?? 200, 1), 500);
    const page = await ctx.db
      .query("shots")
      .paginate({ cursor: args.cursor ?? null, numItems: batchSize });

    let patched = 0;
    for (const shot of page.page) {
      const versions = await ctx.db
        .query("versions")
        .withIndex("by_shot", (q) => q.eq("shotId", shot._id))
        .collect();
      if (shot.versionsCount === versions.length) continue;
      await ctx.db.patch(shot._id, { versionsCount: versions.length });
      patched += 1;
    }

    return {
      scanned: page.page.length,
      patched,
      done: page.isDone,
      // Feed this back in as `cursor` to continue.
      cursor: page.isDone ? null : page.continueCursor,
    };
  },
});

// ---------------------------------------------------------------------------
// Dangling file storage.
//
// The 2026-09-18 pilot reinstall was restored from a tables-only export (no
// --include-file-storage), so every `assets` row with provider "storage" kept
// its storageId / thumbStorageId while the `_storage` documents behind them
// were gone: ctx.storage.getUrl resolves them to null and the UI shows blank
// thumbnails with nothing to open. The audit below lists exactly which files
// testers must re-upload; the mutation flags the rows so the UI can say so.
// ---------------------------------------------------------------------------

/**
 * Page-size bounds for the storage audit. Each asset row costs the row itself
 * plus up to two `_storage` lookups (file + thumbnail), so at the cap the
 * worst case is 1,000 + 2,000 = 3,000 reads, under Convex's 4,096-document
 * ceiling (the same arithmetic MAX_LIST_ASSETS does for the Files page).
 */
const STORAGE_AUDIT_DEFAULT_BATCH = 200;
const STORAGE_AUDIT_MAX_BATCH = 1000;

function storageAuditBatchSize(requested: number | undefined): number {
  return Math.min(
    Math.max(requested ?? STORAGE_AUDIT_DEFAULT_BATCH, 1),
    STORAGE_AUDIT_MAX_BATCH,
  );
}

/** The two asset fields that point into the `_storage` system table. */
const STORAGE_FIELDS = ["storageId", "thumbStorageId"] as const;
type StorageField = (typeof STORAGE_FIELDS)[number];

/**
 * Per-call memo of `_storage` existence. Image uploads reuse the file as its
 * own thumbnail (versions.addFromUpload: `thumbStorageId ?? storageId`), so
 * without it every such row would look the same id up twice, and each
 * db.system.get counts against the read ceiling — the same trick as the URL
 * memo in assets.ts. The promise is cached, not the boolean, so two rows
 * sharing an id can never race two lookups.
 *
 * `ctx.db.system.get("_storage", id)` is the existence check: it returns the
 * file's metadata document, or null once the file is gone.
 */
type ExistsCache = Map<Id<"_storage">, Promise<boolean>>;

function storageExists(
  ctx: QueryCtx | MutationCtx,
  cache: ExistsCache,
  storageId: Id<"_storage">,
): Promise<boolean> {
  const cached = cache.get(storageId);
  if (cached !== undefined) return cached;
  const pending = ctx.db.system
    .get("_storage", storageId)
    .then((metadata) => metadata !== null);
  cache.set(storageId, pending);
  return pending;
}

/** One dangling reference; a row with both ids gone yields two of these. */
type DanglingRef = {
  assetId: Id<"assets">;
  productionId: Id<"productions">;
  shotId: Id<"shots"> | null;
  versionId: Id<"versions"> | null;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: Id<"users">;
  field: StorageField;
  storageId: Id<"_storage">;
};

/**
 * Read-only: lists every `assets` row whose storageId and/or thumbStorageId no
 * longer resolves in `_storage`, with enough context (production, shot,
 * version, name, uploader) to tell people what to re-upload. Checks every row
 * carrying either id regardless of provider — a "gdrive" row keeps its
 * storageId as thumbnail source after drive.mirrorUploadToHub, and a dead
 * thumbnail there is worth knowing about even though the file itself is fine.
 *
 * Pages through the assets table (default 200 rows, at most 1,000 per call);
 * re-run with the returned `cursor` until it reports `done: true`, and
 * concatenate `dangling` across calls.
 */
export const auditDanglingStorage = internalQuery({
  args: { cursor: v.optional(v.string()), batchSize: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{
    scanned: number;
    dangling: DanglingRef[];
    done: boolean;
    cursor: string | null;
  }> => {
    const batchSize = storageAuditBatchSize(args.batchSize);
    const page = await ctx.db
      .query("assets")
      .paginate({ cursor: args.cursor ?? null, numItems: batchSize });

    const exists: ExistsCache = new Map();
    const dangling: DanglingRef[] = [];
    for (const asset of page.page) {
      for (const field of STORAGE_FIELDS) {
        const storageId = asset[field];
        if (storageId === undefined) continue;
        if (await storageExists(ctx, exists, storageId)) continue;
        dangling.push({
          assetId: asset._id,
          productionId: asset.productionId,
          shotId: asset.shotId ?? null,
          versionId: asset.versionId ?? null,
          name: asset.name,
          mimeType: asset.mimeType ?? null,
          sizeBytes: asset.sizeBytes ?? null,
          uploadedBy: asset.uploadedBy,
          field,
          storageId,
        });
      }
    }

    return {
      scanned: page.page.length,
      dangling,
      done: page.isDone,
      // Feed this back in as `cursor` to continue.
      cursor: page.isDone ? null : page.continueCursor,
    };
  },
});

/**
 * Sets `missing: true` on every provider "storage" asset whose storageId no
 * longer resolves — the same flag drive.syncNow sets for a trashed Drive
 * file, so the UI needs no new state to show "file gone, re-upload". Only the
 * file itself counts: a dead thumbnail on an otherwise intact asset is
 * reported by the audit but does not make the asset missing.
 *
 * Never deletes a row. History is immutable by design: versions point at
 * their asset through primaryAssetId, shots through coverAssetId, and the
 * activity feed names the file — a deleted row would turn all of those into
 * dangling references of their own.
 *
 * Same pagination as the audit; re-run until `done: true`. Idempotent: rows
 * already flagged are skipped without a storage lookup. Like the other
 * migrations here it writes no activity row — there is no actor.
 */
export const markDanglingAssetsMissing = internalMutation({
  args: { cursor: v.optional(v.string()), batchSize: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{
    scanned: number;
    marked: number;
    done: boolean;
    cursor: string | null;
  }> => {
    const batchSize = storageAuditBatchSize(args.batchSize);
    const page = await ctx.db
      .query("assets")
      .paginate({ cursor: args.cursor ?? null, numItems: batchSize });

    const exists: ExistsCache = new Map();
    let marked = 0;
    for (const asset of page.page) {
      if (asset.provider !== "storage" || asset.storageId === undefined) {
        continue;
      }
      if (asset.missing === true) continue;
      if (await storageExists(ctx, exists, asset.storageId)) continue;
      await ctx.db.patch(asset._id, { missing: true });
      marked += 1;
    }

    return {
      scanned: page.page.length,
      marked,
      done: page.isDone,
      // Feed this back in as `cursor` to continue.
      cursor: page.isDone ? null : page.continueCursor,
    };
  },
});

/**
 * Operator: mark a user's email as verified so a Google sign-in with that
 * email links to the existing account instead of being refused
 * (convex/auth.ts refuses to link a verified Google identity to an
 * unverified password account, because the old password would stay usable).
 * Only for people the operator can vouch for — the pilot's allow-listed
 * testers — never on request from a stranger.
 *   npx convex run migrations:verifyUserEmail '{"email":"someone@studio.com"}'
 */
export const verifyUserEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const email = args.email.toLowerCase().trim();
    const matches = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .take(2);
    if (matches.length === 0) return `No user with the email ${email}`;
    if (matches.length > 1) return `Several users carry ${email} — resolve that first`;
    if (matches[0].emailVerificationTime) return `${email} is already verified`;
    await ctx.db.patch(matches[0]._id, { emailVerificationTime: Date.now() });
    return `Verified ${email}: Google sign-in with this address now links to the account`;
  },
});

/**
 * Operator: move an existing account to a different email — the address a
 * person's Google account uses — so "Continue with Google" lands in the
 * account they already have (studio, productions, history) instead of
 * creating a second one or being refused. The password credential keeps
 * its original address, so that sign-in keeps working too. Refuses when
 * another account already carries the new address.
 *   npx convex run migrations:relabelUserEmail '{"from":"old@x","to":"new@y"}'
 */
export const relabelUserEmail = internalMutation({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const from = args.from.toLowerCase().trim();
    const to = args.to.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return `${to} is not an email address`;
    const taken = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", to))
      .take(1);
    if (taken.length > 0) return `${to} already belongs to another account — resolve that first`;
    const matches = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", from))
      .take(2);
    if (matches.length === 0) return `No user with the email ${from}`;
    if (matches.length > 1) return `Several users carry ${from} — resolve that first`;
    await ctx.db.patch(matches[0]._id, { email: to, emailVerificationTime: Date.now() });
    return `${from} is now ${to} (verified): Google sign-in with ${to} lands in this account; the password still signs in as ${from}`;
  },
});
