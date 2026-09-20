"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { Check, ChevronRight, Circle, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/app/user-avatar";
import type { ShotStatusKey } from "@/convex/lib/domain";
import { cn } from "@/lib/utils";

type StageRow = (typeof api.productions.listStages._returnType)[number];

/** Past the pick and signed off — what "done" means for a stage's fill. */
const DONE_STATUSES = new Set<ShotStatusKey>(["approved", "final", "delivered"]);

/** Literal class strings so Tailwind compiles them (same trick as status-pill). */
const SEGMENT_CLASSES: Record<StageRow["status"], string> = {
  not_started: "border-t-border bg-muted/30",
  active: "border-t-tape bg-card",
  blocked: "border-t-status-rework bg-status-rework/10",
  done: "border-t-status-approved bg-status-approved/10",
};

const STATUS_LABELS: Record<StageRow["status"], string> = {
  not_started: "Not started",
  active: "Active",
  blocked: "Blocked",
  done: "Done",
};

const STATUS_LABEL_CLASSES: Record<StageRow["status"], string> = {
  not_started: "text-muted-foreground/80",
  active: "text-tape",
  blocked: "text-status-rework",
  done: "text-status-approved",
};

const GATE_TITLES: Record<StageRow["gateStatus"], string> = {
  open: "Gate open",
  requested: "Sign-off requested",
  approved: "Gate approved",
  rejected: "Gate rejected",
};

/**
 * Gate state, said in words as well as colour. It used to be a 12px circle
 * whose meaning lived in a tooltip — the one thing on this band a producer
 * most needs to read across the room.
 */
function GateChip({ status }: { status: StageRow["gateStatus"] }) {
  const title = GATE_TITLES[status];
  const base =
    "inline-flex min-w-0 items-center gap-1 whitespace-nowrap text-[10px] font-medium";

  switch (status) {
    case "open":
      return (
        <span className={cn(base, "text-muted-foreground/70")} title={title}>
          <Circle className="size-2.5 shrink-0" aria-hidden />
          <span className="truncate">Open</span>
        </span>
      );
    case "requested":
      return (
        <span className={cn(base, "text-status-generating")} title={title}>
          <span className="relative flex size-2.5 shrink-0" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-generating opacity-50" />
            <span className="relative inline-flex size-2.5 rounded-full bg-status-generating" />
          </span>
          <span className="truncate">Sign-off</span>
        </span>
      );
    case "approved":
      return (
        <span className={cn(base, "text-status-approved")} title={title}>
          <Check className="size-3 shrink-0" aria-hidden />
          <span className="truncate">Signed</span>
        </span>
      );
    case "rejected":
      return (
        <span className={cn(base, "text-destructive")} title={title}>
          <X className="size-3 shrink-0" aria-hidden />
          <span className="truncate">Rejected</span>
        </span>
      );
  }
}

/**
 * The pipeline (spec F3). Six stages in flow order, each carrying its own
 * numbers: how many shots sit in it, how far through they are, whether its
 * gate is waiting on someone. The 2px status-coloured top edge is the
 * slate-strip signature; the active stage takes the tape accent so "where are
 * we" is answered before any text is read.
 *
 * Each segment zooms into its own shots (the board-column convention), rather
 * than the whole band linking to the board as it did in v1.1.
 */
export function OverviewStageStrip({
  productionId,
}: {
  productionId: Id<"productions">;
}) {
  const stages = useQuery(api.productions.listStages, { productionId });
  // Same query the shot summary on this page runs — Convex dedupes it.
  const shots = useQuery(api.shots.list, { productionId });

  if (stages === undefined) return <Skeleton className="h-[86px] rounded-xl" />;

  return (
    <div
      className="grid grid-cols-3 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 sm:grid-cols-6"
      role="group"
      aria-label="Production pipeline"
    >
      {stages.map((stage, i) => {
        const inStage = (shots ?? []).filter(
          (s) => s.stage === stage.stage && s.status !== "killed",
        );
        const done = inStage.filter((s) => DONE_STATUSES.has(s.status)).length;
        const pct = inStage.length ? (done / inStage.length) * 100 : 0;

        return (
          <Link
            key={stage._id}
            href={`/p/${productionId}/shots?stage=${stage.stage}`}
            aria-label={`${stage.label} — ${STATUS_LABELS[stage.status]}, ${
              inStage.length
            } shots, ${GATE_TITLES[stage.gateStatus].toLowerCase()}`}
            className={cn(
              "relative flex min-w-0 flex-col gap-1.5 border-t-2 px-3 py-2.5 transition-colors duration-150 hover:bg-accent/50",
              i > 0 && "border-l border-l-border",
              SEGMENT_CLASSES[stage.status],
            )}
          >
            {/* Flow marker: the band reads left-to-right as one pipe. */}
            {i > 0 && (
              <ChevronRight
                aria-hidden
                className="absolute -left-[7px] top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/40"
              />
            )}

            <div className="flex items-baseline justify-between gap-1.5">
              <span
                className={cn(
                  "truncate text-xs font-medium",
                  stage.status === "not_started"
                    ? "text-muted-foreground"
                    : "text-foreground",
                )}
              >
                {stage.short}
              </span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                {inStage.length || "—"}
              </span>
            </div>

            {/* How far this stage's own shots have got. */}
            <div
              className={cn(
                "h-1 overflow-hidden rounded-full",
                // An empty stage gets a fainter track: no shots is not the
                // same as no progress, and the bar should not imply data.
                inStage.length ? "bg-foreground/10" : "bg-foreground/5",
              )}
              title={
                inStage.length
                  ? `${done} of ${inStage.length} approved or beyond`
                  : "No shots in this stage"
              }
            >
              <div
                className="h-full rounded-full bg-status-approved transition-[width] duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>

            <span
              className={cn(
                "truncate text-[10px] uppercase tracking-wide",
                STATUS_LABEL_CLASSES[stage.status],
              )}
            >
              {STATUS_LABELS[stage.status]}
            </span>

            {/* Gate and its approvers share the last row — at six segments
                across, the stage status needed a line of its own or the
                avatars landed on top of it. */}
            <div className="flex h-4 items-center justify-between gap-1">
              <GateChip status={stage.gateStatus} />
              {stage.approvers.length > 0 && (
                <div className="flex shrink-0 items-center -space-x-1.5">
                  {stage.approvers.slice(0, 2).map((approver) => (
                    <UserAvatar
                      key={approver._id}
                      name={approver.name}
                      image={approver.image}
                      className="size-4 text-[8px] ring-1 ring-card"
                    />
                  ))}
                  {stage.approvers.length > 2 && (
                    <span className="pl-2 text-[9px] text-muted-foreground">
                      +{stage.approvers.length - 2}
                    </span>
                  )}
                </div>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
