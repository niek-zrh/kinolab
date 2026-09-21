"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_DOT_CLASSES } from "@/components/app/status-pill";
import type { ShotStatusKey } from "@/convex/lib/domain";
import { cn } from "@/lib/utils";

const DONE_STATUSES = new Set<ShotStatusKey>(["approved", "final", "delivered"]);
const REVIEW_STATUSES = new Set<ShotStatusKey>(["options_ready", "in_review"]);

/**
 * Share of the production that is signed off, as a dial rather than a
 * sentence. Percent lives in the middle in mono — the same tabular treatment
 * every other number on the overview uses.
 */
function ProgressRing({ value, size = 60 }: { value: number; size?: number }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(Math.max(value, 0), 1));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-foreground/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="stroke-status-approved transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-xs tabular-nums">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

function Vital({
  dot,
  label,
  value,
  href,
  accent = false,
}: {
  dot: string;
  label: string;
  value: number;
  href?: string;
  accent?: boolean;
}) {
  const body = (
    <>
      <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />
      <span className="font-mono text-sm tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </>
  );

  const className = cn(
    "flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors duration-120",
    accent && "bg-tape/10 text-tape",
    href && "hover:bg-muted",
  );

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <span className={className}>{body}</span>
  );
}

/**
 * The production at a glance (spec F3, v1.2): one band carrying the page
 * heading, how far the production has got, the two or three numbers a
 * producer opens the app for, and the picked frames themselves.
 *
 * The frames themselves moved out to <OverviewReel> in v1.5, which shows the
 * same work directly below this band at a size worth looking at — two strips
 * of the same thumbnails was one too many.
 */
export function OverviewVitals({
  productionId,
}: {
  productionId: Id<"productions">;
}) {
  const production = useQuery(api.productions.get, { productionId });
  const shots = useQuery(api.shots.list, { productionId });
  const pending = useQuery(api.approvals.myPending, {});

  const live = (shots ?? []).filter((s) => s.status !== "killed");
  const done = live.filter((s) => DONE_STATUSES.has(s.status)).length;
  const inReview = live.filter((s) => REVIEW_STATUSES.has(s.status)).length;
  const needsYou = (pending ?? []).filter(
    (a) => a.productionId === productionId,
  ).length;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-xl bg-card px-4 py-3.5 ring-1 ring-foreground/10">
      <div className="flex min-w-0 items-center gap-3.5">
        {shots === undefined ? (
          <Skeleton className="size-[60px] rounded-full" />
        ) : (
          <ProgressRing value={live.length ? done / live.length : 0} />
        )}

        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold leading-tight tracking-tight">
            Overview
          </h1>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {production ? (
              <>
                <span className="font-medium text-foreground/80">
                  {production.name}
                </span>
                <span className="font-mono"> · {production.code}</span>
                {production.kind === "episodic" ? " · Series" : ""}
              </>
            ) : (
              "…"
            )}
          </p>

          {shots === undefined ? (
            <Skeleton className="mt-2 h-5 w-64" />
          ) : (
            <div className="-mx-1.5 mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1">
              <Vital
                dot="bg-muted-foreground/50"
                label={live.length === 1 ? "shot" : "shots"}
                value={live.length}
                href={`/p/${productionId}/shots`}
              />
              <Vital
                dot={STATUS_DOT_CLASSES.in_review}
                label="in review"
                value={inReview}
                href={`/p/${productionId}/review`}
              />
              <Vital
                dot={STATUS_DOT_CLASSES.approved}
                label="approved"
                value={done}
                href={`/p/${productionId}/shots?status=approved`}
              />
              {needsYou > 0 && (
                <Vital
                  dot="bg-tape"
                  label="need you"
                  value={needsYou}
                  href={`/p/${productionId}/decisions`}
                  accent
                />
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
