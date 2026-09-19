# Kinolab

Production orchestration for AI-native film studios. **Files live in Drive.
Decisions live here.** One calm overview per production, a stage-gated
pipeline, a shot list, a Review Room that formalizes the
options-screenshots-and-pick workflow, Google Drive as the file home, daily
production reports, and a TV-delivery QC checklist.

Built on Next.js 15 + Convex (realtime) + Tailwind v4 + shadcn/ui.
Spec: `stravi-pilot-mega-prompt.md` · decisions log: [DECISIONS.md](DECISIONS.md) ·
backend API contract: [docs/CONTRACTS.md](docs/CONTRACTS.md) · plan: [PLAN.md](PLAN.md).

---

## Quickstart (clone → seeded app in ~10 minutes)

Prerequisites: Node 20+, pnpm 9+.

```bash
pnpm install

# 1. Create the local Convex dev deployment (no account needed) and push:
CONVEX_AGENT_MODE=anonymous npx convex dev --once

# 2. Generate + store the Convex Auth signing keys on that deployment:
node scripts/setup-auth.mjs

# 3. Seed the demo studio (Aurora North / SIGNAL LOST). LOCAL DEMOS ONLY —
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
   `…/Shots/SC010_SH020/Options/`).
4. **Creative Director** → Review → `SC010_SH020`: `2`–`4` to compare,
   scroll to zoom (synced), `S` to shortlist two, `P` to **pick** with a note
   → siblings rejected, shot flips to *picked*, Decisions ledger + activity
   updated, artist notified. With a hub: the canonical file appears in
   `Approved/`.
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

## E2E smoke tests

With `pnpm dev` running (and the seed applied):

```bash
SHOTS_DIR=/tmp/slate-shots node e2e/qa-flow.mjs    # full §13 demo: studio → wizard →
                                                   # bulk shots → upload → review-room
                                                   # keyboard pick → gates → report → QC
QA_SIGNUP=1 SHOTS_DIR=/tmp/slate-shots node e2e/qa-aurora.mjs  # screenshot walk of every
                                                   # seeded Aurora North screen
```

Each run creates throwaway users/studios in the local dev DB; multi-tenant
isolation keeps them invisible to real accounts.

## Repo map

```
app/                  Next.js routes (App Router)
  (auth)/sign-in      Sign-in (password fallback + Google)
  (app)/              Shell: studio home, team, /new wizard, /p/[productionId]/*
components/app        Kinolab components (slate-strip, status-pill, shell…)
components/ui         shadcn/ui primitives (Base UI generation)
convex/               Backend: schema, auth, modules per docs/CONTRACTS.md
  lib/                permissions (assertCan), activity, notify, domain, google (Drive REST)
  seed.ts             npx convex run seed:run (local demos only)
  migrations.ts       backfills + auditDanglingStorage / markDanglingAssetsMissing
lib/                  client helpers (copy, format, hotkeys, google-picker)
scripts/setup-auth.mjs        Convex Auth key generation
scripts/pilot-env-backup.sh   dump the deployment's env vars (npx convex env list) → password manager
scripts/pilot-rebuild.sh      export zip + env dump → fresh backend: import, env set, push, verify
deploy/convex-backend.compose.yml  stateless Convex backend + Postgres + dashboard + backup + offsite mirror
deploy/convex-backend.env.example  every variable the backend compose reads (Postgres, MinIO/S3, backup, offsite)
docker-compose.yml    frontend (+ one-shot function push) behind the host proxy
```

Working agreements: every mutation is permission-checked server-side and
writes one human-readable activity row; picks/approvals are immutable;
tokens never reach a client. UI tokens and the two-mood design system live
in `app/globals.css` (spec §9).
