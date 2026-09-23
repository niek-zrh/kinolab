# Kinolab 1.7 — the creative workspace

## UI / UX review and changes

The review covered a populated production and a brand-new project. The target
is the clarity of a native productivity app with the visual emphasis of a
professional creative tool, not a copy of Apple or Adobe branding.

| Finding | Improvement |
| --- | --- |
| A flat rail gives equal weight to every destination | Workspace, Create, Production, and Studio groups; personal reordering, hiding, and collapse preferences remain intact |
| Repetitive cards push useful production context down the page | A production-artwork hero, three useful metrics, a compact four-frame reel, and a full-width stage pipeline |
| Empty artist workspaces provide little direction | Original studio artwork, links to shots and references, and clear assignment states |
| Artists must scan all their work to find a current task | Accessible All / Needs you / In progress / With review / Settled filters, with a reset action for empty results |
| Command search has no immediate starting points | Keyboard-accessible production destinations appear before a search is typed |
| The future AI story has no place in the actual workflow | Contextual, clearly marked preview panels and a dedicated AI workspace roadmap |
| Collapsed rail icons lack accessible names | Each collapsed destination has an explicit accessible label; custom links and controls receive visible keyboard focus |

## What is live versus planned

Navigation, search shortcuts, assignment filters, artwork, production metrics,
and assistant detail panels are functional UI. The six AI assistants themselves
are **not implemented or connected**. There is no provider integration, prompt
submission, background AI job, data upload, activation switch, or inference cost.

| Planned assistant | Contextual entry points |
| --- | --- |
| Story & coverage | Storyboard, shots |
| Look development | Reference board |
| Character continuity | Characters |
| Review companion | Review queue, decisions |
| Production brief | Overview, My work, board, reports |
| Delivery preflight | QC, files |

Each preview explains the proposed inputs, output, and human approval step.
It also makes clear that future permission, provenance, and cost controls are
requirements, not already implemented security guarantees. The shared catalogue
is `lib/assistant-roadmap.ts`; it deliberately contains no execution hooks.

Before adding execution, design and test: explicit material selection and
consent; provider/retention terms; production-level authorization on the server;
rights to source material; visible spending limits; source/version provenance;
cancel/retry; and human confirmation of any mutation. An AI suggestion must not
silently pick a version, approve a gate, reassign a person, or deliver a file.

## Visual integrity

Production artwork always takes precedence over decorative artwork on the
overview. Brand images are never inserted into shot versions or reference
records. Their labels distinguish studio artwork from production frames.
Review imagery and video are not tinted or restyled by this release.

Two original bitmap assets were made with the built-in image generator,
compressed for delivery, and committed alongside the source. Seven interface
symbols are native SVG, not rasterized controls. See
[asset provenance and exact prompts](WORKSPACE-ASSETS.md).

## Verification and deployment

Verified locally on 2026-09-23: TypeScript, 7 unit tests, 467 backend checks,
148 browser tests on the production build, and the optimized build all passed.
The dependency audit reported no known vulnerabilities. Manual visual checks
covered desktop dark/light, the artist desk, assistant details, and 390px mobile
layout; mobile banner contrast was corrected after inspection.

Run `pnpm typecheck`, `pnpm test:unit`, `pnpm test:api`, `pnpm build`, and
`pnpm test:e2e` against an isolated local Convex backend. The new
`workspace-design.spec.ts` exercises the empty/populated overview, assignment
filters, contextual previews, keyboard focus, command navigation, collapsed
navigation, mobile sizing, both themes, image loading, and reduced motion.

Deploy through the existing Dokploy GitHub workflow. No schema migration,
Google credentials, or AI API keys are required for this release. Existing
Drive configuration and backup/restore setup are unchanged; this UI release
does not certify those operational integrations as configured or tested.
