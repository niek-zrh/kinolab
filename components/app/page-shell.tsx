"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Star } from "lucide-react";
import type { ReactNode } from "react";
import { MAX_FAVORITES, useFavorites } from "./favorites";
import { cn } from "@/lib/utils";

/**
 * One page frame for every screen (v1.3).
 *
 * Before this, each page picked its own `mx-auto max-w-*`: 2xl on the wizard,
 * 3xl on a QC run, 4xl on Team, 5xl on Files, 6xl on Shots… all CENTRED. So
 * the heading landed at a different x on every screen and appeared to jump as
 * you moved through the rail — and worse, the Shots title slid sideways when
 * you toggled table/sheet, because the two views cap at different widths.
 *
 * Content is now LEFT-aligned against one gutter. A page may still cap its
 * own measure (a table of text is unreadable at 1800px), but that cap grows
 * to the right; the heading never moves.
 */

const WIDTHS = {
  /** Contact sheets and boards — take the monitor. */
  sheet: "max-w-[1800px]",
  /** The default: wide enough for two columns, narrow enough to scan. */
  wide: "max-w-6xl",
  /** Forms and long text, where measure matters more than space. */
  reading: "max-w-4xl",
} as const;

export type PageWidth = keyof typeof WIDTHS;

export function PageShell({
  children,
  width = "wide",
  className,
}: {
  children: ReactNode;
  width?: PageWidth;
  className?: string;
}) {
  return (
    <main className="min-w-0 flex-1 px-8 py-6">
      <div className={cn("w-full", WIDTHS[width], className)}>{children}</div>
    </main>
  );
}

/**
 * The star that pins this page to the top bar. Favourites key on the full
 * path INCLUDING the query, so a filtered view ("Shots · rework") can be
 * pinned separately from the unfiltered one.
 */
export function FavoriteStar({ label }: { label: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { favorites, isFavorite, toggle } = useFavorites();

  const query = searchParams.toString();
  const href = query ? `${pathname}?${query}` : pathname;
  const starred = isFavorite(href);
  const full = favorites.length >= MAX_FAVORITES && !starred;

  return (
    <button
      type="button"
      onClick={() => toggle(href, label)}
      aria-pressed={starred}
      aria-label={starred ? `Unpin ${label}` : `Pin ${label} to favourites`}
      title={
        starred
          ? "Pinned — click to remove"
          : full
            ? `Pin to favourites (replaces the oldest of ${MAX_FAVORITES})`
            : "Pin to favourites"
      }
      className={cn(
        "rounded-md p-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        starred
          ? "text-tape hover:text-tape/80"
          : "text-muted-foreground/50 hover:text-foreground",
      )}
    >
      <Star className={cn("size-4", starred && "fill-current")} />
    </button>
  );
}

/**
 * Page heading row. `title` is the one thing that must sit at the same x on
 * every screen, so it is the first child of the shell's gutter, never nested
 * in a centred box.
 */
export function PageHeader({
  title,
  meta,
  description,
  actions,
  favoriteLabel,
}: {
  title: string;
  /** Small count or status beside the title, e.g. "14". */
  meta?: ReactNode;
  description?: string;
  actions?: ReactNode;
  /** Label to store when pinned; omit to hide the star (detail pages). */
  favoriteLabel?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {/* `meta` sits INSIDE the heading on purpose: it belongs to the
              heading's accessible name, so a count is part of what a screen
              reader (and a test) announces — "Characters · 3", not a bare
              "Characters" with a number floating beside it. */}
          <h1 className="font-display text-xl font-semibold tracking-tight">
            {title}
            {meta !== undefined && (
              <>
                {/* A real space, not just the margin: accessible names join
                    text nodes verbatim, so without it the heading announces
                    "Characters· 3". */}
                {" "}
                <span className="font-sans text-sm font-normal text-muted-foreground">
                  {meta}
                </span>
              </>
            )}
          </h1>
          {favoriteLabel !== undefined && (
            <FavoriteStar label={favoriteLabel} />
          )}
        </div>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
