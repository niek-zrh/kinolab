"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Copy-to-clipboard for prompts (the sheet's Prompt column is copied into
 * Midjourney all day). Disabled while there is nothing to copy.
 */
export function CopyButton({
  text,
  label,
  size = "icon-xs",
  className,
}: {
  text: string;
  label: string;
  size?: "icon-xs" | "xs" | "sm";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const empty = text.trim().length === 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy — select the text and copy it by hand");
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      aria-label={label}
      title={label}
      disabled={empty}
      className={cn("shrink-0 text-muted-foreground", className)}
      onClick={() => void copy()}
    >
      {copied ? <Check /> : <Copy />}
      {size !== "icon-xs" && (copied ? "Copied" : "Copy")}
    </Button>
  );
}
