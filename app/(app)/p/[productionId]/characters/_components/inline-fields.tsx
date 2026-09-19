"use client";

import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Blur-to-save fields for the character header, in the shot page's
 * InlineTitle idiom: Enter (single line) or ⌘/Ctrl+Enter (multi-line)
 * commits, Escape restores the saved value without writing.
 */

export function InlineName({
  value,
  onSave,
  canEdit,
  ariaLabel = "Character name",
  className,
}: {
  value: string;
  onSave: (next: string) => void;
  canEdit: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  if (!canEdit) {
    return (
      <h1
        className={cn(
          "font-display text-2xl font-semibold tracking-tight",
          className,
        )}
      >
        {value}
      </h1>
    );
  }

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const next = draft.trim();
    if (next.length === 0 || next === value) {
      setDraft(value);
      return;
    }
    onSave(next);
  };

  return (
    <h1 className={cn("font-display text-2xl font-semibold tracking-tight", className)}>
      <input
        value={draft}
        aria-label={ariaLabel}
        className="w-full max-w-lg border-b border-transparent bg-transparent outline-none hover:border-border focus:border-ring"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelled.current = true;
            setDraft(value);
            e.currentTarget.blur();
          }
        }}
      />
    </h1>
  );
}

export function InlineTextarea({
  value,
  onSave,
  canEdit,
  ariaLabel,
  placeholder,
  maxLength,
  className,
}: {
  value: string;
  onSave: (next: string) => void;
  canEdit: boolean;
  ariaLabel: string;
  placeholder: string;
  maxLength: number;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  if (!canEdit) {
    return value.length > 0 ? (
      <p className={cn("whitespace-pre-wrap text-sm", className)}>{value}</p>
    ) : (
      <p className={cn("text-sm text-muted-foreground", className)}>—</p>
    );
  }

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const next = draft.trim();
    if (next === value) {
      setDraft(value);
      return;
    }
    onSave(next);
  };

  return (
    <Textarea
      value={draft}
      aria-label={ariaLabel}
      placeholder={placeholder}
      maxLength={maxLength}
      className={cn("min-h-20 text-sm", className)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          cancelled.current = true;
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
