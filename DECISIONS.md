# Decisions log

Format: date — decision — why. Spec references are to the mega prompt
(`stravi-pilot-mega-prompt.md`).

- 2026-08-17 — **Working name "Slate" used in UI.** Spec calls it the working
  name; the shell, sign-in and README use it consistently.
- 2026-08-17 — **Dev auth fallback: Convex Auth Password provider** alongside
  Google. Google OAuth requires the studio's GCP client (user will set up
  later); Password keeps the app usable/testable now. Google activates
  automatically when `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are set on the
  deployment. Pilot onboarding should use Google sign-in.
- 2026-08-17 — **Convex anonymous local deployment** for development; linking
  to a Convex cloud project is a later one-liner (`npx convex login` +
  `npx convex dev --configure`).
- 2026-08-17 — **Asset provider `storage` added** to the spec's
  `gdrive | url` union: file bytes in Convex storage. This is the sanctioned
  M2 interim upload path (spec §11 M2) kept as a permanent fallback so every
  flow (upload, review, pick) works before a Drive hub is connected. On
  connect, new uploads go to Drive; pick-to-Approved copies only apply to
  Drive-backed assets.
- 2026-08-17 — **Drive API via REST (`fetch`) instead of the `googleapis`
  package.** Same server-side calls and scopes, but no huge dependency inside
  the Convex bundle and no `"use node"` runtime needed. Behavior per spec §7
  is unchanged (all writes with the Hub token, `supportsAllDrives=true`
  everywhere).
- 2026-08-17 — **Direct-upload cutoff 20 MB, not 25 MB** — Convex HTTP action
  request limit is 20 MiB. Larger files: "add big files in Drive, they'll
  appear here on next sync" (spec's own fallback).
- 2026-08-17 — **Daily-report cron runs hourly (UTC)** and fires a
  production's report when its local time passes 18:00 (Convex crons are
  UTC-only). Idempotent per (production, date).
- 2026-08-17 — **Invites claim on sign-in with matching email; no email
  sending anywhere** (spec F1). The team page shows the pending invite so the
  producer can tell people out-of-band (their Telegram).
- 2026-08-17 — **Seed placeholders are SVG, not PNG** — gradients + burned-in
  shot code, generated with zero dependencies and no network, stored in
  Convex storage. Browsers render them identically in cards and the Review
  Room compare.
- 2026-08-17 — **Membership `userId` made optional** in the schema (spec had
  it required with a separate `invitedEmail`): a pending invite is a
  membership row without a user, which makes "invite = membership row"
  literal and claim-on-signin atomic.
- 2026-08-17 — **shadcn/ui current generation (Base UI primitives)** — the
  CLI now installs `@base-ui/react`-based components rather than Radix.
  Accepted as-is; visual system is ours via tokens.
- 2026-08-17 — **Telegram notification fan-out**: `convex/lib/notify.ts` is
  the single fan-out point where a Telegram webhook can be added post-pilot.
- 2026-08-17 — **Parked (top post-pilot candidate): resource planning**, per
  spec §14.

- 2026-08-17 — **Adversarial review round applied** (multi-agent find →
  refute → fix): pick() now refuses to regress approved/final/delivered/
  killed shots; @mentions are filtered to studio members and notification
  hrefs validated against the production path (cross-studio injection
  closed); QC runs with zero required checks can no longer auto-pass;
  attach-to-shot refuses assets that already back a version; malformed URL
  filter ids no longer crash the shots query; due dates are clearable;
  Settings tab hidden for non-managers and the active studio auto-follows
  the production being viewed; Drive lib hardened (random multipart
  boundary, full pagination, refresh-token rotation, 10-min OAuth state
  TTL, folder-creation compare-and-set); user-facing server errors use
  `ConvexError` so messages survive production deployments' redaction.
- 2026-08-17 — **E2E harness**: `e2e/qa-flow.mjs` runs the full §13 demo
  (minus live Drive) headlessly via Playwright against the dev servers;
  `e2e/qa-aurora.mjs` walks every seeded screen. QA users/studios created in
  the local DB are invisible to real users (multi-tenant isolation).
- 2026-08-17 — **Known limitation**: the seeded "yesterday" daily report has
  fabricated stats and an empty full-day list — Convex `_creationTime`
  cannot be backdated, so seeded activity is all "today" (which makes
  "Generate now" demos rich instead).

- 2026-08-17 — **Product renamed to "Kinolab"** (domain kinolab.ai claimed by
  Niek). All user-visible copy, metadata, package name and localStorage keys
  renamed. The `SlateStrip` component, `slate-strip`/`slate-clap` CSS classes
  and the QC parameter "Slate info correct" keep their names — they refer to
  the physical clapperboard slate (the design motif), not the old brand.

- 2026-08-17 — **Brand embedded from kinolab.ai**: fonts Archivo (display +
  UI, variable width) and Martian Mono (codes/labels) via next/font; accent
  #FF6B2C with dark glyphs (replaces #FF4D00; status "picked" follows); dark
  mood now uses the site palette verbatim (#0b0d11 / #12161d / warm ink
  #f3efe8); light "office" mood retuned to the warm-paper family. Logo mark
  recreated as SVG (`components/app/kinolab-mark.tsx`) + KINOLAB.AI wordmark;
  tagline now the site hero: "From forty generations to one approved shot."
  The two-mood architecture (paper office / dark review room) is kept — the
  site is dark-only, but the product's light management surfaces are a spec
  §9 design decision; both moods now derive from the brand palette.

- 2026-08-18 — **Docker deployment baked in** (mirrors the user's Corticum
  Sense pattern): multi-stage `Dockerfile` (one-shot `convex-deploy` target +
  standalone Next runner on 8090 with `/api/health`), `docker-compose.yml`
  with `depends_on: service_completed_successfully` so the frontend only
  recreates after a successful function push; key-less runs skip the push and
  exit 0. Consequences: `convex/_generated` is now **committed** (the Convex
  CLI's own guidance; `codegen` refuses to run without a configured
  deployment inside the image), `next.config.ts` gained
  `output: "standalone"`, the middleware matcher excludes `/api/` so the
  healthcheck never round-trips to Convex, and `scripts/setup-auth.mjs` only
  defaults to the anonymous local deployment when no
  `CONVEX_SELF_HOSTED_URL` is set. Both images built and smoke-tested
  locally (health 200, sign-in renders, skip behavior verified).

- **Go-live hardening (2026-08-19).** Deviations introduced deliberately:
  (a) the sign-up gate now fails CLOSED — invite-only unless
  `ALLOW_OPEN_SIGNUPS=1`, except on a local dev backend detected from
  `CONVEX_SITE_URL`, so `pnpm dev` and both suites need no configuration;
  (b) `seed:run` is an `internalAction`, not public (`npx convex run` still
  reaches it); (c) list queries are **bounded**, not exhaustive — Convex
  hard-fails past 4,096 document reads, so `shots.list` (1000),
  `assets.listForProduction` (750), `approvals.ledger` (500),
  `search.global` (8/group) and `productions.listForStudio` (per-production
  ceiling) cap and the UI states the cap rather than truncating silently;
  (d) `shots.versionsCount` is denormalised, with
  `migrations.backfillVersionsCount` for existing rows; (e) superseding a
  version on pick now writes a `version.rejected` activity row — the daily
  report's Rejections tile read 0 on days full of them, and an e2e assertion
  encoded that bug; (f) a stage is "done" only while its gate is approved, and
  a decided gate must be re-requested before it can be decided again.
  Known gap shipped knowingly: **no password reset** (no email provider
  wired); mitigations in README §Go-live checklist.

## v1.1.0-pilot.2 — second tester round (2026-09-19)

Brief: `docs/SPEC-v2.md` (from First_Round.md and Heroes.png). Entries (a)–(f)
below are the spec's own decision texts; (g) is undecided.

- 2026-09-19 — **Dark is the default mood for every surface; light is a preference.** Spec §9 made management screens light ('production office') and only the Review Room dark ('grading suite'); DECISIONS 2026-08-17 kept both moods. First tester round (First_Round.md §1.1, §6): dark was the first ask and the meeting decided dark by default with light under Settings. Both palettes stay; what changes is the default and that the person chooses (per device, next-themes, key `kinolab-theme`, Settings + user menu). The Review Room stays dark regardless — the colour-judgement reason still holds. Consequence: Settings is now visible to every role (it was hidden for non-managers, 2026-08-17); manager-only cards are gated individually.
- 2026-09-19 — **Characters as first-class elements, stored as element rows plus slot shots.** Spec §2's model was episodes → scenes → shots → versions; characters and locations were Drive folders only. Round one (First_Round.md §2.3, §6, Heroes.png) wants the options-and-pick workflow for characters with Concept and Animation phases. v2 adds an `elements` table (kind: character now; location, script later) and stores each phase as a `shots` row carrying `elementId` + `slot`, so the Review Room, the one-pick invariant, the ledger, notifications, comments, history and (later) Drive filing work unchanged; list queries exclude slot rows by default. Chosen over a parallel element-versions model that would duplicate pick(), the Review Room and the ledger. Codes CH_/LOC_/SCR_ are reserved for elements. Known gap: with a Drive hub connected, slot picks would file under Shots/ — parked until Drive is live.
- 2026-09-19 — **Generation details are editable after upload; a provenance export exists per production.** Spec §5 recorded prompt metadata write-once at upload (the backend `updateMeta` existed without UI). Round one (First_Round.md §2.6, §6) did not understand the field and asked for editing and a legal export. Renamed 'Prompt details' → 'Generation details' (copy only). The export lists every version with prompt, tool, model, seed, file identity, creator and decision; cells are verbatim (no CSV formula guard — it is evidence), UTF-8 BOM; limited to production.manage and logged as `export.generated`.
- 2026-09-19 — **Shot creation is scene-first with generated numbering, plus a tabular import.** Spec F5 had a single-shot dialog and a paste-codes list. Round one (First_Round.md §2.5a, §6): name a scene, say how many shots, import many at once. `shots.importRows` becomes the batch path (`bulkCreate` kept one release as a deprecated alias); scene codes become unique per production (never enforced before). No sequence level is added — episodes → scenes → shots stays; the tester said 'sequence/scene' and the meeting did not ask for a third level.
- 2026-09-19 — **Codes are renameable; links are editable by content editors.** Spec §7.4 tied the shot code to the Drive folder and canonical filename, so v1 made it immutable. Round one (First_Round.md §2.4): renaming was the first thing the tester looked for. v2 adds `shots.rename` (content.edit, never artists; refused on delivered shots and on element slots), recorded as `shot.renamed` with a `formerCodes` trail; Drive folders and already-filed Approved files are NOT renamed (Drive is dormant on the pilot; a rename job is in the parking lot) — new picks use the new code. Scene codes become editable and unique. External links move from production.manage to content.edit so a Creative Director can fix a wrong storyboard link; artists and viewers read them. Production code stays immutable.
- 2026-09-19 — **Board cards are editable in place and every board element links into detail.** Spec F4 defined the Board as drag-between-stages plus gates. Round one (First_Round.md §6): 'more editable' and 'zoom from the board into the details'. v2 adds status/assignee/due edits on the card (same mutations and permission rules as the shot page), URL-addressable shot-page tabs (`?tab=`), cover thumbnails on cards, and column-title / scene-header links into the filtered Shots list. Reordering inside a column and multi-select are parked.

Build notes (2026-09-19, decided while building the entries above):
- **`scenes.list` is bounded with a per-scene `.take(50)` rather than a
  denormalised counter.** The old query collected every shot of every scene
  to count them — the same unbounded read `shots.list` was cured of on
  2026-08-19. Nothing on screen shows the number (the Shots page uses the
  rows for the scene filter), so `shotCount` saturates at 50 per scene under
  a 3,000-read budget across ≤ 500 scenes, and rows carry `shotCountCapped`.
  A counter on the scene would have meant a backfill migration and a second
  invariant to keep on every shot insert, move and delete, for a number
  nobody reads.
- **A character's detail page shows one phase at a time** (Concept |
  Animation switcher, `?slot=`) instead of stacking both sections: one set
  of status/assignee/due controls, one uploader and one set of tab names
  keeps every locator unambiguous, and the switcher still shows each phase's
  status, option count and pick at a glance. **Delete lives in the list row
  menu only** — removing the element while its detail query is subscribed
  would throw into the error boundary before the navigation away.
- **Review queue "Characters" = phases with options nobody has decided on
  yet** (slot shots with `versionsCount > 0` and a status outside picked /
  approved / final / delivered / killed); picks appear in "Decided today"
  like shots. The spec said "slot shots with options"; the narrower rule is
  what "needs a decision" means for shots too.
- **The Playwright suite stays self-contained by default** (every spec signs
  up its own throwaway owner); `E2E_EMAIL` / `E2E_PASSWORD` opt a spec into a
  real local account. Credentials are passed on the command line only, never
  stored in the repo. Two specs (decisions, generation-details) read
  `KINOLAB_E2E_EMAIL` / `KINOLAB_E2E_PASSWORD` instead — to be unified.

## v1.2.0-pilot.1 — visual pass (2026-09-20)

Brief: "more visual help in the software", against kinolab.ai. The brand
system (Archivo + Martian Mono, ink `#0b0d11`, tape `#ff6b2c`, warm paper) was
already the site's and is unchanged; what follows adds visual scaffolding on
top of it rather than restyling anything.

- 2026-09-20 — **Every frame slot shows a frame, and the empty one is unexposed film stock.** The same "no image yet" state was drawn five different ways — a centred mono code (shots grid), nothing at all (board card, so a card with no cover collapsed to two lines), an `ImageIcon` on flat muted (review queue, options tab) and a `Film` icon (filmstrip). One `ShotFrame` / `SlateFill` pair (`components/app/shot-frame.tsx`) now serves all five: sprocket perforations, viewfinder ticks and a gradient tinted with the shot's own status hue, its angle seeded by the shot code so a grid of pending shots varies instead of tiling. A grey rectangle reads as a broken image; film stock reads as "not shot yet", which is what is true. Consequence: the Board in Cards mode renders a frame for every card, not only for shots that already have a cover.
- 2026-09-20 — **The overview opens with the production's own numbers and its picked frames.** The page began with a bare "Overview" heading and three cards, and could be read top to bottom without seeing a single image — in a film tool. `OverviewVitals` puts a progress dial (approved-or-beyond over live shots), the shot / in-review / approved counts, a tape-accented "need you" chip when the viewer owes a decision, and a strip of picked frames into one band that also carries the heading. The heading text stays "Overview" — `wizard.spec.ts` and `theme.spec.ts` locate the page by it.
- 2026-09-20 — **The stage strip became a pipeline, and the tape accent now also marks the active stage.** Six segments reading "NOT STARTED" with a 12px circle whose meaning lived in a tooltip answered neither "where are we" nor "who is waiting". Each segment now carries its shot count, a fill showing how far those shots have got, and its gate state in words (Open / Sign-off / Signed / Rejected). Segments link to their own filtered shots (the board-column convention) instead of the whole band linking to the board. This **extends the tape rule** recorded in `app/globals.css` — previously "primary actions, Pick, unread markers only" — to include the single marker that says where the production is now; the accent stays rare enough to keep meaning what it means.
- 2026-09-20 — **The rail carries live counts, via a new `shots.counts` query rather than `shots.list`.** Badges show the shot total, the review queue and — in tape — approvals waiting on the viewer. The rail is mounted on every production page, so subscribing it to `shots.list` would have put an enrichment pass (a storage lookup per cover asset, plus user / scene / episode gets) behind a two-digit badge. `shots.counts` walks the same index with no enrichment, and composes `reviewQueue` exactly as the Review page does so the badge and the page can never disagree.
- 2026-09-20 — **Empty states are set in foreground with the icon in a badge.** Eight screens can be empty on day one of a production; `text-muted-foreground` on a dashed rectangle read as "nothing here" rather than "start here". The component gained an optional `description` so the detail can leave the headline.

- 2026-09-20 — **The artist gets a screen of their own: My work.** Every view in the app was built for whoever runs the production — the Overview opens on gates and reports, the Board on stages, Shots on a filterable table of everything — so an artist signing in landed on a producer's dashboard and had to filter their way to their own work. `/p/{id}/my-work` (first in the rail, for every role) groups the viewer's assigned shots by **whose move it is** rather than by stage or status: Needs you (rework first, then never-started, by due date) · In progress · With review · Settled. It includes element slot shots, which `shots.list` excludes by default, because an artist assigned a character phase still has to see it. Not made the default landing route — `wizard.spec` and `theme.spec` locate the production by the Overview heading, and changing where sign-in lands is a bigger decision than a design pass should take on its own.
- 2026-09-20 — **The compare canvas says what zoom it is at.** It has had wheel-zoom toward the cursor, drag-pan and reset-on-0 since v1, but no readout and no way back to a known state except by feel — and judging AI generations is mostly a zoom argument. The HUD adds −/percentage/+/Fit plus `−`, `=`/`+` on the keyboard (both characters bind separately: `e.code` is "Equal" for each and `bindingCandidates` only resolves `e.code` for letters and digits). The percentage is **relative to fit, not to the image's own pixels**: one transform is shared across up to four differently sized panes so anatomy lines up between options, and there is no single "100% of natural size" to show. Rejected showing a true 1:1 for the same reason, and because the canvas draws the cached **thumbnail** — past roughly 175% the pixels are interpolated, so a 1:1 label would have been a lie. The HUD instead surfaces "open the original" past that point. Swapping the canvas to full resolution was not done here: `asset.fileUrl` is a Drive `webViewLink` for Drive-backed assets (an HTML page, not an image), so a blind swap would break them. Parked as its own change.

## Open questions
- 2.5b multiple selections — undecided 2026-09-19; one-pick invariant unchanged; candidate designs: alternates / slots / take-forward; needs First_Round.md §2.5b Q1–Q6 answered. (Draft entry to use only when decided: "2026-09-19 — Pick stays single; approved alternates added as a tagged state — spec §6 invariant kept; round one asked for several selections (First_Round.md §2.5b); studio confirmed the case is <case>; alternates never count as the shot's decision.")

## Post-pilot parking lot
1. Resource planning / workload view (raised in discovery, spec §14).
2. Telegram notification delivery via `lib/notify.ts` fan-out.
3. Full-res video preview pipeline (currently: poster + Open in Drive).
