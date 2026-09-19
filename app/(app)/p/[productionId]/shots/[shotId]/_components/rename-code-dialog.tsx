"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { showMutationError } from "./error-toast";

/**
 * Confirm step of the shot-code rename (spec v2 item e). The heading's inline
 * editor collects the new code; this dialog states what changes and what does
 * not, then calls `shots.rename`. Server refusals (duplicate code, delivered
 * shot, character slot) become a toast and the heading keeps the old code —
 * the live query never showed anything else.
 */
export function RenameCodeDialog({
  shotId,
  from,
  to,
  onClose,
}: {
  shotId: Id<"shots">;
  from: string;
  /** Pending new code; the dialog is open while this is a string. */
  to: string | null;
  onClose: () => void;
}) {
  const rename = useMutation(api.shots.rename);
  const [busy, setBusy] = useState(false);
  const open = to !== null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">
            Rename shot code
          </AlertDialogTitle>
          <AlertDialogDescription>
            Renaming <span className="font-mono">{from}</span> →{" "}
            <span className="font-mono">{to ?? ""}</span>. Comments and history
            keep the old text; the rename is recorded.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || to === null}
            onClick={async () => {
              if (to === null) return;
              setBusy(true);
              try {
                const code = await rename({ shotId, code: to });
                toast.success(`Renamed ${from} → ${code}`);
              } catch (err) {
                showMutationError(err);
              } finally {
                setBusy(false);
                onClose();
              }
            }}
          >
            Rename
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
