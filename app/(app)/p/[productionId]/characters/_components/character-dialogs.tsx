"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useEffect, useState, type FormEvent } from "react";
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
} from "@/components/ui/alert-dialog";
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
import {
  deriveElementCode,
  isValidElementCode,
  MAX_ELEMENT_BASE_PROMPT_LENGTH,
  MAX_ELEMENT_CODE_LENGTH,
  MAX_ELEMENT_NAME_LENGTH,
} from "@/convex/lib/domain";
import { cn } from "@/lib/utils";
import { showMutationError } from "../../shots/[shotId]/_components/error-toast";
import { KIND, MAX_PASTE_NAMES, parseNames } from "./characters-common";

const CODE_HINT = "Codes use A–Z, 0–9 and _";
const CODE_REQUIRED = "Code is required — codes use A–Z, 0–9 and _";

type ElementRef = { _id: Id<"elements">; name: string; code: string };

/** Typed codes are uppercased and spaced-out as they are typed, like shot codes. */
function normaliseTypedCode(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, "_");
}

/* ------------------------------------------------------------------------ */
/* New character                                                             */
/* ------------------------------------------------------------------------ */

/** Name → auto-derived code (editable) → optional base prompt. Hotkey N opens it. */
export function NewCharacterDialog({
  productionId,
  open,
  onOpenChange,
}: {
  productionId: Id<"productions">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useMutation(api.elements.create);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [basePrompt, setBasePrompt] = useState("");
  const [busy, setBusy] = useState(false);

  // The code follows the name until something is typed into the code field;
  // clearing that field hands control back to the derivation.
  const derived = deriveElementCode(name);
  const effectiveCode = code.length > 0 ? code : derived;
  const codeMissing = name.trim().length > 0 && effectiveCode.length === 0;
  const codeInvalid =
    effectiveCode.length > 0 && !isValidElementCode(effectiveCode);

  const reset = () => {
    setName("");
    setCode("");
    setBasePrompt("");
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (busy || trimmed.length === 0 || effectiveCode.length === 0) return;
    setBusy(true);
    try {
      await create({
        productionId,
        kind: KIND,
        name: trimmed,
        code: effectiveCode,
        basePrompt: basePrompt.trim() || undefined,
      });
      toast.success(`Created ${trimmed}`);
      reset();
      onOpenChange(false);
    } catch (err) {
      showMutationError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">New character</DialogTitle>
          <DialogDescription>
            Gets a Concept and an Animation phase to collect options in.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="new-character-name">Name</Label>
            <Input
              id="new-character-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Papa Tupik"
              maxLength={MAX_ELEMENT_NAME_LENGTH}
              autoFocus
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-character-code">Code</Label>
            <Input
              id="new-character-code"
              value={effectiveCode}
              onChange={(e) => setCode(normaliseTypedCode(e.target.value))}
              placeholder="PAPA_TUPIK"
              className="font-mono uppercase"
              maxLength={MAX_ELEMENT_CODE_LENGTH}
              aria-invalid={codeMissing || codeInvalid}
            />
            <p
              className={cn(
                "text-xs",
                codeMissing || codeInvalid
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {codeMissing
                ? CODE_REQUIRED
                : `${CODE_HINT} · the phases become CH_${effectiveCode || "CODE"}_CONCEPT and _ANIMATION`}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-character-prompt">Base prompt (optional)</Label>
            <Textarea
              id="new-character-prompt"
              value={basePrompt}
              onChange={(e) => setBasePrompt(e.target.value)}
              placeholder="Cartoon still. Baby mammoth standing on the ice…"
              maxLength={MAX_ELEMENT_BASE_PROMPT_LENGTH}
              className="min-h-20 text-sm"
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={
                busy ||
                name.trim().length === 0 ||
                effectiveCode.length === 0 ||
                codeInvalid
              }
            >
              Create character
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------ */
/* Paste names                                                               */
/* ------------------------------------------------------------------------ */

/**
 * The paste form — inline in the empty state (the invitation) and inside
 * the "Paste names" dialog. Codes are derived server-side; collisions get
 * _2, _3…; a name that derives to nothing (Cyrillic only) is reported back.
 */
export function PasteNamesForm({
  productionId,
  onDone,
}: {
  productionId: Id<"productions">;
  onDone?: () => void;
}) {
  const bulkCreate = useMutation(api.elements.bulkCreate);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const names = parseNames(text);
  const tooMany = names.length > MAX_PASTE_NAMES;

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (names.length === 0 || tooMany || busy) return;
        setBusy(true);
        try {
          const result = await bulkCreate({
            productionId,
            kind: KIND,
            names,
          });
          const noun = result.created === 1 ? "character" : "characters";
          toast.success(
            result.skipped.length > 0
              ? `Created ${result.created} ${noun} · ${result.skipped.length} need a typed code: ${result.skipped.join(", ")}`
              : `Created ${result.created} ${noun}`,
          );
          setText("");
          onDone?.();
        } catch (err) {
          showMutationError(err);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Pushistik\nMama\nTupik"}
        className="min-h-28 text-sm"
        aria-label="Character names"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className={cn(
            "text-xs",
            tooMany ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {tooMany
            ? `That's ${names.length} names — paste at most ${MAX_PASTE_NAMES} at a time`
            : "One name per line. Codes come from the names (Papa Tupik → PAPA_TUPIK)."}
        </p>
        <Button
          type="submit"
          size="sm"
          className="ml-auto"
          disabled={names.length === 0 || tooMany || busy}
        >
          {names.length > 0
            ? `Create ${names.length} ${names.length === 1 ? "character" : "characters"}`
            : "Create characters"}
        </Button>
      </div>
    </form>
  );
}

export function PasteNamesDialog({
  productionId,
  open,
  onOpenChange,
}: {
  productionId: Id<"productions">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Paste character names</DialogTitle>
          <DialogDescription>
            Copy the Name column of your sheet and paste it here — one
            character per line.
          </DialogDescription>
        </DialogHeader>
        <PasteNamesForm
          productionId={productionId}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------ */
/* Rename / edit prompt / delete                                             */
/* ------------------------------------------------------------------------ */

/** Name + code. A code change renames the phase shots in the same write. */
export function RenameCharacterDialog({
  element,
  open,
  onOpenChange,
}: {
  element: ElementRef;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useMutation(api.elements.update);
  const [name, setName] = useState(element.name);
  const [code, setCode] = useState(element.code);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName(element.name);
      setCode(element.code);
    }
  }, [open, element.name, element.code]);

  const nextName = name.trim();
  const nextCode = code.trim().toUpperCase();
  const codeInvalid = nextCode.length > 0 && !isValidElementCode(nextCode);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy || nextName.length === 0 || nextCode.length === 0 || codeInvalid)
      return;
    setBusy(true);
    try {
      await update({ elementId: element._id, name: nextName, code: nextCode });
      toast.success(
        nextCode !== element.code
          ? `Renamed to ${nextName} · ${nextCode}`
          : `Renamed to ${nextName}`,
      );
      onOpenChange(false);
    } catch (err) {
      showMutationError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Rename character</DialogTitle>
          <DialogDescription>
            A new code renames the phase shots too (CH_{"{CODE}"}_CONCEPT…);
            their old codes stay on their history.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="rename-character-name">Name</Label>
            <Input
              id="rename-character-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_ELEMENT_NAME_LENGTH}
              autoFocus
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rename-character-code">Code</Label>
            <Input
              id="rename-character-code"
              value={code}
              onChange={(e) => setCode(normaliseTypedCode(e.target.value))}
              className="font-mono uppercase"
              maxLength={MAX_ELEMENT_CODE_LENGTH}
              aria-invalid={codeInvalid}
              required
            />
            <p
              className={cn(
                "text-xs",
                codeInvalid ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {CODE_HINT}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={
                busy ||
                nextName.length === 0 ||
                nextCode.length === 0 ||
                codeInvalid
              }
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditPromptDialog({
  element,
  open,
  onOpenChange,
}: {
  element: ElementRef & { basePrompt?: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useMutation(api.elements.update);
  const [prompt, setPrompt] = useState(element.basePrompt ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setPrompt(element.basePrompt ?? "");
  }, [open, element.basePrompt]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await update({ elementId: element._id, basePrompt: prompt });
      toast.success("Prompt saved");
      onOpenChange(false);
    } catch (err) {
      showMutationError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">
            Base prompt · {element.name}
          </DialogTitle>
          <DialogDescription>
            The prompt every option of this character starts from. Each
            option keeps its own generation details.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="edit-character-prompt">Base prompt</Label>
            <Textarea
              id="edit-character-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Cartoon still. Baby mammoth standing on the ice…"
              maxLength={MAX_ELEMENT_BASE_PROMPT_LENGTH}
              className="min-h-40 text-sm"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Refused server-side while any phase holds options — the toast says so. */
export function DeleteCharacterDialog({
  element,
  open,
  onOpenChange,
}: {
  element: ElementRef;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const remove = useMutation(api.elements.remove);
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">
            Delete {element.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Its Concept and Animation phases go with it. A character that
            already has options can&apos;t be deleted — remove them first.
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
                await remove({ elementId: element._id });
                toast.success(`Deleted ${element.name}`);
                onOpenChange(false);
              } catch (err) {
                showMutationError(err);
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
  );
}
