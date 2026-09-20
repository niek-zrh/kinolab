# Kinolab — build plan

Built under the working name **Slate**; officially **Kinolab** (kinolab.ai)
since 2026-08-17. Milestones from spec §11; a box is
checked only after its acceptance criteria passed locally (typecheck + build +
Playwright end-to-end run in `e2e/`).

## M0 — Foundation ✅
- [x] Scaffold Next 15 (App Router, TS strict) + Tailwind v4 + shadcn/ui
- [x] Convex local dev deployment (anonymous), schema pushed
- [x] Convex Auth: Password (dev fallback) + Google (activates via env)
- [x] Permissions helper (`assertCan`) + activity + notify helpers
- [x] Studio create / invite claim on sign-in / team management (F1)
- [x] App shell: left rail, topbar, studio switcher, notifications bell
- [x] Team page UI

## M1 — Structure ✅
- [x] Production setup wizard (Drive step functional but env-gated) (F2)
- [x] Episodes / scenes / shots CRUD, bulk-create from pasted codes (F5)
- [x] Shot table + grid views, filters, inline edits (F5)
- [x] Pipeline board, drag between stages, stage instances (F4)

## M2 — Decisions ✅
- [x] Versions + uploads (Convex storage behind the assets interface) (F6)
- [x] Shot detail: Options / Discussion / Files / History (F6)
- [x] Review Room: queue, N-up compare, synced zoom, hotkeys, pick flow (F7)
- [x] Stage gates: request sign-off, approve/reject with note (F4 gates)
- [x] Decisions ledger + CSV export (F9)
- [x] Activity rows from every state-changing mutation

## M3 — Drive ✅ (code complete; dormant until GCP credentials exist)
- [x] Connect Google Drive flow (OAuth code flow, `drive.file`) (§7.2)
- [x] Hub scaffold + member sharing (§7.3), wizard step 2 (F2)
- [x] Uploads to Hub via Hub token; Picker attach; canonical Approved copies (§7.4)
- [x] Sync cron + thumbnails in Convex storage; Files tab; missing-file state (F8)
- [x] README GCP setup guide (§7.6)
- [ ] Live end-to-end test against a real Drive — **needs the GCP OAuth client
      only you can create (README §Google setup); everything else is done.**

## M4 — Rhythm ✅
- [x] Overview dashboard (F3)
- [x] Daily report cron (18:00 production tz) + publish + notify (F10)
- [x] Notifications center + fan-out (F12)

## M5 — Delivery & polish ✅
- [x] QC template (studio) + QC runs (production) (F11)
- [x] Seed script (§12): Aurora North / SIGNAL LOST / 14 shots / activity
- [x] Design pass via full-app screenshot review; keyboard overlay (`?`)
- [x] README: quickstart, GCP guide, demo script (§13)
- [x] Demo (§13) verified end-to-end via Playwright (`e2e/qa-flow.mjs`) —
      studio → wizard → bulk shots → upload → review-room keyboard pick →
      gate request/approve → report generate/publish → QC run to passed →
      delivery sign-off in Decisions. Zero console errors.
- [x] Adversarial multi-agent review (24 findings raised, 21 confirmed, all
      confirmed fixes applied — see DECISIONS.md)

## M6 — Go-live hardening ✅ (2026-08-19)
Full production-readiness review before the pilot: 14 test suites plus a
45-agent code audit across 12 dimensions, every finding adversarially refuted
and independently re-confirmed. 8 blockers found, all fixed and re-verified.
- [x] Studio takeover closed — roles have a rank; nobody grants a role above
      their own or changes their own (F1)
- [x] Sign-up gate fails CLOSED (open registration was the shipped default)
- [x] `seed:run` made internal — it was anonymously callable and plants
      claimable owner/producer invites
- [x] Review Room works on a Cyrillic keyboard (hotkeys match the physical
      key) and Pick/Shortlist/Reject are clickable — `versions.pick` had no
      button anywhere (F7)
- [x] Daily-report cron isolated per production + timezones validated; one bad
      row silently killed every report (F10)
- [x] Error boundaries — a stale link or forbidden production blanked the app
- [x] Every unbounded query bounded; a production died past ~4k shots. Shots
      can now be deleted and bulk paste is capped (F5)
- [x] Nightly `convex export` + documented restore; images pinned
- [x] Security headers + CSP + host allowlist, verified on the built image
- [x] `pnpm test:api` — 124-check server-side suite (six-role matrix, tenant
      isolation, concurrency, limits) the browser suite could not express
- [ ] Google Drive live end-to-end — still blocked on the GCP OAuth client
      (README §Google setup); do not enable for the pilot until exercised

## M7 — v2 tester round (v1.1.0-pilot.2) — code complete, gate pending (2026-09-19)
Brief: `docs/SPEC-v2.md`, written from the first tester round
(First_Round.md, Heroes.png) and adopted by the lead engineer that evening.
Built by parallel agents and tested against the local anonymous deployment
only; the pilot backend is untouched until the gate passes. Decisions in
DECISIONS.md (2026-09-19 entries + build notes). MUST list:
- [x] Foundation: schema (`elements`, `shots.elementId/slot/formerCodes`,
      `scenes.by_production_code`, `versions.by_production`), domain helpers
      (element kinds/slots/codes, shot-code pattern generator), `lib/csv.ts`,
      `shots.createShotRow` single insert path, CONTRACTS + DECISIONS
      updated, version 1.1.0-pilot.2
- [x] a1 Dark by default + Appearance control (Settings › Appearance for
      every role, avatar menu; next-themes, key `kinolab-theme`; Review Room
      always dark) + `.thumb-frame` letterbox pass + both-theme screenshot
      walk (`scripts/screenshot-themes.mjs`, `theme.spec.ts` T7) —
      `e2e/tests/theme.spec.ts`
- [x] b1 Characters under Pre-production: `elements.ts`, one slot shot per
      phase (Concept + Animation — lead decision), `/characters` list
      mirroring the Heroes sheet + `/characters/{id}` detail with a phase
      switcher (`?slot=`), slot rows excluded from Shots/Board/counts/search,
      shot-page redirect, Review queue "Characters" group —
      `e2e/tests/characters.spec.ts`, `e2e/api/elements.mjs`
- [x] c1 Generation details editable after upload (Options tab card +
      Review Room rail → `components/app/generation-details-dialog.tsx`),
      `versions.updateMeta` caps + `params` —
      `e2e/tests/generation-details.spec.ts`
- [x] c2 Provenance CSV export (`exports.provenanceRows` + `columns`,
      verbatim cells, BOM, CRLF, paginated, `export.generated`) from the
      Decisions ledger toolbar — `e2e/tests/decisions.spec.ts`,
      `e2e/api/exports.mjs`
- [x] d1 New shots › Generate tab (scene-first, count/start/step/pattern,
      live preview, numbering remembered per production) +
      `shots.importRows`; scene codes unique per production
- [x] d2 New shots › Import tab from pasted text or a .csv/.tsv file with
      header auto-detect, preview and per-row validation (≤ 500 rows);
      Edit scene sheet — `e2e/tests/shot-import.spec.ts`,
      `e2e/api/shots-v2.mjs`
- [x] e1 Shot code rename (`shots.rename` + `formerCodes`, "formerly …"
      hint, confirm dialog), scene/episode selects on the shot header
      (`shots.update` null-clears), Edit scene sheet (`scenes.update.code`),
      external links editable by `content.edit` — `e2e/tests/shot-detail.spec.ts`
- [x] f1 Board card menu (status / assignee / due; ⋯, right-click,
      Shift+F10), `?tab=` deep links, Picked chip → Review Room, column-title
      links, cover thumbnails + Compact | Cards toggle, 1,000-shot cap banner
      — `e2e/tests/board.spec.ts`
- [ ] g1 Copy clarity for shortlist / pick ("Shortlist (compare later)",
      "Shortlisted 3 — press 2/3/4 to compare", pick dialog names the
      superseded count) — NOT landed; one-pick invariant unchanged (2.5b
      stays open, see DECISIONS "Open questions")
- [x] Seed: the five Heroes characters with their prompts as base prompts,
      seeded options and picks (local demo only)
- [x] README: Appearance, Characters (Heroes-sheet mapping), New shots,
      Renaming, Board, Generation details + Provenance export (verbatim-cells
      warning), demo script steps 3–4; CONTRACTS / DECISIONS / PLAN
- [ ] Gate: `pnpm typecheck && pnpm build && pnpm test:api && pnpm test:e2e`
      green locally + both-theme screenshot pass signed off in the PR; then
      tag v1.1.0-pilot.2

Open at hand-off (2026-09-19 evening), owner in brackets:
- Spec helpers: `review.spec.ts`, `realtime.spec.ts`, `files-search.spec.ts`,
  `permissions.spec.ts`, `reports.spec.ts` still drive the removed
  "Paste codes" / inline "Shot codes" empty state — switch them to
  `helpers.bulkCreateShots` (New shots › Import); `helpers.bulkCreateShots`
  itself must scope its submit to the enabled Import-tab button (both tab
  panels stay mounted). [e2e owners]
- `shots.list` rows lack `pickedVersionIndex`, so the Board's Picked chip
  reads "✓ Review" instead of "✓ v3". [backend]
- Settings › Details card does not yet link to the provenance export (spec
  c.5); the button lives in Decisions › ledger toolbar. [settings]
- Daily report copy "Options added — shots and characters" not applied
  (counts are already right — a slot shot is a shot). [reports]
- `E2E_EMAIL` / `E2E_PASSWORD` vs `KINOLAB_E2E_EMAIL` / `KINOLAB_E2E_PASSWORD`
  — two specs use the second pair; unify. [e2e owners]
- SHOULD items not built: command-palette Characters group (b4), Import
  column re-map (d3), Generate assignee/due/stage defaults (d4),
  `promptMetaUpdatedAt/By` (c3), JSON export (c4), Board filters (f2),
  scene sub-headers (f3), gate chip → Decisions filter (f4), Unassign from
  the Board (needs `shots.update` to accept `assigneeId: null`).
SHOULD / LATER items are ranked in docs/SPEC-v2.md §1 and stay parked unless
the lead engineer's decisions list says otherwise.

## Post-pilot backlog
See DECISIONS.md parking lot (resource planning first, Telegram fan-out,
video preview pipeline).
