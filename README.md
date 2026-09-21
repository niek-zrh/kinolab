# Kinolab

Production orchestration for AI-native film studios. **Files live in Drive.
Decisions live here.** One calm overview per production, a stage-gated
pipeline, a shot list, characters under Pre-production with the same
options-and-pick loop per phase, a Review Room that formalizes the
options-screenshots-and-pick workflow, Google Drive as the file home, daily
production reports, a TV-delivery QC checklist, and a provenance export of
every prompt and decision.

Built on Next.js 15 + Convex (realtime) + Tailwind v4 + shadcn/ui.
**User manual: in the app — `?` for help on the screen you are on, `/help`
for the full illustrated guide. How to edit it: [docs/MANUAL.md](docs/MANUAL.md).**

Spec: `stravi-pilot-mega-prompt.md` · second-round brief: `docs/SPEC-v2.md` ·
decisions log: [DECISIONS.md](DECISIONS.md) ·
backend API contract: [docs/CONTRACTS.md](docs/CONTRACTS.md) · plan: [PLAN.md](PLAN.md).
Current version: **1.2.0-pilot.1** — what changed is in
§What changed in v1.2.0-pilot.1.

---

## Quickstart (clone → seeded app in ~10 minutes)

Prerequisites: Node 20+, pnpm 9+.

```bash
pnpm install

# 1. Create the local Convex dev deployment (no account needed) and push:
CONVEX_AGENT_MODE=anonymous npx convex dev --once

# 2. Generate + store the Convex Auth signing keys on that deployment:
node scripts/setup-auth.mjs

# 3. Seed the demo studio (Aurora North / SIGNAL LOST: 14 shots, the five
#    Heroes characters with their prompts, activity). LOCAL DEMOS ONLY —
#    never against the pilot backend, see §Go-live checklist:
CONVEX_AGENT_MODE=anonymous npx convex run seed:run

# 4. Run backend + frontend together:
pnpm dev            # convex dev + next dev → http://localhost:3000
```

Sign in with **email + password** (the dev fallback — Google sign-in activates
once you finish the Google setup below). Sign-up with one of these emails
(any password ≥ 8 chars) claims a seeded role:

| Email | Role |
|---|---|
| `niek.tenhove@gmail.com` | Owner |
| `producer@demo.slate` | Producer |
| `director@demo.slate` | Creative Director |
| `artist@demo.slate` | Artist |

Those four rows are **claimable pending invites**: the password provider does
not verify email ownership, so whoever registers with one of these addresses
takes that seat — including the owner seat. Fine on a local dev backend (where
sign-ups are open by design), never on the pilot backend.

Use two browser profiles (e.g. producer + director) to see realtime
collaboration — boards, review rooms and gate chips update live.

## The demo that must work (pilot acceptance, spec §13)

1. **Producer** signs in → opens **SIGNAL LOST** → Overview shows the stage
   strip, pending decisions, today's activity.
2. Board → column *Previews & Review* menu → **Request sign-off**. In the
   second browser, the **Creative Director** sees the approval (bell +
   Overview), approves with a note → the chip flips live in browser one.
3. **Artist** opens shot `SC010_SH020` → pastes/drops two images → versions
   v5, v6 appear (with a Drive hub connected they also land in
   `…/Shots/SC010_SH020/Options/`). Then **Pre-production › Characters**:
   the five Heroes are there (Pushistik, Mama, Tupik, Morzh, Papa Tupik —
   Pushistik, Mama and Papa Tupik already have a picked Concept). Open
   **Tupik** → Concept → drop two more images → v3, v4; back in the list the
   Concept cell reads "4 options · Options ready". **Paste names** with
   `Sova\nLisa` adds two characters with codes SOVA / LISA in one go.
4. **Creative Director** → Review → `SC010_SH020`: `2`–`4` to compare,
   scroll to zoom (synced), `S` to shortlist two, `P` to **pick** with a note
   → siblings rejected, shot flips to *picked*, Decisions ledger + activity
   updated, artist notified. With a hub: the canonical file appears in
   `Approved/`. The queue's **Characters** group lists *Tupik — Concept*:
   open it, `P` on v4 → the Characters list shows the picked thumb and
   *Picked* in Tupik's Concept cell, **Final › Open** is enabled, and
   Decisions › Picks lists `CH_TUPIK_CONCEPT`. (The shot page is the same
   page for both — a character phase *is* a shot underneath.)
5. **Producer** → Reports → **Generate now** → the day's picks/uploads/
   comments are in the report → **Publish** (everyone gets notified).
6. **Delivery engineer** (owner works) → QC → **New QC run** "EP01 — TV
   Master" → work the checklist to *passed* → it appears in Decisions as a
   delivery sign-off.
7. Bring an existing Drive file in: shot → Files → **Attach from Drive** →
   pick it in the Google Picker → it appears on the shot, and the hub copy
   lands in the shot's folder.

   > Note: dropping a file into the hub folder *in Drive itself* and pressing
   > **Sync now** does NOT surface it. The app requests only `drive.file`,
   > which grants access to files the app created plus files the user hands it
   > through the Picker — a file dragged in via Drive's own UI is neither, so
   > `files.list` never returns it. Seeing everything in the folder would need
   > `drive.readonly` or `drive`, both of which are *restricted* scopes
   > requiring Google's CASA security assessment. The Picker is the supported
   > route in, and **Sync now** keeps already-known files up to date
   > (renames, new revisions, trashed files).

---

## What changed in v1.2.0-pilot.1 (visual pass)

A design pass against kinolab.ai, asked for as "more visual help in the
software". The brand system was already the site's (Archivo + Martian Mono,
ink `#0b0d11`, tape `#ff6b2c`, warm paper) and is unchanged — this adds
visual scaffolding on top of it. Decisions: DECISIONS.md §v1.2.

- **Every frame slot shows a frame.** `components/app/shot-frame.tsx` draws
  the cover when there is one and unexposed film stock when there is not —
  sprocket perforations, viewfinder ticks and a tint carried from the shot's
  status, seeded by its code so a grid varies instead of tiling. It replaces
  five different "no image" treatments (a mono code, nothing at all, two
  `ImageIcon`s and a `Film` icon). The Board in Cards mode now renders a
  frame for every card; the Shots **table** — the default view, previously
  imageless — gets a thumbnail in its code cell.
- **The Overview opens with the production's numbers and its picked frames**
  — a progress dial, shot / in-review / approved counts, a tape "need you"
  chip, and a strip of the frames that have been picked.
- **The stage strip is a pipeline**: per-stage shot counts, a progress fill,
  and gate state in words (Open / Sign-off / Signed / Rejected). Segments
  link to their own filtered shots.
- **The rail carries live counts** — shots, the review queue, and approvals
  waiting on you (in tape). Backed by a new `shots.counts` query that skips
  enrichment, because the rail mounts on every production page.
- **Empty states** set the message in foreground with the icon in a badge.
- **My work** (`/p/{id}/my-work`, first in the rail) — the artist's screen.
  Assigned shots grouped by whose move it is: Needs you · In progress · With
  review · Settled, character phases included.
- **The compare canvas says what zoom it is at** — −/percentage/+/Fit, with
  `−`, `=`/`+` and `0` on the keyboard, and a link to the original once you
  zoom past what the cached preview can honestly show.

Fixed while testing this (pre-existing, unrelated to the visuals): `board.spec.ts`'s
`signUpResilient` waited for the studio switcher, which a brand-new account
never sees — it lands on the create-studio screen — so every board test died
in `beforeAll`.

## What changed in v1.1.0-pilot.2 (second tester round)

Everything below came out of the first tester round (`docs/SPEC-v2.md`,
written from First_Round.md and the studio's "Heroes" sheet). Nothing here
needs a data migration: new tables and optional fields only.

### Appearance

The app opens **dark** on every device. **Settings › Appearance** (the first
card, visible to every role) and the avatar menu offer Dark | Light | System;
both write the same preference. It is per device, not per account
(localStorage `kinolab-theme`, via next-themes) — a shared laptop keeps one
choice for everyone who uses it, and a private window with blocked storage
simply opens dark. Choosing System follows the OS live.

The **Review Room and its dialogs are always dark**, whatever you chose:
colour judgement wants a neutral surround. Under Light the transition into
the room is intentional; leaving it restores your theme. Thumbnails
everywhere (option cards, board cards, files, filmstrip) sit in a hairline
frame on a muted letterbox so light images do not float on dark.

Settings is in the rail for every role now. The cards that need
`production.manage` — Details editing, Stages & gates, Drive hub — still hide
themselves from everyone else; **Links** is readable by every role and
editable by `content.edit` roles (owner, producer, creative director,
supervisor), so a CD can fix a wrong storyboard link.

### Characters (Pre-production)

Rail: **Pre-production › Characters** → `/p/{id}/characters`. The list is the
studio's Heroes sheet, column for column:

| Heroes sheet | Kinolab |
|---|---|
| № | row number |
| Name | **Name** + mono code (`PUSHISTIK` — derived from the name, editable) |
| Concept / Concept Status | **Concept**: thumbnail + status pill; click → the character's Concept phase |
| Animation / Anim Status | **Animation**: the same for the second phase |
| Final | **Final › Open** — the picked file of the latest picked phase (disabled until something is picked) |
| URL | folded into Final › Open |
| Prompt | **Prompt** — the character's base prompt (click to edit inline; blur saves, Esc cancels; copy button) |
| colour flags | the status pills |

Underneath, **each phase is a shot**: creating a character creates one "slot
shot" per phase (`CH_PUSHISTIK_CONCEPT`, `CH_PUSHISTIK_ANIMATION`, stage
Pre-Production, no scene), so uploading options, shortlist / reject / pick
with the one-pick rule, the Review Room, comments, history, the Decisions
ledger, notifications and the daily report all work on a character phase
exactly as on a shot — and the report's tiles count character options and
picks alongside shot work. Slot shots never show up on the Shots page, the
Board, the Overview counts or search; a link that points at one (a
notification, a ledger row, history) lands on the character page with the
right phase selected. The prefixes `CH_`, `LOC_` and `SCR_` are reserved:
an ordinary shot cannot use them.

- Header "Characters · N" (capped at 300 — the header says "(first 300)").
- **New character** (hotkey `N` on this page): the code is derived from the
  name (ASCII letters and digits, spaces → `_`, uppercased) and can be
  changed before saving; a Cyrillic-only name asks for a code — "Codes use
  A–Z, 0–9 and _". Codes are unique per production; duplicate names are
  allowed.
- **Paste names**: one name per line (up to 200); code collisions get
  `_2`, `_3`; names that yield no code are reported as skipped. The empty
  state ("No characters yet. Add one, or paste the names from your sheet.")
  carries the same form inline.
- Row menu (`{name} menu`): **Rename…** (name and code — renaming the code
  renames the phase shots too, and the old code is kept as "formerly …"),
  **Edit prompt…**, **Open in Review Room** (the first phase with options),
  **Delete** — refused while any phase has options ("This character has
  options — remove them first"). Delete is on the list only, not on the
  detail page.
- Detail page `/p/{id}/characters/{elementId}`: name and code (Rename
  dialog), description and base prompt (with Copy), then a **Concept |
  Animation** switcher (`?slot=`, Concept by default) showing one phase at a
  time — the shot page's Status / Assignee / Due controls and the Options |
  Discussion | Files | History tabs for that phase, plus "Open in Review
  Room". The switcher shows every phase's status, option count and pick.
- Review → the queue gains a **Characters** group: phases that have options
  and no decision yet. Character picks appear in "Decided today" like shots.
- Who may do what: create, rename, edit prompts and delete = `content.edit`
  roles; artists upload options to any phase, comment, and change a phase's
  status / assignee / due date only when assigned; deciding follows the shot
  rules (a supervisor decides when gate approver of Pre-Production);
  viewers read and comment.

The demo seed creates the five Heroes with their sheet prompts as base
prompts, a few placeholder options, three picked Concepts (Pushistik, Mama,
Papa Tupik) and Papa Tupik's picked Animation — the sheet's one green cell
(local demos only — never the pilot). Locations and scripts use the same model later;
today only characters have a UI.

### New shots (Generate | Import)

Shots › **New shots** (hotkey `N`) opens a dialog with two tabs; the
dropdown next to the button has **Single shot…** (the one-shot dialog, kept
for inserts such as `SH015`) and **Import list…**. A production with no
shots shows the same panel inline.

**Generate** — name a scene, say how many shots:

- **Existing scene | New scene** (New is preselected when the production has
  no scenes yet). Existing → pick a scene (the episode follows it). New →
  scene code (`SC010`), optional title, episode when episodic. Scene codes
  are unique per production now.
- **Count** 1–200 (larger numbers are clamped and say so), **Start** 10,
  **Step** 10 (≥ 1), and the **pattern** `{SCENE}_SH{N:3}` behind "Customise
  pattern" — tokens `{SCENE}`, `{N}` / `{N:pad}` (zero-padded number),
  `{EP}` (`EP01`), `{I}` (1-based row index); Reset puts the default back.
- A live **preview** of the codes (the full list up to 50, else first three
  / … / last) marks codes that already exist — "exists — will be skipped",
  "2 of 5 already exist" — so the submit reads "Create 3 shots in SC020"
  with the number that will actually be created.
- **Titles**, one per line, line *i* → shot *i*; extra lines are reported as
  ignored. Enter submits from every field except Titles (there
  ⌘/Ctrl+Enter). On success: toast, and the Shots table filtered to that
  scene. The last Start / Step / Pattern are remembered per production on
  this device (`kinolab-shot-numbering:{productionId}`).

**Import** — paste from your sheet (Google Sheets pastes tab-separated), or
pick / drop a `.csv`, `.tsv` or `.txt` file:

- A line containing tabs, commas or semicolons is one row of columns;
  otherwise every line is one code. Quotes, CRLF and a BOM are tolerated.
- The **header is auto-detected** when the first row names any of
  `code`/`shot`, `title`/`name`, `scene`, `episode`/`ep`, `assignee`,
  `due`/`due date`; without a header the columns are positional: code,
  title, scene. Without a Scene column the Scene / Episode pickers below the
  textarea apply to every row. Up to **500 rows** per paste.
- The preview gives every row a verdict: ok · exists (skip) · duplicate in
  paste (skip) · invalid code (empty, > 64 chars, a reserved `CH_`/`LOC_`/
  `SCR_` prefix, characters outside A–Z 0–9 `_` `-`) · title too long
  (> 200) · unknown scene → will be created (with **Create missing scenes**,
  on by default) · unknown episode · unknown assignee · bad date (dates
  are `YYYY-MM-DD`; `DD.MM.YYYY` is converted). Invalid rows and in-paste
  duplicates are dropped; existing codes are skipped, never overwritten.
  The footer reads "Create 42 shots · 3 skipped · 1 invalid"; the server is
  authoritative and reports what it skipped.
- One activity row per import ("Anna created scene SC010 and 10 shots");
  assignees get one aggregated notification each.

**Edit scene**: the pencil on the scene filter chip opens the Edit scene
sheet — code, title, episode, description, storyboard (Figma) URL, and
**Delete scene** when it has no shots. **Changing a scene's code does not
rename its shots' codes** (the sheet says so); rename shots individually.

### Renaming and re-linking

- **Shot code**: on the shot page, `content.edit` roles click the mono code
  in the heading (or ⋯ "Shot code actions" › **Rename code…**), edit inline
  (Enter or blur to submit, Esc to cancel) and confirm: "Renaming SC010_SH020
  → SC010_SH025. Comments and history keep the old text; the rename is
  recorded." The heading then shows "formerly SC010_SH020"; the ledger,
  search and the Review Room read the new code; History has the
  `shot.renamed` row. Refused for an existing code, on delivered shots and on
  character phases (rename the character instead); artists never rename.
  **Drive folders and already-filed Approved copies are not renamed** — Drive
  is dormant on the pilot; new picks use the new code.
- **Scene / episode of a shot**: the meta line on the shot page is a
  scene select (with inline create) and an episode select for `content.edit`
  roles; choosing a scene sets the episode from it. Text for everyone else.
- **Links** (Settings › Links): read by everyone, edited by `content.edit`.
- **Production code** stays immutable — it is in every canonical filename
  and the Drive root; the Details card says "ask us".
- **Generation details** of a version — see below. Character name, code,
  description and base prompt — see §Characters.

### Board

Cards are places to work now, and every element links into detail:

- The **⋯ menu** on a card (hover / focus, right-click, Shift+F10 or the
  Menu key): **Status ▸**, **Assign to ▸** (studio members), **Due date…**
  (date popover with Clear), Open shot, Open in Review Room, Discussion /
  Files / History (deep links), Copy code. The status pill and the assignee
  avatar open the same submenus; the due chip opens the date popover.
  Permissions match the shot page — `content.edit` roles on any shot,
  artists on their own shots within the working statuses, viewers see no
  menu (links still work) — and the server enforces everything: Approved
  without a pick comes back as "Pick a version before approving this shot"
  and the pill reverts. There is no Unassign (the backend cannot clear an
  assignee yet).
- The card is focusable (Enter opens the shot); the code and title are the
  links. "4 options" opens the Options tab; the shot page's tabs are
  URL-addressable — `?tab=options|discussion|files|history`.
- A **Picked** chip (✓) on a shot with a pick opens the Review Room. It
  reads "✓ v3" once `shots.list` carries the picked index; until then
  "✓ Review".
- **Cover thumbnail** strip on cards with options, with a **Compact |
  Cards** toggle in the header remembered per device (localStorage
  `kinolab.boardView`).
- Column title → the Shots page filtered to that stage; the same 1,000-shot
  cap banner as the Shots page ("first 1000 — narrow with a filter").
- Test hooks are stable: cards carry `aria-label="{code}"` and
  `data-shot-card="{code}"`; the controls are `Actions for {code}`,
  `Change status of {code}`, `Assign {code}`, `Due date of {code}`.

### Generation details and the provenance export

"Prompt details" is now **Generation details** — tool, model, prompt, seed,
params and a note: "so anyone can regenerate this option or show how it was
made." Set them in the upload popover ("Applied to the next uploads. You can
edit them later on each option.") and **edit them later on any option**:
Options tab card › **Edit details** (pencil), or the Review Room's right rail
› Generation details › Edit. The creator of the version and `content.edit`
roles may edit (an artist only their own uploads; viewers never). Caps:
prompt and params 20,000 characters, tool / model / seed 200, note 2,000.
Every edit is a `version.updated` row in History.

**Export provenance (CSV)** — Decisions › ledger toolbar, next to "Export
CSV", for owners and producers only. One row per version across shots *and*
character phases, newest first, rejected and superseded versions included:
studio and production, target (shot or character, code, title, phase),
scene and episode, version number and status, when it was created (UTC and
production-local) and by whom (name, email), tool / model / prompt / seed /
params / note, the file (name, MIME type, size, MD5, provider, location,
missing flag), the canonical Approved filename when picked, the decision
(who, when, note) and when the details were last edited and by whom — 37
columns, listed in `docs/CONTRACTS.md` §exports.ts. The file is
`{CODE}_provenance_{YYYY-MM-DD}.csv`, UTF-8 with BOM (Excel + Cyrillic),
CRLF, fetched 400 rows at a time with a progress toast, and logged in the
activity feed as "Niek exported provenance (312 rows)".

> **Cells are verbatim.** This file is evidence, so every cell is quoted
> exactly as stored and **no spreadsheet formula guard is applied** — unlike
> the ledger's Export CSV. A prompt that begins with `=`, `+`, `-` or `@`
> will be evaluated as a formula if you open the file in Excel or Google
> Sheets by double-clicking. Open it as text, or import it with every column
> typed as text.

> **Storage rows name only the app's storage id.** For files uploaded
> through the app, `file_location` is `app storage:{storageId}` — the Convex
> `_storage` id, not an S3 object key: the backend's per-database prefix and
> the MinIO key are invisible to application code. The id is what the export
> zip uses (`_storage/<id>` in the backup, §Backups and restore), which is how
> to hand the bytes over alongside the CSV. Drive-backed rows carry the
> `webViewLink`; link rows carry the URL; a version whose file is gone has
> `file_missing` = `true` and empty `file_*` cells.

---

## Google setup (spec §7.6) — enables Google sign-in, Drive hub, Picker

The app runs fully without this (password auth + Convex-storage uploads).
Do this before the pilot so files live in the studio's own Drive.

1. Create a GCP project → enable **Google Drive API** and **Google Picker
   API** (APIs & Services → Library).
2. **OAuth consent screen**: External · app name "Kinolab" · scopes: `openid`,
   `email`, `profile`, `https://www.googleapis.com/auth/drive.file` (all
   non-sensitive → no CASA security assessment) · **Publish to "In
   production"** (do NOT stay in Testing — testing refresh tokens expire
   every 7 days and silently break sync).
3. **Credentials → OAuth client (Web application)** with redirect URIs
   (`<convex-site-url>` is `NEXT_PUBLIC_CONVEX_SITE_URL` from `.env.local`,
   e.g. `http://127.0.0.1:3211` locally):
   - `<convex-site-url>/api/auth/callback/google` (sign-in)
   - `<convex-site-url>/google/drive/callback` (Drive connect)
4. **Credentials → API key**, restricted to the Picker API (browser).
5. Set the env vars:

```bash
# on the Convex deployment:
npx convex env set AUTH_GOOGLE_ID <oauth-client-id>
npx convex env set AUTH_GOOGLE_SECRET <oauth-client-secret>
npx convex env set GOOGLE_DRIVE_CLIENT_ID <oauth-client-id>      # may reuse
npx convex env set GOOGLE_DRIVE_CLIENT_SECRET <oauth-client-secret>
npx convex env set GOOGLE_PICKER_API_KEY <api-key>
```

That is the whole inventory — nothing Google-related belongs in `.env.local`.
The browser never sees these: the Picker gets its `apiKey`, a short-lived
access token and the `appId` from `drive.getPickerConfig`, which derives the
`appId` from the numeric prefix of the OAuth client id (that prefix *is* the
GCP project number).

**What this costs: nothing.** The OAuth client id/secret and the Picker API
key identify *this application* to Google — they are not metered and they do
not require a billing account on the GCP project. Sign in with Google, the
Drive API and the Picker API are free; they have per-day quotas, not charges.
One client serves the whole studio: every member signs in with their own
Google account, and each person's Drive connection is stored per-user.

If the studio runs on Google Workspace, create the OAuth client as **Internal**
— then only Workspace accounts can use it and Google requires no app
verification at all.

Then in the app: production **Settings → Drive hub → Connect Google Drive**
→ choose where the hub lives → the folder tree is scaffolded and shared with
the team. Uploads, picks (canonical `Approved/` copies) and the 5-minute
metadata sync activate automatically.

How the integration behaves (spec §7): scope is only `drive.file` — the app
can touch nothing in anyone's Drive except the hub **it created** and files
users **explicitly picked** (which is also why files added to the hub through
Drive's own UI stay invisible to it — see the note in the demo script). All hub writes use the hub owner's token;
personal tokens only read files their owner picked. Thumbnails are cached in
Convex storage; full files never pass through the app.

## Going to Convex cloud (shared pilot deployment)

```bash
npx convex login
npx convex dev --once --configure=new   # attaches this repo to a cloud dev deployment
node scripts/setup-auth.mjs <your-app-url>
npx convex run seed:run                 # demo deployments only — plants
                                        # claimable invites (see §Go-live checklist)
# re-set the Google env vars on the cloud deployment (env vars don't migrate)
```

`.env.local` is rewritten automatically with the cloud
`NEXT_PUBLIC_CONVEX_URL`. Deploy the Next app anywhere (Vercel etc.) with
`NEXT_PUBLIC_CONVEX_URL` + `NEXT_PUBLIC_CONVEX_SITE_URL` set, and update
`SITE_URL` + the Google redirect URIs to the public URLs.

## Deploying with Docker (self-hosted Convex behind the host proxy)

`docker-compose.yml` follows the Corticum pattern: every
`docker compose up -d --build` first runs the one-shot **convex-deploy**
service (pushes `convex/` to the self-hosted backend), and only if that push
succeeds does the **frontend** container get (re)created — a new frontend
never serves against stale functions. Without
`CONVEX_SELF_HOSTED_ADMIN_KEY` set, the push logs a skip notice and the
frontend deploys as before.

The pilot environment:

| What | URL |
|---|---|
| Frontend (this compose, via the host proxy) | `https://pilot.kinolab.ai` |
| Convex backend API (`CONVEX_CLOUD_ORIGIN`) → backend port 3210 | `https://api.kinolab.ai` |
| Convex HTTP actions (`CONVEX_SITE_ORIGIN`) → backend port 3211 | `https://actions.kinolab.ai` |

### The backend holds nothing; Postgres and MinIO are the state

`deploy/convex-backend.compose.yml` runs the Convex backend **stateless**:
`kinolab-convex-backend` has no volume (the container keeps only
`$DATA_DIR/tmp` scratch), documents live in `kinolab-postgres` (volume
`kinolab-pgdata`; Postgres 17, the version upstream tests), and file storage,
deployed function modules, search indexes and export/import staging live in
five MinIO buckets. Recreate the container, swap the image, move it to
another host — pointed at the same database and buckets, the pilot is
intact. Until 2026-09-18 both lived in one `convex-data` volume, and one
tables-only export later every uploaded file was gone.

**Layout on the server.** The repo is cloned on the server (say
`/srv/kinolab/app`). The backend's variables are `deploy/.env`, copied from
`deploy/convex-backend.env.example` (gitignored: `.gitignore` lists `.env`,
which matches at every depth). Nightly zips go to `BACKUP_DIR`, default
`/var/backups/kinolab`, outside the checkout. The compose pins its project
name (`name: kinolab-backend`), so the database volume is
`kinolab-backend_kinolab-pgdata` whatever directory it is run from, and
`docker compose down -v` is the one command that deletes it. Every backend
command runs from the checkout root as

```bash
docker compose -f deploy/convex-backend.compose.yml <cmd>     # "the backend compose" below
```

The image is `ghcr.io/get-convex/convex-backend`, pinned via
`CONVEX_IMAGE_TAG` to `c0cb7ae17f54e14846c243c5332a8a5e6d0e19d4` (2026-08-10
build; dashboard on the same tag). Its `run_backend.sh` at that commit turns
environment variables into backend flags. The compose sets the fixed ones
itself: `POSTGRES_URL` (→ `--db postgres-v5`; no database name, the backend
derives it from `INSTANCE_NAME`), `DO_NOT_REQUIRE_SSL`, `AWS_REGION`, **all
five** `S3_STORAGE_*_BUCKET` names (together they select `--s3-storage`),
`AWS_S3_FORCE_PATH_STYLE=true` and `AWS_S3_DISABLE_SSE=true` (Rust's `bool`
parser: the literal string `true`; `1` is silently false; this MinIO needs
path-style addressing and rejects the SSE header; do **not** set
`AWS_S3_DISABLE_CHECKSUMS`, trailing checksums work). `deploy/.env` supplies
only what is specific to this installation — `INSTANCE_NAME`,
`INSTANCE_SECRET`, `CONVEX_CLOUD_ORIGIN`, `CONVEX_SITE_ORIGIN`,
`NEXT_PUBLIC_DEPLOYMENT_URL`, `POSTGRES_PASSWORD`,
`KINOLAB_S3_ACCESS_KEY`/`KINOLAB_S3_SECRET_KEY` (the scoped MinIO user
`kino`), optionally `KINOLAB_S3_ENDPOINT`, `CONVEX_IMAGE_TAG`, `BACKUP_DIR`,
`CONVEX_SELF_HOSTED_ADMIN_KEY` and the `OFFSITE_*` block. Every required
value carries a `${VAR:?}` guard: `up` refuses to start when one is missing
or empty, and the template ships them empty. The MinIO keys are
project-prefixed on purpose: compose lets a variable exported in your shell
override `.env`, and an `aws` CLI session with other keys in
`AWS_ACCESS_KEY_ID` would otherwise boot the backend with them. Nothing is
passed by `env_file`; the dashboard receives only its URL.

> **The first boot decides the storage type, permanently.** On its first
> start against an empty database the backend writes the storage type into
> the database (`database_globals`), with a per-database S3 prefix
> `kinolab-<uuid>/`, and never changes it. If that boot went to
> `--local-storage`, every later start with S3 configured fails with
> `Database was initialized with Local {…}, but backend started up with S3`
> and the container crash-loops. Choosing S3 prints **nothing** in the log;
> only a *partial* set of S3 variables prints `Warning: … Falling back to
> local storage`. So `deploy/.env` must be complete before the first `up`,
> and the proof is PID 1's command line, not the log (the entrypoint `exec`s
> the binary):
>
> ```bash
> docker compose -f deploy/convex-backend.compose.yml exec kinolab-convex-backend \
>   sh -c "tr '\0' '\n' </proc/1/cmdline | grep -E -- '--(s3|local)-storage|--db'"
> # must print  --db  (followed by postgres-v5)  and  --s3-storage
> ```
>
> Wrong? Before any import: `docker compose -f deploy/convex-backend.compose.yml
> down -v` (deletes the still-empty `kinolab-pgdata`), fix `deploy/.env`,
> `up -d`, check again. Objects in the buckets sit under the per-database
> prefix, so a new database never sees an old database's objects — files come
> back through the export zip, never through the bucket.

MinIO runs on the same host outside this compose project, API on host port
9000 (console 9001). The host's own name does not resolve inside containers,
so the backend service carries `extra_hosts: host.docker.internal:host-gateway`
(Linux Docker 20.10+) and `KINOLAB_S3_ENDPOINT` defaults to
`http://host.docker.internal:9000`; the LAN IP works too. Buckets — they must
exist before the first boot, the `kino` policy cannot create them:
`kinolab-files` (versioning **on**), `kinolab-exports`,
`kinolab-snapshot-imports`, `kinolab-modules`, `kinolab-search`; no object
lock on any of them.

### The proxy in front

The public proxy is **Caddy on the host** (responses carry `via: 1.1 Caddy`),
reached through Cloudflare. The backend compose joins no external network
and carries no proxy labels; it publishes loopback ports for the host proxy —
`127.0.0.1:3230 → 3210` and `127.0.0.1:3231 → 3211`, not 3210/3211
themselves, because another Convex backend on the same server may hold those.
The whole Caddy side for the backend:

```caddyfile
api.kinolab.ai {
    reverse_proxy 127.0.0.1:3230
}
actions.kinolab.ai {
    reverse_proxy 127.0.0.1:3231
}
```

`reverse_proxy` passes the WebSocket upgrade the Convex client needs; TLS
between Cloudflare and Caddy is §The Cloudflare → origin hop. If Caddy turns
out to be a container, loopback is invisible to it: `docker network connect
kinolab-backend_kinolab-internal <caddy container>` and use
`reverse_proxy kinolab-convex-backend:3210` / `:3211` instead.

The frontend `docker-compose.yml` is still written for Traefik/Dokploy: it
hardcodes the external network `dokploy-network` (create it once with
`docker network create dokploy-network`, or its `up` refuses) and publishes
**no** host port, so under Caddy `pilot.kinolab.ai` needs a published port
added to that file (`127.0.0.1:8090:8090`) before Caddy can `reverse_proxy`
it.

Frontend environment (a `.env` next to `docker-compose.yml` on the server;
Dokploy's Environment tab only if Dokploy is the deployer — the compose also
accepts `NEXT_PUBLIC_DEPLOYMENT_URL` as the API-origin fallback, matching the
dashboard's variable):

```bash
CONVEX_SELF_HOSTED_URL=https://api.kinolab.ai
CONVEX_SELF_HOSTED_ADMIN_KEY=<never commit this>
NEXT_PUBLIC_CONVEX_URL=https://api.kinolab.ai       # inlined at build → rebuild to change
NEXT_PUBLIC_CONVEX_SITE_URL=https://actions.kinolab.ai  # also feeds the CSP (build time)
ALLOWED_HOSTS=pilot.kinolab.ai                      # hosts allowed into redirect URLs
FORCE_HTTPS=1                                       # served only via TLS proxies
```

`.env.local.example` carries the inventory for the frontend (build args and
runtime) and the Convex deployment (`npx convex env set …`);
`deploy/convex-backend.env.example` is the authoritative list for the backend
compose project (Postgres, MinIO/S3, backup, offsite mirror).

> **These planes are not interchangeable — this is the easiest thing to get
> wrong.** Anything read by code under `convex/` (the Google credentials,
> `INVITE_ONLY_SIGNUPS`, `ADMIN_SIGNUP_ALLOWLIST`, `SITE_URL`, the JWT keys)
> lives in the **Convex deployment's own** environment and is set with
> `npx convex env set` or in the Convex dashboard. Putting those in the
> frontend `.env`, in `docker-compose.yml`, or in `deploy/.env` sets them on
> *containers* — Convex functions never see them, and the symptom is silence:
> Google sign-in simply doesn't appear, Drive reports "not configured yet".
> Verify what the deployment actually has:
>
> ```bash
> set -a; . ./.env.pilot.local; set +a   # CONVEX_SELF_HOSTED_URL + _ADMIN_KEY (gitignored; chmod 600 it)
> export CONVEX_DEPLOYMENT=              # blank it: the CLI crashes if .env.local's value is also visible
> npx convex env list
> ```
>
> That is "the pilot CLI env" everywhere below. The admin key looks like
> `kinolab|<hex>` — it contains a pipe, so it is stored double-quoted in
> `.env.pilot.local`; an unquoted `KEY=value` line breaks `source`. Never
> pass `--url`/`--admin-key` to `convex dev` (it rewrites `.env.local`), and
> prefer `npx convex deploy --env-file .env.pilot.local` for pushes:
> `dev --once --env-file` also rewrites `.env.local` to the pilot origins.
> Values that start with `-` (the JWT private key) need
> `npx convex env set -- NAME VALUE`.
>
> Convex env changes take effect immediately — no rebuild, no redeploy.

One-time backend setup (from any machine, with those two `CONVEX_SELF_*`
vars exported). A rebuilt backend gets all of this back from the env dump
instead — §Rebuild: fresh server.

```bash
node scripts/setup-auth.mjs https://pilot.kinolab.ai  # JWT keys + SITE_URL
npx convex env set INVITE_ONLY_SIGNUPS 1              # close registration (see below)
npx convex env set ADMIN_SIGNUP_ALLOWLIST you@studio.com  # bootstrap the first owner
npx convex env set GOOGLE_DRIVE_CLIENT_ID …           # Google vars, see above
```

**Do NOT run `npx convex run seed:run` against the pilot backend.** The demo
seed is for local demos: it plants pending invites for
`niek.tenhove@gmail.com` (owner), `producer@`, `director@` and
`artist@demo.slate`, and because the password provider does not verify email
ownership, anyone who registers with one of those addresses claims that seat.
If it has already been run there, remove those memberships — see §Go-live
checklist.

The frontend serves on port 8090 with `GET /api/health` as the container
healthcheck; the host proxy routes `pilot.kinolab.ai` to it. Google OAuth
redirect URIs for this environment point at the **actions origin**:

- `https://actions.kinolab.ai/api/auth/callback/google` (sign-in)
- `https://actions.kinolab.ai/google/drive/callback` (Drive connect)

(Inside Convex functions, `CONVEX_SITE_URL` is derived from the backend's
`CONVEX_SITE_ORIGIN`, so the app builds these URLs automatically.)

## Go-live checklist (pilot backend)

Work top to bottom. Everything here is a decision someone has to make once;
none of it has a safe default that guesses right.

1. **Close registration.** The gate lives in `convex/auth.ts` and fails
   closed, but set it explicitly so nobody has to reason about defaults:

   ```bash
   npx convex env set INVITE_ONLY_SIGNUPS 1
   npx convex env set ADMIN_SIGNUP_ALLOWLIST you@studio.com   # comma-separated
   ```

   Precedence: `INVITE_ONLY_SIGNUPS=1` forces invite-only · else
   `ALLOW_OPEN_SIGNUPS=1` opens registration · else invite-only everywhere
   except a local dev backend (detected from `CONVEX_SITE_URL` pointing at
   `127.0.0.1` / `localhost` / `[::1]`). With the gate on, a new account is
   created only when the email has a pending invite, is on
   `ADMIN_SIGNUP_ALLOWLIST`, or the backend has no users at all (first boot).
   Existing users always sign in. **Never set `ALLOW_OPEN_SIGNUPS` on the
   pilot** — the password provider does not verify email ownership, so open
   registration means anyone with the URL can create an account.

2. **Onboard the studio by invite.** Owner (an allowlisted email) signs up
   first, then Team → invite each person with their role. They sign up with
   that exact email and the membership attaches on first sign-in.

3. **Never seed the pilot backend.** `npx convex run seed:run` plants
   claimable pending invites — `niek.tenhove@gmail.com` (owner),
   `producer@`, `director@`, `artist@demo.slate`. If it has already been run
   against the pilot:
   - In the app (as owner): Team → remove every demo row — the pending
     invites *and* any account that has already claimed one.
   - Or in the dashboard (SSH tunnel, Data tab): delete the `memberships`
     rows whose `invitedEmail` is one of those addresses, and for seats
     already claimed also the `users` row and its `authAccounts` row (the
     password credential — without it the address can no longer sign in).
   - The seeded demo studio *Aurora North / SIGNAL LOST* itself is harmless
     once no membership points at it, but delete it too if the studio will
     see it.

4. **Backups running, mirrored off-host, and restored once** — §Backups and
   restore. Nightly zips *with* `--include-file-storage`, the offsite mirror
   confirmed, and `scripts/pilot-env-backup.sh` run into the password
   manager — an export does not contain the deployment's env vars.
   `INVITE_ONLY_SIGNUPS=1` was missing on the pilot as of 2026-09-18;
   `scripts/pilot-rebuild.sh` sets it on a rebuild, otherwise item 1.
5. **The eight assets uploaded before 2026-09-18 are gone, and stay gone
   (decision 2026-09-19).** The fresh server starts from the tables-only
   export, so their `assets` rows point at `_storage` ids that do not resolve
   (blank thumbnails, `getUrl` → null). Ask the uploaders to re-upload.
   `convex/migrations.ts` has `auditDanglingStorage` (lists them) and
   `markDanglingAssetsMissing` (sets `missing: true`) if the rows should be
   flagged in the UI. Both are internal functions: push first, then run with
   the pilot CLI env, page by page:

   ```bash
   npx convex deploy --env-file .env.pilot.local        # the functions must be on the backend
   set -a; . ./.env.pilot.local; set +a; export CONVEX_DEPLOYMENT=
   npx convex run migrations:auditDanglingStorage '{}'      # returns { done, cursor, … }; re-run with '{"cursor":"…"}' until done: true
   npx convex run migrations:markDanglingAssetsMissing '{}' # same loop
   ```

   Known copy gap flagged in review: the badge for a flagged *app* upload
   currently reads "File missing in Drive" — fix that text before marking.
6. **Images pinned** (they are, in `deploy/convex-backend.compose.yml`) —
   §Upgrading the self-hosted backend.
7. **`ALLOWED_HOSTS` set** for the frontend — §Security headers and the host
   allowlist.
8. **Decide the Cloudflare → origin hop** — §The Cloudflare → origin hop.
9. Keys and secrets: `INSTANCE_SECRET`, the admin key, `deploy/.env` (MinIO
   and Postgres credentials) and the env-var dump never leave the server or a
   password manager. `.gitignore` covers `.env` (so `deploy/.env`),
   `.env*.local`, `backups/` and the `pilot-env-*.env` / `kinolab-env-*.env`
   dumps as a backstop; everything in `.env.local.example` and
   `deploy/convex-backend.env.example` is a placeholder; `chmod 600
   .env.pilot.local`. `INSTANCE_SECRET` must be non-empty, generated and
   stable: the admin key derives from it, so a new secret invalidates every
   stored key, and an empty one would be replaced by a random one on every
   container start.
10. **Know the one gap you are shipping with: there is no password reset.**
   The Password provider is the pilot fallback and there is no email sender
   wired up, so a forgotten password cannot be reset from inside the app and
   an owner cannot reset it for someone else. Over a pilot with 20+ people,
   someone will forget. Until a reset flow exists (it needs an email provider,
   e.g. Resend via `@convex-dev/auth`), plan for it:
   - Tell the crew at hand-over to save the password in their browser or a
     password manager. This is the cheapest mitigation by far.
   - Finish the **Google sign-in** setup (§Google setup) before the pilot if
     you can — Google accounts recover themselves and remove this problem
     entirely for everyone who uses them.
   - Recovery of last resort, from the server: the person signs up again with
     a *different* address, an owner invites that address to the same role,
     and the old membership is removed. Their past decisions, comments and
     uploads stay attributed to the old identity — history is immutable by
     design, so this is a new person in the ledger, not a rename.

## Moving file storage to another S3 provider

The pilot already runs `--s3-storage`; the bytes just live in the MinIO on
the pilot host. Moving them to another S3 provider changes the **endpoint**,
not the storage type, so the "first boot decides the storage type" trap above
does not apply — the database stays S3 and keeps its per-database prefix
`kinolab-<uuid>/`. What has to be right is the object copy, the dialect
switches, and having a way back.

**All five buckets move together.** `kinolab-files` holds the uploads, but
`kinolab-modules` holds the deployed functions — a backend pointed at an
empty modules bucket serves no functions at all.

**Dialect switches**, both in `deploy/.env` (defaults keep MinIO's
behaviour — see `deploy/convex-backend.env.example`):

| Provider | `KINOLAB_S3_FORCE_PATH_STYLE` | `KINOLAB_S3_DISABLE_SSE` | Trailing checksums |
|---|---|---|---|
| MinIO (today) | unset (`true`) | unset (`true`) | work — leave alone |
| AWS S3 | `false` | `false` | work |
| Cloudflare R2 | unset (`true`) | unset (`true`) | **rejected** — see below |
| Backblaze B2 | unset (`true`) | unset (`true`) | **rejected** — see below |

A provider that rejects trailing checksums needs a literal
`AWS_S3_DISABLE_CHECKSUMS: "true"` line added to the backend service in
`deploy/convex-backend.compose.yml`. It is deliberately not a variable: its
*absence* is what MinIO needs, and compose cannot omit a variable it
interpolates — an empty value is not the same as unset.

### The cutover

Nothing below destroys the MinIO copy, which is the whole rollback plan.
Budget a short window: uploads and picks fail while the backend is down.

```bash
# 0. A fresh, complete backup FIRST — this is the only portable artifact.
docker compose -f deploy/convex-backend.compose.yml exec kinolab-convex-backup \
  npx convex export --include-file-storage --path /backups/pre-s3-move.zip

# 1. Create the five buckets on the new provider, same names as today
#    (keeping the names means S3_STORAGE_*_BUCKET stays untouched):
#    kinolab-files  kinolab-modules  kinolab-search
#    kinolab-exports  kinolab-snapshot-imports
#    Versioning on for files; no object lock.

# 2. First copy, with the backend still serving. Keys must land IDENTICALLY —
#    no added prefix, or the per-database prefix stops matching and every
#    file 404s. Mirror bucket-to-bucket, never into a subfolder.
mc alias set old http://127.0.0.1:9000 "$OLD_KEY" "$OLD_SECRET"
mc alias set new <endpoint> "$NEW_KEY" "$NEW_SECRET"
for b in files modules search exports snapshot-imports; do
  mc mirror --preserve old/kinolab-$b new/kinolab-$b
done

# 3. Stop the backend so nothing new is written mid-copy.
docker compose -f deploy/convex-backend.compose.yml stop kinolab-convex-backend

# 4. Catch up whatever landed during step 2.
for b in files modules search exports snapshot-imports; do
  mc mirror --preserve --overwrite old/kinolab-$b new/kinolab-$b
done

# 5. Point deploy/.env at the new provider:
#      KINOLAB_S3_ENDPOINT=<endpoint>
#      KINOLAB_S3_REGION=<region>
#      KINOLAB_S3_ACCESS_KEY=... KINOLAB_S3_SECRET_KEY=...
#      KINOLAB_S3_FORCE_PATH_STYLE / KINOLAB_S3_DISABLE_SSE per the table
docker compose -f deploy/convex-backend.compose.yml up -d

# 6. Prove it — PID 1 must still say --s3-storage (never trust the log):
docker compose -f deploy/convex-backend.compose.yml exec kinolab-convex-backend \
  sh -c "tr '\0' '\n' </proc/1/cmdline | grep -E -- '--(s3|local)-storage|--db'"
```

**Then verify by looking, not by grepping.** Open a shot that already has
options and confirm the thumbnails render — a 404ing thumbnail means the keys
did not land where the per-database prefix expects them. Upload one new
option and confirm the object appears in the new `kinolab-files`. Check
`docker compose -f deploy/convex-backend.compose.yml logs kinolab-convex-backend`
for `SignatureDoesNotMatch` (wrong keys / wrong region) or `NotImplemented`
(a checksum or SSE dialect mismatch — revisit the table).

**Rollback**, any time before the old MinIO is deleted: put the old values
back in `deploy/.env` and `up -d` again. That is why step 2 copies rather
than moves, and why MinIO should stay untouched for a few days after the
cutover before anyone reclaims the disk.

**Afterwards.** The offsite mirror (`kinolab-offsite`, §Backups) still points
at the *local* MinIO via `KINOLAB_S3_ENDPOINT` for its `files/` copy, so it
follows the move automatically — but if the new provider IS the offsite
provider, that second mirror is now copying a bucket to the same account and
should be dropped from the compose. The backup zips are unaffected: they are
written to `BACKUP_DIR` on the host either way.

## Backups and restore

The production record lives in two places, neither of them the Convex
container: documents — every decision, pick, gate, report, QC run, user,
membership, and the `_storage` rows — in Postgres (volume `kinolab-pgdata`),
and the uploaded bytes in the MinIO bucket `kinolab-files`. Both sit on the
same disk as the backend. The 2026-09-18 lesson in one sentence: the
pre-reinstall backup was a tables-only export, so the restore brought back
every row and lost every uploaded file — always `--include-file-storage`.

### What is backed up where

| What | Lives in | Backed up by |
|---|---|---|
| Tables, `_storage` rows and the blobs themselves | Postgres + `kinolab-files` | `npx convex export --include-file-storage` → one zip: `<table>/documents.jsonl` per table, plus `_storage/documents.jsonl` and `_storage/<id>` per file. **The only portable artifact.** |
| Deployment env vars: `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL=https://pilot.kinolab.ai`, `ADMIN_SIGNUP_ALLOWLIST`, `INVITE_ONLY_SIGNUPS=1`, `NEXT_PUBLIC_GOOGLE_API_KEY`, `NEXT_PUBLIC_GOOGLE_APP_ID`; optional `AUTH_GOOGLE_ID`/`SECRET`, `GOOGLE_DRIVE_CLIENT_ID`/`SECRET`, `GOOGLE_PICKER_API_KEY` | the deployment | **Never in an export.** `scripts/pilot-env-backup.sh [out-file]` dumps `npx convex env list` (a dotenv file) → password manager. Lose `JWT_PRIVATE_KEY`/`JWKS` and every session is invalidated: `setup-auth.mjs` mints new keys and everyone signs in again with their existing password (passwords live in `authAccounts` and survive). |
| `INSTANCE_SECRET`, the admin key, the MinIO (`kino`) and Postgres credentials | `deploy/.env` | Password manager, by hand, once. None of it is in any export; the admin key derives from `INSTANCE_SECRET`, so keep the secret and the key stays valid. |
| Deployed functions | Postgres + `kinolab-modules` (durable with the database) | The repo. Not in any export: a backend on a **new** database has none until `scripts/pilot-rebuild.sh` / `npx convex deploy --env-file .env.pilot.local` pushes them. |

`CONVEX_SITE_URL` is derived by the backend from `CONVEX_SITE_ORIGIN`: never
set it by hand, and do not be surprised that it is not in the dump.

### The backup service and the offsite mirror

The backend compose runs **`kinolab-convex-backup`**: every
`BACKUP_INTERVAL_SECONDS` (default 24h; also once at every start) it runs
`npx convex export --include-file-storage` against the backend over the
compose network, writes the zip under `BACKUP_DIR/.partial/` and renames it
to `BACKUP_DIR/kinolab-<UTC timestamp>.zip` only when the export succeeded,
keeping `BACKUP_KEEP_DAYS` (default 14) days; `BACKUP_DIR` defaults to
`/var/backups/kinolab`. It needs `CONVEX_SELF_HOSTED_ADMIN_KEY` in
`deploy/.env`; without it the service logs `NO BACKUP IS BEING TAKEN` and
waits. On S3 storage the backend stages every export in `kinolab-exports`
first — add an expiry rule there if it grows.

Those zips sit on the disk they protect, and so does MinIO. **`kinolab-offsite`**
(`mc mirror`, every 15 minutes) copies `BACKUP_DIR` to `<bucket>/backups/`
and the `kinolab-files` bucket to `<bucket>/files/` on another provider —
Cloudflare R2 or any S3-compatible store, configured by the `OFFSITE_*` block
in `deploy/convex-backend.env.example`. The zips are the restorable artifact
(they carry the blobs); `files/` is a raw second copy of the uploads that can
only be read back together with the `_storage` rows in a zip, and it doubles
the offsite footprint — drop that second mirror in the compose if that
matters. Left unconfigured, the service says so in its log and waits, like
the backup service.

**Verify, by hand — a backup nobody has restored is not a backup:**

```bash
docker compose -f deploy/convex-backend.compose.yml logs -f kinolab-convex-backup  # "[backup] ok: /backups/…zip"
ls -lh /var/backups/kinolab/                                 # a zip, not 0 bytes
unzip -l "$(ls -t /var/backups/kinolab/kinolab-*.zip | head -1)" | grep '_storage/' | grep -v documents.jsonl
                                                             # one _storage/<id> line per uploaded file in the NEWEST zip;
                                                             # none after uploads = files are NOT in the backup
docker compose -f deploy/convex-backend.compose.yml logs kinolab-offsite      # "[offsite] ok: backups"
AWS_ACCESS_KEY_ID=<offsite key> AWS_SECRET_ACCESS_KEY=<offsite secret> \
  aws s3 ls s3://<offsite bucket>/backups/ --endpoint-url <offsite endpoint>   # today's zip is there
```

On demand from any machine with the repo and `pnpm install`, with the pilot
CLI env loaded (§Deploying with Docker) — the same commands the service runs:

```bash
npx convex export --include-file-storage --path ./kinolab-$(date -u +%Y%m%dT%H%M%SZ).zip
scripts/pilot-env-backup.sh            # → ~/pilot-env-<ts>.env (mode 600) → password manager, then delete it
```

Re-run the env dump whenever a deployment variable changes (`setup-auth.mjs`,
Google setup, allowlist edits). It is a file of secrets: password manager,
not `backups/`, not git (`pilot-env-*.env` and `backups/` are gitignored as a
backstop, not as a home).

### Restore

Same backend, same database (undo a bad migration, roll back a day), with the
pilot CLI env loaded:

```bash
npx convex import --replace-all kinolab-20260918T030000Z.zip   # add -y only when scripting; by hand the prompt is the safety net
```

`--replace-all` overwrites every table, `_storage` included, with identical
`_id`s, so users, memberships and files come back together. Env vars and
functions are untouched. If Google Drive was connected, reconnect it after a
restore: refresh tokens in the snapshot may have been revoked.

### Rebuild: fresh server (the 2026-09 path)

The container holds nothing, so "rebuild", "move to a new host" and "start
over on a reinstalled server" are one runbook. Decided 2026-09-19: the server
is redeployed from scratch, the eight lost files are **not** recovered, the
existing users come back from the export zip, and S3 storage is on from the
first boot. Inputs in hand: the tables-only export
`kinolab-pre-rebuild-<ts>.zip` and the env dump `pilot-env-2026-09-19.env`
(safety copies from 2026-09-19; both belong in the password manager). If the
old backend still answers, take fresher ones first (§The backup service, "On
demand"). No env dump at all? See the note under step 8.

Steps 1–7 and 9–11 run on the server from the checkout root; step 8 runs
from a machine with the repo and `pnpm install` (your laptop).

1. **Host:** Docker + compose v2, Caddy, MinIO with the five buckets (§The
   backend holds nothing) and the scoped user `kino`; `git clone` the repo.
2. **`deploy/.env`:** `cp deploy/convex-backend.env.example deploy/.env`;
   fill in the old `INSTANCE_NAME=kinolab` and `INSTANCE_SECRET` from the
   password manager (same secret ⇒ the admin key in `.env.pilot.local` stays
   valid), a new `POSTGRES_PASSWORD` (`openssl rand -hex 24`), the MinIO
   keys as `KINOLAB_S3_ACCESS_KEY` / `KINOLAB_S3_SECRET_KEY`, the origins.
   Leave `CONVEX_SELF_HOSTED_ADMIN_KEY=""` for now. `chmod 600 deploy/.env`.
   Nothing in your shell may shadow it:
   `env | grep -E '^(INSTANCE_|POSTGRES_|KINOLAB_|CONVEX_)'` → empty.
3. **Network:** `docker network create dokploy-network` — for the frontend
   compose only (it hardcodes it); the backend compose needs none.
4. **Boot:** `docker compose -f deploy/convex-backend.compose.yml up -d`, then
   `… ps` → `kinolab-postgres` and `kinolab-convex-backend` healthy, and
   `curl -s http://127.0.0.1:3230/version` answers.
5. **Prove S3 before anything else touches the database:**

   ```bash
   docker compose -f deploy/convex-backend.compose.yml exec kinolab-convex-backend \
     sh -c "tr '\0' '\n' </proc/1/cmdline | grep -E -- '--(s3|local)-storage|--db'"
   ```

   `--db` and `--s3-storage` → continue. `--local-storage` → `docker compose
   -f deploy/convex-backend.compose.yml down -v` (the database is still
   empty), fix `deploy/.env`, back to step 4.
6. **Admin key:** `docker compose -f deploy/convex-backend.compose.yml exec
   kinolab-convex-backend ./generate_admin_key.sh` must print the key already
   in `.env.pilot.local`. If it differs, `INSTANCE_SECRET` is not the old one:
   stop and fix it, or accept the new key and put it in `.env.pilot.local`,
   `deploy/.env` and the frontend `.env`. Then set
   `CONVEX_SELF_HOSTED_ADMIN_KEY="…"` in `deploy/.env` and `up -d` again so
   the backup service has it.
7. **Route it:** Caddyfile from §The proxy in front, `caddy reload`; DNS /
   Cloudflare at this host. `curl -s https://api.kinolab.ai/instance_name` →
   `kinolab`, and `npx convex env list` with the pilot CLI env prints
   `No environment variables set` (fresh backend — variables mean you are
   talking to another backend; stop).
8. **Restore, from your laptop:**

   ```bash
   scripts/pilot-rebuild.sh --dry-run <export.zip> <env-dump.env>   # inputs + plan, no network
   scripts/pilot-rebuild.sh           <export.zip> <env-dump.env>   # asks for the S3 check + the instance name
   ```

   Preflight refuses a backend that already has env vars (not fresh). Then:
   `import --replace-all` (users, memberships, everything), `env set
   --from-file` (JWT keys, `SITE_URL`, allowlist, Google vars) plus
   `INVITE_ONLY_SIGNUPS=1`, `deploy` (the functions), verify: JWKS served,
   unknown HTTP route → 404 (not the generic 500 of 2026-09-18), a query
   answers. The tables-only zip restores zero files — expected.

   *No env dump?* With the pilot CLI env loaded: `node scripts/setup-auth.mjs
   https://pilot.kinolab.ai` (new JWT keys — everyone signs in again with
   their existing password), `npx convex env set ADMIN_SIGNUP_ALLOWLIST …`
   and the Google vars (§Google setup), then `scripts/pilot-env-backup.sh`
   to produce the dump, and run step 8 with `--overwrite-existing` (the
   backend is no longer "fresh"; the data still is).
9. **Verify like a user:** sign in with an existing account, open a shot,
   upload an image. The MinIO console (:9001) shows a new object under
   `kinolab-files/kinolab-<uuid>/`, and `kinolab-snapshot-imports` holds the
   zip from step 8 — neither happens on local storage. Then force a backup
   (`docker compose -f deploy/convex-backend.compose.yml restart
   kinolab-convex-backup`) and run the checks in §The backup service.
10. **Frontend:** the frontend `.env` (§The proxy in front), the published
    port and `dokploy-network`, then `docker compose up -d --build` from the
    checkout root and `pilot.kinolab.ai → 127.0.0.1:8090` in the Caddyfile.
11. Reconnect Drive hubs if any were connected; go-live item 5 for the lost
    files.

A rehearsal against a throwaway backend uses its own credentials file and
actions origin — never the default `.env.pilot.local`:
`PILOT_ENV_FILE=.env.throwaway.local CONVEX_SITE_URL_PUBLIC=https://<its actions origin> scripts/pilot-rebuild.sh …`.
The script refuses to verify a non-pilot backend without that variable.

## Upgrading the self-hosted backend

`deploy/convex-backend.compose.yml` pins the backend and dashboard to an
explicit build tag (`CONVEX_IMAGE_TAG`, default
`c0cb7ae17f54e14846c243c5332a8a5e6d0e19d4`, the 2026-08-10 build; get-convex
publishes one immutable commit-sha tag per build). `:latest` is not used on
purpose: with it, any container recreate — a restart, a redeploy, a host
reboot — could swap the database engine under a live pilot.

With Postgres and S3 behind it the container is disposable, so an upgrade
is: export, bump the tag, `up -d`. No volume to migrate, nothing to copy.

1. Take an export and confirm the offsite mirror has it (§Backups and
   restore).
2. Pick the new tag by hand — still pinned, still a decision. The newest
   stable release as of 2026-09-18 is
   `cf8398b4719cc7c32454229ccad52922398b7d67`, for both images.
   `docker manifest inspect ghcr.io/get-convex/convex-backend:latest` or the
   upstream `self-hosted/docker/docker-compose.yml` shows what is current.
3. Before trusting a new tag, check `self-hosted/docker-build/run_backend.sh`
   at that commit still reads the same `POSTGRES_URL` / `S3_STORAGE_*`
   variables. Then set `CONVEX_IMAGE_TAG=<new tag>` in `deploy/.env` (backend
   and dashboard share it) and `docker compose -f deploy/convex-backend.compose.yml
   up -d`. The storage type is pinned in the database, so a build that
   somehow failed to select S3 would crash-loop with the mismatch error
   rather than silently write files into the container — check `ps` and the
   `/proc/1/cmdline` line from §The backend holds nothing after the upgrade.
4. Check `/version`, sign in, open a production, upload one image and see it
   land in `kinolab-files`. If it misbehaves, put the old tag back; if the
   schema migrated forward and the old tag refuses the database, rebuild from
   the export (§Rebuild: fresh server).

## The Cloudflare → origin hop

TLS ends at Cloudflare; what happens between Cloudflare and this server is
the decision here. The proxy on the server is **Caddy** (`via: 1.1 Caddy`).
The backend compose has no proxy configuration at all (loopback ports only);
the frontend `docker-compose.yml` still carries Traefik labels whose
`TRAEFIK_*` variables are inert under Caddy.

Pick one:

- **Cloudflare Full (strict) + an origin certificate** (recommended). In
  Cloudflare: SSL/TLS → Overview → *Full (strict)*; SSL/TLS → Origin Server →
  create an Origin Certificate for `*.kinolab.ai`, put it on the server and
  reference it in every site block:

  ```caddyfile
  api.kinolab.ai {
      tls /etc/caddy/origin.pem /etc/caddy/origin.key
      reverse_proxy 127.0.0.1:3230
  }
  ```

  (same for `actions.kinolab.ai` and `pilot.kinolab.ai`). Caddy →
  `127.0.0.1` stays plain HTTP on the host itself, which is fine.
- **Caddy's automatic certificate** (Let's Encrypt): leave the `tls` line
  out; Cloudflare still has to be *Full (strict)*, not *Flexible*, and the
  ACME HTTP challenge must reach Caddy on port 80 through Cloudflare's proxy.

Only if Traefik/Dokploy turns out to be the proxy after all: install the
origin certificate on Traefik as the default cert and set
`TRAEFIK_ENTRYPOINT=websecure` + `TRAEFIK_TLS=1` for the frontend project
(the commented `certresolver` label in `docker-compose.yml` is the Let's
Encrypt variant; it cannot be an env var with a blank default — Traefik
rejects a router whose `tls.certresolver` is empty). Verify the entrypoint
exists in the Traefik dashboard first: the switch takes the site down if it
does not.

## Security headers and the host allowlist

`next.config.ts` sends, on every route: a Content-Security-Policy,
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy`
that switches off camera/microphone/geolocation/payment/USB, and (production
builds only) HSTS for a year including subdomains.

The CSP allows what this app actually uses: the Convex API + WebSocket
origins, the Convex HTTP-actions origin, Google Fonts, and the Google
Picker/Drive endpoints; `'unsafe-inline'` scripts and styles are allowed
because Next inlines both. Its origins come from `NEXT_PUBLIC_CONVEX_URL` and
`NEXT_PUBLIC_CONVEX_SITE_URL`, and Next bakes headers in at **build** time —
changing either needs a rebuild, exactly like the public Convex URL. Escape
hatches, both build args: `CSP_EXTRA_ORIGINS` (comma-separated additions) and
`CSP_REPORT_ONLY=1` (ship the policy report-only while keeping the other
headers enforced).

`ALLOWED_HOSTS` (comma-separated, port optional) is the set of hosts whose
inbound `Host` header the middleware is willing to copy into redirect URLs.
Without it, `Host: evil.example` came back as
`Location: https://evil.example/sign-in` and Traefik's host rule was the only
guard. An unrecognised host now falls back to the first entry, so redirects
land on the real site. Unset, only local development hosts are trusted
(`localhost`, `127.0.0.1`, `[::1]`, `0.0.0.0`) — `pnpm dev` and the Playwright
suite need no configuration, and a real deployment fails closed. **Set it to
the public host** (`pilot.kinolab.ai`) wherever the app is deployed; keep it
in step with the Traefik `Host()` rule.

## Tests

With `pnpm dev` running against the local anonymous deployment (never the
pilot):

```bash
pnpm typecheck                       # tsc --noEmit
pnpm test:api                        # e2e/api/run.mjs — server-side suite: six-role
                                     # authz matrix, integrity, validation, shots-v2,
                                     # elements (characters), exports (provenance)
pnpm test:e2e                        # Playwright, e2e/tests/*.spec.ts (reuses :3000)
pnpm exec playwright test e2e/tests/characters.spec.ts   # one spec
node scripts/screenshot-themes.mjs   # both-theme walk of every route →
                                     # e2e/screenshots/{dark,light}/{route}.png
```

Every spec is serial and self-contained: it signs up its own throwaway
owner, studio and production (`e2e/tests/helpers.ts`), so nothing depends on
the seed and multi-tenant isolation keeps the leftovers invisible to real
accounts. To run a spec as an existing local account instead, pass
`E2E_EMAIL=… E2E_PASSWORD=…` on the command line (the spec signs in, or signs
the account up on a fresh local deployment; a production with a unique code
is created per run). `decisions.spec.ts` and `generation-details.spec.ts`
read `KINOLAB_E2E_EMAIL` / `KINOLAB_E2E_PASSWORD`. Credentials never go in
the repo.

The two older smoke scripts still work (seed applied):

```bash
SHOTS_DIR=/tmp/slate-shots node e2e/qa-flow.mjs    # full §13 demo: studio → wizard →
                                                   # bulk shots → upload → review-room
                                                   # keyboard pick → gates → report → QC
QA_SIGNUP=1 SHOTS_DIR=/tmp/slate-shots node e2e/qa-aurora.mjs  # screenshot walk of every
                                                   # seeded Aurora North screen
```

## Repo map

```
app/                  Next.js routes (App Router)
  (auth)/sign-in      Sign-in (password fallback + Google)
  (app)/              Shell: studio home, team, /new wizard, /p/[productionId]/*
                      (board, shots, shots/[shotId], characters, characters/[elementId],
                      review, review/[shotId], files, decisions, reports, qc, settings)
components/app        Kinolab components (slate-strip, shot-frame, status-pill, shell,
                      theme provider + appearance control, generation-details dialog…)
components/ui         shadcn/ui primitives (Base UI generation)
convex/               Backend: schema, auth, modules per docs/CONTRACTS.md
  elements.ts         characters (elements + slot shots), v1.1
  exports.ts          provenance export, v1.1
  lib/                permissions (assertCan), activity, notify, domain, google (Drive REST)
  seed.ts             npx convex run seed:run (local demos only)
  migrations.ts       backfills + auditDanglingStorage / markDanglingAssetsMissing
lib/                  client helpers (copy, format, hotkeys, google-picker, csv)
  help.ts             per-screen help + the six-stage process (in-app guide)
public/help/          the guide's screenshots · scripts/capture-help.mjs regenerates them
e2e/tests/            Playwright specs + helpers.ts · e2e/api/  server-side suite
scripts/setup-auth.mjs        Convex Auth key generation
scripts/screenshot-themes.mjs both-theme screenshot walk (dark + light)
scripts/pilot-env-backup.sh   dump the deployment's env vars (npx convex env list) → password manager
scripts/pilot-rebuild.sh      export zip + env dump → fresh backend: import, env set, push, verify
deploy/convex-backend.compose.yml  stateless Convex backend + Postgres + dashboard + backup + offsite mirror
deploy/convex-backend.env.example  every variable the backend compose reads (Postgres, MinIO/S3, backup, offsite)
docker-compose.yml    frontend (+ one-shot function push) behind the host proxy
```

Working agreements: every mutation is permission-checked server-side and
writes one human-readable activity row; picks/approvals are immutable;
tokens never reach a client. UI tokens for both themes (dark by default,
light as a preference, the Review Room always dark) live in
`app/globals.css` (spec §9, revised in v1.1 — see §Appearance).

Help is part of the product, not the repo: per-screen guidance in
`lib/help.ts`, the drawer in `components/app/help-panel.tsx`, the illustrated
guide at `app/(app)/help/page.tsx`. Regenerate its screenshots with
`node scripts/capture-help.mjs`.

Visual language (spec §9.2, extended in the v1.2 pass — DECISIONS 2026-09-20):
the **slate strip** bands every shot and version card, the **status hues** are
fixed per shot status, and **every frame slot shows a frame** —
`components/app/shot-frame.tsx` renders the cover when there is one and
unexposed film stock (perforations, viewfinder ticks, a tint carried from the
shot's status) when there is not, so no screen shows an empty grey rectangle.
The **tape accent** is reserved for primary actions, Pick, unread markers and
the marker for the stage the production is currently in.
