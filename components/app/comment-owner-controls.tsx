"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Pencil, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** Accessible names carry the comment's opening words, like the Resolve button. */
function nameSnippet(body: string): string {
  return body.slice(0, 40);
}

/**
 * Edit / Delete for the viewer's own comment (comments.edit / .remove are
 * author-only server-side). The list owns which comment is being edited and
 * swaps the body for <CommentEditForm> while it is.
 */
export function CommentOwnerActions({
  commentId,
  body,
  onEdit,
  onError,
}: {
  commentId: Id<"comments">;
  body: string;
  onEdit: () => void;
  onError: (e: unknown) => void;
}) {
  const remove = useMutation(api.comments.remove);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={`Edit comment: ${nameSnippet(body)}`}
        onClick={onEdit}
        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
      >
        <Pencil className="size-3" /> Edit
      </button>
      <button
        type="button"
        aria-label={`Delete comment: ${nameSnippet(body)}`}
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-3" /> Delete
      </button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
            <AlertDialogDescription>
              The comment is removed for everyone and its mention
              notifications are withdrawn. History keeps a note that a comment
              was deleted, without the text. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await remove({ commentId });
                  setConfirming(false);
                } catch (e) {
                  onError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Inline editor that replaces a comment's body. Esc cancels; the save key
 * follows the composer beside it — plain Enter in the Review Room rail,
 * ⌘/Ctrl+Enter where Enter is a newline (Discussion, QC). ⌘/Ctrl+Enter
 * always saves.
 */
export function CommentEditForm({
  commentId,
  body: initialBody,
  submitOn = "mod+enter",
  onDone,
  onError,
}: {
  commentId: Id<"comments">;
  body: string;
  submitOn?: "enter" | "mod+enter";
  onDone: () => void;
  onError: (e: unknown) => void;
}) {
  const edit = useMutation(api.comments.edit);
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!body.trim() || saving) return;
    setSaving(true);
    try {
      await edit({ commentId, body });
      onDone();
    } catch (e) {
      onError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-1 space-y-1.5">
      <Textarea
        aria-label={`Edit comment: ${nameSnippet(initialBody)}`}
        autoFocus
        maxLength={8000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // A key the IME is still composing must never commit the edit.
          if (e.nativeEvent.isComposing) return;
          const mod = e.metaKey || e.ctrlKey;
          if (e.key === "Escape") {
            e.preventDefault();
            onDone();
          } else if (
            e.key === "Enter" &&
            (mod || (submitOn === "enter" && !e.shiftKey))
          ) {
            e.preventDefault();
            void save();
          }
        }}
        rows={2}
        className="min-h-9 text-sm"
      />
      <div className="flex items-center gap-1.5">
        <Button
          size="xs"
          disabled={!body.trim() || saving}
          onClick={() => void save()}
        >
          Save
        </Button>
        <Button size="xs" variant="ghost" disabled={saving} onClick={onDone}>
          Cancel
        </Button>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {submitOn === "enter" ? "↵ save" : "⌘↵ save"} · Esc cancel
        </span>
      </div>
    </div>
  );
}
