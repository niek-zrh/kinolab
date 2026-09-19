"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid, Plus, Rows3 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { STAGES, type ShotStatusKey, type StageKey } from "@/convex/lib/domain";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/empty-state";
import { useStudio } from "@/components/app/studio-context";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { BoardColumn } from "./_components/board-column";
import {
  BOARD_SHOT_CAP,
  BOARD_VIEW_KEY,
  isContentEditor,
  showMutationError,
  type BoardCardActions,
  type BoardMember,
  type BoardShot,
  type BoardView,
  type ShotOverride,
} from "./_components/board-helpers";

type OverrideKey = keyof ShotOverride;
const OVERRIDE_KEYS: OverrideKey[] = ["stage", "status", "assigneeId", "dueDate"];

/** The server's value for an overridable field, normalised so null == unset. */
function serverValue(shot: BoardShot, key: OverrideKey) {
  if (key === "dueDate") return shot.dueDate ?? null;
  return shot[key];
}

export default function BoardPage() {
  const params = useParams<{ productionId: string }>();
  const productionId = params.productionId as Id<"productions">;
  const { role, studioId } = useStudio();

  const stages = useQuery(api.productions.listStages, { productionId });
  const shots = useQuery(api.shots.list, { productionId });
  const team = useQuery(api.studios.team, studioId ? { studioId } : "skip");
  const setShotStage = useMutation(api.shots.setStage);
  const setShotStatus = useMutation(api.shots.setStatus);
  const updateShot = useMutation(api.shots.update);

  const members = useMemo<BoardMember[]>(
    () =>
      (team ?? []).flatMap((m) =>
        m.userId !== undefined
          ? [{ userId: m.userId, name: m.name, image: m.image }]
          : [],
      ),
    [team],
  );

  // Optimistic overrides while a mutation is in flight (a drop's stage, the
  // card menu's status / assignee / due date); each field clears once the
  // server value catches up, or rolls back on rejection.
  const [overrides, setOverrides] = useState<Record<string, ShotOverride>>({});

  useEffect(() => {
    if (!shots) return;
    setOverrides((prev) => {
      const entries = Object.entries(prev);
      if (entries.length === 0) return prev;
      const byId = new Map(shots.map((s) => [s._id as string, s]));
      const next: Record<string, ShotOverride> = {};
      let changed = false;
      for (const [shotId, override] of entries) {
        const server = byId.get(shotId);
        if (server === undefined) {
          changed = true;
          continue;
        }
        const kept: ShotOverride = {};
        for (const key of OVERRIDE_KEYS) {
          const value = override[key];
          if (value === undefined) continue;
          if (serverValue(server, key) === value) changed = true;
          else (kept as Record<string, unknown>)[key] = value;
        }
        if (Object.keys(kept).length > 0) next[shotId] = kept;
      }
      return changed ? next : prev;
    });
  }, [shots]);

  /** Apply `patch` optimistically, run the mutation, revert + toast if it fails. */
  const optimistic = useCallback(
    (shotId: Id<"shots">, patch: ShotOverride, run: () => Promise<unknown>) => {
      setOverrides((prev) => ({ ...prev, [shotId]: { ...prev[shotId], ...patch } }));
      void run().catch((e: unknown) => {
        setOverrides((prev) => {
          const current = prev[shotId];
          if (!current) return prev;
          const kept: ShotOverride = { ...current };
          for (const key of OVERRIDE_KEYS) {
            // Only undo what this call set — a newer edit to the same field stays.
            if (patch[key] !== undefined && current[key] === patch[key])
              delete kept[key];
          }
          const next = { ...prev };
          if (Object.keys(kept).length > 0) next[shotId] = kept;
          else delete next[shotId];
          return next;
        });
        showMutationError(e);
      });
    },
    [],
  );

  const effectiveShots = useMemo<BoardShot[]>(() => {
    if (!shots) return [];
    const memberById = new Map(members.map((m) => [m.userId as string, m]));
    return shots.map((shot) => {
      const o = overrides[shot._id];
      if (!o) return shot;
      const next: BoardShot = { ...shot };
      if (o.stage !== undefined) next.stage = o.stage;
      if (o.status !== undefined) next.status = o.status;
      if (o.dueDate !== undefined) next.dueDate = o.dueDate ?? undefined;
      if (o.assigneeId !== undefined) {
        next.assigneeId = o.assigneeId;
        const m = memberById.get(o.assigneeId);
        next.assignee = m
          ? { _id: m.userId, name: m.name, image: m.image ?? undefined }
          : shot.assignee;
      }
      return next;
    });
  }, [shots, overrides, members]);

  const grouped = useMemo(() => {
    const map = Object.fromEntries(
      STAGES.map((s) => [s.key, [] as BoardShot[]]),
    ) as Record<StageKey, BoardShot[]>;
    for (const shot of effectiveShots) map[shot.stage].push(shot);
    return map;
  }, [effectiveShots]);

  // shots.setStage needs content.edit — artists/viewers get a read-only board.
  const canDrag = isContentEditor(role);

  const handleMoveShot = (shotId: Id<"shots">, stage: StageKey) => {
    const shot = effectiveShots.find((s) => s._id === shotId);
    if (!shot || shot.stage === stage) return;
    optimistic(shotId, { stage }, () => setShotStage({ shotId, stage }));
  };

  const actions = useMemo<BoardCardActions>(
    () => ({
      onSetStatus: (shotId, status: ShotStatusKey) =>
        optimistic(shotId, { status }, () => setShotStatus({ shotId, status })),
      onAssign: (shotId, assigneeId) =>
        optimistic(shotId, { assigneeId }, () => updateShot({ shotId, assigneeId })),
      onSetDueDate: (shotId, dueDate) =>
        optimistic(shotId, { dueDate }, () => updateShot({ shotId, dueDate })),
    }),
    [optimistic, setShotStatus, updateShot],
  );

  // Card density is a per-device preference (spec f: Compact | Cards).
  const [view, setView] = useState<BoardView>("cards");
  useEffect(() => {
    try {
      const stored = localStorage.getItem(BOARD_VIEW_KEY);
      if (stored === "compact" || stored === "cards") setView(stored);
    } catch {
      // Storage can be unavailable (private mode) — keep the default.
    }
  }, []);
  const changeView = (next: BoardView) => {
    setView(next);
    try {
      localStorage.setItem(BOARD_VIEW_KEY, next);
    } catch {
      // Not remembered this session; the toggle still works.
    }
  };

  const loading = stages === undefined || shots === undefined;

  return (
    <main className="flex-1 px-6 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="font-display text-xl font-semibold tracking-tight">
          Board
          {shots !== undefined && (
            <span className="ml-2 font-sans text-sm font-normal text-muted-foreground">
              {shots.length}
              {/* shots.list caps at MAX_LIST_SHOTS — the same marker the Shots
                  page shows, rather than quietly showing a subset. */}
              {shots.length >= BOARD_SHOT_CAP && (
                <>
                  {" "}
                  (first {BOARD_SHOT_CAP} —{" "}
                  <Link
                    href={`/p/${productionId}/shots`}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    narrow with a filter
                  </Link>
                  )
                </>
              )}
            </span>
          )}
        </h1>
        <div className="flex items-center gap-3">
          {canDrag && (
            <p className="hidden text-xs text-muted-foreground lg:block">
              Drag shots between stages — stages can run in parallel.
            </p>
          )}
          <ViewToggle view={view} onChange={changeView} />
        </div>
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-x-hidden">
          {STAGES.map((s) => (
            <Skeleton
              key={s.key}
              className="h-80 min-w-[260px] max-w-[360px] flex-1 rounded-xl"
            />
          ))}
        </div>
      ) : (
        <>
          {shots.length === 0 && (
            <EmptyState title={copy.empty.shots} className="mb-5 py-10">
              <Link
                href={`/p/${productionId}/shots`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Plus className="size-4" /> {copy.actions.newShot}
              </Link>
            </EmptyState>
          )}
          <div className="flex items-stretch gap-3 overflow-x-auto pb-4">
            {stages.map((stage) => (
              <BoardColumn
                key={stage._id}
                stage={stage}
                shots={grouped[stage.stage]}
                canDrag={canDrag}
                onMoveShot={handleMoveShot}
                members={members}
                showThumbs={view === "cards"}
                actions={actions}
              />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

/** Compact (no thumbnails) | Cards (cover strip) — mirrors the Shots view toggle. */
function ViewToggle({
  view,
  onChange,
}: {
  view: BoardView;
  onChange: (view: BoardView) => void;
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border bg-background p-0.5"
      role="group"
      aria-label="Card size"
    >
      <Button
        type="button"
        variant="ghost"
        size="xs"
        aria-pressed={view === "compact"}
        className={cn("gap-1", view === "compact" && "bg-muted text-foreground")}
        onClick={() => onChange("compact")}
        title="Compact — no thumbnails"
      >
        <Rows3 /> Compact
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        aria-pressed={view === "cards"}
        className={cn("gap-1", view === "cards" && "bg-muted text-foreground")}
        onClick={() => onChange("cards")}
        title="Cards — with cover thumbnails"
      >
        <LayoutGrid /> Cards
      </Button>
    </div>
  );
}
