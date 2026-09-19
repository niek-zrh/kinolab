"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  EpisodeSelect,
  SceneSelect,
  onMutationError,
  type EpisodeRow,
  type SceneRow,
} from "./shots-common";

/**
 * Single-shot dialog: code, title, scene (+ episode when episodic). Kept for
 * inserts such as SH015 — reached from the "New shots" button's dropdown
 * ("Single shot…"); batches go through new-shots-dialog.tsx.
 */
export function NewShotDialog({
  productionId,
  scenes,
  episodes,
  episodic,
  open,
  onOpenChange,
}: {
  productionId: Id<"productions">;
  scenes: SceneRow[] | undefined;
  episodes: EpisodeRow[] | undefined;
  episodic: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createShot = useMutation(api.shots.create);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [sceneId, setSceneId] = useState<Id<"scenes"> | undefined>();
  const [episodeId, setEpisodeId] = useState<Id<"episodes"> | undefined>();
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">New shot</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const normalized = code.trim().toUpperCase();
            if (!normalized || busy) return;
            setBusy(true);
            try {
              await createShot({
                productionId,
                code: normalized,
                title: title.trim() || undefined,
                sceneId,
                episodeId,
              });
              toast.success(`Created ${normalized}`);
              onOpenChange(false);
              setCode("");
              setTitle("");
            } catch (err) {
              onMutationError(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="new-shot-code">Code</Label>
            <Input
              id="new-shot-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="SC010_SH020"
              className="font-mono uppercase"
              autoFocus
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-shot-title">Title (optional)</Label>
            <Input
              id="new-shot-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Hero close-up"
            />
          </div>
          <div className={cn("grid gap-3", episodic && "sm:grid-cols-2")}>
            <div className="space-y-1.5">
              <Label>Scene</Label>
              <SceneSelect
                productionId={productionId}
                scenes={scenes}
                value={sceneId}
                onChange={setSceneId}
              />
            </div>
            {episodic && (
              <div className="space-y-1.5">
                <Label>Episode</Label>
                <EpisodeSelect
                  episodes={episodes}
                  value={episodeId}
                  onChange={setEpisodeId}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={code.trim().length === 0 || busy}>
              Create shot
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
