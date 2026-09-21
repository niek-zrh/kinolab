# Kinolab 1.6 — visual production workspace

## What changed

- **Storyboard:** scene-ordered shot artwork, scene briefs, status and assignment context, search, scene filtering, shot links and a printable board. Uses uploaded or picked artwork, with honest empty-frame states.
- **Reference board:** shared images from the production library, department/category filters, creative direction, up to six palette colors, source-credit links, search, edit and recoverable archive. Artists edit their own cards; editorial roles can manage all cards. Viewer access is read-only.
- **Characters:** an artwork-first gallery with concept/animation phase status and direct links, plus the existing editable production table. View preference survives reloads.
- **Review:** native playback for browser-decodable uploaded video, automatic upload posters, elapsed-time comments, click-to-seek, resolve/reopen feedback and a resolved filter. Drive-hosted video opens at its source when direct playback is unavailable. Nonfocused compare videos pause to avoid competing audio.
- **Daily work:** larger overview frames and direct routes to My Work, references and review. Responsive production navigation and smaller-screen review layout; keyboard skip link and print styles.
- **Visual identity:** original cinematic sign-in artwork; optional, explicitly illustrative local demo frames and reference cards. No generated artwork is inserted into real productions.
- **Release safety:** dependency updates, production static assets included in Docker, loopback-only regression harnesses, policy/formatting tests and GitHub Actions quality checks. Authentication setup no longer logs private signing keys.

## Important authentication change

Remote password **registration** is now disabled by default. Existing password
sign-in remains supported. Configure Google OAuth and use invited, verified
Google identities for new team members. Bootstrap the first owner with
`ADMIN_SIGNUP_ALLOWLIST`; the first internet visitor can no longer claim an
empty deployment. Keep `INVITE_ONLY_SIGNUPS=1` explicit.

Verified Google accounts may link to a single already-verified user with the
same email. Legacy unverified accounts and multiple matches fail closed and
need administrator migration; an old password must not remain as an attacker
backdoor after the real email owner signs in. Legacy password sign-in keeps
existing memberships, but unverified accounts cannot claim new remote invites.
`ALLOW_PASSWORD_SIGNUPS=1` allows unverified registration deliberately and
should not be enabled for a public production deployment.

The schema changes are additive: a `referenceCards` table and optional
`comments.timeSeconds`. Existing shots, versions and feedback require no
destructive migration. Deploy the Convex schema/functions before serving the
new frontend. Back up data and file storage before deployment.

## Verification and release gates

Run against an isolated local backend, not live data:

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm check
pnpm test:api
pnpm start
# Another terminal, same isolated backend:
pnpm test:e2e
```

Local release verification: **467 backend assertions, 139 browser tests, four
unit tests, typecheck and the optimized production build passed**. The full
dependency audit reported no known vulnerabilities at the time of testing.
Browser tests ran against the standalone server bundle on an isolated backend.
Both-theme screenshots and 390px creative/review layouts were inspected or
checked; print-mode frame visibility is also covered.

Browser coverage includes existing
production creation, role controls, shots, character phases, review decisions,
approvals, reporting and new creative workflows. The new video test uploads
and decodes a real H.264 fixture, verifies its poster, saves timestamped notes,
reloads, seeks and resolves/reopens feedback. Phone layouts are checked at
390px. A passing local suite is **not** evidence that live OAuth, Drive,
infrastructure or every browser/codec has been validated.

Before a studio rollout, the deployment owner must still:

1. Configure and smoke-test Google sign-in, invited onboarding and existing-account linking with real studio accounts. OAuth credentials were not available in this development environment.
2. Smoke-test the configured Drive Picker, upload/copy permissions, refresh tokens and canonical approved-file paths. No live Drive account was modified by this release.
3. Verify TLS, trusted hosts, secrets, backup/offsite retention and a restore drill using the existing README operations checklist. No production server was deployed during this work.
4. Run acceptance with a representative production and actual file formats; measure concurrency, large libraries and network/storage performance before a larger rollout.
5. Confirm media access/retention policy. Storage URLs are bearer links; this release does not add DRM, watermark enforcement or expiring external client-review portals.

## Deliberate limits

- This is a review and production-coordination workspace, not an NLE, render farm or full asset-management/transcoding system.
- Video time labels represent elapsed seconds with milliseconds, **not** SMPTE timecode. Playback is not frame-accurate or synchronized across comparison panes. Browser codec support varies; use an H.264 MP4 proxy for reliable review. Larger files use Drive; direct upload remains capped at 20 MB.
- References select existing production images or text-only direction. Upload source artwork through a shot/character first; the board does not scrape external websites or upload independent reference files.
- The storyboard reports its 1,000-shot/500-scene bounds; reference lists report their 300-card bound. Comment threads show the newest 500 comments with a truncation notice. These are bounded workspace views, not unlimited archives.
- Existing password accounts still have no self-service password-reset flow. Google linking is not a recovery mechanism for unverified accounts. A trusted administrator must verify ownership and securely migrate/revoke old credentials and sessions; do not mark an email verified based only on a request containing that address.
- The generated demo scenes are illustrative and reused across versions, not distinct production takes or real approvals. Character seed images remain placeholders.

## Design rationale

The new workflow follows established production patterns: visual shot context,
version-centric review, actionable feedback and a shared visual brief. The
implementation is original and retains Kinolab's own artwork-first ink/orange
identity. Research references:

- [Autodesk Flow Production Tracking overview](https://blogs.autodesk.com/design-studio/2023/03/21/making-it-simple-flow-production-tracking-101/)
- [Autodesk overlay player](https://help.autodesk.com/view/SGSUB/ENU/?contextId=SA_OVERLAY_PLAYER)
- [Frame.io versioning](https://help.frame.io/en/articles/9101068-versioning-in-frame-io)
- [Frame.io comments panel](https://help.frame.io/en/articles/9859849-adobe-premiere-frame-io-v4-comments-panel-overview)

These references informed direction; Kinolab does not claim feature parity.
