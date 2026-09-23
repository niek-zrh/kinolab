"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Fragment,
  useEffect,
  useState,
  type ComponentType,
  type DragEvent,
} from "react";
import {
  Brush,
  BookOpen,
  Check,
  Columns3,
  Eye,
  EyeOff,
  FileText,
  Film,
  FolderOpen,
  GripVertical,
  LayoutDashboard,
  MonitorPlay,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  RotateCcw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Stamp,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { copy } from "@/lib/copy";
import { useStudio } from "@/components/app/studio-context";
import { useRailPrefs } from "./rail-prefs";

type RailItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
  group: "Workspace" | "Create" | "Production" | "Studio";
};

/**
 * Default rail order. People can reorder and hide these (v1.3, stored per
 * device in `kinolab.rail`), so this is a starting point, not a layout.
 *
 * Settings shows for every role since v1.1 — the Appearance card is personal
 * (DECISIONS 2026-09-19); the manager-only cards gate themselves.
 */
const ITEMS: RailItem[] = [
  // Group the shared overview and personal work together before creative tools.
  // A saved custom order still wins over these defaults.
  {
    href: "",
    label: copy.nav.overview,
    icon: LayoutDashboard,
    exact: true,
    group: "Workspace",
  },
  { href: "/my-work", label: copy.nav.myWork, icon: Brush, group: "Workspace" },
  { href: "/board", label: copy.nav.board, icon: Columns3, group: "Workspace" },
  { href: "/shots", label: copy.nav.shots, icon: Film, group: "Create" },
  { href: "/storyboard", label: "Storyboard", icon: BookOpen, group: "Create" },
  {
    href: "/references",
    label: "Reference board",
    icon: Palette,
    group: "Create",
  },
  // Characters sits with the other content rather than under a shouted
  // "Pre-production" heading: a character is a thing you make, like a shot.
  {
    href: "/characters",
    label: copy.nav.characters,
    icon: Users,
    group: "Create",
  },
  {
    href: "/review",
    label: copy.nav.review,
    icon: MonitorPlay,
    group: "Production",
  },
  {
    href: "/files",
    label: copy.nav.files,
    icon: FolderOpen,
    group: "Production",
  },
  {
    href: "/decisions",
    label: copy.nav.decisions,
    icon: Stamp,
    group: "Production",
  },
  {
    href: "/reports",
    label: copy.nav.reports,
    icon: FileText,
    group: "Production",
  },
  { href: "/qc", label: copy.nav.qc, icon: ShieldCheck, group: "Production" },
  {
    href: "/assistants",
    label: "AI workspace",
    icon: Sparkles,
    group: "Studio",
  },
  {
    href: "/settings",
    label: copy.nav.settings,
    icon: Settings,
    group: "Studio",
  },
];

const ALL_HREFS = ITEMS.map((i) => i.href);

export function ProductionRail({
  productionId,
}: {
  productionId: Id<"productions">;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { studioId, setStudioId } = useStudio();
  const production = useQuery(api.productions.get, { productionId });
  // Two cheap queries, deliberately: shots.counts skips enrichment and
  // approvals.myPending is already subscribed by the Overview.
  const counts = useQuery(api.shots.counts, { productionId });
  const pending = useQuery(api.approvals.myPending, {});
  const { prefs, setCollapsed, toggleHidden, move, reset, ordered } =
    useRailPrefs();
  const [editing, setEditing] = useState(false);
  const [dragHref, setDragHref] = useState<string | null>(null);
  const base = `/p/${productionId}`;

  const needsYou = (pending ?? []).filter(
    (a) => a.productionId === productionId,
  ).length;

  /**
   * Live badges: how much work sits behind a destination, and — in tape, the
   * decision accent — how much is waiting on the person reading. Zero never
   * renders; a badge means there is something there.
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

  const collapsed = prefs.collapsed && !editing;
  // Hiding is only honoured outside edit mode — you have to see an item to
  // bring it back.
  const visible = ordered(ITEMS).filter(
    (item) => editing || !prefs.hidden.includes(item.href),
  );

  const onDrop = (target: string | null) => {
    if (dragHref === null) return;
    move(dragHref, target, ALL_HREFS);
    setDragHref(null);
  };

  return (
    <>
      <div className="no-print flex items-center gap-3 border-b bg-sidebar px-4 py-3 md:hidden">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {production?.name ?? "Production"}
        </span>
        <select
          aria-label="Production navigation"
          className="native-select max-w-44"
          value={
            ITEMS.find((item) =>
              item.exact
                ? pathname === base
                : pathname.startsWith(base + item.href),
            )?.href ?? ""
          }
          onChange={(e) => router.push(base + e.target.value)}
        >
          {ITEMS.map((item) => (
            <option key={item.href} value={item.href}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <aside
        className={cn(
          "no-print sticky top-12 hidden h-[calc(100dvh-3rem)] shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 md:flex",
          collapsed ? "w-14" : "w-56",
        )}
      >
        <div className="flex items-start gap-1 border-b px-3 py-3">
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight">
                {production?.name ?? "…"}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {production?.code ?? ""}
                {production?.kind === "episodic" ? " · Series" : ""}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(!prefs.collapsed)}
            aria-label={prefs.collapsed ? "Expand menu" : "Collapse menu"}
            title={prefs.collapsed ? "Expand menu" : "Collapse menu"}
            className={cn(
              "rounded-md p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
              collapsed && "mx-auto",
            )}
          >
            {prefs.collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        </div>

        <nav
          aria-label="Production workspace"
          className="flex-1 space-y-0.5 overflow-y-auto p-2"
        >
          {visible.map((item, index) => {
            const href = `${base}${item.href}`;
            const active = item.exact
              ? pathname === href
              : pathname.startsWith(href);
            const Icon = item.icon;
            const badge = badges[item.href];
            const hidden = prefs.hidden.includes(item.href);

            const body = (
              <>
                {/* Where am I: a solid edge marker, readable before colour. */}
                {active && !editing && (
                  <span
                    aria-hidden
                    className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-tape"
                  />
                )}
                <Icon className="size-4 shrink-0" />
                {!collapsed && (
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                )}
                {!collapsed && item.href === "/assistants" && !editing && (
                  <span className="text-[9px] text-muted-foreground">
                    Planned
                  </span>
                )}
                {!collapsed && badge && !editing && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 font-mono text-[10px] leading-4 tabular-nums",
                      badge.accent
                        ? "bg-tape font-medium text-tape-foreground"
                        : "bg-sidebar-accent text-muted-foreground",
                    )}
                  >
                    {badge.value}
                  </span>
                )}
              </>
            );

            const shared = cn(
              "relative flex min-h-8 w-full items-center gap-2.5 rounded-lg py-1 pl-2.5 pr-2 text-[13px] transition-colors duration-150",
              collapsed && "justify-center px-0",
              active && !editing
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              editing && hidden && "opacity-40",
            );

            if (editing) {
              return (
                <div
                  key={item.href}
                  draggable
                  onDragStart={() => setDragHref(item.href)}
                  onDragEnd={() => setDragHref(null)}
                  onDragOver={(e: DragEvent) => e.preventDefault()}
                  onDrop={() => onDrop(item.href)}
                  className={cn(
                    shared,
                    "cursor-grab active:cursor-grabbing",
                    dragHref === item.href && "opacity-30",
                  )}
                >
                  <GripVertical className="size-3.5 shrink-0 text-muted-foreground/60" />
                  {body}
                  <button
                    type="button"
                    onClick={() => toggleHidden(item.href)}
                    aria-label={
                      hidden ? `Show ${item.label}` : `Hide ${item.label}`
                    }
                    title={hidden ? "Show" : "Hide"}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    {hidden ? (
                      <EyeOff className="size-3.5" />
                    ) : (
                      <Eye className="size-3.5" />
                    )}
                  </button>
                </div>
              );
            }

            return (
              <Fragment key={item.href}>
                {!collapsed &&
                  prefs.order.length === 0 &&
                  (index === 0 || visible[index - 1].group !== item.group) && (
                    <p
                      className={cn(
                        "eyebrow px-2.5 pb-1 pt-2",
                        index === 0 && "pt-1",
                      )}
                    >
                      {item.group}
                    </p>
                  )}
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  title={collapsed ? item.label : undefined}
                  className={shared}
                >
                  {body}
                </Link>
              </Fragment>
            );
          })}

          {/* Drop target for "move to the end". */}
          {editing && (
            <div
              onDragOver={(e: DragEvent) => e.preventDefault()}
              onDrop={() => onDrop(null)}
              className="h-6 rounded-md border border-dashed border-border/60"
            />
          )}
        </nav>

        <div className="border-t p-2">
          {editing ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-sidebar-accent py-1.5 text-xs font-medium text-sidebar-accent-foreground"
              >
                <Check className="size-3.5" /> Done
              </button>
              <button
                type="button"
                onClick={reset}
                aria-label="Reset menu to default"
                title="Reset to default"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              >
                <RotateCcw className="size-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Customise menu"
              title="Customise menu — drag to reorder, hide what you don't use"
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground",
                collapsed ? "justify-center px-0" : "px-2.5",
              )}
            >
              <SlidersHorizontal className="size-3.5 shrink-0" />
              {!collapsed && "Customise menu"}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
