"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { Brush, CalendarDays, Layers } from "lucide-react";
import type { CSSProperties } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/empty-state";
import { ShotFrame } from "@/components/app/shot-frame";
import { STATUS_DOT_CLASSES, STATUS_VAR } from "@/components/app/status-pill";
import { useStudio } from "@/components/app/studio-context";
import type { ShotStatusKey } from "@/convex/lib/domain";
import { formatDueDate } from "../board/_components/board-helpers";
import { todayInTz } from "@/lib/format";
import { PageHeader, PageShell } from "@/components/app/page-shell";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

type ShotRow = (typeof api.shots.list._returnType)[number];

/**
 * My work (v1.2) — the artist's screen.
 *
 * Every other view in the app is built for whoever is running the production:
 * the Overview opens on gates and reports, the Board on stages, Shots on a
 * filterable table of everything. An artist wants one question answered —
 * what is on me right now — so this groups their assigned shots by whose move
 * it is, not by stage or status. "Needs you" first, "with review" below it,
 * settled work last and quiet.
 */

/** Whose move is it? The grouping the whole screen is built on. */
type Bucket = "needs_you" | "in_progress" | "with_review" | "settled";

const BUCKET_OF: Record<ShotStatusKey, Bucket> = {
  rework: "needs_you",
  planned: "needs_you",
  generating: "in_progress",
  options_ready: "with_review",
  in_review: "with_review",
  picked: "settled",
  approved: "settled",
  final: "settled",
  delivered: "settled",
  killed: "settled",
};

const SECTIONS: {
  bucket: Bucket;
  title: string;
  blurb: string;
  accent?: boolean;
}[] = [
  {
    bucket: "needs_you",
    title: "Needs you",
    blurb: "Rework to address, or shots with no options yet.",
    accent: true,
  },
  {
    bucket: "in_progress",
    title: "In progress",
    blurb: "Generating — nothing to do until the options land.",
  },
  {
    bucket: "with_review",
    title: "With review",
    blurb: "Options are in. Waiting on a decision.",
  },
  {
    bucket: "settled",
    title: "Settled",
    blurb: "Decided. Here for reference.",
  },
];

/** Statuses where a past due date no longer matters (as in the Shots table). */
const SETTLED_STATUSES: ShotStatusKey[] = [
  "approved",
  "final",
  "delivered",
  "killed",
];

/**
 * Inside "Needs you", rework outranks a shot that was never started: someone
 * is already waiting on the second pass.
 */
const STATUS_URGENCY: Partial<Record<ShotStatusKey, number>> = {
  rework: 0,
  planned: 1,
};

/**
 * A card, not a row. My work used to be a list of 56px thumbnails beside
 * text — the shot as a database record. At this size you recognise the frame
 * before you read the code, which is the whole point of assigning work by
 * picture.
 */
function WorkCard({ shot, today }: { shot: ShotRow; today: string }) {
  const href = `/p/${shot.productionId}/shots/${shot._id}`;
  // Same rule and colour as the Shots table's due cell: a date only turns red
  // once it has actually passed, and never on settled work.
  const overdue =
    shot.dueDate !== undefined &&
    shot.dueDate < today &&
    !SETTLED_STATUSES.includes(shot.status);

  return (
    <Link href={href} className="group block outline-none">
      <div
        style={{ borderTopColor: STATUS_VAR[shot.status] } as CSSProperties}
        className="relative overflow-hidden rounded-lg border-t-2 bg-muted ring-1 ring-foreground/10 transition-all duration-150 group-hover:ring-foreground/25 group-focus-visible:ring-2 group-focus-visible:ring-ring"
      >
        <ShotFrame
          code={shot.code}
          src={shot.coverThumbUrl}
          status={shot.status}
          label={shot.coverThumbUrl ? undefined : shot.code}
          framed={false}
          className="transition-transform duration-200 group-hover:scale-[1.02]"
        />
        <span
          aria-hidden
          className={cn(
            "absolute right-2 top-2 size-2.5 rounded-full ring-2 ring-background/70",
            STATUS_DOT_CLASSES[shot.status],
          )}
        />
      </div>
      <div className="mt-1.5 px-0.5">
        <p className="truncate text-[13px] leading-tight text-foreground/90">
          {shot.title ?? (
            <span className="text-muted-foreground">Untitled</span>
          )}
        </p>
        <p className="mt-0.5 flex items-center gap-2 truncate font-mono text-[11px] text-muted-foreground">
          <span className="truncate">{shot.code}</span>
          {shot.versionsCount > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1">
              <Layers className="size-3" />
              {shot.versionsCount}
            </span>
          )}
          {shot.dueDate && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1",
                overdue && "font-sans font-medium text-destructive",
              )}
            >
              <CalendarDays className="size-3" />
              {formatDueDate(shot.dueDate)}
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}

function Section({
  title,
  blurb,
  accent,
  shots,
  today,
}: {
  title: string;
  blurb: string;
  accent?: boolean;
  shots: ShotRow[];
  today: string;
}) {
  if (shots.length === 0) return null;
  return (
    <section
      className={cn(
        "rounded-xl bg-card p-3 ring-1 ring-foreground/10",
        // The one section that is actually a call to action gets the tape
        // edge the app reserves for decision moments.
        accent && "border-l-2 border-l-tape",
      )}
    >
      <div className="mb-2 flex items-baseline justify-between gap-3 px-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {shots.length}
        </span>
      </div>
      <p className="mb-2 px-2 text-[11px] text-muted-foreground">{blurb}</p>
      <div className="grid grid-cols-1 gap-3 px-2 pb-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {shots.map((shot) => (
          <WorkCard key={shot._id} shot={shot} today={today} />
        ))}
      </div>
    </section>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return <PageShell width="sheet">{children}</PageShell>;
}

export default function MyWorkPage() {
  const params = useParams<{ productionId: string }>();
  const productionId = params.productionId as Id<"productions">;
  const { viewer } = useStudio();
  const [focus, setFocus] = useState<Bucket | "all">("all");
  const production = useQuery(api.productions.get, { productionId });
  // Due dates are production-local (lib/format), not the viewer's clock.
  const today = production?.timezone
    ? todayInTz(production.timezone)
    : new Date().toISOString().slice(0, 10);

  const shots = useQuery(
    api.shots.list,
    viewer ? { productionId, assigneeId: viewer._id } : "skip",
  );
  // Character phases are slot shots and are excluded from shots.list by
  // default (v2 item b) — an artist assigned one still has to see it.
  const slotShots = useQuery(
    api.shots.list,
    viewer
      ? { productionId, assigneeId: viewer._id, elements: "only" }
      : "skip",
  );

  const byBucket = useMemo(() => {
    if (shots === undefined || slotShots === undefined) return undefined;
    const all = [...shots, ...slotShots];
    const out: Record<Bucket, ShotRow[]> = {
      needs_you: [],
      in_progress: [],
      with_review: [],
      settled: [],
    };
    for (const shot of all) out[BUCKET_OF[shot.status]].push(shot);
    out.needs_you.sort(
      (a, b) =>
        (STATUS_URGENCY[a.status] ?? 9) - (STATUS_URGENCY[b.status] ?? 9) ||
        (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
        a.order - b.order,
    );
    for (const key of ["in_progress", "with_review", "settled"] as const) {
      out[key].sort(
        (a, b) =>
          (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
          a.order - b.order,
      );
    }
    return out;
  }, [shots, slotShots]);

  const total = byBucket
    ? Object.values(byBucket).reduce((n, rows) => n + rows.length, 0)
    : 0;

  return (
    <Frame>
      <PageHeader
        title="My work"
        favoriteLabel="My work"
        description="Your assignments, your references, your next frame."
        actions={
          byBucket && total > 0 ? (
            <span className="font-mono text-xs text-muted-foreground">
              {total} assigned
            </span>
          ) : undefined
        }
      />

      <section className="editorial-banner mb-5" aria-label="Creative desk">
        <img
          src="/brand/creative-workbench-v1.jpg"
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-black/70 sm:bg-transparent sm:bg-gradient-to-r sm:from-black/85 sm:via-black/60 sm:to-transparent" />
        <div className="relative max-w-lg p-6 sm:p-7">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">
            Artist workspace
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-white">
            Your creative desk.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/75">
            Pick up an assignment or find the reference that brings the next
            frame into focus.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/p/${productionId}/shots`}
              className={buttonVariants({
                size: "sm",
                className: "bg-white text-black hover:bg-white/90",
              })}
            >
              Browse all shots
            </Link>
            <Link
              href={`/p/${productionId}/references`}
              className={buttonVariants({
                size: "sm",
                variant: "outline",
                className:
                  "border-white/30 bg-black/20 text-white hover:bg-white/15 hover:text-white",
              })}
            >
              Reference board
            </Link>
          </div>
        </div>
      </section>

      {byBucket && total > 0 && (
        <div
          role="group"
          aria-label="Filter assignments"
          className="segmented-control mb-5"
        >
          <button
            type="button"
            onClick={() => setFocus("all")}
            aria-pressed={focus === "all"}
            className={cn(
              "segmented-option",
              focus === "all" && "segmented-option-active",
            )}
          >
            All work{" "}
            <span className="ml-1 tabular-nums text-muted-foreground">
              {total}
            </span>
          </button>
          {SECTIONS.map(({ bucket, title }) => (
            <button
              key={bucket}
              type="button"
              onClick={() => setFocus(bucket)}
              aria-pressed={focus === bucket}
              className={cn(
                "segmented-option",
                focus === bucket && "segmented-option-active",
              )}
            >
              {title}{" "}
              <span className="ml-1 tabular-nums text-muted-foreground">
                {byBucket[bucket].length}
              </span>
            </button>
          ))}
        </div>
      )}

      {byBucket === undefined ? (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : total === 0 ? (
        <EmptyState
          icon={<Brush />}
          title="Nothing is assigned to you in this production."
          description="Shots appear here as soon as someone puts your name on one."
        />
      ) : focus !== "all" && byBucket[focus].length === 0 ? (
        <EmptyState
          icon={<Brush />}
          title="No assignments in this view."
          description="Your other work is one click away."
        >
          <button
            type="button"
            className="text-sm underline underline-offset-4"
            onClick={() => setFocus("all")}
          >
            Show all work
          </button>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {SECTIONS.filter(
            (section) => focus === "all" || section.bucket === focus,
          ).map((section) => (
            <Section
              key={section.bucket}
              title={section.title}
              blurb={section.blurb}
              accent={section.accent}
              shots={byBucket[section.bucket]}
              today={today}
            />
          ))}
        </div>
      )}
    </Frame>
  );
}
