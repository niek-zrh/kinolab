"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, MoreHorizontal, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The mono shot-code heading (spec v2 item e). For content.edit roles the
 * code is a button: click it (or kebab › "Rename code…") to edit inline;
 * Enter or blur hands the new code to the parent, which confirms it in
 * RenameCodeDialog. Artists and viewers get the plain heading. The heading's
 * accessible name is always the code itself so `getByRole("heading",
 * { name: code })` keeps working in every role.
 */
export function CodeHeading({
  code,
  formerCode,
  canRename,
  onSubmit,
}: {
  code: string;
  /** Last entry of shot.formerCodes → "formerly …" hint. */
  formerCode?: string;
  canRename: boolean;
  onSubmit: (code: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(code);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!editing) setValue(code);
  }, [code, editing]);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setEditing(false);
      return;
    }
    const next = value.trim().toUpperCase();
    setEditing(false);
    if (next.length === 0 || next === code) return;
    onSubmit(next);
  };

  const former = formerCode ? (
    <span className="font-mono text-xs text-muted-foreground">
      formerly {formerCode}
    </span>
  ) : null;

  if (!canRename) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">
          {code}
        </h1>
        {former}
      </div>
    );
  }

  if (editing) {
    return (
      <h1 className="font-mono text-2xl font-semibold tracking-tight">
        <input
          autoFocus
          value={value}
          aria-label="Shot code"
          spellCheck={false}
          className="w-full max-w-md border-b border-ring bg-transparent font-mono text-2xl font-semibold tracking-tight uppercase outline-none"
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              cancelled.current = true;
              setValue(code);
              e.currentTarget.blur();
            }
          }}
        />
      </h1>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <h1 className="font-mono text-2xl font-semibold tracking-tight">
        <button
          type="button"
          title="Rename code"
          onClick={() => setEditing(true)}
          className="rounded-sm border-b border-transparent text-left hover:border-border focus-visible:border-ring focus-visible:outline-none"
        >
          {code}
        </button>
      </h1>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              aria-label="Shot code actions"
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => setEditing(true)}>
            <PencilLine /> Rename code…
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              void navigator.clipboard
                ?.writeText(code)
                .then(() => toast.success(`Copied ${code}`))
                .catch(() => toast.error("Couldn't copy — select it instead"));
            }}
          >
            <Copy /> Copy code
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {former}
    </div>
  );
}
