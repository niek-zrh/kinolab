"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { showMutationError } from "@/app/(app)/p/[productionId]/shots/[shotId]/_components/error-toast";

/**
 * Generation details (spec v2 item c): "how this option was made" — tool,
 * model, prompt, seed, free-text params and the note — editable after upload
 * from the Options tab card and the Review Room rail. Saves through
 * `versions.updateMeta`, which enforces the caps and the creator-or-
 * content.edit rule; the client only decides whether to show the button.
 */

export const GENERATION_DETAILS_EXPLAINER =
  "Tool, model, prompt and seed — so anyone can regenerate this option or show how it was made.";

/** Roles holding `content.edit` (convex/lib/permissions.ts ROLE_CAPS). */
const CONTENT_EDIT_ROLES = [
  "owner",
  "producer",
  "creative_director",
  "supervisor",
];

/**
 * Client-side mirror of the updateMeta permission: the version's creator or
 * a content editor. An artist therefore sees Edit only on their own uploads;
 * a viewer never does. The server re-checks on save.
 */
export function canEditGenerationDetails({
  role,
  viewerId,
  createdBy,
}: {
  role: string | null;
  viewerId: Id<"users"> | null | undefined;
  createdBy: Id<"users">;
}): boolean {
  if (viewerId !== null && viewerId !== undefined && viewerId === createdBy)
    return true;
  return role !== null && CONTENT_EDIT_ROLES.includes(role);
}

/** The slice of a version the dialog needs — any enriched card shape fits. */
export type GenerationDetailsVersion = {
  _id: Id<"versions">;
  index: number;
  promptMeta?: {
    tool?: string;
    model?: string;
    prompt?: string;
    seed?: string;
    params?: string;
  };
  note?: string;
};

type Draft = {
  tool: string;
  model: string;
  prompt: string;
  seed: string;
  params: string;
  note: string;
};

function draftFrom(version: GenerationDetailsVersion): Draft {
  return {
    tool: version.promptMeta?.tool ?? "",
    model: version.promptMeta?.model ?? "",
    prompt: version.promptMeta?.prompt ?? "",
    seed: version.promptMeta?.seed ?? "",
    params: version.promptMeta?.params ?? "",
    note: version.note ?? "",
  };
}

/** Trimmed, and absent rather than "" so the stored object stays sparse. */
function clean(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function GenerationDetailsDialog({
  open,
  onOpenChange,
  version,
  contentClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: GenerationDetailsVersion;
  /** The Review Room passes "dark" so the popup matches the room's surround. */
  contentClassName?: string;
}) {
  // The Review Room binds single keys (S/X/P, arrows, 1–4, 0, F, Escape) on
  // `window` and only ignores them while ITS dialogs are open. Keep those
  // keys inside this popup — a focused Save button must never pick the
  // version or leave the room. Tab/Enter/modifier combos pass through so the
  // dialog's own focus handling keeps working.
  const keepRoomKeysInside = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      onOpenChange(false);
      return;
    }
    if (e.key.length === 1 || e.key.startsWith("Arrow")) e.stopPropagation();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("sm:max-w-lg", contentClassName)}
        onKeyDown={keepRoomKeysInside}
      >
        <DialogHeader>
          <DialogTitle className="font-display">
            Generation details{" "}
            <span className="font-mono text-muted-foreground">
              v{version.index}
            </span>
          </DialogTitle>
          <DialogDescription>{GENERATION_DETAILS_EXPLAINER}</DialogDescription>
        </DialogHeader>
        {/* The popup unmounts when closed, so the form's state — seeded from
            the version on mount — starts fresh on every open. */}
        <DetailsForm
          key={version._id}
          version={version}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function DetailsForm({
  version,
  onClose,
}: {
  version: GenerationDetailsVersion;
  onClose: () => void;
}) {
  const updateMeta = useMutation(api.versions.updateMeta);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(version));
  const [busy, setBusy] = useState(false);

  const set = (key: keyof Draft) => (value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const note = draft.note.trim();
      await updateMeta({
        versionId: version._id,
        promptMeta: {
          tool: clean(draft.tool),
          model: clean(draft.model),
          prompt: clean(draft.prompt),
          seed: clean(draft.seed),
          params: clean(draft.params),
        },
        // Only send the note when it changed, so an untouched empty note
        // never writes "" onto a version that had none.
        note: note === (version.note ?? "") ? undefined : note,
      });
      toast.success("Details saved");
      onClose();
    } catch (e) {
      showMutationError(e);
    } finally {
      setBusy(false);
    }
  };

  // ⌘/Ctrl+Enter saves from any field — plain Enter stays a newline in the
  // textareas (prompts are multi-line).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void save();
    }
  };

  return (
    <>
      <div className="grid gap-3" onKeyDown={onKeyDown}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="gd-tool" className="text-xs">
              Tool
            </Label>
            <Input
              id="gd-tool"
              value={draft.tool}
              placeholder="Midjourney"
              className="h-8 text-sm"
              onChange={(e) => set("tool")(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="gd-model" className="text-xs">
              Model
            </Label>
            <Input
              id="gd-model"
              value={draft.model}
              placeholder="v6.1"
              className="h-8 text-sm"
              onChange={(e) => set("model")(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="gd-prompt" className="text-xs">
            Prompt
          </Label>
          <Textarea
            id="gd-prompt"
            value={draft.prompt}
            placeholder="wide shot, dusk, rain-soaked street…"
            className="max-h-64 min-h-24 font-mono text-xs leading-relaxed"
            onChange={(e) => set("prompt")(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="gd-seed" className="text-xs">
              Seed
            </Label>
            <Input
              id="gd-seed"
              value={draft.seed}
              placeholder="82931"
              className="h-8 font-mono text-sm"
              onChange={(e) => set("seed")(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="gd-note" className="text-xs">
              Note
            </Label>
            <Input
              id="gd-note"
              value={draft.note}
              placeholder="Shown on the option card"
              className="h-8 text-sm"
              onChange={(e) => set("note")(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="gd-params" className="text-xs">
            Params
          </Label>
          <Textarea
            id="gd-params"
            value={draft.params}
            placeholder="--ar 16:9 --stylize 250, or any settings worth keeping"
            className="max-h-40 min-h-16 font-mono text-xs leading-relaxed"
            onChange={(e) => set("params")(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button disabled={busy} onClick={() => void save()}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
