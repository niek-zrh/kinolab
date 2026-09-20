import { cn } from "@/lib/utils";

/**
 * Kinolab brand mark, recreated from kinolab.ai: orange rounded square,
 * skewed clapper bar, selection chevron. Dark glyphs on accent per brand.
 *
 * The fills below are literal on purpose and never follow the theme tokens:
 * the mark is identical in Dark and Light (spec v2 §(a).2 keeps `--tape`
 * #ff6b2c with dark glyphs in both themes), so it is exempt from the
 * no-hardcoded-colours rule.
 */
export function KinolabMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 25 25" className={className} aria-hidden="true">
      <rect width="25" height="25" rx="6" fill="#ff6b2c" />
      <path d="M6.1 5h15L18.9 10h-15Z" fill="#121418" />
      <path
        d="M11.5 14l4 4 4-4"
        stroke="#121418"
        strokeWidth="2"
        fill="none"
        strokeLinecap="square"
      />
    </svg>
  );
}

/** KINOLAB.AI wordmark — Archivo bold, condensed, ".AI" in accent. */
export function KinolabWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display font-bold tracking-[0.06em] [font-stretch:88%]",
        className,
      )}
    >
      KINOLAB<b className="font-semibold text-tape">.AI</b>
    </span>
  );
}
