"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_SHOT_PATTERN,
  SHOT_PATTERN_TOKENS,
  generateShotCodes,
  isReservedCode,
  patternHasNumberToken,
} from "@/convex/lib/domain";
import { cn } from "@/lib/utils";
import { ImportTab } from "./import-tab";
import { MAX_SHOT_CODE_LENGTH, SHOT_CODE_RE } from "./import-rows";
import {
  EpisodeSelect,
  SceneSelect,
  onMutationError,
  type EpisodeRow,
  type SceneRow,
  type TeamMember,
} from "./shots-common";

export type NewShotsTab = "generate" | "import";

/** Generate tab caps (spec v2 item d). */
export const MAX_GENERATE_COUNT = 200;
const DEFAULT_COUNT = 5;
const DEFAULT_START = 10;
const DEFAULT_STEP = 10;
/** Full preview list up to this many codes; first three + last beyond. */
const FULL_PREVIEW_LIMIT = 50;
const MAX_SCENE_CODE_LENGTH = 32;

type NumberingPrefs = { start: number; step: number; pattern: string };

/** Last Start / Step / Pattern per production (spec: remembered locally). */
function numberingKey(productionId: Id<"productions">): string {
  return `kinolab-shot-numbering:${productionId}`;
}

function readNumbering(productionId: Id<"productions">): NumberingPrefs | null {
  try {
    const raw = localStorage.getItem(numberingKey(productionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NumberingPrefs>;
    const start = Number(parsed.start);
    const step = Number(parsed.step);
    return {
      start: Number.isInteger(start) && start >= 0 ? start : DEFAULT_START,
      step: Number.isInteger(step) && step >= 1 ? step : DEFAULT_STEP,
      pattern:
        typeof parsed.pattern === "string" && parsed.pattern.trim().length > 0
          ? parsed.pattern
          : DEFAULT_SHOT_PATTERN,
    };
  } catch {
    return null;
  }
}

function writeNumbering(productionId: Id<"productions">, prefs: NumberingPrefs) {
  try {
    localStorage.setItem(numberingKey(productionId), JSON.stringify(prefs));
  } catch {
    // Private mode / blocked storage: the defaults simply come back next time.
  }
}

type PanelProps = {
  productionId: Id<"productions">;
  scenes: SceneRow[] | undefined;
  episodes: EpisodeRow[] | undefined;
  episodic: boolean;
  team: TeamMember[] | undefined;
  tab: NewShotsTab;
  onTabChange: (tab: NewShotsTab) => void;
  onDone?: () => void;
};

/** "New shots" dialog: Generate | Import. Hotkey N opens it on Generate. */
export function NewShotsDialog({
  open,
  onOpenChange,
  ...panel
}: PanelProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">New shots</DialogTitle>
          <DialogDescription>
            Name a scene and generate its shots, or import a list from your
            sheet. Existing codes are skipped, never overwritten.
          </DialogDescription>
        </DialogHeader>
        <NewShotsPanel {...panel} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The tabbed body — shared by the dialog and the empty state, which renders
 * it inline (spec: THE empty-state invitation is the Generate tab). Loads the
 * production's shot codes once (unfiltered, capped at 1000 like every list)
 * so both tabs can mark codes that already exist.
 */
export function NewShotsPanel({
  productionId,
  scenes,
  episodes,
  episodic,
  team,
  tab,
  onTabChange,
  onDone,
}: PanelProps) {
  const allShots = useQuery(api.shots.list, { productionId });
  const existingCodes = useMemo(
    () => new Set((allShots ?? []).map((s) => s.code)),
    [allShots],
  );
  return (
    <Tabs value={tab} onValueChange={(v) => onTabChange(v as NewShotsTab)}>
      <TabsList aria-label="How to add shots">
        <TabsTrigger value="generate" className="px-3">
          Generate
        </TabsTrigger>
        <TabsTrigger value="import" className="px-3">
          Import
        </TabsTrigger>
      </TabsList>
      <TabsContent value="generate" className="pt-2">
        <GenerateTab
          productionId={productionId}
          scenes={scenes}
          episodes={episodes}
          episodic={episodic}
          existingCodes={existingCodes}
          onDone={onDone}
        />
      </TabsContent>
      <TabsContent value="import" className="pt-2">
        <ImportTab
          productionId={productionId}
          scenes={scenes}
          episodes={episodes}
          episodic={episodic}
          team={team}
          existingCodes={existingCodes}
          onDone={onDone}
        />
      </TabsContent>
    </Tabs>
  );
}

type SceneMode = "existing" | "new";

/**
 * Generate: scene (existing or new) × count / start / step / pattern → a
 * live preview with exists-marking, optional titles, one shots.importRows
 * call. Enter submits from any field (⌘/Ctrl+Enter from the titles box);
 * Esc closes the dialog around it.
 */
function GenerateTab({
  productionId,
  scenes,
  episodes,
  episodic,
  existingCodes,
  onDone,
}: {
  productionId: Id<"productions">;
  scenes: SceneRow[] | undefined;
  episodes: EpisodeRow[] | undefined;
  episodic: boolean;
  existingCodes: ReadonlySet<string>;
  onDone?: () => void;
}) {
  const router = useRouter();
  const importRows = useMutation(api.shots.importRows);
  const hasScenes = scenes !== undefined && scenes.length > 0;

  // Default to New when the production has no scenes yet, else Existing —
  // decided once the scenes list has loaded.
  const [mode, setMode] = useState<SceneMode | null>(null);
  const effectiveMode: SceneMode =
    mode ?? (scenes === undefined || hasScenes ? "existing" : "new");
  const [sceneId, setSceneId] = useState<Id<"scenes"> | undefined>();
  const [episodeId, setEpisodeId] = useState<Id<"episodes"> | undefined>();
  const [newSceneCode, setNewSceneCode] = useState("");
  const [newSceneTitle, setNewSceneTitle] = useState("");
  const [newEpisodeId, setNewEpisodeId] = useState<Id<"episodes"> | undefined>();

  const [countText, setCountText] = useState(String(DEFAULT_COUNT));
  const [clampNote, setClampNote] = useState<string | null>(null);
  const [startText, setStartText] = useState(String(DEFAULT_START));
  const [stepText, setStepText] = useState(String(DEFAULT_STEP));
  const [pattern, setPattern] = useState(DEFAULT_SHOT_PATTERN);
  const [customising, setCustomising] = useState(false);
  const [titlesText, setTitlesText] = useState("");
  const [busy, setBusy] = useState(false);
  const loadedPrefs = useRef(false);

  // Remembered numbering, read after mount (localStorage is per device).
  useEffect(() => {
    const prefs = readNumbering(productionId);
    if (prefs) {
      setStartText(String(prefs.start));
      setStepText(String(prefs.step));
      setPattern(prefs.pattern);
      if (prefs.pattern !== DEFAULT_SHOT_PATTERN) setCustomising(true);
    }
    loadedPrefs.current = true;
  }, [productionId]);

  const count = Number(countText);
  const start = Number(startText);
  const step = Number(stepText);
  const countValid = Number.isInteger(count) && count >= 1 && count <= MAX_GENERATE_COUNT;
  const startValid = Number.isInteger(start) && start >= 0;
  const stepValid = Number.isInteger(step) && step >= 1;
  const patternValid = patternHasNumberToken(pattern);

  useEffect(() => {
    if (!loadedPrefs.current) return;
    if (startValid && stepValid && pattern.trim().length > 0)
      writeNumbering(productionId, { start, step, pattern });
  }, [productionId, start, step, pattern, startValid, stepValid]);

  const selectedScene = scenes?.find((s) => s._id === sceneId);
  const sceneCode =
    effectiveMode === "existing"
      ? (selectedScene?.code ?? "")
      : newSceneCode.trim().toUpperCase();
  const effectiveEpisodeId =
    effectiveMode === "existing" ? episodeId : newEpisodeId;
  const episodeNumber = episodes?.find((e) => e._id === effectiveEpisodeId)?.number;
  const newSceneExists =
    effectiveMode === "new" &&
    sceneCode.length > 0 &&
    (scenes ?? []).some((s) => s.code === sceneCode);

  const codes = useMemo(() => {
    if (sceneCode.length === 0 || !countValid || !startValid || !stepValid || !patternValid)
      return [];
    return generateShotCodes({
      pattern,
      sceneCode,
      episodeNumber,
      count,
      start,
      step,
    });
  }, [sceneCode, countValid, startValid, stepValid, patternValid, pattern, episodeNumber, count, start, step]);

  const existingCount = codes.filter((c) => existingCodes.has(c)).length;
  const newCount = codes.length - existingCount;

  const titles = useMemo(() => {
    const lines = titlesText.split(/\r?\n/).map((l) => l.trim());
    while (lines.length > 0 && lines[lines.length - 1].length === 0) lines.pop();
    return lines;
  }, [titlesText]);
  const extraTitles = Math.max(0, titles.length - codes.length);

  // Validation (spec list) — errors block submit; notes do not.
  const errors: string[] = [];
  if (!stepValid) errors.push("Step must be ≥ 1");
  if (!startValid) errors.push("Start must be a whole number ≥ 0");
  if (!countValid) errors.push(`Count must be between 1 and ${MAX_GENERATE_COUNT}`);
  if (!patternValid) errors.push("Pattern needs {N}");
  if (effectiveMode === "new" && newSceneCode.trim().length > MAX_SCENE_CODE_LENGTH)
    errors.push(`Scene code is too long — keep it to ${MAX_SCENE_CODE_LENGTH} characters`);
  if (codes.some((c) => isReservedCode(c)))
    errors.push("CH_, LOC_ and SCR_ codes are reserved for pre-production elements");
  if (codes.some((c) => c.length > MAX_SHOT_CODE_LENGTH))
    errors.push(`Shot codes can't be longer than ${MAX_SHOT_CODE_LENGTH} characters`);
  if (codes.some((c) => !SHOT_CODE_RE.test(c)))
    errors.push("Shot codes use A–Z, 0–9, _ and - only");

  const sceneMissing = sceneCode.length === 0;
  const canSubmit = !busy && errors.length === 0 && !sceneMissing && newCount > 0;
  const noun = (n: number) => (n === 1 ? "shot" : "shots");
  // Without a scene the label carries no count: an unscoped /Create \d+ shots/
  // lookup (tests, screen-reader users skimming buttons) must only ever hit
  // the Import tab's live submit.
  const submitLabel = sceneMissing
    ? "Create shots"
    : `Create ${newCount} ${noun(newCount)} in ${sceneCode}`;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const rows = codes.map((code, i) => ({
        code,
        title: titles[i] && titles[i].length > 0 ? titles[i] : undefined,
        sceneCode: effectiveMode === "new" ? sceneCode : undefined,
      }));
      const result = await importRows({
        productionId,
        rows,
        defaults:
          effectiveMode === "existing"
            ? { sceneId, episodeId }
            : { episodeId: newEpisodeId },
        scenesToCreate:
          effectiveMode === "new"
            ? [
                {
                  code: sceneCode,
                  title: newSceneTitle.trim() || undefined,
                  episodeId: newEpisodeId,
                },
              ]
            : undefined,
        createMissingScenes: true,
      });
      const parts = [`Created ${result.created} ${noun(result.created)} in ${sceneCode}`];
      if (result.skipped.length > 0)
        parts.push(`skipped ${result.skipped.length} existing`);
      if (result.invalid.length > 0) parts.push(`${result.invalid.length} invalid`);
      toast.success(parts.join(" · "));
      setTitlesText("");
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
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {/* Scene: existing or new */}
      <div className="space-y-2">
        <div
          role="group"
          aria-label="Scene"
          className="inline-flex items-center gap-0.5 rounded-lg border bg-background p-0.5"
        >
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-pressed={effectiveMode === "existing"}
            className={cn(effectiveMode === "existing" && "bg-muted text-foreground")}
            onClick={() => setMode("existing")}
            disabled={!hasScenes}
            title={hasScenes ? undefined : "No scenes yet"}
          >
            Existing scene
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-pressed={effectiveMode === "new"}
            className={cn(effectiveMode === "new" && "bg-muted text-foreground")}
            onClick={() => setMode("new")}
          >
            New scene
          </Button>
        </div>

        {effectiveMode === "existing" ? (
          <div className={cn("grid gap-3", episodic && "sm:grid-cols-2")}>
            <div className="space-y-1.5">
              <Label>Scene</Label>
              <SceneSelect
                productionId={productionId}
                scenes={scenes}
                value={sceneId}
                ariaLabel="Scene"
                onChange={(next) => {
                  setSceneId(next);
                  const scene = scenes?.find((s) => s._id === next);
                  // Episode defaults from the scene; still overridable.
                  setEpisodeId(scene?.episodeId);
                }}
              />
            </div>
            {episodic && (
              <div className="space-y-1.5">
                <Label>Episode</Label>
                <EpisodeSelect
                  episodes={episodes}
                  value={episodeId}
                  onChange={setEpisodeId}
                  ariaLabel="Episode"
                />
              </div>
            )}
          </div>
        ) : (
          <div className={cn("grid gap-3 sm:grid-cols-2", episodic && "sm:grid-cols-3")}>
            <div className="space-y-1.5">
              <Label htmlFor="gen-scene-code">Scene code</Label>
              <Input
                id="gen-scene-code"
                value={newSceneCode}
                onChange={(e) => setNewSceneCode(e.target.value)}
                placeholder="SC010"
                className="font-mono uppercase"
                autoFocus
                maxLength={MAX_SCENE_CODE_LENGTH}
              />
              {newSceneExists && (
                <p className="text-xs text-muted-foreground">
                  {sceneCode} already exists — shots are added to it.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gen-scene-title">Scene title (optional)</Label>
              <Input
                id="gen-scene-title"
                value={newSceneTitle}
                onChange={(e) => setNewSceneTitle(e.target.value)}
                placeholder="Signal room"
                maxLength={200}
              />
            </div>
            {episodic && (
              <div className="space-y-1.5">
                <Label>Episode</Label>
                <EpisodeSelect
                  episodes={episodes}
                  value={newEpisodeId}
                  onChange={setNewEpisodeId}
                  ariaLabel="Episode"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Numbering */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="gen-count">Count</Label>
          <Input
            id="gen-count"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_GENERATE_COUNT}
            value={countText}
            onChange={(e) => {
              const raw = e.target.value;
              const n = Number(raw);
              if (Number.isFinite(n) && n > MAX_GENERATE_COUNT) {
                setCountText(String(MAX_GENERATE_COUNT));
                setClampNote(`Count is capped at ${MAX_GENERATE_COUNT} — clamped`);
              } else {
                setCountText(raw);
                setClampNote(null);
              }
            }}
            className="tabular-nums"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gen-start">Start</Label>
          <Input
            id="gen-start"
            type="number"
            inputMode="numeric"
            min={0}
            value={startText}
            onChange={(e) => setStartText(e.target.value)}
            className="tabular-nums"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gen-step">Step</Label>
          <Input
            id="gen-step"
            type="number"
            inputMode="numeric"
            min={1}
            value={stepText}
            onChange={(e) => setStepText(e.target.value)}
            className="tabular-nums"
            aria-invalid={!stepValid}
          />
        </div>
      </div>

      {/* Pattern */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="gen-pattern">Pattern</Label>
          {!customising && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setCustomising(true)}
            >
              Customise pattern
            </Button>
          )}
        </div>
        {customising ? (
          <>
            <div className="flex items-center gap-2">
              <Input
                id="gen-pattern"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                className="font-mono"
                aria-invalid={!patternValid}
              />
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setPattern(DEFAULT_SHOT_PATTERN)}
                disabled={pattern === DEFAULT_SHOT_PATTERN}
              >
                Reset
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {SHOT_PATTERN_TOKENS.map((t, i) => (
                <span key={t.token}>
                  {i > 0 && " · "}
                  <code className="font-mono">{t.token}</code> {t.meaning}
                </span>
              ))}
            </p>
          </>
        ) : (
          <p id="gen-pattern" className="font-mono text-xs text-muted-foreground">
            {pattern}
          </p>
        )}
      </div>

      {/* Preview */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Preview</span>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {codes.length === 0
              ? null
              : existingCount > 0
                ? `${existingCount} of ${codes.length} already exist`
                : `${codes.length} ${noun(codes.length)}`}
          </span>
        </div>
        <CodePreview
          codes={codes}
          existingCodes={existingCodes}
          placeholder={
            sceneMissing
              ? effectiveMode === "existing"
                ? "Choose a scene to preview the codes."
                : "Enter a scene code to preview the codes."
              : "Fix the numbering to preview the codes."
          }
        />
      </div>

      {/* Titles */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="gen-titles">Titles (optional)</Label>
          {extraTitles > 0 && (
            <span className="text-xs text-muted-foreground">
              {extraTitles} {extraTitles === 1 ? "title" : "titles"} ignored
            </span>
          )}
        </div>
        <Textarea
          id="gen-titles"
          value={titlesText}
          onChange={(e) => setTitlesText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={"One per line — line 1 titles shot 1\nWide establishing\nHero close-up"}
          className="min-h-20 text-xs"
        />
      </div>

      {/* Messages + submit */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 space-y-0.5 text-xs" aria-live="polite">
          {errors.map((message) => (
            <p key={message} className="text-destructive">
              {message}
            </p>
          ))}
          {clampNote && <p className="text-muted-foreground">{clampNote}</p>}
          {errors.length === 0 && codes.length > 0 && newCount === 0 && (
            <p className="text-muted-foreground">
              All {codes.length} already exist — nothing to create.
            </p>
          )}
        </div>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** First three, "…", last when long; the full scrollable list when ≤ 50. */
function CodePreview({
  codes,
  existingCodes,
  placeholder,
}: {
  codes: string[];
  existingCodes: ReadonlySet<string>;
  placeholder: string;
}) {
  if (codes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
        {placeholder}
      </p>
    );
  }
  const rows: (string | null)[] =
    codes.length <= FULL_PREVIEW_LIMIT
      ? codes
      : [...codes.slice(0, 3), null, codes[codes.length - 1]];
  return (
    <ul
      className="max-h-40 divide-y overflow-auto rounded-lg border bg-card font-mono text-xs"
      aria-label="Shot code preview"
    >
      {rows.map((code, i) =>
        code === null ? (
          <li key="ellipsis" className="px-3 py-1 text-muted-foreground">
            … {codes.length - 4} more
          </li>
        ) : (
          <li
            key={`${code}-${i}`}
            className="flex items-center justify-between gap-2 px-3 py-1"
            data-exists={existingCodes.has(code) ? "true" : undefined}
          >
            <span className={cn(existingCodes.has(code) && "text-muted-foreground line-through")}>
              {code}
            </span>
            {existingCodes.has(code) && (
              <span className="font-sans text-muted-foreground">
                exists — will be skipped
              </span>
            )}
          </li>
        ),
      )}
    </ul>
  );
}
