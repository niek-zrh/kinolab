# User test — new project to premiere (1.7.0)

**Run:** 2026-09-23, against the optimized production build (`pnpm build` →
`pnpm start`) on an isolated local Convex backend.
**Method:** two real accounts in two browser contexts — a producer who sets
the work up and decides, and an artist who makes the options — walking the
lifecycle in order and stopping at the first step that could not carry them
forward.
**Result:** **14 / 14 steps passed, 17.3s**, no console or page errors in
either account.

The run is `e2e/tests/premiere-journey.spec.ts`. It is part of the suite, so
the walkthrough in the in-app guide cannot quietly stop being true: if a step
here breaks, the run fails.

## The run

| # | Step | Who | Time |
|---|---|---|---|
| 1 | Start the production | Producer | 0.85s |
| 2 | Shot list goes in | Producer | 1.2s |
| 3 | Artist invited, signs up, claims the seat | Producer → Artist | 1.2s |
| 4 | Work assigned | Producer | 0.99s |
| 5 | Artist finds it on My work | Artist | 0.68s |
| 6 | Three options uploaded as v1–v3 | Artist | 1.7s |
| 7 | Shot appears in the review queue | — | 0.63s |
| 8 | Compared 2-up and picked | Producer | 2.8s |
| 9 | Decision on the ledger | — | 0.61s |
| 10 | Stage gate requested and approved | Producer | 1.8s |
| 11 | Delivery QC run started against the template | Producer | 0.96s |
| 12 | Daily report generated and published | Producer | 2.2s |
| 13 | Provenance export available | Producer | 0.62s |
| 14 | No console or page errors in either account | — | — |

**The pipeline holds end to end.** A production can go from nothing to a
delivered record without anyone leaving the product, and the handoffs that
matter happen on their own: uploading options moves the shot into the review
queue with nobody remembering to hand it over, and a pick writes itself to
the ledger.

## Friction found

Three places where a first-time studio stops. None is a defect — each is a
precondition the interface does not state at the moment it is needed.

### 1. A new production has no gate approvers, and the gate does not say so

Requesting sign-off on a brand-new production works, but the gate cannot be
**approved** by anybody, because no one is an approver yet. The fix is
Settings › Stages & gates, which is two screens away from where the problem
appears. The board offers no hint.

*Severity:* medium — it blocks the first gate of every new production, and
the message does not point anywhere.
*Suggestion:* when a stage has no approvers, say so on the gate control and
link to Settings.

### 2. "Start QC run" is disabled with no stated reason

The new-run dialog needs a name. Until one is typed the button is simply
disabled — no hint, no validation text. This cost the first run of this test
a failed step, which is exactly what it would cost a producer at 11pm before
a delivery.

*Severity:* low, high annoyance.
*Suggestion:* mark the field required, or say "Name the run to start it"
beside the disabled button.

### 3. An invited person cannot be assigned work until they have signed in

The invite creates a pending seat; the person only becomes assignable once
they have signed in and claimed it. Reasonable, but a producer setting up on
a Friday will not know why a name is missing from the assignee list.

*Severity:* low.
*Suggestion:* show pending invitees in the assignee list, disabled, labelled
"invited — not signed in yet".

All three are now stated in the in-app walkthrough (`/help#journey`) as
preconditions on the step where they bite, which is a documentation fix
rather than a product fix. The product fixes above are not done.

## What this run does not cover

Honest scope, so nobody reads a green result as more than it is:

- **Google Drive filing.** The hub is dormant on this backend, so picks did
  not file into `Approved/` in Drive. That path is untested here.
- **Google sign-in.** The run uses password accounts on a local deployment,
  where password registration is permitted. Production defaults to
  invite-only with password registration **off** — see the note below.
- **Real generated media.** Options are small synthetic PNGs, not 20MB
  stills or video, so upload time and thumbnailing at real sizes are untested.
- **Multi-episode productions, characters, references, storyboard.** Covered
  by other specs, not by this lifecycle run.
- **The six AI assistants**, which are previews with no execution path in
  1.7 and were not exercised.

## Production note carried from the release verification

The pilot deployment uses email + password and has no Google OAuth
configured. Since 1.6, password registration is disabled on remote
deployments by default, so **invited people cannot register on the pilot** as
configured. Existing accounts sign in normally. Either configure
`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`, or set `ALLOW_PASSWORD_SIGNUPS=1`
(which the README correctly calls an insecure opt-in). A local test run will
never surface this, because loopback deployments get the permissive defaults.
