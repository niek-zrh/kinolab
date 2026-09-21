"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { Plus, HardDrive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import {
  PageHeader,
  PageShell,
} from "@/components/app/page-shell";
import { FilmLeader } from "@/components/app/film-leader";
import { ShotFrame } from "@/components/app/shot-frame";
import { useStudio } from "@/components/app/studio-context";
import { STATUS_DOT_CLASSES } from "@/components/app/status-pill";
import { SHOT_STATUSES, type ShotStatusKey } from "@/convex/lib/domain";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

export default function StudioHomePage() {
  const { studioId, role } = useStudio();
  const productions = useQuery(
    api.productions.listForStudio,
    studioId ? { studioId } : "skip",
  );
  const canManage = role === "owner" || role === "producer";

  return (
    <PageShell width="sheet">
      <PageHeader
        title="Productions"
        favoriteLabel="Productions"
        actions={
          canManage ? (
            <Link href="/new" className={buttonVariants({ size: "sm" })}>
              <Plus className="size-4" /> {copy.actions.newProduction}
            </Link>
          ) : undefined
        }
      />

      {productions === undefined ? (
        <FilmLeader label="Loading productions" />
      ) : productions.length === 0 ? (
        <EmptyState title={copy.empty.productions}>
          {canManage && (
            <Link href="/new" className={buttonVariants({ size: "sm" })}>
              <Plus className="size-4" /> {copy.actions.newProduction}
            </Link>
          )}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {productions.map((p, i) => (
            <Link
              key={p._id}
              href={`/p/${p._id}`}
              className="group gate-weave block"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {/* The production's face: a frame from work that has been
                  decided. This screen carried no picture at all before —
                  a wall of text in a tool for film. */}
              <div className="relative overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10 transition-all duration-150 group-hover:ring-foreground/25">
                <ShotFrame
                  code={p.code}
                  src={p.coverThumbUrl}
                  status={p.status === "active" ? "picked" : undefined}
                  label={p.coverThumbUrl ? undefined : p.code}
                  framed={false}
                  // A poster is allowed to be showy — there is no frame here
                  // anyone is colour-judging.
                  poster
                  className="transition-transform duration-300 group-hover:scale-[1.02]"
                />
              </div>
              {/* Caption below the frame, not over it — the same rule the
                  contact sheet follows. A still carries its own burned-in
                  slate bottom-left, and two pieces of text in one corner are
                  unreadable (the seeded covers show exactly that). */}
              <div className="mt-2 px-0.5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="truncate font-display text-lg font-semibold leading-tight">
                    {p.name}
                  </h2>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {p.hubConnected && (
                      <HardDrive className="size-3.5 text-muted-foreground" />
                    )}
                    {p.status !== "active" && (
                      <Badge variant="outline" className="capitalize">
                        {p.status}
                      </Badge>
                    )}
                  </span>
                </div>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                  {p.code} · {p.kind === "episodic" ? "Series" : "Feature"}
                  {/* listForStudio bounds how many shots it counts, so say
                      "800+" rather than presenting a saturated count as the
                      real one. */}
                  {" · "}
                  {p.shotCounts.total}
                  {p.shotCountsCapped ? "+" : ""} shots
                </p>
                <div className="mt-2">
                  <ShotBar
                    byStatus={p.shotCounts.byStatus}
                    total={p.shotCounts.total}
                  />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}

function ShotBar({
  byStatus,
  total,
}: {
  byStatus: Record<string, number>;
  total: number;
}) {
  if (total === 0)
    return <div className="h-1.5 rounded-full bg-muted" aria-hidden />;
  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
      {SHOT_STATUSES.map(({ key }) => {
        const count = byStatus[key] ?? 0;
        if (count === 0) return null;
        return (
          <div
            key={key}
            className={cn(STATUS_DOT_CLASSES[key as ShotStatusKey])}
            style={{ width: `${(count / total) * 100}%` }}
            title={`${key}: ${count}`}
          />
        );
      })}
    </div>
  );
}
