# The manual lives in the app

Kinolab's user manual is **in the product**, not in this repo:

| Where | What |
|---|---|
| The `?` key, or the Help button in the top bar | Help for the screen you are on: what it is for, what to do next, and the thing people get wrong. Plus the end-to-end process and the keyboard shortcuts. |
| `/help` | The full illustrated guide, with screenshots. |

A manual nobody in the studio can open is not a manual. This file used to
hold the whole thing in Markdown, which meant the people it was written for
— artists, producers — never saw it, and it drifted from the product the
moment anything changed.

## Editing it

| To change | Edit |
|---|---|
| Per-screen help (purpose, steps, tip) | `lib/help.ts` — `HELP_TOPICS`, keyed by route |
| The six-stage process | `lib/help.ts` — `PROCESS`, shared by the drawer and the guide |
| Keyboard shortcuts | `components/app/shortcuts.ts` — one list, rendered in both places |
| The illustrated walkthrough | `app/(app)/help/page.tsx` — `SECTIONS` |
| The drawer itself | `components/app/help-panel.tsx` |

Adding a screen? Add a `HELP_TOPICS` entry for its route. `topicFor` matches
most-specific-first and turns opaque id segments into `:id`, so
`/p/<id>/shots/<id>` resolves to `/p/:id/shots/:id`.

## Refreshing the screenshots

They live in `public/help/` and are captured from the seeded demo, so they
can be regenerated rather than re-shot by hand:

```bash
pnpm dev                        # app + seeded local backend
node scripts/capture-help.mjs   # → public/help/*.png
```

The script only captures the files `app/(app)/help/page.tsx` references, so
an unused screenshot cannot quietly rot in the repo. Re-run it after any
change to a screen the guide shows — stale help is worse than none.
