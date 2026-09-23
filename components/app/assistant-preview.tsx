"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, CheckCheck, LockKeyhole } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { WorkspaceGlyph } from "./workspace-glyph";
import type { Assistant } from "@/lib/assistant-roadmap";

/** A real, accessible details panel for a planned feature, not a fake AI run. */
export function AssistantPreview({
  assistant,
  compact = true,
}: {
  assistant: Assistant;
  compact?: boolean;
}) {
  const { productionId } = useParams<{ productionId: string }>();
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="outline" size="sm" className="gap-2" />}
        aria-label={`Preview AI assistance: ${assistant.title}`}
      >
        <WorkspaceGlyph kind="assist" className="size-4" />
        {compact ? "AI assistance" : "Explore assistant"}
        {compact && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
            Planned
          </span>
        )}
        {!compact && <ArrowRight className="size-3.5" />}
      </SheetTrigger>
      <SheetContent className="w-full! overflow-y-auto sm:max-w-md!">
        <SheetHeader className="gap-3 border-b px-6 pb-6 pt-10">
          <div className="flex items-center gap-3">
            <span className="workspace-icon">
              <WorkspaceGlyph kind={assistant.glyph} />
            </span>
            <span className="eyebrow">
              {assistant.phase} · Planned assistant
            </span>
          </div>
          <SheetTitle className="text-2xl">{assistant.title}</SheetTitle>
          <SheetDescription>{assistant.detail}</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-6 pb-6">
          <p className="rounded-lg border border-dashed bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            Design preview only. This assistant is not connected and cannot run.
            No production data is sent to an AI service.
          </p>
          <ol className="space-y-5">
            {[
              ["You choose the context", assistant.inputs],
              ["The assistant proposes", assistant.output],
              ["Your team decides", assistant.approval],
            ].map(([title, text], i) => (
              <li key={title} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted font-mono text-xs">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-sm font-medium">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="space-y-2 border-t pt-4 text-xs text-muted-foreground">
            <p className="flex gap-2">
              <LockKeyhole className="size-4 shrink-0" />
              Planned controls: explicit consent and production-scoped access.
            </p>
            <p className="flex gap-2">
              <CheckCheck className="size-4 shrink-0" />
              Planned controls: provenance, cost visibility, and human approval.
            </p>
          </div>
          <Link
            href={`/p/${productionId}/assistants`}
            onClick={() => setOpen(false)}
            className={buttonVariants({
              variant: "outline",
              className: "w-full",
            })}
          >
            See the AI workspace plan <ArrowRight className="size-4" />
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
