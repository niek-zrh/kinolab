"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  EpisodeSelect,
  SceneSelect,
  episodeLabel,
} from "../../_components/shots-common";
import { showMutationError } from "./error-toast";

type ShotDetail = typeof api.shots.get._returnType;

/**
 * The header meta line (spec v2 item e, "Shot → scene / episode"). For
 * content.edit roles the scene and episode are selects — the scene select
 * carries the inline "Create scene…" — wired to `shots.update`, where
 * choosing a scene also sets the episode from the scene. Everyone else sees
 * the same facts as text. Each select sits in a named group so tests and
 * assistive tech can tell "Scene" from "Episode" without touching the shared
 * select component.
 */
export function ShotPlacement({
  productionId,
  shot,
  canEdit,
}: {
  productionId: Id<"productions">;
  shot: ShotDetail;
  canEdit: boolean;
}) {
  // Only editors need the option lists; everyone else reads the shot itself.
  const scenes = useQuery(api.scenes.list, canEdit ? { productionId } : "skip");
  const production = useQuery(
    api.productions.get,
    canEdit ? { productionId } : "skip",
  );
  const updateShot = useMutation(api.shots.update);

  const countBits = [
    `${shot.versionsCount} option${shot.versionsCount === 1 ? "" : "s"}`,
    shot.pickedVersionIndex !== null ? `picked v${shot.pickedVersionIndex}` : null,
  ].filter((bit): bit is string => bit !== null);

  if (!canEdit) {
    const bits = [
      shot.scene ? shot.scene.code : null,
      shot.episode ? episodeLabel(shot.episode) : null,
      ...countBits,
    ].filter((bit): bit is string => bit !== null);
    return (
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        {bits.join(" · ")}
      </p>
    );
  }

  const episodic = production?.kind === "episodic";

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span role="group" aria-label="Scene">
        <SceneSelect
          productionId={productionId}
          scenes={scenes}
          value={shot.sceneId}
          onChange={(sceneId) =>
            void updateShot({ shotId: shot._id, sceneId: sceneId ?? null }).catch(
              showMutationError,
            )
          }
          triggerClassName="h-7 w-fit rounded-[min(var(--radius-md),10px)] text-[0.8rem]"
          ariaLabel="Scene"
        />
      </span>
      {episodic && (
        <span role="group" aria-label="Episode">
          <EpisodeSelect
            episodes={production?.episodes}
            value={shot.episodeId}
            onChange={(episodeId) =>
              void updateShot({
                shotId: shot._id,
                episodeId: episodeId ?? null,
              }).catch(showMutationError)
            }
            triggerClassName="h-7 w-fit rounded-[min(var(--radius-md),10px)] text-[0.8rem]"
            ariaLabel="Episode"
          />
        </span>
      )}
      <span className="font-mono text-xs text-muted-foreground">
        {countBits.join(" · ")}
      </span>
    </div>
  );
}
