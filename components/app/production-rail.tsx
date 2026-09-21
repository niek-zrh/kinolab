"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ComponentType } from "react";
import {
  Brush,
  Columns3,
  FileText,
  Film,
  FolderOpen,
  LayoutDashboard,
  MonitorPlay,
  Settings,
  ShieldCheck,
  Stamp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { copy } from "@/lib/copy";
import { useStudio } from "@/components/app/studio-context";

type RailItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
};

/**
 * Rail groups. A label above a group is a section heading (spec v2 §(b):
 * "Pre-production" over Characters); unlabelled groups render as a plain run.
 * Settings shows for every role since v1.1 — the Appearance card is personal
 * (DECISIONS 2026-09-19); the manager-only cards gate themselves.
 */
const GROUPS: { label?: string; items: RailItem[] }[] = [
  {
    items: [
      // First on purpose: everyone else's screens answer "how is the
      // production doing", this one answers "what is on me".
      { href: "/my-work", label: copy.nav.myWork, icon: Brush },
      { href: "", label: copy.nav.overview, icon: LayoutDashboard, exact: true },
      { href: "/board", label: copy.nav.board, icon: Columns3 },
      { href: "/shots", label: copy.nav.shots, icon: Film },
      // Characters sits with the other content, not under a "Pre-production"
      // heading: one item under a shouted section label read as filing-cabinet
      // structure, and a character is a thing you make, like a shot.
      { href: "/characters", label: copy.nav.characters, icon: Users },
    ],
  },
  {
    items: [
      { href: "/review", label: copy.nav.review, icon: MonitorPlay },
      { href: "/files", label: copy.nav.files, icon: FolderOpen },
      { href: "/decisions", label: copy.nav.decisions, icon: Stamp },
      { href: "/reports", label: copy.nav.reports, icon: FileText },
      { href: "/qc", label: copy.nav.qc, icon: ShieldCheck },
      { href: "/settings", label: copy.nav.settings, icon: Settings },
    ],
  },
];

export function ProductionRail({
  productionId,
}: {
  productionId: Id<"productions">;
}) {
  const pathname = usePathname();
  const { studioId, setStudioId } = useStudio();
  const production = useQuery(api.productions.get, { productionId });
  // Two cheap queries, deliberately: shots.counts skips enrichment and
  // approvals.myPending is already subscribed by the Overview.
  const counts = useQuery(api.shots.counts, { productionId });
  const pending = useQuery(api.approvals.myPending, {});
  const base = `/p/${productionId}`;

  const needsYou = (pending ?? []).filter(
    (a) => a.productionId === productionId,
  ).length;

  /**
   * Live badges on the rail: how much work sits behind a destination, and —
   * in tape, the decision accent — how much of it is waiting on the person
   * reading. Zero never renders; a badge means there is something there.
   */
  const badges: Record<string, { value: number; accent?: boolean }> = {};
  if (counts?.total) badges["/shots"] = { value: counts.total };
  if (counts?.reviewQueue) badges["/review"] = { value: counts.reviewQueue };
  if (needsYou) badges["/decisions"] = { value: needsYou, accent: true };

  // Keep the active studio in sync with the production being viewed so
  // role-gated UI derives from the production's own studio.
  useEffect(() => {
    if (production && production.studioId !== studioId) {
      setStudioId(production.studioId);
    }
  }, [production, studioId, setStudioId]);

  return (
    <aside className="sticky top-12 flex h-[calc(100vh-3rem)] w-44 shrink-0 flex-col border-r bg-sidebar">
      <div className="border-b px-3 py-3">
        <p className="truncate text-sm font-medium leading-tight">
          {production?.name ?? "…"}
        </p>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {production?.code ?? ""}
          {production?.kind === "episodic" ? " · Series" : ""}
        </p>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {GROUPS.map((group, gi) => (
          <div
            key={group.label ?? gi}
            className={cn("space-y-0.5", gi > 0 && "mt-2")}
          >
            {group.label && (
              <p className="px-2.5 pt-1 pb-1 font-mono text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const href = `${base}${item.href}`;
              const active = item.exact
                ? pathname === href
                : pathname.startsWith(href);
              const Icon = item.icon;
              const badge = badges[item.href];
              return (
                <Link
                  key={item.href}
                  href={href}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-md py-1.5 pl-2.5 pr-2 text-sm transition-colors duration-120",
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  {/* Where am I: a solid edge marker, readable before colour. */}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-foreground"
                    />
                  )}
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0 truncate">{item.label}</span>
                  {badge && (
                    <span
                      className={cn(
                        "ml-auto shrink-0 rounded-full px-1.5 font-mono text-[10px] leading-4 tabular-nums",
                        badge.accent
                          ? "bg-tape text-tape-foreground font-medium"
                          : "bg-sidebar-accent text-muted-foreground",
                      )}
                    >
                      {badge.value}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
