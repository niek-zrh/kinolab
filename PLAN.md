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

## M7 — v2 tester round (v1.1.0-pilot.2) — in progress, 2026-09-19
Brief: `docs/SPEC-v2.md`, written from the first tester round
(First_Round.md, Heroes.png) and adopted by the lead engineer that evening.
Built and tested against the local anonymous deployment only; the pilot
backend is untouched until the gate passes. Decisions in DECISIONS.md
(2026-09-19 entries). MUST list:
- [x] Foundation: schema (`elements`, `shots.elementId/slot/formerCodes`,
      `scenes.by_production_code`, `versions.by_production`), domain helpers
      (element kinds/slots/codes, shot-code pattern generator), `lib/csv.ts`,
      `shots.createShotRow` single insert path, CONTRACTS + DECISIONS
      updated, version 1.1.0-pilot.2
- [ ] a1 Dark by default + Appearance control (Settings visible to every
      role, avatar menu) + status-token contrast pass + both-theme
      screenshot walk of every route
- [ ] b1 Characters under Pre-production: `elements.ts`, one slot shot per
      phase (Concept + Animation — lead decision), list + detail pages,
      slot rows excluded from Shots/Board/counts/search, shot-page redirect
- [ ] c1 Generation details editable after upload (Options tab + Review Room
      rail), `versions.updateMeta` caps
- [ ] c2 Provenance CSV export (`exports.provenanceRows`, verbatim cells,
      BOM, paginated, `export.generated`)
- [ ] d1 New shots › Generate tab (scene-first, count/start/step/pattern) +
      `shots.importRows`; scene codes unique per production
- [ ] d2 New shots › Import tab from pasted text (TSV/CSV) with preview and
      per-row validation
- [ ] e1 Shot code rename (`shots.rename` + `formerCodes`), scene/episode
      selects on the shot header, Edit scene sheet (`scenes.update.code`),
      external links editable by `content.edit`
- [ ] f1 Board card menu (status / assignee / due), `?tab=` deep links,
      column-title links, cover thumbnails, 1,000-shot cap banner
- [ ] g1 Copy clarity for shortlist / pick — one-pick invariant unchanged
      (2.5b stays open, see DECISIONS "Open questions")
- [ ] Seed: the five Heroes characters with their prompts (local demo only)
- [ ] README: Appearance, Characters (Heroes-sheet mapping), New shots,
      Provenance export (verbatim-cells warning), demo script steps 3–4
- [ ] Gate: `pnpm typecheck && pnpm build && pnpm test:api && pnpm test:e2e`
      green locally + both-theme screenshot pass signed off in the PR; then
      tag v1.1.0-pilot.2
SHOULD / LATER items are ranked in docs/SPEC-v2.md §1 and stay parked unless
the lead engineer's decisions list says otherwise.

## Post-pilot backlog
See DECISIONS.md parking lot (resource planning first, Telegram fan-out,
video preview pipeline).
