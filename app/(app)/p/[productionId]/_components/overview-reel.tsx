"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ShotFrame } from "@/components/app/shot-frame";
import { STATUS_VAR } from "@/components/app/status-pill";
import { SHOT_STATUS_BY_KEY, type ShotStatusKey } from "@/convex/lib/domain";
import type { CSSProperties } from "react";

/**
 * The reel (v1.5) — what the film looks like right now, at the top of the
 * Overview.
 *
 * The Overview used to open on a wall of activity sentences: "Dara added v2
 * to SC120_SH010". True, and unreadable as a picture of the production. A
 * producer opening the app wants to see the work, then the numbers, then the
 * paper trail. So the frames come first and the feed moves below them.
 *
 * Decided work leads — that is what the production has actually committed to
 * — and anything still in flight follows, so the row is never empty on a
 * production that has started.
 */

/** Best first: the film's face, then what is nearly there. */
const REEL_RANK: Partial<Record<ShotStatusKey, number>> = {
  delivered: 0,
  final: 1,
  approved: 2,
  picked: 3,
  in_review: 4,
  options_ready: 5,
};

const MAX = 6;

export function OverviewReel({
  productionId,
}: {
  productionId: Id<"productions">;
}) {
  const shots = useQuery(api.shots.list, { productionId });

  if (shots === undefined) {
    return (
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: MAX }, (_, i) => (
          <Skeleton key={i} className="aspect-video rounded-lg" />
        ))}
      </div>
    );
  }

  const reel = shots
    .filter((s) => s.coverThumbUrl !== null && REEL_RANK[s.status] !== undefined)
    .sort(
      (a, b) =>
        (REEL_RANK[a.status] ?? 9) - (REEL_RANK[b.status] ?? 9) ||
        a.order - b.order,
    )
    .slice(0, MAX);

  // Nothing generated yet: say so where the pictures will be, rather than
  // leaving a hole or collapsing the section silently.
  if (reel.length === 0) {
    return (
      <Link
        href={`/p/${productionId}/shots`}
        className="creative-banner mb-6 flex min-h-48 items-center justify-center rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        No frames yet — options appear here as the production generates them.
      </Link>
    );
  }

  return (
    <section aria-label="Latest frames" className="mb-6">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-medium">
          The film so far
        </h2>
        <Link
          href={`/p/${productionId}/storyboard`}
          className="group flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Open storyboard
          <ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-0.5" />
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {reel.map((shot) => (
          <Link
            key={shot._id}
            href={`/p/${productionId}/shots/${shot._id}`}
            title={`${shot.code}${shot.title ? ` — ${shot.title}` : ""} · ${
              SHOT_STATUS_BY_KEY[shot.status].label
            }`}
            className="group block overflow-hidden rounded-lg border-t-2 bg-muted ring-1 ring-foreground/10 transition-all duration-150 hover:ring-foreground/25"
            style={{ borderTopColor: STATUS_VAR[shot.status] } as CSSProperties}
          >
            <ShotFrame
              code={shot.code}
              src={shot.coverThumbUrl}
              status={shot.status}
              size="sm"
              framed={false}
              className="transition-transform duration-300 group-hover:scale-[1.03]"
            />
            <div className="flex items-start justify-between gap-3 bg-card px-3 py-2.5">
              <div className="min-w-0"><p className="truncate text-sm font-medium">{shot.title ?? shot.code}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{shot.code}</p></div>
              <span className="shrink-0 text-[10px] text-muted-foreground">{SHOT_STATUS_BY_KEY[shot.status].label}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
