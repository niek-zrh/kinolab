"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ImportPreviewTable } from "./import-preview-table";
import {
  buildPreview,
  MAX_IMPORT_ROWS,
  rowsToSubmit,
} from "./import-rows";
import {
  EpisodeSelect,
  SceneSelect,
  onMutationError,
  type EpisodeRow,
  type SceneRow,
  type TeamMember,
} from "./shots-common";

const ACCEPTED_FILES = ".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain";

/**
 * New shots › Import (spec v2 item d): paste from a sheet (or pick a
 * .csv/.tsv), see every row's verdict, create the valid ones through
 * shots.importRows. Columns come from a header row when there is one, else
 * code / title / scene by position. Without a Scene column the fallback
 * scene / episode selects apply to every row.
 */
export function ImportTab({
  productionId,
  scenes,
  episodes,
  episodic,
  team,
  existingCodes,
  onDone,
}: {
  productionId: Id<"productions">;
  scenes: SceneRow[] | undefined;
  episodes: EpisodeRow[] | undefined;
  episodic: boolean;
  team: TeamMember[] | undefined;
  existingCodes: ReadonlySet<string>;
  onDone?: () => void;
}) {
  const router = useRouter();
  const importRows = useMutation(api.shots.importRows);
  const [text, setText] = useState("");
  const [createMissingScenes, setCreateMissingScenes] = useState(true);
  const [sceneId, setSceneId] = useState<Id<"scenes"> | undefined>();
  const [episodeId, setEpisodeId] = useState<Id<"episodes"> | undefined>();
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const checkboxId = useId();

  const episodeNumberById = useMemo(
    () => new Map((episodes ?? []).map((e) => [e._id, e.number] as const)),
    [episodes],
  );
  const preview = useMemo(
    () =>
      buildPreview({
        text,
        existingCodes,
        scenes: (scenes ?? []).map((s) => ({
          code: s.code,
          episodeNumber:
            s.episodeId !== undefined
              ? episodeNumberById.get(s.episodeId)
              : undefined,
        })),
        episodes: episodes ?? [],
        team: team ?? [],
        createMissingScenes,
      }),
    [text, existingCodes, scenes, episodes, team, createMissingScenes, episodeNumberById],
  );

  const { counts } = preview;
  const canSubmit =
    !busy && !preview.tooMany && counts.create > 0;

  const readFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(typeof reader.result === "string" ? reader.result : "");
      setFileName(file.name);
    };
    reader.onerror = () => toast.error(`Couldn't read ${file.name}`);
    reader.readAsText(file);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const result = await importRows({
        productionId,
        rows: rowsToSubmit(preview),
        defaults: { sceneId, episodeId },
        createMissingScenes,
      });
      const noun = result.created === 1 ? "shot" : "shots";
      const parts = [`Created ${result.created} ${noun}`];
      if (result.scenesCreated.length > 0)
        parts.push(
          result.scenesCreated.length === 1
            ? `scene ${result.scenesCreated[0]}`
            : `${result.scenesCreated.length} scenes`,
        );
      if (result.skipped.length > 0)
        parts.push(`skipped ${result.skipped.length} existing`);
      if (result.invalid.length > 0)
        parts.push(`${result.invalid.length} invalid`);
      toast.success(parts.join(" · "));
      setText("");
      setFileName(null);
      onDone?.();
      if (result.sceneId !== undefined)
        router.push(`/p/${productionId}/shots?scene=${result.sceneId}`);
    } catch (err) {
      onMutationError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="import-shots-text">Paste from your sheet</Label>
          <div className="flex items-center gap-1.5">
            {fileName && (
              <span className="max-w-40 truncate text-xs text-muted-foreground">
                {fileName}
              </span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp /> Choose file…
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FILES}
              aria-label="Import file"
              className="sr-only"
              onChange={(e) => {
                readFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        <Textarea
          id="import-shots-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setFileName(null);
          }}
          onDrop={(e) => {
            const file = e.dataTransfer.files?.[0];
            if (file) {
              e.preventDefault();
              readFile(file);
            }
          }}
          placeholder={
            "Code\tTitle\tScene\nSC010_SH010\tWide establishing\tSC010\nSC010_SH020\tHero close-up\tSC010"
          }
          className="min-h-28 font-mono text-xs"
          aria-label="Shot codes"
        />
        <p className="text-xs text-muted-foreground">
          One code per line, or rows separated by tabs, commas or semicolons
          (Google Sheets pastes tabs). A header row with Code, Title, Scene,
          Episode, Assignee or Due date is detected; otherwise columns are
          code, title, scene. Up to {MAX_IMPORT_ROWS} rows at a time.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id={checkboxId}
            checked={createMissingScenes}
            onCheckedChange={(checked) => setCreateMissingScenes(checked)}
          />
          <Label htmlFor={checkboxId} className="font-normal">
            Create missing scenes
          </Label>
        </div>
        {!preview.hasSceneColumn && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {preview.rows.length > 0 ? "No Scene column — all rows go to" : "Scene for every row"}
            </span>
            <div className="w-44">
              <SceneSelect
                productionId={productionId}
                scenes={scenes}
                value={sceneId}
                onChange={(next) => {
                  setSceneId(next);
                  const scene = scenes?.find((s) => s._id === next);
                  if (scene?.episodeId !== undefined) setEpisodeId(scene.episodeId);
                }}
                triggerClassName="h-7 text-xs"
                ariaLabel="Scene for all rows"
              />
            </div>
            {episodic && (
              <div className="w-32">
                <EpisodeSelect
                  episodes={episodes}
                  value={episodeId}
                  onChange={setEpisodeId}
                  triggerClassName="h-7 text-xs"
                  ariaLabel="Episode for all rows"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {preview.rows.length > 0 && <ImportPreviewTable preview={preview} />}

      <div className="flex flex-wrap items-center gap-2">
        <p
          className={cn(
            "text-xs",
            preview.tooMany ? "text-destructive" : "text-muted-foreground",
          )}
          aria-live="polite"
        >
          {preview.tooMany
            ? `That's ${preview.total} rows — paste up to ${MAX_IMPORT_ROWS} rows at a time`
            : preview.rows.length > 0
              ? [
                  `Create ${counts.create} ${counts.create === 1 ? "shot" : "shots"}`,
                  counts.scenes > 0 &&
                    `${counts.scenes} new ${counts.scenes === 1 ? "scene" : "scenes"}`,
                  counts.skipped > 0 && `${counts.skipped} skipped`,
                  counts.invalid > 0 && `${counts.invalid} invalid`,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Existing codes are skipped, never overwritten."}
        </p>
        <Button
          type="submit"
          size="sm"
          className="ml-auto"
          disabled={!canSubmit}
        >
          {`Create ${counts.create} ${counts.create === 1 ? "shot" : "shots"}`}
        </Button>
      </div>
    </form>
  );
}
