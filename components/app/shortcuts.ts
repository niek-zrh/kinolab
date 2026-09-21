/**
 * Keyboard shortcuts, in one place (v1.4).
 *
 * The app shell's overlay and the help drawer both render this list, so the
 * two can no longer drift — they already had: the overlay was missing the
 * Review Room's zoom keys for a release.
 */
export const SHORTCUTS: { title: string; keys: [string, string][] }[] = [
  {
    title: "Everywhere",
    keys: [
      ["⌘K", "Search shots, scenes, files"],
      ["?", "Help for the screen you are on"],
    ],
  },
  {
    title: "Shots & files",
    keys: [
      ["N", "New shot"],
      ["/", "Search files"],
      ["⌘V", "Paste an image onto a shot as an option"],
    ],
  },
  {
    title: "Review Room",
    keys: [
      ["1–4", "Compare 1–4 up"],
      ["←/→", "Move focus"],
      ["S", "Shortlist"],
      ["X", "Reject"],
      ["P", "Pick"],
      ["0", "Fit to pane"],
      ["− +", "Zoom out / in"],
      ["F", "Fullscreen"],
      ["Esc", "Back to queue"],
    ],
  },
];
