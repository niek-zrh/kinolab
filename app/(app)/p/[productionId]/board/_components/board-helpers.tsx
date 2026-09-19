"use client";

import { format } from "date-fns";
import { Check, CircleDashed, Clock, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  SHOT_STATUSES,
  WORKING_STATUSES,
  type ShotStatusKey,
  type StageKey,
} from "@/convex/lib/domain";
import { cn } from "@/lib/utils";

/** Enriched stage instance as returned by api.productions.listStages. */
export type StageRow = (typeof api.productions.listStages._returnType)[number];
/**
 * Enriched shot card as returned by api.shots.list. `pickedVersionIndex` is
 * what shots.get returns today; list rows gain it once the backend adds it
 * (requested), and the "Picked" chip shows the number as soon as it arrives.
 */
export type BoardShot = (typeof api.shots.list._returnType)[number] & {
  pickedVersionIndex?: number | null;
};
/** A studio member with an account — the only kind a shot can be assigned to. */
export type BoardMember = {
  userId: Id<"users">;
  name: string;
  image?: string | null;
};
export type StageInstanceStatus = StageRow["status"];
export type GateStatus = StageRow["gateStatus"];

/**
 * Optimistic card edits while a mutation is in flight (stage from a drop,
 * status / assignee / due date from the card menu). A field clears once the
 * server value catches up, or rolls back when the server refuses.
 */
export type ShotOverride = {
  stage?: StageKey;
  status?: ShotStatusKey;
  assigneeId?: Id<"users">;
  dueDate?: string | null;
};

/** Card edit handlers, threaded from the page (which owns the overrides). */
export type BoardCardActions = {
  onSetStatus: (shotId: Id<"shots">, status: ShotStatusKey) => void;
  onAssign: (shotId: Id<"shots">, userId: Id<"users">) => void;
  onSetDueDate: (shotId: Id<"shots">, dueDate: string | null) => void;
};

/** dataTransfer type used when dragging shot cards between columns. */
export const SHOT_DRAG_TYPE = "application/x-slate-shot";

/** Per-device card density (spec f: header toggle Compact | Cards). */
export const BOARD_VIEW_KEY = "kinolab.boardView";
export type BoardView = "compact" | "cards";

/** shots.list stops at MAX_LIST_SHOTS — the Shots page shows the same marker. */
export const BOARD_SHOT_CAP = 1000;

export function shotHref(shot: Pick<BoardShot, "productionId" | "_id">): string {
  return `/p/${shot.productionId}/shots/${shot._id}`;
}

/** Roles with content.edit (drag between stages, edit any shot). */
export function isContentEditor(role: string | null): boolean {
  return (
    role === "owner" ||
    role === "producer" ||
    role === "creative_director" ||
    role === "supervisor"
  );
}

/**
 * Who may edit status / assignee / due date from the card — the shot page's
 * rule (canEditShot): content.edit roles on any shot, an artist on their own.
 * The server enforces it again; this only decides whether the menu renders.
 */
export function canEditBoardShot(
  role: string | null,
  viewerId: Id<"users"> | undefined,
  shot: Pick<BoardShot, "assigneeId">,
): boolean {
  if (isContentEditor(role)) return true;
  return (
    role === "artist" &&
    viewerId !== undefined &&
    shot.assigneeId === viewerId
  );
}

/** Statuses the menu offers: artists only move between working statuses. */
export function statusOptionsFor(role: string | null) {
  return role === "artist"
    ? SHOT_STATUSES.filter((s) => WORKING_STATUSES.includes(s.key))
    : SHOT_STATUSES;
}

/** An artist's own shot that has left the working statuses is status-locked. */
export function statusLockedFor(
  role: string | null,
  shot: Pick<BoardShot, "status">,
): boolean {
  return role === "artist" && !WORKING_STATUSES.includes(shot.status);
}

/**
 * Convex error messages can be multiline ("[CONVEX M(...)] Server Error\n
 * Uncaught Error: the actual message\n at handler…") — surface something short.
 */
export function firstErrorLine(message: string): string {
  const lines = message
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const uncaught = lines.find((line) => line.includes("Uncaught "));
  if (uncaught) {
    const stripped = uncaught.replace(/^.*Uncaught [A-Za-z]*(?:Error)?:?\s*/, "");
    if (stripped) return stripped;
  }
  return lines[0] ?? "Something didn't work — try again";
}

export function showMutationError(e: unknown): void {
  toast.error(
    e instanceof Error
      ? firstErrorLine(e.message)
      : "Something didn't work — try again",
  );
}

export const STAGE_STATUS_OPTIONS: {
  key: StageInstanceStatus;
  label: string;
  dot: string;
}[] = [
  { key: "not_started", label: "Not started", dot: "bg-muted-foreground/40" },
  { key: "active", label: "Active", dot: "bg-chart-1" },
  { key: "blocked", label: "Blocked", dot: "bg-destructive" },
  { key: "done", label: "Done", dot: "bg-chart-3" },
];

export const STAGE_STATUS_BY_KEY = Object.fromEntries(
  STAGE_STATUS_OPTIONS.map((o) => [o.key, o]),
) as Record<StageInstanceStatus, (typeof STAGE_STATUS_OPTIONS)[number]>;

const GATE_META: Record<
  GateStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  open: {
    label: "Gate open",
    icon: CircleDashed,
    className: "border-border bg-transparent text-muted-foreground",
  },
  requested: {
    label: "Gate requested",
    icon: Clock,
    className: "border-chart-2/30 bg-chart-2/10 text-chart-2",
  },
  approved: {
    label: "Gate approved",
    icon: Check,
    className: "border-chart-3/30 bg-chart-3/10 text-chart-3",
  },
  rejected: {
    label: "Gate rejected",
    icon: X,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

/** Gate status chip — open outline / requested purple / approved green / rejected red. */
export function GateChip({
  status,
  note,
}: {
  status: GateStatus;
  note?: string;
}) {
  const meta = GATE_META[status];
  const Icon = meta.icon;
  return (
    <span
      title={note ? `${meta.label} — ${note}` : meta.label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-px text-[10px] font-medium",
        meta.className,
      )}
    >
      <Icon className="size-3" />
      {meta.label}
    </span>
  );
}

/** "YYYY-MM-DD" (production-tz day string) → short label like "24 Aug". */
export function formatDueDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return format(new Date(y, m - 1, d), "d MMM");
}
