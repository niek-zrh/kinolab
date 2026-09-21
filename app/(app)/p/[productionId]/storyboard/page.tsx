"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  Film,
  Pencil,
  Printer,
  Search,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/app/page-shell";
import { ShotFrame } from "@/components/app/shot-frame";
import { StatusPill } from "@/components/app/status-pill";
import { useStudio } from "@/components/app/studio-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/empty-state";
import { EditSceneSheet } from "../shots/_components/edit-scene-sheet";
import {
  isContentEditor,
  type SceneRow,
} from "../shots/_components/shots-common";

const READY = new Set(["picked", "approved", "final", "delivered"]);

export default function StoryboardPage() {
  const { productionId: id } = useParams<{ productionId: string }>();
  const productionId = id as Id<"productions">;
  const production = useQuery(api.productions.get, { productionId });
  const scenes = useQuery(api.scenes.list, { productionId });
  const [sceneId, setSceneId] = useState("");
  const shots = useQuery(api.shots.list, {
    productionId,
    sceneId: sceneId || undefined,
  });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<SceneRow | null>(null);
  const { role } = useStudio();
  const filtered = useMemo(
    () =>
      shots?.filter((s) =>
        `${s.code} ${s.title ?? ""} ${s.scene?.title ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [shots, search],
  );
  const groups = useMemo(() => {
    if (!scenes || !filtered) return [];
    const list = scenes
      .filter((s) => !sceneId || s._id === sceneId)
      .map((scene) => ({
        scene,
        shots: filtered
          .filter((s) => s.sceneId === scene._id)
          .sort((a, b) => a.order - b.order),
      }));
    const unassigned = filtered.filter(
      (s) => !s.sceneId || !scenes.some((scene) => scene._id === s.sceneId),
    );
    return [
      ...list,
      ...(unassigned.length ? [{ scene: null, shots: unassigned }] : []),
    ].filter((g) => g.shots.length || !search);
  }, [scenes, filtered, sceneId, search]);
  const ready = filtered?.filter((s) => READY.has(s.status)).length ?? 0;

  return (
    <PageShell width="sheet" className="storyboard-page">
      <PageHeader
        title="Storyboard"
        favoriteLabel="Storyboard"
        description="Read the film in sequence. Frames, scene direction, and production status in one place."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer /> Print board
            </Button>
            <Button size="sm" render={<Link href={`/p/${id}/shots`} />}>
              <Film /> Manage shots
            </Button>
          </>
        }
      />
      <div className="creative-banner mb-6 flex flex-wrap items-center justify-between gap-5 rounded-xl border px-5 py-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-tape">
            The story, frame by frame
          </p>
          <p className="mt-1 font-display text-xl">
            {production?.name ?? "Production"}
          </p>
        </div>
        <div className="flex gap-6 text-sm">
          <span>
            <strong className="block font-display text-2xl">
              {filtered?.length ?? "—"}
            </strong>
            <span className="text-muted-foreground">shots in view</span>
          </span>
          <span>
            <strong className="block font-display text-2xl">{ready}</strong>
            <span className="text-muted-foreground">selected or beyond</span>
          </span>
          <span>
            <strong className="block font-display text-2xl">
              {groups.filter((g) => g.scene).length}
            </strong>
            <span className="text-muted-foreground">scenes in view</span>
          </span>
        </div>
      </div>
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            aria-label="Search storyboard"
            placeholder="Find a shot or scene…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          aria-label="Storyboard scene"
          className="native-select sm:w-auto"
          value={sceneId}
          onChange={(e) => setSceneId(e.target.value)}
        >
          <option value="">All scenes</option>
          {scenes?.map((s) => (
            <option key={s._id} value={s._id}>
              {s.code}
              {s.title ? ` · ${s.title}` : ""}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground sm:ml-auto">
          Click a frame to open options, notes, and files.
        </span>
      </div>
      {shots === undefined || scenes === undefined ? (
        <Skeleton className="h-80" />
      ) : shots.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title="Your story starts with a scene."
          description="Create or import shots to build a storyboard. Upload options and the latest artwork will appear here."
        >
          <Button render={<Link href={`/p/${id}/shots`} />}>
            Create shots
          </Button>
        </EmptyState>
      ) : groups.length === 0 ? (
        <EmptyState icon={<Search />} title="No shots match your search." />
      ) : (
        <div className="space-y-10">
          {groups.map(({ scene, shots: sceneShots }, sceneIndex) => (
            <section
              key={scene?._id ?? "unassigned"}
              className="storyboard-scene"
            >
              <div className="mb-4 flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border font-mono text-xs text-tape">
                  {String(sceneIndex + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h2 className="font-display text-lg font-semibold">
                      {scene?.title || scene?.code || "Unassigned shots"}
                    </h2>
                    {scene?.title && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {scene.code}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {sceneShots.length} shots
                    </span>
                  </div>
                  <p className="mt-1 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {scene?.description ||
                      (scene
                        ? "Add a scene brief to keep framing, action, and visual intent close to the work."
                        : "Assign these shots to a scene from the shot detail page.")}
                  </p>
                  {scene?.figmaUrl && (
                    <a
                      href={scene.figmaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="no-print mt-2 inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      Original storyboard <ArrowUpRight className="size-3" />
                    </a>
                  )}
                </div>
                {scene && isContentEditor(role) && (
                  <Button
                    className="no-print"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit scene ${scene.code}`}
                    onClick={() => setEditing(scene)}
                  >
                    <Pencil />
                  </Button>
                )}
              </div>
              {sceneShots.length ? (
                <div className="storyboard-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {sceneShots.map((shot, i) => (
                    <Link
                      key={shot._id}
                      href={`/p/${id}/shots/${shot._id}`}
                      className="group overflow-hidden rounded-lg border bg-card transition-colors hover:border-tape/60 focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <div className="relative">
                        <ShotFrame
                          code={shot.code}
                          src={shot.coverThumbUrl}
                          status={shot.status}
                          label={
                            shot.coverThumbUrl ? undefined : "Awaiting artwork"
                          }
                          framed={false}
                        />
                        <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 font-mono text-[10px] text-white">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {READY.has(shot.status) && (
                          <span
                            className="absolute right-2 top-2 rounded-full bg-tape p-1 text-tape-foreground"
                            title="Selected or beyond"
                          >
                            <Check className="size-3" />
                          </span>
                        )}
                      </div>
                      <div className="space-y-2 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {shot.code}
                          </span>
                          <StatusPill status={shot.status} size="xs" />
                        </div>
                        <h3 className="font-medium">
                          {shot.title || "Untitled shot"}
                        </h3>
                        <p className="flex justify-between gap-2 text-xs text-muted-foreground">
                          <span>{shot.assignee?.name ?? "Unassigned"}</span>
                          <span>{shot.versionsCount} options</span>
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                  No shots in this scene yet. Add them from Manage shots.
                </p>
              )}
            </section>
          ))}
        </div>
      )}
      {shots && shots.length >= 1000 && (
        <p className="mt-5 text-sm text-muted-foreground">
          Showing the first 1,000 shots. Select a scene to load its shots
          separately.
        </p>
      )}
      {scenes && scenes.length >= 500 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Showing the first 500 scenes.
        </p>
      )}
      <EditSceneSheet
        scene={editing}
        episodes={production?.episodes}
        episodic={production?.kind === "episodic"}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
    </PageShell>
  );
}
