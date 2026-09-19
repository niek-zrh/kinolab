"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
} from "@/components/ui/select";
import { UserAvatar } from "@/components/app/user-avatar";
import { STATUS_DOT_CLASSES } from "@/components/app/status-pill";
import {
  SHOT_STATUSES,
  STAGES,
  type ShotStatusKey,
} from "@/convex/lib/domain";
import { cn } from "@/lib/utils";
import { EditSceneSheet } from "./edit-scene-sheet";
import {
  episodeLabel,
  type EpisodeRow,
  type SceneRow,
  type TeamMember,
} from "./shots-common";

export const FILTER_KEYS = [
  "status",
  "stage",
  "scene",
  "assignee",
  "episode",
] as const;

/**
 * Combinable filters driven by the URL (?status=&stage=&scene=&assignee=&episode=)
 * so filtered views deep-link. router.replace keeps history clean. With a
 * scene selected, content editors get a pencil → "Edit scene" sheet (v2 item e).
 */
export function ShotsFilters({
  scenes,
  team,
  episodes,
  episodic,
  canEditScenes = false,
}: {
  scenes: SceneRow[] | undefined;
  team: TeamMember[] | undefined;
  episodes: EpisodeRow[] | undefined;
  episodic: boolean;
  /** content.edit roles: shows the pencil on the scene chip. */
  canEditScenes?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [editingScene, setEditingScene] = useState<Id<"scenes"> | null>(null);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const status = searchParams.get("status");
  const stage = searchParams.get("stage");
  const scene = searchParams.get("scene");
  const assignee = searchParams.get("assignee");
  const episode = searchParams.get("episode");
  const anyActive = FILTER_KEYS.some((k) => searchParams.get(k) !== null);

  const selectedScene = scenes?.find((s) => s._id === scene);
  const editingSceneRow = scenes?.find((s) => s._id === editingScene) ?? null;
  const selectedMember = team?.find((m) => m.userId === assignee);
  const selectedEpisode = episodes?.find((e) => e._id === episode);
  const selectedStatus = SHOT_STATUSES.find((s) => s.key === status);
  const selectedStage = STAGES.find((s) => s.key === stage);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      <FilterSelect
        placeholder="Status"
        allLabel="All statuses"
        value={selectedStatus?.key ?? null}
        onChange={(v) => setParam("status", v)}
        display={
          selectedStatus && (
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  STATUS_DOT_CLASSES[selectedStatus.key],
                )}
              />
              {selectedStatus.label}
            </span>
          )
        }
      >
        {SHOT_STATUSES.map((s) => (
          <SelectItem key={s.key} value={s.key}>
            <span
              className={cn(
                "size-1.5 rounded-full",
                STATUS_DOT_CLASSES[s.key as ShotStatusKey],
              )}
            />
            {s.label}
          </SelectItem>
        ))}
      </FilterSelect>

      <FilterSelect
        placeholder="Stage"
        allLabel="All stages"
        value={selectedStage?.key ?? null}
        onChange={(v) => setParam("stage", v)}
        display={selectedStage && <span>{selectedStage.label}</span>}
      >
        {STAGES.map((s) => (
          <SelectItem key={s.key} value={s.key}>
            {s.label}
          </SelectItem>
        ))}
      </FilterSelect>

      <FilterSelect
        placeholder="Scene"
        allLabel="All scenes"
        value={selectedScene?._id ?? null}
        onChange={(v) => setParam("scene", v)}
        display={
          selectedScene && (
            <span className="font-mono text-xs">{selectedScene.code}</span>
          )
        }
      >
        {(scenes ?? []).map((s) => (
          <SelectItem key={s._id} value={s._id}>
            <span className="font-mono text-xs">{s.code}</span>
            {s.title && (
              <span className="truncate text-muted-foreground">{s.title}</span>
            )}
          </SelectItem>
        ))}
      </FilterSelect>
      {selectedScene && canEditScenes && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="-ml-1 text-muted-foreground"
          aria-label={`Edit scene ${selectedScene.code}`}
          title="Edit scene"
          onClick={() => setEditingScene(selectedScene._id)}
        >
          <Pencil />
        </Button>
      )}

      <FilterSelect
        placeholder="Assignee"
        allLabel="All assignees"
        value={selectedMember?.userId ?? null}
        onChange={(v) => setParam("assignee", v)}
        display={
          selectedMember && (
            <span className="flex min-w-0 items-center gap-1.5">
              <UserAvatar
                name={selectedMember.name}
                image={selectedMember.image}
                className="size-4 text-[8px]"
              />
              <span className="truncate">{selectedMember.name}</span>
            </span>
          )
        }
      >
        {(team ?? [])
          .filter((m) => m.userId !== undefined)
          .map((m) => (
            <SelectItem key={m._id} value={m.userId as string}>
              <UserAvatar
                name={m.name}
                image={m.image}
                className="size-4 text-[8px]"
              />
              {m.name}
            </SelectItem>
          ))}
      </FilterSelect>

      {episodic && (
        <FilterSelect
          placeholder="Episode"
          allLabel="All episodes"
          value={selectedEpisode?._id ?? null}
          onChange={(v) => setParam("episode", v)}
          display={
            selectedEpisode && (
              <span className="font-mono text-xs">
                {episodeLabel(selectedEpisode)}
              </span>
            )
          }
        >
          {(episodes ?? []).map((e) => (
            <SelectItem key={e._id} value={e._id}>
              <span className="font-mono text-xs">{episodeLabel(e)}</span>
              {e.title && (
                <span className="truncate text-muted-foreground">
                  {e.title}
                </span>
              )}
            </SelectItem>
          ))}
        </FilterSelect>
      )}

      {anyActive && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => router.replace(pathname, { scroll: false })}
        >
          <X /> Clear
        </Button>
      )}

      {canEditScenes && (
        <EditSceneSheet
          scene={editingSceneRow}
          episodes={episodes}
          episodic={episodic}
          open={editingScene !== null}
          onOpenChange={(open) => {
            if (!open) setEditingScene(null);
          }}
          onDeleted={() => setParam("scene", null)}
        />
      )}
    </div>
  );
}

const ALL_SENTINEL = "__all__";

function FilterSelect({
  placeholder,
  allLabel,
  value,
  onChange,
  display,
  children,
}: {
  placeholder: string;
  allLabel: string;
  value: string | null;
  onChange: (value: string | null) => void;
  display?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Select
      value={value ?? ALL_SENTINEL}
      onValueChange={(v) => onChange(v === ALL_SENTINEL ? null : (v as string))}
    >
      <SelectTrigger
        size="sm"
        className={cn(
          "max-w-48",
          value === null
            ? "text-muted-foreground"
            : "border-foreground/25 bg-muted/50",
        )}
      >
        {value !== null && display ? display : placeholder}
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        <SelectItem value={ALL_SENTINEL}>{allLabel}</SelectItem>
        <SelectSeparator />
        {children}
      </SelectContent>
    </Select>
  );
}
