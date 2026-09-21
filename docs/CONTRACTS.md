# Backend contracts — Convex module surface

This is the binding contract between backend modules and the frontend. If you
are implementing a module, match these names and shapes exactly; note real
deviations at the end of your work. If you are building UI, this is the API
you call via `api.<module>.<fn>`.

Shared rules for every module (non-negotiable):

1. Every **mutation**: permission check → invariant checks → writes → exactly
   one `logActivity` row with a human-readable summary that includes the actor
   name (use `actorName(ctx, userId)` from `./lib/activity`), e.g.
   `"Anna picked v3 for SC010_SH020 — 'best hand anatomy'"`.
2. Every **query**: assert membership (`assertMember` / `assertMemberForProduction`
   from `./lib/permissions`). Never return Google tokens or `googleConnections`
   docs to clients — ever.
3. Convex validators (`v`) on all args; TypeScript strict; no `any`.
4. Use helpers from `convex/lib/`: `permissions.ts` (assertCan,
   assertCanForProduction, assertMember, assertMemberForProduction,
   canDecideGate, canDecideForShot, canEditShot, requireUserId),
   `activity.ts` (logActivity, actorName), `notify.ts` (notify, notifyMany),
   `domain.ts` (STAGES, SHOT_STATUSES, WORKING_STATUSES, canonicalApprovedName,
   HUB_FOLDERS; v2: ELEMENT_KINDS, ELEMENT_KIND_LABELS, SLOTS_BY_KIND,
   SLOT_LABELS, ELEMENT_CODE_PREFIX, RESERVED_CODE_PREFIXES, isReservedCode,
   deriveElementCode, isValidElementCode, slotShotCode, slotTitle,
   ELEMENT_SLOT_STAGE, the MAX_ELEMENT_* / MAX_LIST_ELEMENTS /
   MAX_BULK_ELEMENTS caps, DEFAULT_SHOT_PATTERN, SHOT_PATTERN_TOKENS,
   expandShotPattern, generateShotCodes, patternHasNumberToken,
   episodeToken). Shot rows are inserted ONLY through `createShotRow`
   exported from `convex/shots.ts` (see §shots.ts) — never a second
   `ctx.db.insert("shots", …)`; element rows and their slot shots ONLY through
   `insertElementWithSlots` exported from `convex/elements.ts` (used by
   `elements.create`, `elements.bulkCreate` and the seed).
5. Timestamps: `Date.now()`. Dates as `"YYYY-MM-DD"` strings in the
   production's timezone (`formatInTimeZone` from `date-fns-tz`).
6. Activity `type` values are dot-namespaced and FIXED (reports count on
   them): `production.created`, `production.updated`, `stage.status_changed`,
   `scene.created`, `scene.updated`, `scene.removed`, `shot.created`,
   `shot.status_changed`, `shot.stage_changed`, `shot.updated`,
   `shot.renamed`, `shot.removed`, `version.added`, `version.updated`,
   `version.shortlisted`, `version.rejected`, `version.unrejected`,
   `version.picked`, `version.moved` (SHOULD, with `versions.moveToShot`),
   `element.created`, `element.updated`, `element.removed`, `gate.requested`,
   `gate.approved`, `gate.rejected`, `comment.added`, `comment.resolved`, `comment.reopened`,
   `reference.created`, `reference.updated`, `reference.archived`, `reference.restored`,
   `asset.added`, `export.generated`, `report.published`, `qc.run_started`,
   `qc.run_passed`, `qc.run_failed`, `drive.hub_created`, `drive.synced`,
   `drive.approved_filed`, `drive.hub_owner_mismatch`.
   The daily report counts ONLY `version.added`, `version.picked`,
   `version.rejected`, `shot.status_changed` + `shot.stage_changed`,
   `comment.added`, `gate.approved` + `gate.rejected` — element slot work
   flows through those same types (a slot shot is a shot), so character
   options/picks land in the existing tiles; renames, edits and exports show
   in the day-activity list only.
7. Notification `type` values: `mention`, `approval_requested`,
   `gate_decided`, `version_picked`, `report_published`, `shot_assigned`.
   `href` is an app path like `/p/{productionId}/shots/{shotId}`. For an
   element slot shot (v2, `shot.elementId` set) the href stays
   `/p/{pid}/shots/{slotShotId}` — the shot page redirects
   (`router.replace`) to `/p/{pid}/characters/{elementId}?slot={slot}`, so
   notifications, ledger rows and history links never need to know about
   elements (`elementForShot` in elements.ts is the server-side lookup for
   the same mapping). The shot page's tabs are URL-addressable:
   `/p/{pid}/shots/{shotId}?tab=options|discussion|files|history` (any other
   value → options; the page writes `?tab=` on every tab change), and the
   character page honours `?slot=concept|animation` (default concept) —
   Board cards, notifications and the command palette can deep-link with
   these.

Enriched user shape used across returns:
`{ _id: Id<"users">, name: string, image?: string }` — call it `UserRef`.
Build with a local helper; `name` falls back to email then "Unknown".

---

## productions.ts

- `create` (mutation): `{ studioId, name: string, code: string, kind: "feature"|"episodic", episodeCount?: number, timezone?: string }` → `Id<"productions">`.
  Perm `production.manage`. code uppercased, 2–6 chars A–Z0–9. Creates 6
  stageInstances (from STAGES: stage 1 `active`, others `not_started`, gates
  `open`, `gateApproverIds: []`), episodes 1..episodeCount when episodic,
  timezone default "Europe/Zurich", status "active". Activity `production.created`.
- `listForStudio` (query): `{ studioId }` → productions with
  `{ ...production, shotCounts: { total: number, byStatus: Record<string, number> }, hubConnected: boolean, coverThumbUrl: string | null }`. **v1.5:** `coverThumbUrl` is the production's face on the home screen — the cover asset of the best-ranked DECIDED shot (delivered > final > approved > picked; a candidate nobody chose is not the film's face), resolved to a thumbnail URL. Chosen during the same bounded scan that produces `shotCounts`, so it costs no extra pass over the table: one `ctx.db.get` plus one `ctx.storage.getUrl` per production, and only when such a shot was found. Ties break on index order. `null` when the production has no decided shot with a cover, or the scan ceiling cut off before one. Never include `hub.connectionId` semantics beyond presence; folderIds are fine. v2: `shotCounts` skip element slot shots (`elementId` set) — characters are not shots.
- `get` (query): `{ productionId }` → `{ ...production, hubConnected: boolean, episodes: Doc<"episodes">[] }`.
- `update` (mutation): `{ productionId, name?, status?: "active"|"paused"|"wrapped", timezone? }`. Perm `production.manage`. Activity `shot.updated`-style summary under type `production.created`? No — use type `shot.updated`? No. Use `production.created`? No. **Use activity type `production.updated`** (add to the fixed list). 
- `listStages` (query): `{ productionId }` → stageInstances ordered by STAGES
  order, each enriched `{ ...stageInstance, label, short, approvers: UserRef[] }`.
- `setStageStatus` (mutation): `{ stageInstanceId, status: "not_started"|"active"|"blocked"|"done" }`.
  Permission: `canDecideGate(member, stageInstance, userId)` OR capability
  `production.manage`. Activity `shot.stage_changed`? **No — use `stage.status_changed`** (add to fixed list).
- `setGateApprovers` (mutation): `{ stageInstanceId, approverIds: Id<"users">[] }`. Perm `production.manage`. Verify each is a studio member. No activity row needed (config, not state) — exception to rule 1, documented here.

## episodes.ts

- `list` (query): `{ productionId }` → episodes ordered by number.
- `create` (mutation): `{ productionId, number, title? }` perm `production.manage`.
- `update` (mutation): `{ episodeId, title? }` perm `production.manage`.

## externalLinks.ts

- `list` (query): `{ productionId }` → links. Every member (viewer included) reads them.
- `add` (mutation): `{ productionId, kind: "figma"|"sheet"|"miro"|"telegram"|"other", title, url }` perm **`content.edit`** (v2 item e — was `production.manage`; a CD or supervisor can fix a wrong storyboard link; artist/viewer read only). Validate http(s) URL.
- `update` (mutation): `{ linkId, title?, url? }` perm `content.edit`.
- `remove` (mutation): `{ linkId }` perm `content.edit`.
(no activity rows for links — config, documented exception; SHOULD `production.updated` "changed link Storyboard (Figma)")

## scenes.ts

- `list` (query): `{ productionId, episodeId? }` → scenes ordered by `order` (at most `MAX_LIST_SCENES` = 500), each with `shotCount: number` and `shotCountCapped: boolean`. The count is **bounded, not exact**: per scene at most `SCENE_SHOT_COUNT_CAP` (50) shots are read (`by_scene` + `.take(50)`), under a per-call budget of `SCENE_SHOT_READ_BUDGET` (3,000) reads, so the worst case is 500 + 3,000 = 3,500 documents under the 4,096 ceiling; `shotCountCapped` is true when the scene's count saturated (at 50, or earlier once the budget ran out — a scene past the budget reads 0 / capped). Nothing on screen shows the number itself (the Shots page uses the rows for the scene filter); a caller that needs an exact count must count on its own index. Slot shots never carry a `sceneId`, so they are never counted here.
- `create` (mutation): `{ productionId, episodeId?, code, title?, figmaUrl?, description? }` perm `content.edit`. Order = max+1. **Scene codes are unique per production** (v2 item d): trimmed, uppercased, checked with one lookup on `scenes.by_production_code`; a duplicate is refused ("Scene code SC010 already exists in this production"). Nothing enforced this before — on restored old data with duplicates, readers that match by code take the first by `order` and log a warning.
- `update` (mutation): `{ sceneId, code?, title?, figmaUrl?, description?, order?, episodeId? }` perm `content.edit`. `code` (v2 item e): same normalisation + uniqueness as `create`; a scene code change does NOT rename the scene's shot codes (the sheet says so explicitly; SHOULD: opt-in cascade with preview). Activity `scene.updated` with the change list, e.g. "updated scene SC010 (code → SC015, title …)".
- `remove` (mutation): `{ sceneId }` perm `content.edit`; only when no shots reference it.

## shots.ts

Enriched shot shape `ShotCard`:
`{ ...shot, assignee: UserRef | null, scene: { _id, code, title? } | null, episode: { _id, number } | null, versionsCount: number, coverThumbUrl: string | null }`
(coverThumbUrl: coverAssetId → asset.thumbStorageId → `ctx.storage.getUrl`; else null)

v2 fields on `shot`: `elementId?: Id<"elements">` + `slot?: string` — set together on an element **slot shot** (see §elements.ts), never on an ordinary shot; `formerCodes?: string[]` — rename trail, oldest first (the heading shows "formerly {last}").

Reserved codes: an ordinary shot code may not start with `CH_`, `LOC_` or `SCR_` (`isReservedCode` / `RESERVED_CODE_PREFIXES` in lib/domain.ts). **The rule lives in `createShotRow`** (skipped only when `elementId` is set), so `create`, `bulkCreate` and `importRows` all refuse it through the one insert path ("CH_ codes are reserved for characters — create it under Characters"); `rename` checks it separately before its uniqueness lookup. Slot shots are the only rows with such codes.

- `createShotRow(ctx: MutationCtx, args)` — exported **helper, not a Convex function**: the single insert path for `create`, `importRows` and `elements.create` / `elements.bulkCreate`. `args: { productionId, studioId, code, title?, sceneId?, episodeId?, stage?, assigneeId?, dueDate?, elementId?, slot?, order? }` → `{ shotId, code }` (code trimmed + uppercased). Applies the code (≤ 64) / title (≤ 200) caps, the reserved-prefix rule (skipped when `elementId` is set), the `elementId` ⇔ `slot` pairing, "no scene/episode on a slot shot", scene / episode / assignee / due-date validation, the `by_production_code` uniqueness lookup and `order` (`args.order` from batch callers that read `lastOrder` once and count up, else max+1). Status "planned", stage default "production" (`ELEMENT_SLOT_STAGE` = "preproduction" for slot shots), versionsCount 0. Writes NO activity row — the calling mutation logs its own (rule 1). `studioId` is the production's studio from `assertCanForProduction`, passed in so the assignee membership check costs no extra read.
- `list` (query): `{ productionId, status?, stage?, sceneId?, assigneeId?, episodeId?, elements?: "exclude"|"only"|"all" }` → `ShotCard[]` ordered by `order`. All filters optional & combinable, applied while streaming the index (never a full `.collect()` — a production past ~4k shots used to blow Convex's 4,096-document read limit and take the Shots page, Board and Overview down with it). Caps at `MAX_LIST_SHOTS` (1000); the Shots page says so when it hits the cap. `versionsCount` is read from the denormalised field on the shot, never by counting versions. `elements` (v2): default `"exclude"` drops slot shots (`elementId` set) while streaming, so the Shots page, Board, Overview and every existing caller never see characters; `"only"` returns just slot shots (Review queue "Characters" group); `"all"` both. The cap counts returned rows. Rows are plain `ShotCard`s — **no `pickedVersionIndex`** (only `get` resolves the picked version); the Board's Picked chip therefore reads "✓ Review" until this query grows an additive `pickedVersionIndex: number | null` (one cached `ctx.db.get(pickedVersionId)` per picked shot, as `get` does — requested by the Board, not yet built).
- `counts` (query, NEW v1.2): `{ productionId }` → `{ total: number, reviewQueue: number }`. Backs the production rail's badges, which mount on EVERY production page — so it deliberately skips `ShotCard` enrichment entirely (no `ctx.storage.getUrl` per cover asset, no assignee / scene / episode reads); it streams `by_production` and counts. `total` = non-element shots whose status is not `killed`. `reviewQueue` is composed exactly as the Review page composes its two groups — non-element shots with status `options_ready` or `in_review`, PLUS element slot shots with `versionsCount > 0` whose status is outside picked / approved / final / delivered / killed — so the badge and the page it links to can never disagree. Scans at most `MAX_LIST_SHOTS` (1000) rows, the same ceiling `list` uses. Perm: membership (`assertMemberForProduction`).
- `get` (query): `{ shotId }` → `ShotCard & { production: { _id, name, code, timezone }, pickedVersionIndex: number | null, driveFolderId?: string }` (`elementId` / `slot` / `formerCodes` come through on the shot when set; the shot page redirects a slot shot to `/p/{pid}/characters/{elementId}?slot={slot}`).
- `create` (mutation): `{ productionId, code, title?, sceneId?, episodeId?, stage?, assigneeId?, dueDate? }` perm `content.edit`. Calls `createShotRow`: unique code per production, default stage "production", status "planned", order max+1, reserved prefixes refused. Activity `shot.created`.
- `importRows` (mutation, v2 item d — THE batch path): `{ productionId, rows: { code, title?, sceneCode?, episodeNumber?, assigneeId?, dueDate? }[] (≤ 500), defaults?: { sceneId?, episodeId?, stage?, assigneeId?, dueDate? }, scenesToCreate?: { code, title?, episodeId? }[] (≤ 100), createMissingScenes: boolean }` → `{ created: number, skipped: string[], invalid: { code: string, reason: string }[], scenesCreated: string[], sceneId?: Id<"scenes"> }` (`sceneId` set when exactly one scene is involved, for the `/shots?scene=` redirect). Perm `content.edit`. Trims, uppercases, dedupes (a duplicate inside the paste → `skipped`); codes already in the production → `skipped`, never an error; per-row problems (reserved prefix, > 64 chars, chars outside A–Z 0–9 _ -, title > 200, unknown episode / assignee, bad date) → `invalid`; a row's `sceneCode` is matched on `scenes.by_production_code` (an existing scene under another episode is used as is), created when `createMissingScenes`, else `invalid`; rows without `sceneCode` take `defaults`. Structural errors throw (> 500 rows, > 100 scenes, bad production). Reads `lastOrder` once and counts up through `createShotRow`. ONE activity row `shot.created` ("Anna created scene SC010 and 10 shots" / "Anna created 42 shots", `data: { skipped, invalid, scenesCreated }`), one aggregated `shot_assigned` notification per assignee. Two concurrent imports of the same codes: the second reports them skipped.
- `bulkCreate` (mutation) — **DEPRECATED** in v2, kept one release as an alias of `importRows` for callers still passing `{ productionId, codes: string[], sceneId?, episodeId? }` → `{ created: number, skipped: string[] }`; removed after v1.1. Same caps (500 codes, code ≤ 64) and the reserved-prefix rule; ONE activity row. It keeps the OLD failure contract: where `importRows` reports per-row problems in `invalid`, `bulkCreate` **throws a `ConvexError` with the first invalid row's reason** and the transaction rolls back, so a bad code means nothing is written (`createMissingScenes` is false; blank lines are dropped before the call).
- `rename` (mutation, v2 item e): `{ shotId, code }` → `string` (the **normalised** code, so the client can show it without re-normalising; returned unchanged on a no-op). Perm `content.edit` — never the assigned artist. New code normalised (trim, uppercase, ≤ 64) and unique per production (`by_production_code`, "Shot code X already exists in this production"); refused on element slot shots ("This is a character slot — rename the character instead"), on `delivered` shots ("Delivered shots can't be renamed"), and on reserved prefixes; a no-op when unchanged. Patches `code` and appends the old code to `formerCodes`. Activity `shot.renamed` ("Anna renamed SC010_SH020 → SC010_SH025", `data: { from, to }`). No notification. Drive folders and already-filed Approved files are NOT renamed (Drive dormant; rename job parked); the ledger targetLabel, search and the Review Room header read the live code; future picks use the new canonical name.
- `remove` (mutation): `{ shotId }` perm `content.edit`; refuses when the shot has versions or a pick (mirrors `scenes.remove`). Deletes the shot's dangling comments/assets, never its activity rows (reports count on them). ONE activity row. `elements.remove` deletes slot shots through the same rules.
- `bulkRemove` (mutation): `{ shotIds: Id<"shots">[] }` (max 500) — same per-shot safety rule, so a mis-paste can actually be undone.
- `update` (mutation): `{ shotId, title?, sceneId?: Id<"scenes"> | null, assigneeId?, dueDate?: string | null, order?, episodeId?: Id<"episodes"> | null }`. Permission `canEditShot`. v2: `sceneId` / `episodeId` / `dueDate` accept **`null` to clear** (omit = unchanged, id/string = set; "scene cleared" / "episode cleared" / "due date cleared" in the summary). Choosing a scene sets `episodeId` **server-side from the scene** unless the same call names an episode (so the shot-header SceneSelect needs no second call); a scene must belong to the shot's production. Refuses `sceneId` / `episodeId` on a slot shot ("Character slots don't belong to a scene or episode"). `assigneeId` has no `null` — a shot cannot be unassigned (known gap; the Board and the Shots table offer no "Unassign"). SHOULD `elementIds?: Id<"elements">[]` (characters appearing in the shot; each must belong to the production). Activity `shot.updated` (summarize what changed, e.g. "scene → SC020, episode → EP02"); returns without a row when nothing changed. If assignee changed → notify new assignee (`shot_assigned`).
- `setStatus` (mutation): `{ shotId, status }`. Permission `canEditShot(member, shot, userId, status)`. Invariants (spec §6): → `approved` requires `pickedVersionId`; → `delivered` requires the production's delivery stageInstance gateStatus !== "rejected". Activity `shot.status_changed` ("Anna moved SC010_SH020 to In review"). Works on slot shots unchanged (the character page uses it).
- `setStage` (mutation): `{ shotId, stage }`. Perm `content.edit`. Activity `shot.stage_changed`. Slot shots never reach the Board (excluded by `list`), so they stay in Pre-Production.

## versions.ts

Enriched `VersionCard`:
`{ ...version, asset: (Doc<"assets"> & { thumbUrl: string | null, fileUrl: string | null }) | null, createdByUser: UserRef, decidedByUser: UserRef | null }`
(fileUrl only for provider "storage" via storage.getUrl; gdrive uses webViewLink)

- `listForShot` (query): `{ shotId }` → `VersionCard[]` ordered by index.
- `createWithAsset` (**internalMutation** — used by uploads and Drive):
  `{ shotId, createdBy: Id<"users">, asset: { provider: "storage"|"gdrive"|"url", storageId?, driveFileId?, driveParentId?, name, mimeType?, sizeBytes?, md5?, webViewLink?, url?, thumbStorageId?, ownerConnectionId? }, promptMeta?, note? }`
  → `{ versionId, index }`. Computes index = max+1 per shot. Creates asset row
  (productionId from shot, shotId, versionId back-patched, uploadedBy) then
  version (status "candidate", primaryAssetId). Sets shot.coverAssetId if
  unset. Auto-moves shot planned/generating → options_ready (activity
  `shot.status_changed` by createdBy). Activity `version.added`.
- `generateUploadUrl` (mutation): `{ productionId }` → string. Perm `version.create`.
- `addFromUpload` (mutation): `{ shotId, storageId: Id<"_storage">, name, mimeType?, sizeBytes?, promptMeta?, note?, thumbStorageId? }` → `{ versionId, index }`. Perm `version.create` + calls the same code path as `createWithAsset` (thumbStorageId = the caller's downscaled thumbnail when supplied — the upload dropzone makes one in-browser — else storageId when mimeType starts with "image/"). If the production has a connected hub, ALSO schedule `internal.drive.mirrorUploadToHub` with the new versionId (runAfter 0) — guard with try/catch so absence never breaks upload.
- `shortlist` (mutation): `{ versionId }` → toggles candidate↔shortlisted. Permission `canDecideForShot`. Activity `version.shortlisted`.
- `reject` (mutation): `{ versionId, note? }`. Permission `canDecideForShot`. Sets rejected + decidedBy/At/decisionNote. Activity `version.rejected`.
- `unreject` (mutation): `{ versionId }` → back to candidate (only if shot not picked with this superseded). Permission `canDecideForShot`.
- `pick` (mutation): `{ versionId, note? }`. Permission `canDecideForShot`.
  Invariants: exactly one picked per shot — sets this version `picked`
  (decidedBy/At/decisionNote=note), all sibling candidate/shortlisted →
  `rejected` with decisionNote `"superseded by v{n}"`; shot.pickedVersionId set,
  shot.status → "picked" ; approvals row `{ scope: "version", targetId: versionId, requestedBy: userId, approverId: userId, status: "approved", decidedAt, note }`.
  Activity `version.picked` (include note in summary when present). Notify
  shot assignee + version creator (`version_picked`). If hub connected,
  schedule `internal.drive.copyPickToApproved({ versionId })` (try/catch guard).
- `updateMeta` (mutation): `{ versionId, promptMeta?: { tool?, model?, prompt?, seed?, params? }, note? }`. Creator or `content.edit` (artist: own uploads only; viewer never). v2 caps (ConvexError): `prompt` ≤ 20,000, `params` ≤ 20,000, `tool` / `model` / `seed` ≤ 200, `note` ≤ 2,000. The UI (`components/app/generation-details-dialog.tsx`, opened by "Edit details" on the Options tab card and in the Review Room rail; `canEditGenerationDetails({ role, viewerId, createdBy })` is the shared client predicate) sends `params` too and toasts "Details saved". A call with neither `promptMeta` nor `note`, or with nothing actually changed, writes nothing. Activity `version.updated` (summary names the fields changed). SHOULD (not built): `promptMetaUpdatedAt`, `promptMetaUpdatedBy` on the version ("edited by X · 3 min ago").
- SHOULD `moveToShot` (mutation): `{ versionId, shotId }` creator or `content.edit`; never a picked/rejected version; the target shot must be in the same production; new index = max+1 on the target; patches `asset.shotId`, `versionsCount` on both shots and `coverAssetId` fix-ups on both. Activity `version.moved`.

## elements.ts (NEW, v2 item b)

Pre-production elements — characters now; `kind` "location" / "script" are accepted by the schema and have no UI yet. Each element owns one **slot shot** per `SLOTS_BY_KIND[kind]` (character: `concept`, `animation`): a `shots` row with `elementId` + `slot`, code `slotShotCode(kind, code, slot)` = `CH_{CODE}_{SLOT}`, stage `preproduction`, status "planned", title `slotTitle(name, slot)` = "{name} — Concept", no scene/episode, inserted via `createShotRow`. Everything version-shaped (upload, Options, shortlist / reject / pick with the one-pick invariant, Review Room, comments, history, ledger, notifications, daily report) works on the slot shot unchanged.

Enriched `ElementRow`:
`{ ...element, slots: { slot: string, shotId: Id<"shots">, status: ShotStatusKey, versionsCount: number, pickedVersionIndex: number | null, coverThumbUrl: string | null, pickedThumbUrl: string | null, pickedFileUrl: string | null, latestPrompt: string | null }[] }`
Slots come in `SLOTS_BY_KIND` order (a slot whose shot is missing is left out). Per slot, the picked state wins: **once the slot has a pick, `coverThumbUrl` is `null`** and `pickedThumbUrl` / `pickedFileUrl` (thumb + file URL of the picked version's asset, per provider like `versions.enrichAsset`) carry the picture, and `latestPrompt` is the picked version's `promptMeta.prompt`; without a pick, `coverThumbUrl` is the cover asset's thumbnail (the first option), `pickedThumbUrl` / `pickedFileUrl` are `null`, and `latestPrompt` is the newest version's prompt (`by_shot` desc) — `null` when there are no versions or no prompt. `versionsCount` is the denormalised field on the slot shot. The list renders `pickedThumbUrl ?? coverThumbUrl`; "Final › Open" uses `pickedFileUrl` (disabled while null).

Exported helpers (TypeScript exports, not Convex functions): `insertElementWithSlots(ctx, { productionId, studioId, kind, name, code, description?, basePrompt?, order, createdBy, firstShotOrder })` → `{ elementId, slots: { slot, shotId, code }[] }` — the single insert path for an element and its slot shots (inputs already validated, code known free, NO activity row); `elementForShot(ctx, shotId)` → `{ elementId, slot } | null` — the slot-shot → character-page mapping behind the redirect in rule 7.

- `list` (query): `{ productionId, kind }` → `ElementRow[]` by `order`. Membership. Streams the `elements.by_production_kind_code` prefix (only that kind is read) and stops at `MAX_LIST_ELEMENTS` (300 — an enriched row costs the element, its slot shots and ≤ 4 reads per slot, which stays under the 4,096 ceiling; separate from the 1000-shot cap). At the cap the first 300 in index (code) order come back, sorted by `order`; the Characters page shows "(first 300)".
- `get` (query): `{ elementId }` → `ElementRow & { production: { _id, name, code, timezone } }`. Membership (cross-studio → PermissionError).
- `create` (mutation): `{ productionId, kind, name (≤ 120), code? (A–Z0–9_, ≤ 32), description? (≤ 2000), basePrompt? (≤ 4000) }` → `Id<"elements">`. Perm `content.edit`. Code = the given one (validated with `isValidElementCode`) else `deriveElementCode(name)`; an empty derivation (Cyrillic-only name) → "Code is required — codes use A–Z, 0–9 and _". Unique per production + kind via `elements.by_production_kind_code` ("Character code PAPA already exists"); duplicate names allowed. order = max+1. Creates the element, then one slot shot per `SLOTS_BY_KIND[kind]` through `createShotRow` (`studioId` from the production, `elementId`, `slot`, `order` counted up from one `lastOrder` read). ONE activity row `element.created` ("Anna created character Pushistik"), targetType "element".
- `bulkCreate` (mutation): `{ productionId, kind, names: string[] (≤ 200) }` → `{ created: number, skipped: string[] }`. Perm `content.edit`. Trims, drops blanks, derives codes; a code collision (inside the batch or in the table) gets `_2`, `_3`… (kept within 32 chars); names with an empty derivation (Cyrillic-only) come back in `skipped` so the person can add them one at a time with a typed code. Slot shots' `order` counts up from one `lastOrder` read. ONE activity row `element.created` ("Anna created 5 characters").
- `update` (mutation): `{ elementId, name?, code?, description?, basePrompt?, order? }` perm `content.edit`. Same caps and code rules. A `code` change renames EVERY slot shot's code in the same transaction (`slotShotCode` with the new code, uniqueness per slot on `shots.by_production_code`, the old code appended to that shot's `formerCodes`); a `name` change re-titles the slot shots (`slotTitle`). Activity `element.updated` with the change list ("updated character Pushistik (code → PUSHISTIK_JR, formerly CH_PUSHISTIK_CONCEPT; base prompt)").
- `remove` (mutation): `{ elementId }` perm `content.edit`. Refused when any slot shot has versions or a recorded pick ("This character has options — remove them first"); otherwise deletes the slot shots via the `shots.remove` rules (`removeShotIfSafe`: dangling comments/assets removed, activity rows kept), then the element. Deleting twice is not an error (an already-gone id returns null). Activity `element.removed` (`data: { kind, code, slotShots }`).

Permissions: create / update / remove / bulkCreate = `content.edit` (owner, producer, CD, supervisor). Artist: upload options to any slot (`version.create`), comment, change a slot's status / assignee / due only when assigned (`canEditShot`); never create, rename or delete. Decide (shortlist / reject / pick) = `canDecideForShot` on the slot shot (supervisor: when gate approver of Pre-Production, the slot's stage). Viewer: read + comment.

UI contract (v1.1, for tests and other pages): `/p/{pid}/characters` mirrors the tester's Heroes sheet — № | Name (+ mono code) | Concept | Animation | Prompt (base prompt, inline edit, copy) | Final ("Open" → `pickedFileUrl` of the latest picked phase) | row menu (`{name} menu`: Rename…, Edit prompt…, Open in Review Room — first phase with options, else Concept —, Delete). Header "Characters · N" with "(first 300)" at the cap; "New character" (hotkey N on this page) and "Paste names" (textarea `Character names`). **Delete lives in the list row menu only** — the detail page has none, because removing an element while `elements.get` is subscribed would throw into the error boundary before the navigation away. `/p/{pid}/characters/{elementId}` shows ONE phase at a time behind a Concept | Animation switcher (`role=group` "Phase", `aria-pressed` buttons, driven by `?slot=`) with the shot page's Status / Assignee / Due controls and Options | Discussion | Files | History tabs for that phase's slot shot, plus "Open in Review Room"; the switcher shows every phase's status, option count and pick at a glance. Review queue: the "Characters" group = slot shots (`elements: "only"`) with `versionsCount > 0` whose status is not picked / approved / final / delivered / killed — "options present, not yet decided"; character picks also appear in "Decided today"; the shots group gets a "Shots" heading only when both groups render. The Review Room works on a slot shot unchanged (header shows the `CH_…` code).

Exclusions elsewhere: `shots.list` default `elements: "exclude"`; `productions.listForStudio` shot counts and `search.global` shots skip rows with `elementId` (SHOULD: search returns a `characters` group instead); the Board never shows slot rows; `shots.update` refuses scene / episode on them; `shots.rename` refuses them ("rename the character instead"). `drive.copyPickToApproved` is unchanged — known gap: with a hub connected, slot picks would file under Shots/ (parked, Drive dormant).

## exports.ts (NEW, v2 item c)

- `provenanceRows` (query): `{ productionId, cursor?: string | null, numItems?: number (1–400, default 400; anything else → ConvexError) }` → `{ rows: ProvenanceRow[], cursor: string | null, done: boolean, columns: string[] }`. Perm `production.manage`. `columns` is **additive**: the CSV header in spec order (`PROVENANCE_COLUMNS`), sent because Convex sorts object keys on the wire and the client must not import the server module — the client writes the header from it and reads each row's cells in that order. `cursor` is **`null` exactly when `done` is true**; feed it back until then. `done` is settled server-side with one small look-ahead (`.paginate` alone would return a trailing empty page), so a table of 6 rows read 2 at a time ends after 3 pages. Paginates `versions.by_production` with `.order("desc")` (newest first) through Convex `.paginate`; one row per version across shots AND element slots, rejected / superseded included; per row ≤ 6 memoised reads (version + shot + element + asset + creator + decider) plus the version's own activity trail (newest-first, stops at the first `version.updated`), so 400 rows per call stays under the read ceiling — a pathological trail fails the page loudly rather than blanking `details_last_edited_*`, and the client retries with a smaller `numItems`. An unusable production timezone is refused with a plain message ("… has an invalid timezone … Fix it in production settings before exporting") rather than blank local times. Every value is a string. `ProvenanceRow` keys, in column order: `studio_name, production_code, production_name, target_type ("shot" | "character" | "location"), target_code, target_title, slot, scene_code, episode ("EP01" or ""), version ("3"), version_id, version_status (candidate | shortlisted | picked | rejected), created_at (ISO 8601 UTC), created_at_local (production tz "YYYY-MM-DD HH:mm"), created_by_name, created_by_email, tool, model, prompt, seed, params, note, file_name, file_mime, file_size_bytes, file_md5, file_provider (storage | gdrive | url | ""), file_location (Drive webViewLink | "app storage:{storageId}" | url), file_missing ("true" | "false"), approved_file_name (`canonicalApprovedName` when picked, e.g. SGL_EP01_SC010_SH020_v3.png), decision (picked | rejected | ""), decided_at (ISO), decided_by_name, decided_by_email, decision_note, details_last_edited_at, details_last_edited_by` — the last two from the newest `version.updated` activity row for the version (`activity.by_target`), else "". A version without an asset → every `file_*` "" and `file_missing` "true". Storage-provider rows expose only the Convex storageId (the S3 object key is invisible to app code — README note). An empty production → `rows: [], done: true` (header-only file).
- `logProvenanceExport` (mutation): `{ productionId, rowCount: number }` → `null`, perm `production.manage`; `rowCount` must be a whole number ≥ 0. Activity `export.generated` ("Niek exported provenance (312 rows)" / "(1 row)"), targetType "production", `data: { rowCount }`. Called by the client once the download starts. No notification.

Client side — `lib/csv.ts` (shared with the ledger export and the New shots › Import tab): `toCsv(rows, { verbatim: true, newline: "\r\n" })` quotes every cell and applies NO formula-lead guard (the file is evidence, not a spreadsheet), `withBom`; filename `{CODE}_provenance_{YYYY-MM-DD}.csv` (date in the production timezone); progress toast while paginating. The button is `Export provenance (CSV)` in the Decisions ledger toolbar beside "Export CSV" (`decisions/_components/provenance-export.tsx`; renders nothing for roles without `production.manage`). The ledger export keeps the guard (`toCsv` defaults). `parseDelimited(text)` is the Import tab's RFC 4180 parser (auto-detects tab / comma / semicolon, tolerates CRLF and BOM). SHOULD (not built): JSON download of the same rows; the Settings › Details link to the export.

## assets.ts

- `listForProduction` (query): `{ productionId, unassignedOnly?: boolean, q?: string }` → assets enriched `{ thumbUrl, fileUrl }`, newest first. `unassignedOnly`: no shotId and no versionId and kind "file".
- `listForShot` (query): `{ shotId }` → enriched assets.
- `attachToShot` (mutation): `{ assetId, shotId, asVersion: boolean }`. Perm `version.create`. Patches asset.shotId; when asVersion, creates a version around the existing asset via the same internal path (do NOT duplicate index logic). Activity `version.added` or `shot.updated`.
- `addLink` (mutation): `{ productionId, shotId?, url, name }` provider "url", kind "link". Perm `version.create`.
- `getUploadUrl` — DO NOT create here; it lives in versions.generateUploadUrl.

## approvals.ts

- `requestGateSignoff` (mutation): `{ stageInstanceId }`. Perm: any member with
  `content.edit` OR `production.manage`. Reopening a completed stage resets its
  status to "active" (see the invariant under `decideGate`). Requires `gateApproverIds` non-empty
  (error "Set gate approvers in production settings first"). Sets gateStatus
  "requested"; creates one pending approvals row per approver
  `{ scope: "stage_gate", targetId: stageInstanceId }` (skip existing
  pending); notifies approvers (`approval_requested`). Activity `gate.requested`.
- `decideGate` (mutation): `{ stageInstanceId, decision: "approved"|"rejected", note?: string }`.
  Note REQUIRED when rejecting. Permission `canDecideGate`. Refuses when the
  gate was already decided (a fresh `requestGateSignoff` reopens it). Patches
  stageInstance (gateStatus, gateDecidedBy/At/Note); approve → stage status
  "done". INVARIANT: a stage reads "done" only while its gate is `approved` —
  a rejection, or a fresh sign-off request, takes a completed stage back to
  "active". Updates this approver's pending row (or inserts a decided row if
  none) and resolves all other pending rows for the target with the same
  decision + note "decided by {name}". Activity `gate.approved`/`gate.rejected`.
  Notify the members who requested + production producers (`gate_decided`).
- `myPending` (query): `{}` → pending approvals for me across studios, enriched:
  `{ ...approval, productionName, targetLabel: string, href: string }`
  (stage gate → "Gate: Previews & Review — SIGNAL LOST", href to board; delivery → QC run name, href to /qc).
- `ledger` (query): `{ productionId, scope? }` → decided + pending approvals
  newest first, enriched `{ requestedByUser: UserRef, approverUser: UserRef, targetLabel, href }`.

## references.ts (1.6)

- `list` (query): `{ productionId, archived?: boolean }` → `{ cards, capped }`. Membership required. Newest 300 cards in the selected archive state, with an enriched image `asset` (or null); `capped` indicates omitted rows.
- `save` (mutation): `{ productionId, cardId?, title, notes, category, assetId?, sourceUrl?, colors }` → card ID. `category` is `look | character | location | costume | lighting`. Permission `version.create`; updates also require creator ownership or `content.edit`. The image must belong to this production. Title 1–120 characters, notes at most 4,000, up to six `#RRGGBB` colors, source URL at most 2,000 characters and HTTP(S) without credentials. Activity `reference.created` / `reference.updated`.
- `setArchived` (mutation): `{ cardId, archived: boolean }`. Same creator/editor rule and `version.create`. Idempotent; archives/restores the card without deleting source media. Activity `reference.archived` / `reference.restored`.

## comments.ts

- `list` (query): `{ targetType, targetId }` → newest 500 comments, ordered oldest first within that window, enriched `{ author: UserRef, mentionUsers: UserRef[] }`. Membership required for the target production.
- `add` (mutation): `{ productionId, targetType, targetId, body, mentions: Id<"users">[], hrefHint?, timeSeconds? }`. Perm `comment.create`. Target must exist in this production. Body 1–8,000 characters; at most 50 mentions (only current studio members retained). `timeSeconds` is optional elapsed playback time (finite 0–86,400), only for a version with a video primary asset; it is not SMPTE timecode. Notify mentions; `hrefHint` is accepted only inside the current production path. Activity `comment.added`.
- `resolve` (mutation): `{ commentId, resolved?: boolean }`. Author or `content.edit`. Defaults to true for compatibility; false reopens. Idempotent and preserves body/timestamp. Activity `comment.resolved` / `comment.reopened`.

## activity.ts (NEW top-level module `convex/activity.ts` — the helper stays at `convex/lib/activity.ts`)

- `feed` (query): `{ productionId, types?: string[], actorId?, limit? (default 50), beforeTs? }` → rows newest first enriched `{ actor: UserRef }`.

## notifications.ts

- `list` (query): `{ limit? }` → mine newest first, with `productionName?`.
- `unreadCount` (query): `{}` → number (cap display at 99).
- `markRead` (mutation): `{ notificationId }` (mine only).
- `markAllRead` (mutation): `{}`.

## search.ts

- `global` (query): `{ q: string }` → across my studios:
  `{ shots: { _id, code, title?, productionId, productionName }[], scenes: {...}[], productions: { _id, name, code }[], assets: { _id, name, productionId, productionName, shotId? }[] }`
  Case-insensitive substring, cap 8 per group, empty q → empty groups. v2: the `shots` group skips element slot shots (`elementId` set) and matches the live code (a renamed shot is found by its new code only). SHOULD: a `characters` group `{ _id, name, code, productionId, productionName }[]` (name / code, cap 8) for the command palette.

## reports.ts

- `generateForDate` (**internalMutation**): `{ productionId, date: string }` —
  idempotent upsert. Stats from activity rows in the production-tz day window:
  versionsAdded (`version.added`), picks (`version.picked`), rejections
  (`version.rejected`), shotsMoved (`shot.status_changed` + `shot.stage_changed`),
  commentsAdded (`comment.added`), gatesDecided (`gate.approved` + `gate.rejected`).
  Highlights: up to 10 summaries, picks & gates first, then rest newest-first.
- `cronTick` (**internalMutation**): `{}` — for every active production whose
  local time is >= 18:00, ensure today's report exists (generate once; skip if
  a report for today already exists). Keep it idempotent — it runs hourly.
- `generateNow` (mutation): `{ productionId }` → regenerates today (perm `report.publish`).
- `publish` (mutation): `{ reportId }` (perm `report.publish`) — sets
  publishedBy, notifies all studio members (`report_published`). Activity `report.published`. A published report is frozen: `generateForDate` must skip published reports.
- `list` (query): `{ productionId }` → reports newest first.
- `get` (query): `{ reportId }` → `{ ...report, dayActivity: (activity & { actor: UserRef })[] }` (that tz-day's window, oldest first).

## qc.ts

- `listParameters` (query): `{ studioId, includeArchived? }` → ordered by `order`.
- `addParameter` (mutation): `{ studioId, category, name, spec, tolerance?, required }` perm `studio.manage`. order = max+1.
- `updateParameter` (mutation): `{ parameterId, name?, spec?, tolerance?, required?, order?, archived? }` perm `studio.manage`.
- `seedDefaultTemplate` (mutation): `{ studioId }` perm `studio.manage`, idempotent (skips if any parameters exist). Seeds the §12 list (~26 params) with category + required=true except noted.
- `createRun` (mutation): `{ productionId, name, masterAssetId? }` perm `qc.run` → creates run `in_progress` + pending qcChecks for all non-archived params. Activity `qc.run_started`.
- `listRuns` (query): `{ productionId }` → runs newest first with `{ progress: { done, total }, startedByUser: UserRef }`.
- `getRun` (query): `{ qcRunId }` → `{ ...run, master: asset | null, checks: (qcCheck & { parameter: Doc<"qcParameters">, checkedByUser: UserRef | null })[] }` grouped client-side.
- `setCheck` (mutation): `{ checkId, result: "pending"|"pass"|"fail"|"na", measured?, note? }` perm `qc.run`. Recomputes run status: any required fail → `failed`; all required pass → `passed`; else `in_progress`. On transition to terminal status: completedAt, activity `qc.run_passed`/`qc.run_failed`, approvals row `{ scope: "delivery", targetId: qcRunId, status: passed ? "approved" : "rejected", requestedBy: run.startedBy, approverId: userId, decidedAt, note: run.name }`, notify run starter. Transition back out of terminal clears completedAt (corrections happen as new decisions — leave old approval rows, add new one on next terminal transition).

## drive.ts + lib/google.ts (REST via fetch, no googleapis dep)

lib/google.ts internals (not exported to clients): `getFreshToken(ctx, connectionId)` (refresh when expiresAt < now+60s via oauth2.googleapis.com/token, persist via internal mutation, `invalid_grant` → mark revoked + throw), `driveRequest(token, path, init?, query?)` always appending `supportsAllDrives=true` (+`includeItemsFromAllDrives=true` on list), helpers: createFolder, list, copy, multipartUpload, permissionCreate, getFileBytes, aboutUser.

drive.ts exports:
- `connectionStatus` (query): `{ productionId? }` → `{ myConnection: { email: string, revoked: boolean } | null, hub: { connected: boolean, rootFolderId?: string, ownerEmail?: string, revoked?: boolean } }`. NO tokens.
- `beginConnect` (mutation): `{ returnTo: string }` → `{ url: string }` — builds consent URL (client GOOGLE_DRIVE_CLIENT_ID, redirect `{CONVEX_SITE_URL}/google/drive/callback`, scope `https://www.googleapis.com/auth/drive.file`, access_type=offline, prompt=consent, state=random UUID stored in driveConnectStates). Errors clearly when env vars missing ("Google Drive is not configured yet — see README").
- `completeConnection` (**internalAction**): `{ code, state }` → `{ returnTo }` (called by drive_http.ts — keep its existing signature).
- `scaffoldHub` (action): `{ productionId, parentFolderId?: string, sharedDriveId?: string }` — perm `production.manage` (via internal query). Uses MY connection as hub connection. Creates root `{CODE} — {Name}` + HUB_FOLDERS tree, patches production.hub, shares root with each member email (writer; viewer role → commenter, sendNotificationEmail=false, best-effort per member). Activity `drive.hub_created`.
- `getPickerConfig` (action): `{}` → `{ accessToken, apiKey, appId }` for MY connection (the sanctioned short-lived token pass for the Picker).
- `uploadToShot` (action): `{ shotId, bytes: ArrayBuffer, name, mimeType, promptMeta?, note? }` → uploads into `Shots/{code}/Options/` with the HUB token (lazily creating `Shots/{code}/`, `Options/`, `Approved/`, patching shot.driveFolderId), thumbnail = original bytes when image/* (stored to Convex storage), then `internal.versions.createWithAsset`.
- `attachFromPicker` (action): `{ shotId, files: { id, name, mimeType? }[], asVersions: boolean }` — read bytes with MY token, copy into hub with HUB token, register via createWithAsset (or plain asset when !asVersions).
- `mirrorUploadToHub` (**internalAction**): `{ versionId }` — storage-provider asset + connected hub → upload bytes to Options/, flip asset to gdrive (keep storageId as thumb source).
- `copyPickToApproved` (**internalAction**): `{ versionId }` — canonicalApprovedName via production code + episode + shot code + index; gdrive asset → files.copy into Approved/; storage asset + hub → multipart upload. New asset row for the approved file (kind "file", shotId, no versionId… set versionId to the picked version — two assets per version is fine). Activity "filed into Approved/".
- `syncNow` (action): `{ productionId }` — member perm; lists all hub folders (folderIds + shot folders), upserts assets by driveFileId (name/md5/size/trashed→missing), fetches Drive thumbnails (thumbnailLink bytes with hub token) into Convex storage when md5 changed or thumb missing; NEW unknown files → asset rows (unassigned, uploadedBy = hub connection's user). NOTE: under `drive.file` "new unknown files" in practice means files the app itself created on another device/session — `files.list` does NOT return files a user dropped into the folder through Drive's UI, because the scope covers only app-created and Picker-granted files. Sync is therefore a freshness pass (renames, revisions, trashes), not a discovery pass. Patches syncedAt. Activity `drive.synced` once per manual sync ("Synced hub — 3 new files").
- `cronSync` (**internalAction**): `{}` — for each active production with hub: same as syncNow minus the activity row (only log when changes found).

## crons.ts (owned by the integrator, not agents)

hourly `reports.cronTick`; every 5 min `drive.cronSync`.

## seed.ts (owned by the integrator)

`seed:run` — idempotent §12 dataset. **`internalAction`**, not public: as a public action it was callable anonymously against the deployment URL and planted claimable owner/producer invites. Run it with `npx convex run seed:run` (which reaches internal functions), and only on a demo backend.
