"use client";

import { cn } from "@/lib/utils";

/**
 * The leader (v1.6) — what Kinolab shows while it waits.
 *
 * A grey pulsing rectangle says "software is thinking". A projector leader
 * says "film is about to run", which is both more pleasant and more on the
 * nose for what this tool does. Used where a whole screen is waiting; small
 * in-card waits keep their skeletons, because a countdown inside a table row
 * would be a joke told too often.
 *
 * Pure SVG and CSS: no asset, sharp at any size, and it stops moving under
 * prefers-reduced-motion (the ring simply sits still — the shape still reads).
 */
export function FilmLeader({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        "flex min-h-64 flex-1 flex-col items-center justify-center gap-4",
        className,
      )}
    >
      <div className="relative size-24">
        {/* The countdown target: crosshair, rings, and one sweeping arm. */}
        <svg viewBox="0 0 100 100" className="size-full">
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            className="stroke-foreground/15"
            strokeWidth="1"
          />
          <circle
            cx="50"
            cy="50"
            r="30"
            fill="none"
            className="stroke-foreground/10"
            strokeWidth="1"
          />
          <line x1="50" y1="2" x2="50" y2="98" className="stroke-foreground/10" strokeWidth="1" />
          <line x1="2" y1="50" x2="98" y2="50" className="stroke-foreground/10" strokeWidth="1" />
          {/* The sweep — one arm going round, the way a leader counts down. */}
          <g className="leader-sweep">
            <path
              d="M50 50 L50 4 A46 46 0 0 1 82 18 Z"
              className="fill-tape/25"
            />
            <line
              x1="50"
              y1="50"
              x2="50"
              y2="4"
              className="stroke-tape"
              strokeWidth="1.5"
            />
          </g>
          <circle cx="50" cy="50" r="2.5" className="fill-tape" />
        </svg>
      </div>
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
