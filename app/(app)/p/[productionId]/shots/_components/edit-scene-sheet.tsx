"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  EpisodeSelect,
  onMutationError,
  type EpisodeRow,
  type SceneRow,
} from "./shots-common";

const MAX_SCENE_CODE_LENGTH = 32;
const MAX_SCENE_TITLE_LENGTH = 200;
const MAX_SCENE_DESCRIPTION_LENGTH = 2000;

/**
 * "Edit scene" (spec v2 item e): code / title / episode / description /
 * storyboard (Figma) URL, and "Delete scene" when it has no shots. Opened
 * from the Shots page's scene filter chip; content.edit roles only (the
 * caller gates the pencil, scenes.update enforces it server-side). A code
 * change never renames the scene's shot codes — the sheet says so.
 */
export function EditSceneSheet({
  scene,
  episodes,
  episodic,
  open,
  onOpenChange,
  onDeleted,
}: {
  scene: SceneRow | null;
  episodes: EpisodeRow[] | undefined;
  episodic: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const updateScene = useMutation(api.scenes.update);
  const removeScene = useMutation(api.scenes.remove);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [episodeId, setEpisodeId] = useState<Id<"episodes"> | undefined>();
  const [description, setDescription] = useState("");
  const [figmaUrl, setFigmaUrl] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset the form to the scene each time the sheet opens on it.
  useEffect(() => {
    if (!open || scene === null) return;
    setCode(scene.code);
    setTitle(scene.title ?? "");
    setEpisodeId(scene.episodeId);
    setDescription(scene.description ?? "");
    setFigmaUrl(scene.figmaUrl ?? "");
  }, [open, scene]);

  const normalizedCode = code.trim().toUpperCase();
  const codeChanged = scene !== null && normalizedCode !== scene.code;
  const errors: string[] = [];
  if (normalizedCode.length === 0) errors.push("Scene code is required");
  if (normalizedCode.length > MAX_SCENE_CODE_LENGTH)
    errors.push(`Scene code is too long — keep it to ${MAX_SCENE_CODE_LENGTH} characters`);
  if (title.length > MAX_SCENE_TITLE_LENGTH)
    errors.push(`Scene title is too long — keep it to ${MAX_SCENE_TITLE_LENGTH} characters`);
  if (description.length > MAX_SCENE_DESCRIPTION_LENGTH)
    errors.push(`Description is too long — keep it to ${MAX_SCENE_DESCRIPTION_LENGTH} characters`);
  const trimmedUrl = figmaUrl.trim();
  if (trimmedUrl.length > 0 && !/^https?:\/\/\S+$/i.test(trimmedUrl))
    errors.push("Storyboard URL must start with http:// or https://");

  const dirty =
    scene !== null &&
    (codeChanged ||
      title.trim() !== (scene.title ?? "") ||
      (episodeId ?? undefined) !== (scene.episodeId ?? undefined) ||
      description.trim() !== (scene.description ?? "") ||
      trimmedUrl !== (scene.figmaUrl ?? ""));
  const canSave = scene !== null && dirty && errors.length === 0 && !busy;

  const save = async () => {
    if (!canSave || scene === null) return;
    setBusy(true);
    try {
      await updateScene({
        sceneId: scene._id,
        code: codeChanged ? normalizedCode : undefined,
        title: title.trim() !== (scene.title ?? "") ? title.trim() : undefined,
        episodeId:
          episodeId !== undefined && episodeId !== scene.episodeId
            ? episodeId
            : undefined,
        description:
          description.trim() !== (scene.description ?? "")
            ? description.trim()
            : undefined,
        figmaUrl: trimmedUrl !== (scene.figmaUrl ?? "") ? trimmedUrl : undefined,
      });
      toast.success(
        codeChanged
          ? `Scene ${scene.code} is now ${normalizedCode}`
          : `Updated scene ${scene.code}`,
      );
      onOpenChange(false);
    } catch (err) {
      onMutationError(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (scene === null || busy) return;
    setBusy(true);
    try {
      await removeScene({ sceneId: scene._id });
      toast.success(`Removed scene ${scene.code}`);
      onOpenChange(false);
      onDeleted?.();
    } catch (err) {
      onMutationError(err);
    } finally {
      setBusy(false);
    }
  };

  const shotCount = scene?.shotCount ?? 0;
  const shotCountLabel = scene?.shotCountCapped ? `${shotCount}+` : String(shotCount);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display">
            Edit scene{scene ? ` ${scene.code}` : ""}
          </SheetTitle>
          <SheetDescription>
            {shotCount === 0
              ? "No shots yet — the scene can be deleted."
              : `${shotCountLabel} ${shotCount === 1 && !scene?.shotCountCapped ? "shot" : "shots"} in this scene.`}
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="edit-scene-code">Code</Label>
            <Input
              id="edit-scene-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="font-mono uppercase"
              maxLength={MAX_SCENE_CODE_LENGTH}
              required
            />
            <p className="text-xs text-muted-foreground">
              {codeChanged && scene
                ? `Shot codes are not renamed: ${scene.code}_* stay as they are.`
                : "Changing the code does not rename the scene's shot codes."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-scene-title">Title</Label>
            <Input
              id="edit-scene-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Signal room"
              maxLength={MAX_SCENE_TITLE_LENGTH}
            />
          </div>
          {episodic && (
            <div className="space-y-1.5">
              <Label>Episode</Label>
              <EpisodeSelect
                episodes={episodes}
                value={episodeId}
                onChange={(next) => setEpisodeId(next ?? scene?.episodeId)}
                ariaLabel="Scene episode"
              />
              <p className="text-xs text-muted-foreground">
                Existing shots keep their episode.
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="edit-scene-description">Description</Label>
            <Textarea
              id="edit-scene-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happens in this scene"
              className="min-h-20"
              maxLength={MAX_SCENE_DESCRIPTION_LENGTH}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-scene-figma">Storyboard (Figma) URL</Label>
            <Input
              id="edit-scene-figma"
              type="url"
              value={figmaUrl}
              onChange={(e) => setFigmaUrl(e.target.value)}
              placeholder="https://www.figma.com/file/…"
              inputMode="url"
            />
          </div>
          {errors.length > 0 && (
            <div className="space-y-0.5 text-xs text-destructive" aria-live="polite">
              {errors.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
          {/* Hidden submit so Enter in any field saves. */}
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
        </form>
        <SheetFooter className="flex-row items-center">
          {scene !== null && shotCount === 0 && (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    disabled={busy}
                  />
                }
              >
                Delete scene
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-display">
                    Delete scene {scene.code}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    It has no shots. The scene is removed from every filter
                    and picker; the activity feed keeps the record.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={busy}
                    onClick={() => void remove()}
                  >
                    Delete scene
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={!canSave} onClick={() => void save()}>
              Save scene
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
