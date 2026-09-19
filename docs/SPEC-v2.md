# Kinolab v2 — product spec (draft for the lead engineer)

Status: DRAFT 2026-09-19, from First_Round.md (§1 verbatim, §2 analysis, §6 meeting decisions) and Heroes.png. Anchored to the code at `main` (schema, permissions, CONTRACTS.md). Binding docs to update alongside: docs/CONTRACTS.md, DECISIONS.md, PLAN.md, README.md. Nothing here has been implemented; no product code was touched to write it. All work and tests run against the LOCAL anonymous deployment (.env.local). Never source .env.pilot.local in this phase.

## 0. What the tester expects for Characters (Heroes.png)

Heroes.png is a Google Sheet named "Heroes". Columns: **№ | Name | Concept | Concept Status | Animation | Anim Status | Final | URL | Prompt** plus a colour-flag column (letters "k"/"o" on magenta). Rows: 1 Pushistik (baby mammoth), 2 Mama (mama mammoth with red flower), 3 Tupik (rapper puffin), 4 Morzh (old walrus), 5 Papa Tupik (puffin with scarf). Concept and Animation cells are colour-coded status (magenta = open, green = done for Papa Tupik's animation). Final holds the approved still. URL holds a Drive file chip ("Pushistik", "Mama", "Tupik") or a file link ("morzh_final_up.png", "mamatupik_final_up.png"). Prompt holds the full generation prompt ("Cartoon still. Baby mammoth standing on the ice. … Ultra-detailed 3D rendering, gentle soft shadows …"); the last row has Midjourney short links (https://s.mj.run/…). Reading: one row per character, **two phases (Concept, Animation) each 

## 1. Ranking (value/effort, 1.5-day build incl. tests)

MUST: a1 dark by default + Appearance control (Settings for all roles, user menu) + token/contrast pass + both-theme screenshots · b1 Characters (elements table, Concept slot, list + detail, exclusions, redirect) · c1 Generation details editable (Options tab + Review rail) · c2 provenance CSV export · d1 New shots — Generate tab + `shots.importRows` · d2 Import tab from pasted text with preview + per-row validation · e1 shot code rename (+formerCodes), scene/episode selects on the shot header, Edit scene sheet, links editable by content.edit · f1 Board card menu (status/assignee/due), `?tab=` deep links, column-title links, cover thumbnails, cap banner · g1 copy clarity only.

SHOULD: b2 Animation slot · b3 `shots.elementIds` + board character chips · b4 search/palette Characters group · d3 CSV file picker + column re-map · d4 assignee/due/stage defaults in Generate · e2 `versions.moveToShot` · e3 scene-code cascade to shot codes · e4 episode titles in Settings · e5 studio rename · f2 board filters · f3 scene sub-headers in columns · f4 gate chip → Decisions filter · a3 contrast script · c3 promptMetaUpdatedAt/By · c4 JSON export · seed: 5 Heroes characters + a generated scene.

LATER: Locations; Scripts (document + per-scene text in the Review Room rail); alternates / per-shot slots (g); Drive rename job + element folder placement (02 Pre-Production/Concepts); server-side per-user theme; PNG metadata auto-extract; trademark term watchlist; scene page; board reorder/multi-select; production code rename; migration of the tester's old character shots; comment editing.

Estimate for MUST ≈ 26–30 engineer-hours → run parallel agents (backend: elements/importRows/exports; theme pass; board; characters UI) or apply the cut order: f scene grouping → d3 → e Edit scene sheet (keep code rename) → c4 → b detail page (fallback: slot mode on the shot page).

Build order. Day 1 AM: a1 provider/tokens/Settings visibility; d1 backend + Generate dialog; b1 schema + elements.ts + shots.list exclusions. Day 1 PM: b1 pages + redirect; c1 dialog; d2 Import tab; e1. Day 2 AM: f1; c2; g1; both-theme screenshot pass; `pnpm typecheck && pnpm build && pnpm test:api && pnpm test:e2e`. Day 2 midday: CONTRACTS/README/DECISIONS/PLAN, package.json 1.1.0-pilot.2, tag.

## 2. Role → capability reminder (convex/lib/permissions.ts)

owner, producer: everything (studio.manage, production.manage, content.edit, version.create, version.decide, gate.decide, qc.run, report.publish, comment.create). creative_director: content.edit, version.create, version.decide, gate.decide, qc.run, comment.create. supervisor: content.edit, version.create, qc.run, comment.create; decide only in stages where gate approver. artist: version.create, comment.create; edit own shots within working statuses. viewer: comment.create.

---

## (a) Dark mode by default, light as an option — MUST

Goal: the app opens dark for everyone; a person switches to Light or System from Settings or the user menu; every screen is designed for both, not inverted.

Today: full dark palette exists as `.dark` tokens (app/globals.css) used only by the Review Room (review-room.tsx:233 wraps in `className="dark"`, dialogs hardcode `dark`); no ThemeProvider (next-themes installed; sonner calls useTheme without a provider); Settings hidden from non-managers (production-rail.tsx:57).

Requirements:
1. `app/layout.tsx`: next-themes `ThemeProvider` with `attribute="class"`, `defaultTheme="dark"`, `enableSystem`, `storageKey="kinolab-theme"`, `disableTransitionOnChange`; `<html suppressHydrationWarning>`. Metadata `themeColor` [{media: light, color: #f7f5f0}, {media: dark, color: #0b0d11}].
2. `globals.css`: `:root { color-scheme: light }`, `.dark { color-scheme: dark }` (native date inputs, selects, scrollbars follow). Status colours (`--color-status-*`) move out of the fixed `@theme inline` block into `:root` / `.dark` tokens with dark variants; contrast targets: pill text vs pill bg ≥ 4.5:1, strip edge / dots vs card ≥ 3:1. Keep `--tape #ff6b2c` with dark glyphs in both themes.
3. Review Room and its dialogs keep the hardcoded `.dark` wrapper: always dark regardless of preference (spec §9 reason: colour judgement on a neutral surround). In Light, the transition into the room is intentional; the room's exit returns to the chosen theme.
4. Remove every hardcoded colour in `app/` and `components/` (grep `#[0-9a-fA-F]{3,6}`, `white`, `black`): options-tab.tsx VersionThumb `bg-[#101114]`, `text-white/70`; avatar `ring-background` stays (token). Each remaining literal needs a comment.
5. Thumbnails (option cards, board cards, files, filmstrip) get a `border-border` hairline and `bg-muted` letterbox so light images do not float on dark.
6. Tables (Shots, Ledger, Team, QC, Files): hover/zebra `bg-muted/40`, sticky headers `bg-card`. Overview stage strip and charts use `--chart-*` (already themed).
7. Sign-in, `/new` wizard, `/team`, `/drive/connected`, `error.tsx`, `global-error.tsx` themed; sign-in dark by default (brand site is dark).
8. Controls: Settings → new FIRST card "Appearance": segmented Dark | Light | System, helper line "The Review Room is always dark for colour judgement." Visible to EVERY role → the rail shows Settings to all roles; cards that need production.manage (Details editing, Stages & gates, Links editing, Drive hub, Compliance export) stay hidden for others. Avatar menu (app-shell.tsx) gets the same three options (radio items). Both read/write the same next-themes state.
9. No flash of wrong theme (next-themes pre-hydration script). Reduced motion respected (exists for clap).
10. Both-theme screenshot pass over every route (extend e2e/qa-aurora.mjs to walk twice) and a signed-off checklist in the PR: Overview, Board, Shots table+grid, Shot detail ×4 tabs, Review queue, Review Room, Files, Decisions, Reports + detail, QC list + run, Settings, Team, New production wizard, Sign-in, Notifications popover, Command palette, Keyboard overlay, Characters list + detail, New shots dialog.

UI surface: Settings › Appearance card; avatar menu › Appearance. Data changes: none server-side; per-device localStorage `kinolab-theme`; server-side per-user preference LATER. Permissions: everyone incl. viewer (personal, not production config). Side effects: none (no activity, notification, report). Edge cases: blocked localStorage/private window → dark, no crash; System follows the OS live; same preference across studios on the device; Base UI portals (command palette, notification popover) opened from inside the Review Room follow the global theme — accepted, minor.

Acceptance tests — `e2e/tests/theme.spec.ts` (serial, own owner/studio/production): T1 fresh context, sign in → `html` has class `dark`, `getComputedStyle(body).backgroundColor === 'rgb(11, 13, 17)'`. T2 Settings › Appearance › Light → class removed; reload → still light; body bg `rgb(247, 245, 240)`. T3 under Light, open `/p/{id}/review/{shotId}` → room container has `.dark` and computed bg #0b0d11; press X → reject dialog content has `.dark`. T4 avatar menu › Dark → Settings segmented control shows Dark. T5 artist: Settings appears in the rail; only Appearance card rendered (no Details/Stages/Links editing/Drive). T6 trackErrors: no console errors or hydration warnings on sign-in and Overview in both themes. T7 both-theme screenshots to `e2e/screenshots/{theme}/{route}.png` (not pixel-asserted). SHOULD T8 `scripts/check-contrast.mjs` computes status token contrast per theme ≥ targets (

DECISIONS.md entry: "2026-09-19 — **Dark is the default mood for every surface; light is a preference.** Spec §9 made management screens light ('production office') and only the Review Room dark ('grading suite'); DECISIONS 2026-08-17 kept both moods. First tester round (First_Round.md §1.1, §6): dark was the first ask and the meeting decided dark by default with light under Settings. Both palettes stay; what changes is the default and that the person chooses (per device, next-themes, key `kinolab-theme`, Settings + user menu). The Review Room stays dark regardless — the colour-judgement reason still holds. Consequence: Settings is now visible to every role (it was hidden for non-managers, 2026-08-17); manager-only cards are gated individually."

---

## (b) Characters under Pre-production — MUST (Concept slot); Animation slot, links, search SHOULD; Locations, Scripts LATER

Goal: characters (later locations, scripts) live in their own section under Pre-production with the options→shortlist→pick loop per phase, a picked look, editable prompts and file links, and never appear as shots.

Model (smallest safe change): a new `elements` table plus **one "slot shot" per phase**. A slot shot is a `shots` row with `elementId` + `slot` set; because it is a shot, upload, Options, shortlist/reject/pick (one-pick invariant), Review Room, comments, history, approvals ledger, notifications, daily report and (later) Drive filing work unchanged. All shot lists exclude slot rows by default. The alternative (a parallel "element versions" model) would duplicate pick(), the Review Room, the ledger and notifications — not possible in 1.5 days and a second invariant to keep.

Data changes (convex/schema.ts):
- `elements`: { productionId, kind: "character"|"location"|"script", name (≤120), code (A–Z0–9_ ≤32, unique per production+kind), description? (≤2000), basePrompt? (≤4000), order, createdBy } — indexes by_production, by_production_kind_code.
- `shots`: + `elementId?: Id<"elements">`, `slot?: string` ("concept" | "animation") — index by_element.
- SHOULD `shots.elementIds?: Id<"elements">[]` (characters appearing in a shot).
- domain.ts: `ELEMENT_KINDS`, `SLOTS_BY_KIND` (character: [concept, animation(SHOULD)], location: [concept] LATER, script: [] LATER), `ELEMENT_CODE_PREFIX` {character: "CH", location: "LOC", script: "SCR"}, `slotShotCode(kind, code, slot)` → `CH_PUSHISTIK_CONCEPT`, `RESERVED_CODE_PREFIXES`.

Backend (new convex/elements.ts):
- `list` (query) { productionId, kind } → elements by order (cap MAX_LIST_ELEMENTS 300 — ≈5 reads per element stays under the 4,096 read ceiling), each with `slots[]`: { slot, shotId, status, versionsCount, pickedVersionIndex, coverThumbUrl, pickedThumbUrl, pickedFileUrl, latestPrompt (picked else latest version promptMeta.prompt) }.
- `get` (query) { elementId } → element + slots + production ref.
- `create` (mutation) { productionId, kind, name, code?, description?, basePrompt? } perm content.edit. Code auto-derived from name (ASCII letters/digits, spaces → `_`, uppercased); empty derivation (Cyrillic) → code required. Creates the element and one slot shot per SLOTS_BY_KIND via a shared `createShotRow` helper (same uniqueness/order rules as shots.create): code `CH_{CODE}_{SLOT}`, stage "preproduction", status "planned", title "{name} — Concept", no scene/episode. ONE activity row `element.created` ("Anna created character Pushistik").
- `bulkCreate` (mutation) { productionId, kind, names: string[] (≤200) } → { created, skipped[] }; collisions get `_2`, `_3`; one activity row.
- `update` (mutation) { elementId, name?, code?, description?, basePrompt?, order? } perm content.edit; code change renames every slot shot's code in the same transaction (uniqueness per slot); activity `element.updated` with change list incl. "formerly CH_OLD_CONCEPT".
- `remove` (mutation) { elementId } perm content.edit; refused when any slot shot has versions ("This character has options — remove them first"); deletes slot shots via the shots.remove rules; activity `element.removed`.
- shots.ts: `list` gains `elements?: "exclude"|"only"|"all"` (default exclude, applied while streaming the index). `create`/`bulkCreate`/`importRows` refuse ordinary codes matching `^(CH|LOC|SCR)_` ("CH_ codes are reserved for characters — create it under Characters"). `update` refuses sceneId/episodeId on slot shots. `rename` (item e) refused on slot shots ("rename the character instead"). productions.listForStudio counts and search.global skip slot rows. Review queue uses `elements: "only"` for its Characters group.
- Notifications keep hrefs `/p/{pid}/shots/{slotShotId}`; the shot page redirects (below). copyPickToApproved (Drive, dormant) unchanged — known gap: slot files would land under Shots/; parked.

UI surface:
- Rail (production-rail.tsx): group label "Pre-production" (10px uppercase muted) above a new item "Characters" (icon Users), placed after Shots. Copy keys nav.preproduction, nav.characters.
- `/p/{pid}/characters` — table mirroring the sheet: № | Name (+ mono code) | Concept (48px picked-or-cover thumb + status pill; click → detail ?slot=concept) | Animation (SHOULD, same) | Prompt (basePrompt clamped 2 lines, copy button, click to edit inline) | Final ("Open" → pickedFileUrl, disabled without pick) | row menu (Rename…, Edit prompt…, Open in Review Room, Delete). Header: "Characters · 5", buttons "New character" (hotkey N on this page) and "Paste names". Empty state: "No characters yet. Add one, or paste the names from your sheet." with the inline paste form. SHOULD grid toggle (cards with the picked still).
- `/p/{pid}/characters/{elementId}` — header: inline name, code (mono, rename via dialog), description textarea, base prompt textarea with Copy; then one section per slot: status select / assignee / due (same controls as the shot page, same canEditShot gating), Tabs Options | Discussion | Files | History reusing OptionsTab, DiscussionTab, FilesTab, HistoryTab with the slot's shotId, and "Open in Review Room". `?slot=` selects the section.
- Shot page: when `shot.elementId` is set → `router.replace('/p/{pid}/characters/{elementId}?slot={slot}')` (ledger, notification and history links resolve).
- Review queue page: second group "Characters" (slot shots with options), same card component. Review Room for a slot works unchanged (header shows CH_… code); SHOULD: back-link to the character.
- SHOULD: search.global + command palette "Characters" group (name/code, cap 8); Files page group label "Characters"; shot header "Characters in this shot" multi-select (elementIds) with chips on the shot page and board cards; seed.ts adds the 5 Heroes characters with their prompts (local demo only).

Permissions: create/update/remove/bulk = content.edit (owner, producer, CD, supervisor). Artist: upload options to any slot (version.create), comment, change a slot's status/assignee/due only when assigned (canEditShot); cannot create/rename/delete. Decide (shortlist/reject/pick) = canDecideForShot: owner/producer/CD anywhere; supervisor when gate approver of Pre-Production (slot stage). Viewer: read + comment.

Side effects: activity types `element.created`, `element.updated`, `element.removed` (add to CONTRACTS rule 6). Slot version/pick/comment activity keeps existing types, so the daily report counts character work in the existing tiles — say so in the report copy ("Options added — shots and characters"); no new tiles. Notifications unchanged (pick → creator + assignee; assign → assignee). Search: SHOULD.

Edge cases: duplicate names allowed, codes unique; Cyrillic-only name → code required with hint "Codes use A–Z, 0–9 and _"; delete with options refused; a character with a picked Concept shows the picked thumb in the list, re-pick follows shot rules; slots never have a scene and never appear on the Board (excluded); shots.list cap (1000) is separate from the elements cap (300); Drive dormant → folder placement parked; no migration of the tester's old character "shots" (fresh redeploy decided); a one-off `migrations.convertShotToElementSlot` is LATER.

Acceptance tests — `e2e/tests/characters.spec.ts` (serial): C1 rail shows "Pre-production › Characters"; empty-state paste "Pushistik\nMama\nTupik" → 3 rows with codes PUSHISTIK/MAMA/TUPIK; Shots page shows 0 shots and the Board no cards. C2 "New character" → name "Papa Tupik" → code auto PAPA_TUPIK; change code to PAPA → row shows PAPA; creating another with code PAPA → toast "already exists". C3 open Pushistik → upload 2 options in Concept (uploadOptions helper) → v1/v2; list row shows "2 options" and "Options ready". C4 as owner, "Open in Review Room" → P on v2 → back on the character page the Concept cell shows the v2 thumb + "Picked", Final "Open" enabled; Decisions › Picks lists `CH_PUSHISTIK_CONCEPT`. C5 edit base prompt inline → blur saves; reload shows it; activity feed row "updated character Pushistik (base prompt)". C6 rename to "Pushistik Jr" / code PUSHISTIK_JR → Review Room
API — authz.mjs: `elements:create/update/remove` denied artist + viewer, allowed supervisor; cross-studio `elements:get` denied. integrity.mjs: create → exactly one slot shot with `elementId` and code `CH_{CODE}_CONCEPT`; `shots:list` default excludes it, `elements:"only"` returns it; `shots:create {code:"CH_X"}` refused; `elements:update` code collision refused; `shots:update {sceneId}` on a slot refused; `shots:rename` on a slot refused. validation.mjs: name >120, basePrompt >4000, bulk >200 names refused.

DECISIONS.md entry: "2026-09-19 — **Characters as first-class elements, stored as element rows plus slot shots.** Spec §2's model was episodes → scenes → shots → versions; characters and locations were Drive folders only. Round one (First_Round.md §2.3, §6, Heroes.png) wants the options-and-pick workflow for characters with Concept and Animation phases. v2 adds an `elements` table (kind: character now; location, script later) and stores each phase as a `shots` row carrying `elementId` + `slot`, so the Review Room, the one-pick invariant, the ledger, notifications, comments, history and (later) Drive filing work unchanged; list queries exclude slot rows by default. Chosen over a parallel element-versions model that would duplicate pick(), the Review Room and the ledger. Codes CH_/LOC_/SCR_ are reserved for elements. Known gap: with a Drive hub connected, slot picks would file under Shots/

---

## (c) Generation details editable; provenance export — MUST

Goal: generation details ("how this was made") can be corrected on any option after upload, and a producer can export per production every prompt and provenance fact (who made what, with which tool/model/seed, when, from which file, who decided) for legal use.

Copy: "Prompt details" → "Generation details" everywhere; explainer "Tool, model, prompt and seed — so anyone can regenerate this option or show how it was made." Upload popover: "Applied to the next uploads. You can edit them later on each option."

Requirements:
1. Options tab VersionCard: "Edit details" (pencil, visible when creator or content.edit) → dialog (new `components/app/generation-details-dialog.tsx`) prefilled with Tool, Model, Prompt (textarea), Seed, Params (textarea, free text), Note → `versions.updateMeta` (exists; the UI must send `params` too). Toast "Details saved".
2. Review Room right rail: section title "Generation details", same Edit button; dialog content rendered with `className="dark"` like the other room dialogs.
3. versions.ts validator caps: prompt ≤ 20,000, params ≤ 20,000, tool/model/seed ≤ 200, note ≤ 2,000 (ConvexError messages). SHOULD: `promptMetaUpdatedAt`, `promptMetaUpdatedBy` on versions, shown as "edited by X · 3 min ago" in the rail.
4. Character base prompt inline edit — item (b).
5. Export button: Decisions page header "Export provenance (CSV)" beside the existing "Export CSV"; Settings › Details card links to it. Visible/enabled for production.manage only.
6. Backend `convex/exports.ts`: `provenanceRows` (query) { productionId, cursor?, numItems? (≤400) } → { rows, cursor, done }, perm production.manage, one row per version across shots AND element slots, newest first; reads per row ≈ version + shot + element + asset + creator + decider (≤ 6) → 400 rows/call under the read ceiling. `logProvenanceExport` (mutation) { productionId, rowCount } → activity `export.generated` ("Niek exported provenance (312 rows)"), called by the client once the download starts.
7. Client: `lib/csv.ts` (move `csvEscape`/`toCsv` out of ledger-table.tsx; add a `verbatim` mode that quotes every cell and does NOT apply the formula-lead guard — the file is evidence, not a spreadsheet; the ledger export keeps the guard), UTF-8 BOM (Excel + Cyrillic), CRLF, filename `{CODE}_provenance_{YYYY-MM-DD}.csv`, progress toast while paginating. SHOULD: JSON download of the same rows.
8. Columns (in order): studio_name, production_code, production_name, target_type (shot | character | location), target_code, target_title, slot, scene_code, episode (EP01 or empty), version (3), version_id, version_status (candidate|shortlisted|picked|rejected), created_at (ISO 8601 UTC), created_at_local (production tz "YYYY-MM-DD HH:mm"), created_by_name, created_by_email, tool, model, prompt, seed, params, note, file_name, file_mime, file_size_bytes, file_md5, file_provider (storage|gdrive|url), file_location (Drive webViewLink | "app storage:{storageId}" | url), file_missing (true/false), approved_file_name (canonical name when picked, e.g. SGL_EP01_SC010_SH020_v3.png), decision (picked|rejected|empty), decided_at (ISO), decided_by_name, decided_by_email, decision_note, details_last_edited_at, details_last_edited_by (from the latest `version.updated` activity row for the version, or

UI surface: Options tab card, Review Room rail, Decisions header, Settings › Details. Permissions: edit = creator or content.edit (artist own uploads only; viewer never); export = production.manage (owner, producer). Side effects: `version.updated` (exists, not counted in reports), `export.generated` (new type, in CONTRACTS); no notifications. Edge cases: version without asset → file_* empty, file_missing=true; rejected/superseded versions included; >400 rows paginated; multi-line prompts quoted; empty production → header-only file; storage-provider rows expose only the Convex storageId (the S3 object key is not visible to app code) — README note.

Acceptance tests — shot-detail.spec.ts: "Edit details on v1 saves tool/model/prompt; tool badge appears; Review Room rail shows the prompt; Copy copies it (clipboard permission granted in the test context)"; "artist sees Edit only on their own version". decisions.spec.ts: "Export provenance downloads a CSV: starts with BOM, header equals the column list, one row per version (2 shots × 2 options + 1 character slot × 2 = 6), a quoted multi-line prompt round-trips through a small CSV parser in the test, activity feed shows 'exported provenance (6 rows)'". API — authz.mjs: `exports:provenanceRows` denied artist/CD/supervisor/viewer, allowed producer; cross-studio denied. integrity.mjs: pagination with numItems 2 over 6 versions ends with done=true after 3 pages. validation.mjs: `versions:updateMeta` prompt of 20,001 chars refused; viewer refused; artist on another's version refused, on own a

DECISIONS.md entry: "2026-09-19 — **Generation details are editable after upload; a provenance export exists per production.** Spec §5 recorded prompt metadata write-once at upload (the backend `updateMeta` existed without UI). Round one (First_Round.md §2.6, §6) did not understand the field and asked for editing and a legal export. Renamed 'Prompt details' → 'Generation details' (copy only). The export lists every version with prompt, tool, model, seed, file identity, creator and decision; cells are verbatim (no CSV formula guard — it is evidence), UTF-8 BOM; limited to production.manage and logged as `export.generated`."

---

## (d) Shot creation: scene-first, N shots, bulk import — MUST (Generate + paste Import); file picker / re-map / defaults SHOULD

Goal: create a scene and its shots in one step, or import many shots from a pasted sheet with a preview, instead of one by one.

UI surface: Shots page primary button "New shots" (hotkey N) → dialog with tabs **Generate | Import**; the button's dropdown: "Single shot…" (existing NewShotDialog, kept for inserts such as SH015) and "Import list…". The empty state renders the Generate tab inline. The Import textarea keeps `aria-label="Shot codes"` and the submit matches /Create \d+ shots?/ so e2e/tests/helpers.ts `bulkCreateShots` needs only to click the Import tab.

Generate tab — exact dialog:
- Segmented "Existing scene | New scene" (default New when the production has no scenes, else Existing). Existing → SceneSelect (existing picker); Episode defaults from the scene. New → Scene code (mono, uppercased, e.g. SC010) + Scene title (optional) + Episode (episodic only).
- Count: number 1–200 (default 5). Start: default 10. Step: default 10, ≥ 1.
- Pattern: default `{SCENE}_SH{N:3}`; tokens `{SCENE}` scene code, `{N}` / `{N:pad}` zero-padded number, `{EP}` EP01 (episodic), `{I}` 1-based row index; editable behind "Customise pattern".
- Preview: live list — first three codes, "…", last code, "10 shots"; full scrollable list when ≤ 50; codes that already exist (from the loaded shots list) marked "exists — will be skipped" with summary "3 of 10 already exist".
- Titles (optional): textarea, one per line; line i → shot i; extra lines → warning "2 titles ignored"; fewer → remaining untitled.
- SHOULD: Assignee, Due date, Stage (default production) applied to all.
- Submit "Create 10 shots in SC010"; Enter submits from any field; Esc closes. On success: close, toast, navigate to `/shots?scene={sceneId}`. Last Start/Step/Pattern remembered per production in localStorage `kinolab-shot-numbering:{pid}`.
- Validation: step 0 → "Step must be ≥ 1"; pattern without {N} → "Pattern needs {N}"; count > 200 → clamped with message; reserved prefixes CH_/LOC_/SCR_ refused; code > 64 chars refused.

Import tab:
- Textarea "Paste from your sheet": one code per line, or tab/comma/semicolon-separated rows (Google Sheets pastes TSV); CRLF and BOM tolerated; RFC 4180 quotes parsed by `lib/csv.ts`. Header auto-detect when the first row contains any of code|shot, title|name, scene, episode|ep, assignee, due|due date (case-insensitive); otherwise positional: code, title, scene. SHOULD: file picker (.csv/.tsv) + drop; a column re-map row (Code / Title / Scene / Episode / Assignee / Due date / Ignore).
- Preview table: # | Code | Title | Scene | Episode | Assignee | Due | Status. Status per row: ok · exists (skip) · duplicate in paste (skip) · invalid code (empty, > 64, reserved prefix, chars outside A–Z 0–9 _ -) · title too long (> 200) · unknown scene → will be created (info) · unknown episode (error) · unknown assignee (error) · bad date (error). Invalid rows are excluded. Checkbox "Create missing scenes" (default on). When the paste has no Scene column, the fallback SceneSelect/EpisodeSelect apply to all rows (today's behaviour). Footer "Create 42 shots · 3 skipped · 1 invalid". Max 500 rows ("Paste up to 500 rows at a time").

Backend — one new mutation `shots.importRows`: { productionId, rows: [{ code, title?, sceneCode?, episodeNumber?, assigneeId?, dueDate? }] (≤ 500), defaults: { sceneId?, episodeId?, stage?, assigneeId?, dueDate? }, scenesToCreate?: [{ code, title?, episodeId? }] (≤ 100), createMissingScenes: boolean } → { created, skipped: string[], invalid: { code, reason }[], scenesCreated: string[], sceneId?: Id (set when exactly one scene is involved, for the redirect) }. Perm content.edit. Trims, uppercases, dedupes; uniqueness via `by_production_code`; scenes matched by code — **scene codes become unique per production** (scenes.create and importRows enforce it; nothing does today; on restored old data with duplicates: first by order + warning). Structural errors throw (> 500 rows, bad production); per-row problems come back in `invalid`. ONE activity row `shot.created` ("Anna created scene SC010 a

Permissions: content.edit (owner, producer, CD, supervisor); artists never create shots. Side effects: one `shot.created` row (not a report tile), aggregated assignment notification. Edge cases: two concurrent imports of the same codes → the second reports them skipped; a scene that exists under another episode is used as is (preview shows its episode); count × step beyond the pad → pad grows (SH1000); existing codes are skipped, never errors; a blank Title column is fine.

Acceptance tests — `e2e/tests/shot-import.spec.ts`: D1 Generate: New scene SC020 "Signal room", count 5, start 10, step 10, 3 titles → preview SC020_SH010 … SC020_SH050; Create → toast "Created 5 shots in SC020"; table filtered to SC020 shows 5 rows, the first 3 titled. D2 Generate into a scene with 2 existing codes → preview marks 2 as existing; result "Created 3 · skipped 2". D3 step 0 and pattern without {N} disable submit with the message; count 201 is clamped. D4 Import paste TSV "Code\tTitle\tScene" + 4 rows (one duplicate, one `CH_X`, one unknown scene SC030) → statuses ok/duplicate/invalid/will be created; Create → 2 created, scene SC030 created and present in the scene filter. D5 (SHOULD) CSV file via setInputFiles with a quoted title containing a comma → title preserved. D6 N opens the dialog on Generate; Esc closes. D7 artist sees no "New shots". API — authz: `shots:importRows

DECISIONS.md entry: "2026-09-19 — **Shot creation is scene-first with generated numbering, plus a tabular import.** Spec F5 had a single-shot dialog and a paste-codes list. Round one (First_Round.md §2.5a, §6): name a scene, say how many shots, import many at once. `shots.importRows` becomes the batch path (`bulkCreate` kept one release as a deprecated alias); scene codes become unique per production (never enforced before). No sequence level is added — episodes → scenes → shots stays; the tester said 'sequence/scene' and the meeting did not ask for a third level."

---

## (e) Renaming and re-linking — MUST (code rename, scene sheet, header selects, links by content.edit); move version, cascade, episode/studio titles SHOULD; production code, Drive rename LATER

Goal: everything named or linked at creation can be corrected from where it is seen, recorded in the activity feed, with references updated.

Edit surface table — What | Where (UI) | Who | Side effects | Drive rename
- Shot title | shot page inline; table inline (exists) | content.edit + assigned artist | shot.updated | no
- Shot code | shot page: click the mono heading (or kebab "Rename code…") → inline edit → confirm dialog "Renaming SC010_SH020 → SC010_SH025. Comments and history keep the old text; the rename is recorded." | content.edit only (never artists) | new `shots.rename { shotId, code }`: uniqueness; refused on element slots ("rename the character instead") and on `delivered` shots; appends the old code to new optional `shots.formerCodes[]`; activity `shot.renamed` ("Anna renamed SC010_SH020 → SC010_SH025"); heading shows "formerly SC010_SH020"; ledger targetLabel, search and Review Room header read the live code; future picks use the new canonical name | NO in v2 — Drive is dormant; existing folder and already-filed Approved files keep the old name; rename job parked
- Shot → scene / episode | shot page header: meta line becomes SceneSelect (with inline create) + EpisodeSelect for content.edit roles; text for others | content.edit (server also allows the assigned artist via canEditShot; UI hides it) | shot.updated ("scene → SC020"); choosing a scene sets the episode from the scene | no
- Shot order in scene | SHOULD: table "Move up/down" when filtered by scene (order exists) | content.edit | shot.updated | no
- Scene code / title / episode / description / storyboard (Figma) URL | Shots page: scene filter chip pencil → "Edit scene" Sheet (components/ui/sheet) with all fields and "Delete scene" when empty; SHOULD a Scenes list page | content.edit | `scenes.update` gains `code` (unique); scene.updated with "code → SC015"; a scene code change does NOT rename shot codes (SHOULD checkbox "also rename shots SC010_* → SC015_*" with preview) | no
- Episode title | SHOULD Settings › Details › Episodes inline | production.manage | none (config, like links) | no
- Production name / status / timezone | exists (Settings) | production.manage | production.updated | no
- Production code | NOT editable in v2 (in every canonical filename and the Drive root); Details card explains and says "ask us" | — | — | LATER
- External links (Figma, sheet, Miro, Telegram) | Settings › Links: visible read-only to every role; add/edit/remove widened from production.manage to **content.edit** (CD, supervisor can fix a wrong storyboard link); artist/viewer read; Overview quick links unchanged | content.edit | SHOULD activity production.updated "changed link Storyboard (Figma)" | no
- Version details / note | item (c) | creator or content.edit | version.updated | no
- Character name / code / description / base prompt | item (b) | content.edit | element.updated | no
- Version → other shot (uploaded to the wrong place) | SHOULD "Move to shot…" on a candidate/shortlisted version card → `versions.moveToShot { versionId, shotId }`: never picked/rejected; new index = max+1 on target; asset.shotId; versionsCount on both; coverAssetId fix-ups; activity `version.moved` | creator or content.edit | no
- Attach an existing file to a shot | exists (Files › Attach to shot…) | version.create | asset.added | no
- Studio name | SHOULD Team page inline | studio.manage | none | no
- Comment edit | LATER

Data changes: `shots.formerCodes?: string[]`; scene code uniqueness; activity types `shot.renamed` (+ `version.moved` SHOULD) in CONTRACTS; `externalLinks.*` perm change in CONTRACTS.

Permissions by role: owner/producer everything; CD/supervisor: shot title/code/scene/episode, scene fields, links, version details, characters; artist: own shot title/status/assignee/due and own version details only; viewer nothing.

Side effects: renames appear in the activity feed and in the daily report's day-activity list (no tile, no notification — answers First_Round.md §2.4 Q4). Edge cases: rename to an existing code refused; concurrent Review Room viewers see the new code live; URLs use ids so nothing breaks; comment text keeps the old code; approved/final shots can be renamed (formerCodes trail), delivered refused; scene delete only when empty (exists); scene code rename leaves shot codes untouched (explicit in the sheet).

Acceptance tests — shot-detail.spec.ts: E1 rename via the heading → confirm → heading, Shots table, Decisions ledger row and History ("renamed SC010_SH020 → SC010_SH025") show the new code; "formerly SC010_SH020" hint visible. E2 header scene select → another scene → meta updates; `/shots?scene={new}` lists it. E3 rename to an existing code → toast, heading unchanged. E4 artist: heading not editable, title still inline-editable. shots.spec.ts: E5 Edit scene sheet: title + Figma URL + code SC010 → SC011 → filter chip shows SC011; shot codes unchanged; activity row "updated scene SC010 (code → SC011, title …)". permissions.spec.ts: E6 CD adds and edits a link in Settings › Links; artist sees the Links card read-only; Overview quick links reflect the edit. API — authz.mjs: `shots:rename` denied artist (even when assignee), allowed supervisor; `externalLinks:add` by CD **allowed** (flip line

DECISIONS.md entry: "2026-09-19 — **Codes are renameable; links are editable by content editors.** Spec §7.4 tied the shot code to the Drive folder and canonical filename, so v1 made it immutable. Round one (First_Round.md §2.4): renaming was the first thing the tester looked for. v2 adds `shots.rename` (content.edit, never artists; refused on delivered shots and on element slots), recorded as `shot.renamed` with a `formerCodes` trail; Drive folders and already-filed Approved files are NOT renamed (Drive is dormant on the pilot; a rename job is in the parking lot) — new picks use the new code. Scene codes become editable and unique. External links move from production.manage to content.edit so a Creative Director can fix a wrong storyboard link; artists and viewers read them. Production code stays immutable."

---

## (f) Board: editable and zoomable — MUST (card menu, ?tab= links, column links, thumbnails); filters, scene headers, gate chip link, character chips SHOULD; reorder, multi-select, scene page LATER

Goal: the Board is a place to work — status, assignee and due date change from the card, and every board element opens the matching detail.

"Editable" means:
1. Drag between columns = stage change (exists, content.edit roles). Keep.
2. Card "⋯" button on hover/focus and right-click context menu: Status ▸ (allowed statuses per canEditShot — artists on own shots get working statuses only), Assign to ▸ (studio members), Due date… (popover date input + Clear), Open shot, Open in Review Room, Copy code. Uses `shots.setStatus` / `shots.update`; optimistic overrides like the existing drag code; server errors toast and revert.
3. The status pill in the slate strip and the assignee avatar open the same submenus; the due chip opens the date popover. The card becomes a `div` whose code/title is the link, so inner controls are clickable and keyboard-reachable (card focusable, Enter opens, menu via keyboard).
4. SHOULD: filter bar (assignee Me / anyone, scene, episode, status) reusing the Shots filter components, URL-driven.
5. LATER: drag-to-reorder within a column, multi-select drag, "add shot here".

"Zoom" means:
1. Card code/title → `/shots/{id}`. "4 options" → `/shots/{id}?tab=options`; menu Discussion / Files / History → `?tab=discussion|files|history`. The shot page reads `?tab=` and updates the URL on tab change (today defaultValue only) — MUST.
2. New "Picked v3" chip (when pickedVersionId) → `/review/{id}`.
3. Cover thumbnail on the card (`coverThumbUrl` already in ShotCard) as a 16:9 strip; header toggle Compact | Cards remembered per device.
4. Column title → `/shots?stage={key}`.
5. SHOULD: scene sub-headers inside a column ("SC010 · Cold open — the array (3)", collapsible, "No scene" last) → `/shots?scene={id}`, with a pencil opening the Edit scene sheet from (e) for content.edit roles. No dedicated scene page in v2 (LATER: scene page with script text, characters, storyboard).
6. SHOULD: gate chip → `/decisions?scope=stage_gate` (Decisions page gains a URL filter); approver avatars → Settings › Stages & gates (managers).

Goal: the Board is a place to work — status, assignee and due date change from the card, and every board element opens the matching detail.

"Editable" means:
1. Drag between columns = stage change (exists, content.edit roles). Keep.
2. Card "⋯" button on hover/focus and right-click context menu: Status ▸ (allowed statuses per canEditShot — artists on own shots get working statuses only), Assign to ▸ (studio members), Due date… (popover date input + Clear), Open shot, Open in Review Room, Copy code. Uses `shots.setStatus` / `shots.update`; optimistic overrides like the existing drag code; server errors toast and revert.
3. The status pill in the slate strip and the assignee avatar open the same submenus; the due chip opens the date popover. The card becomes a `div` whose code/title is the link, so inner controls are clickable and keyboard-reachable (card focusable, Enter opens, menu via keyboard).
4. SHOULD: filter bar (assignee Me / anyone, scene, episode, status) reusing the Shots filter components, URL-driven.
5. LATER: drag-to-reorder within a column, multi-select drag, "add shot here".

"Zoom" means:
1. Card code/title → `/shots/{id}`. "4 options" → `/shots/{id}?tab=options`; menu Discussion / Files / History → `?tab=discussion|files|history`. The shot page reads `?tab=` and updates the URL on tab change (today defaultValue only) — MUST.
2. New "Picked v3" chip (when pickedVersionId) → `/review/{id}`.
3. Cover thumbnail on the card (`coverThumbUrl` already in ShotCard) as a 16:9 strip; header toggle Compact | Cards remembered per device.
4. Column title → `/shots?stage={key}`.
5. SHOULD: scene sub-headers inside a column ("SC010 · Cold open — the array (3)", collapsible, "No scene" last) → `/shots?scene={id}`, with a pencil opening the Edit scene sheet from (e) for content.edit roles. No dedicated scene page in v2 (LATER: scene page with script text, characters, storyboard).
6. SHOULD: gate chip → `/decisions?scope=stage_gate` (Decisions page gains a URL filter); approver avatars → Settings › Stages & gates (managers).
7. SHOULD: character chips (from `shots.elementIds`, item b) → `/characters/{elementId}`; assignee menu "Show all of Dara's shots" → `/shots?assignee={id}`.
8. Show the same 1,000-shot cap banner as the Shots page.

Permissions: status/assignee/due follow canEditShot (content.edit roles any shot; artist own shot within working statuses; viewer sees no menu); drag content.edit (exists); links everyone; the server enforces everything. Side effects: existing activity types (shot.status_changed, shot.updated), `shot_assigned` notification, report shotsMoved — nothing new. Edge cases: status → approved without a pick → server "Pick a version before approving this shot" → toast + revert; element slot rows never appear (excluded by shots.list); menu closes on drag start; thumbnails respect the dark-mode letterbox rule.

Acceptance tests — board.spec.ts: F1 card menu → Status → In review updates the pill without reload; persists after reload; History shows the change. F2 Assign → member → avatar appears; the member's bell count increments. F3 due popover → set → chip "24 Sep"; Clear → gone. F4 Approved on a shot without a pick → error toast, pill unchanged. F5 "4 options" opens the shot with the Options tab active and `?tab=options` in the URL; menu Discussion → `?tab=discussion` active; Picked chip → `/review/{id}`. F6 column title → `/shots?stage=production` shows only those shots. F7 (SHOULD) scene sub-header link + pencil sheet. F8 artist sees the menu only on own shots with working statuses; viewer sees no menu, links still work. F9 cover thumbnail visible on a shot with options; Compact hides it and persists after reload. API: nothing new for MUST; SHOULD `shots:update { elementIds }` cross-product

DECISIONS.md entry: "2026-09-19 — **Board cards are editable in place and every board element links into detail.** Spec F4 defined the Board as drag-between-stages plus gates. Round one (First_Round.md §6): 'more editable' and 'zoom from the board into the details'. v2 adds status/assignee/due edits on the card (same mutations and permission rules as the shot page), URL-addressable shot-page tabs (`?tab=`), cover thumbnails on cards, and column-title / scene-header links into the filtered Shots list. Reordering inside a column and multi-select are parked."

---

## (g) Multiple selected options per shot — UNDECIDED; no invariant change in v2

Recommendation: keep spec §6 "exactly one picked version per shot" untouched. First_Round.md §2.5b lists five different needs behind the sentence with five different designs; building any before the walkthrough (Q1–Q6) risks a rule change the studio did not ask for. The character slots from (b) already show per-phase picks — use them as the "slots" prototype in the next conversation.

MUST (copy only, ~30 min, zero rule change): shortlist button label "Shortlist (compare later)"; Review Room hint "Shortlisted 3 — press 2/3/4 to compare"; Pick confirm dialog states "Picking v3 marks the other N options as superseded. You can re-pick later." Test: one assertion in review.spec.ts that the pick dialog names the superseded count.

Smallest safe change IF the answer is "keep alternates for the editor" (LATER): new version status `alternate` (max 3 per shot); `versions.markAlternate { versionId }` allowed on a shortlisted sibling or one rejected with "superseded by vN" while the shot has a pick — sets alternate + decidedBy/At, activity `version.alternate`, notifies the creator; `unmarkAlternate` → rejected (superseded); `pickedVersionId` stays single; re-picking an alternate makes it picked and the old pick superseded; the ledger shows only the pick; the shot page lists "Approved alternates: v2, v5"; the filmstrip tags ALT; Drive files alternates as `{canonical}_altA/_altB`; the approved-requires-pick invariant is unchanged; the provenance export gains decision value "alternate". If the answer is "one still + one video per shot" → per-shot slots generalising the element-slot mechanism (shots.parentShotId + slot), LA

DECISIONS.md: no entry until decided. Add under a new "Open questions" heading: "2.5b multiple selections — undecided 2026-09-19; one-pick invariant unchanged; candidate designs: alternates / slots / take-forward; needs First_Round.md §2.5b Q1–Q6 answered." Draft text to use only when decided: "2026-09-19 — Pick stays single; approved alternates added as a tagged state — spec §6 invariant kept; round one asked for several selections (First_Round.md §2.5b); studio confirmed the case is <case>; alternates never count as the shot's decision."

---

## Cross-cutting

CONTRACTS.md updates: new modules `elements.ts`, `exports.ts`; `shots.importRows`, `shots.rename`, `shots.list.elements`, `shots.formerCodes`; `scenes.update.code` + scene code uniqueness; `externalLinks.*` perm → content.edit; SHOULD `versions.moveToShot`, `shots.update.elementIds`; rule 6 fixed activity-type list extended with `element.created/updated/removed`, `shot.renamed`, `export.generated`, `version.moved`, and the types the code already emits but the list omits: `scene.created/updated/removed`, `shot.removed`, `version.updated`, `version.unrejected`, `production.updated`, `stage.status_changed`, `asset.added`, `drive.approved_filed`, `drive.hub_owner_mismatch`, `comment.resolved`; note the slot-shot redirect for notification hrefs; `bulkCreate` deprecated.

README: Appearance; Characters (with the Heroes-sheet mapping); New shots (Generate / Import); Provenance export (verbatim cells warning); demo script steps 3–4 updated for characters. PLAN.md: M7 — v2 tester round with the MUST list. package.json: 1.1.0-pilot.2; tag v1.1.0-pilot.2 after the suites pass.

Tests: new e2e/tests/theme.spec.ts, characters.spec.ts, shot-import.spec.ts; extended shot-detail, board, decisions, permissions, review specs; e2e/api authz/integrity/validation additions; helpers.ts `bulkCreateShots` re-pointed at the Import tab. Gate: `pnpm typecheck && pnpm build && pnpm test:api && pnpm test:e2e` green on the local anonymous deployment; both-theme screenshot review signed off in the PR.

Storage: the pilot backend already keeps file blobs in MinIO (S3-compatible) — README §"The backend holds nothing"; product code uses `ctx.storage` unchanged, so "start using S3" is infra work in deploy/convex-backend.compose.yml + env (the infra-fix agent's files). Verify on first boot that the backend logged S3 (README warns of the silent local-storage fallback) and that nightly exports include file storage. The 20 MB direct-upload cap stays (Convex HTTP action limit). Fresh redeploy: no data migrations (new tables and optional fields only); the dangling-storage audit is moot.

---

## Lead engineer's decisions on this draft (2026-09-19, evening)

- Adopted as the build brief for v1.1.0-pilot.2. MUST items are in scope; SHOULD items only where noted below; LATER items are parked.
- (b) Both slots ship: `SLOTS_BY_KIND.character = ["concept", "animation"]`. The list page shows both columns exactly like the Heroes sheet.
- (b) The seed adds the five Heroes characters (Pushistik, Mama, Tupik, Morzh, Papa Tupik) with their prompts as base prompts — local demo only, never the pilot.
- (a) Theme preference is per device (next-themes, key `kinolab-theme`); no schema change. Server-side preference stays LATER.
- (g) One-pick invariant unchanged. Copy clarifications only.
- Storage: the fresh pilot backend runs on Postgres + MinIO from its first boot (deploy/convex-backend.compose.yml); product code keeps using `ctx.storage`.
- Gate before hand-over: `pnpm typecheck && pnpm build && pnpm test:api && pnpm test:e2e` green on the local anonymous deployment, plus the both-theme screenshot pass.
