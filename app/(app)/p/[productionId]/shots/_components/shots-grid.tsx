"use client";

import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { CalendarDays, Check, Layers } from "lucide-react";
import { ShotFrame } from "@/components/app/shot-frame";
import { STATUS_DOT_CLASSES, STATUS_VAR } from "@/components/app/status-pill";
import { UserAvatar } from "@/components/app/user-avatar";
import { SHOT_STATUS_BY_KEY, type ShotStatusKey } from "@/convex/lib/domain";
import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";
import type { ShotRow } from "./shots-common";

/** Statuses where a past due date no longer matters (as in the table). */
const SETTLED: ShotStatusKey[] = ["approved", "final", "delivered", "killed"];

/**
 * The contact sheet (v1.3) — the grid rebuilt around the picture.
 *
 * The old card wrapped a small frame in three bands of chrome: a slate strip
 * with the code, the image, then a footer. You found a shot by READING a mono
 * code. On a sheet of real frames you find it by looking, which is how anyone
 * who has handled contact prints works — so the frame is now the whole card
 * and everything else either sits on it or reduces to one quiet caption.
 *
 * What survives as chrome earns its place by being usable at a glance:
 * a 2px status edge (the slate-strip signature, at no cost in height), the
 * option count, who it is on, and whether it is late.
 */
export function ShotsGrid({
  shots,
  productionId,
  today,
}: {
  shots: ShotRow[];
  productionId: Id<"productions">;
  /** Production-local date, for the late marker. */
  today: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {shots.map((shot, i) => {
        const late =
          shot.dueDate !== undefined &&
          shot.dueDate < today &&
          !SETTLED.includes(shot.status);
        const decided =
          shot.status === "picked" ||
          shot.status === "approved" ||
          shot.status === "final" ||
          shot.status === "delivered";

        return (
          <Link
            key={shot._id}
            href={`/p/${productionId}/shots/${shot._id}`}
            title={`${shot.code}${shot.title ? ` — ${shot.title}` : ""} · ${
              SHOT_STATUS_BY_KEY[shot.status].label
            }`}
            className="group gate-weave block outline-none"
            // Staggered only across the first rows: past that it is scrolling,
            // not arriving, and a delayed frame would just look broken.
            style={{ animationDelay: `${Math.min(i, 11) * 35}ms` }}
          >
            <div
              // The status edge rides the top of the frame itself — the
              // slate-strip signature, at no cost in height.
              style={{ borderTopColor: STATUS_VAR[shot.status] } as CSSProperties}
              className="relative overflow-hidden rounded-lg border-t-2 bg-muted ring-1 ring-foreground/10 transition-all duration-150 group-hover:ring-foreground/25 group-focus-visible:ring-2 group-focus-visible:ring-ring"
            >
              <ShotFrame
                code={shot.code}
                src={shot.coverThumbUrl}
                status={shot.status}
                // With no slate strip above it any more, an empty frame has
                // nothing else naming it — so it carries its own code again.
                label={shot.coverThumbUrl ? undefined : shot.code}
                framed={false}
                className="transition-transform duration-200 group-hover:scale-[1.02]"
              />

              {/* Status, readable without reading: colour top edge + dot. */}
              <span
                aria-hidden
                className={cn(
                  "absolute right-2 top-2 size-2.5 rounded-full ring-2 ring-background/70",
                  STATUS_DOT_CLASSES[shot.status],
                )}
              />

              {decided && (
                <span
                  aria-hidden
                  className="absolute left-2 top-2 flex size-5 items-center justify-center rounded-full bg-status-picked text-tape-foreground"
                >
                  <Check className="size-3" />
                </span>
              )}

              {/* Only the person rides the picture, bottom RIGHT. Nothing
                  sits bottom-left: that is where a still's own burned-in
                  slate or lower-third usually lives, and two pieces of text
                  in the same corner are unreadable. */}
              {shot.assignee && (
                <span className="pointer-events-none absolute bottom-1.5 right-1.5">
                  <UserAvatar
                    name={shot.assignee.name}
                    image={shot.assignee.image}
                    className="size-5 text-[9px] ring-1 ring-black/40"
                  />
                </span>
              )}
            </div>

            {/* One quiet caption. The human title leads; the code is the
                reference you fall back on, not the thing you scan. Counts
                live here rather than over the image — the picture stays a
                picture. */}
            <div className="mt-1.5 px-0.5">
              <p className="truncate text-[13px] leading-tight text-foreground/90">
                {shot.title ?? (
                  <span className="text-muted-foreground">Untitled</span>
                )}
              </p>
              <p className="mt-0.5 flex items-center gap-2 truncate font-mono text-[11px] text-muted-foreground">
                <span className="truncate">
                  {shot.code}
                  {shot.scene ? ` · ${shot.scene.code}` : ""}
                </span>
                {shot.versionsCount > 0 && (
                  <span className="inline-flex shrink-0 items-center gap-1">
                    <Layers className="size-3" />
                    {shot.versionsCount}
                  </span>
                )}
                {late && (
                  <span className="inline-flex shrink-0 items-center gap-1 font-sans font-medium text-destructive">
                    <CalendarDays className="size-3" />
                    Late
                  </span>
                )}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
