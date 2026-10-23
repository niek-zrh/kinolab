# Kinolab 1.8 — comments you can take back, uploads that go to Drive

## What changed for users

- **Your own comments can be edited and deleted** — in the Review Room, a
  shot's Discussion, a character phase and a QC run. An edit shows
  "(edited)"; a delete removes the comment for everyone and withdraws its
  mention notifications, while History keeps a "(comment deleted)" note
  without the text. Nobody can change someone else's words; producers can
  still resolve a note.
- **A production selector in the top bar**, next to the studio selector.
  Switching keeps the screen you are on (Shots stays Shots); "All
  productions" returns to the grid; owners and producers get "New
  production" there too.
- **Files over 20 MB upload straight into the production's Google Drive hub**
  with a progress counter. The upload resumes after a dropped connection,
  and if only the final registration fails, Retry on the file finishes it
  without uploading again. The hub must be connected first.
- **Drive space is checked before an upload starts.** If the hub's Google
  Drive cannot hold the batch, the upload is refused with a message asking
  for the storage to be extended (owners and producers see the free amount).
- **Every Drive hub carries a READ ME guide** explaining the folder structure
  and asking that it is not reorganised outside Kinolab.
- **The Drive picker browses by folder**, with This production, My Drive,
  Shared drives and Recent tabs, and opens on the production's hub.
- **Several Google accounts per person, one per production.** The first
  Google account you connect is your default (a star marks it; "Make
  default" moves it). When creating a production's Drive hub you pick which
  of your accounts it lives in, or connect another on the spot; "Use a
  different Google account…" on an existing hub builds a fresh folder tree
  in the other account — files already in the old hub stay where they are,
  new uploads and picks go to the new one. Attach from Drive browses the
  production's account when it is yours, otherwise your default.
- **Videos that live in Drive play inside the Review Room**, streamed through
  Kinolab — no Google tab, no Google login in the browser — with seeking and
  timestamped notes as for uploads. A codec the browser cannot decode
  (ProRes, HEVC) still needs an H.264 review copy.

## Operator notes

- `SITE_URL` must equal the frontend origin (`https://studio.kinolab.ai`):
  it is the fallback CORS binding for large uploads and the base for auth
  redirects. See README › Google setup › Large uploads.
- Existing hubs get the folder guide with
  `npx convex run drive:addHubReadme '{"productionId":"…"}'`.
- Hubs created before 1.8 in a *shared drive* are recorded as My Drive hubs;
  the space check then measures the hub owner's personal quota. Recreate the
  hub, or expect Drive's own out-of-storage error instead of the pre-check.
- `ALLOW_PASSWORD_SIGNUPS=1` is still set on the pilot backend for tester
  onboarding; set it to `0` once the four accounts exist.

## Google sign-in

"Continue with Google" is built in and switches on when `AUTH_GOOGLE_ID` /
`AUTH_GOOGLE_SECRET` are set on the backend (same OAuth client as Drive,
plus the `/api/auth/callback/google` redirect URI). Accounts that started
with a password are unverified and must be vouched for once with
`npx convex run migrations:verifyUserEmail '{"email":"…"}'` before Google
sign-in links to them — README › Go-live checklist has the four steps. A
Google account under a different address is refused with a visible
explanation on the sign-in page (invite-only, contact hello@kinolab.ai);
`migrations:relabelUserEmail` moves an existing account to that address.

## For developers

- `pnpm check` runs the full audit and had been failing on advisories in
  dev-only packages, almost all under the `shadcn` package's transitive tree
  (`shadcn` stays: `app/globals.css` imports its `tailwind.css`). Its
  dependency tree was re-resolved to patched versions; `shell-quote` and
  `source-map-js` are pinned in `pnpm-workspace.yaml` → `overrides`, and the
  one advisory with no published fix (`braces` ≤3.0.3, dev-only) is listed
  under `auditConfig.ignoreGhsas` with a note to drop it once 3.0.4 ships.
  Audit is clean.

## Tests

- API suite: 572 checks across 8 suites, including the new
  `e2e/api/comments-and-uploads.mjs` (comments edit/remove, the production
  switcher, the large-upload actions, cross-tenant and role refusals).
- Browser suite: new `comments.spec.ts` and `production-switcher.spec.ts`
  (author/non-author controls, confirm dialog, History note, section-keeping
  switch, phone-width header).

## What to test on the pilot (Google paths cannot run locally)

1. Settings › Drive hub on a new production: the folder tree appears in
   Drive with "READ ME — Kinolab folder structure" at the top, and the guide
   does not show up under Files.
2. Drop a file over 20 MB on a shot: progress counts up, the file lands in
   `04 Production/Shots/<code>/Options/`, and the option appears with a
   thumbnail within a few minutes at most.
3. Fill the hub account's Drive (or pick an account that is nearly full):
   the drop is refused with the "Not enough space" message before anything
   uploads.
4. Attach from Drive: the picker opens on the production's hub; the My
   Drive, Shared drives and Recent tabs browse by folder.
5. Review Room: edit and delete your own comment; confirm a colleague sees
   neither control on it.
6. Settings › Drive hub: connect a second Google account, create a new
   production's hub in it, and confirm the folder tree lands in that
   account's Drive; on the first production, "Use a different Google
   account…" and check the old files still open.
7. Review Room on a shot whose video was uploaded over 20 MB (so it lives in
   Drive): it plays in the room, seeking works, and a timestamped note seeks
   back to its moment. Then remove a tester from Team and confirm their
   Review Room stops within minutes (new seeks answer 403; already-buffered
   seconds may finish).

## Known limitations

- Files up to 20 MB still take the Convex-storage path and are mirrored to
  Drive afterwards; thumbnails of Drive files are cached in Convex storage.
  Moving everything to Drive is the next step.
- A large file whose tab is closed before registration is imported by the
  next sync as a loose file; dropping it again registers it.
- No password reset (no email provider); see README › Go-live checklist.
