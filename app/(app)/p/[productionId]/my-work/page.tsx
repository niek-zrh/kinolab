"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { Brush, CalendarDays, Layers } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/empty-state";
import { ShotFrame } from "@/components/app/shot-frame";
import { StatusPill } from "@/components/app/status-pill";
import { useStudio } from "@/components/app/studio-context";
import type { ShotStatusKey } from "@/convex/lib/domain";
import { formatDueDate } from "../board/_components/board-helpers";
import { todayInTz } from "@/lib/format";
import {
  PageHeader,
  PageShell,
} from "@/components/app/page-shell";

import { cn } from "@/lib/utils";

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
  { bucket: "settled", title: "Settled", blurb: "Decided. Here for reference." },
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

function WorkRow({ shot, today }: { shot: ShotRow; today: string }) {
  const href = `/p/${shot.productionId}/shots/${shot._id}`;
  // Same rule and colour as the Shots table's due cell: a date only turns red
  // once it has actually passed, and never on settled work.
  const overdue =
    shot.dueDate !== undefined &&
    shot.dueDate < today &&
    !SETTLED_STATUSES.includes(shot.status);

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-md px-2 py-1.5 outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <span className="w-14 shrink-0 overflow-hidden rounded-[3px]">
        <ShotFrame
          code={shot.code}
          src={shot.coverThumbUrl}
          status={shot.status}
          size="sm"
          framed={false}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate font-mono text-xs font-medium">
            {shot.code}
          </span>
          <span className="truncate text-[13px] text-muted-foreground">
            {shot.title ?? ""}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-2.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Layers className="size-3" />
            {shot.versionsCount}
          </span>
          {shot.scene && <span className="font-mono">{shot.scene.code}</span>}
          {shot.dueDate && (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                overdue && "text-destructive",
              )}
            >
              <CalendarDays className="size-3" />
              {formatDueDate(shot.dueDate)}
            </span>
          )}
        </span>
      </span>
      <StatusPill status={shot.status} size="xs" />
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
      <div className="space-y-0.5">
        {shots.map((shot) => (
          <WorkRow key={shot._id} shot={shot} today={today} />
        ))}
      </div>
    </section>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return <PageShell>{children}</PageShell>;
}

export default function MyWorkPage() {
  const params = useParams<{ productionId: string }>();
  const productionId = params.productionId as Id<"productions">;
  const { viewer } = useStudio();
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
    viewer ? { productionId, assigneeId: viewer._id, elements: "only" } : "skip",
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
        actions={
          byBucket && total > 0 ? (
            <span className="font-mono text-xs text-muted-foreground">
              {total} assigned
            </span>
          ) : undefined
        }
      />

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
        >
          <Link
            href={`/p/${productionId}/shots`}
            className="text-sm underline underline-offset-2 hover:text-foreground"
          >
            Browse all shots
          </Link>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {SECTIONS.map((section) => (
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
