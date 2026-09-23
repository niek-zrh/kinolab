"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, BookOpen, Compass, Keyboard } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JOURNEY, PROCESS, topicFor } from "@/lib/help";
import { SHORTCUTS } from "./shortcuts";
import { cn } from "@/lib/utils";

/**
 * The help drawer (v1.4) — help inside the product, not a file in the repo.
 *
 * Opens on the screen you are actually looking at: "On this screen" is keyed
 * to the route, so someone stuck on the Review Room gets the Review Room,
 * not a table of contents. "The process" is the end-to-end flow for anyone
 * who does not yet know where their bit fits. The full illustrated
 * walkthrough lives at /help.
 */
export function HelpPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const topic = topicFor(pathname);
  const [tab, setTab] = useState("screen");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display">Help</SheetTitle>
          <SheetDescription>
            {topic ? `You are on ${topic.title}.` : "How Kinolab works."}
          </SheetDescription>
        </SheetHeader>

        <Tabs
          value={tab}
          onValueChange={setTab}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="mx-4 shrink-0">
            <TabsTrigger value="screen">
              <Compass className="size-3.5" /> This screen
            </TabsTrigger>
            <TabsTrigger value="process">
              <BookOpen className="size-3.5" /> The process
            </TabsTrigger>
            <TabsTrigger value="keys">
              <Keyboard className="size-3.5" /> Keys
            </TabsTrigger>
          </TabsList>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <TabsContent value="screen" className="mt-4 space-y-4">
              {topic ? (
                <>
                  <p className="text-sm text-foreground/90">{topic.purpose}</p>
                  <ol className="space-y-2.5">
                    {topic.steps.map((step, i) => (
                      <li key={step} className="flex gap-2.5 text-sm">
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[11px] text-muted-foreground">
                          {i + 1}
                        </span>
                        <span className="text-muted-foreground">{step}</span>
                      </li>
                    ))}
                  </ol>
                  {topic.tip && (
                    <p className="rounded-md border-l-2 border-l-tape bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                      {topic.tip}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No guidance for this screen yet — try the process, or the
                  full guide below.
                </p>
              )}
            </TabsContent>

            <TabsContent value="process" className="mt-4 space-y-6">
              <div>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  The shape of the work
                </h3>
                <ol className="space-y-3">
                  {PROCESS.map((step) => (
                    <li key={step.title}>
                      <p className="text-sm font-medium">{step.title}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {step.body}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>

              {/* The same lifecycle as an ordered checklist: what someone
                  actually does next, and who does it. */}
              <div>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  New project to premiere
                </h3>
                <ol className="space-y-2">
                  {JOURNEY.map((jstep) => (
                    <li key={jstep.n} className="flex gap-2.5 text-sm">
                      <span className="mt-px font-mono text-[11px] text-muted-foreground">
                        {jstep.n}
                      </span>
                      <span className="min-w-0">
                        <span className="font-medium">{jstep.title}</span>
                        <span className="ml-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                          {jstep.who}
                        </span>
                        {jstep.needs && (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {jstep.needs}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
                <Link
                  href="/help#journey"
                  onClick={() => onOpenChange(false)}
                  className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  See it with screenshots
                  <ArrowUpRight className="size-3" />
                </Link>
              </div>
            </TabsContent>

            <TabsContent value="keys" className="mt-4 space-y-5">
              {SHORTCUTS.map((group) => (
                <div key={group.title}>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {group.title}
                  </h3>
                  <ul className="space-y-1.5">
                    {group.keys.map(([key, label]) => (
                      <li key={key} className="flex items-center gap-3 text-sm">
                        <kbd className="min-w-9 shrink-0 rounded border bg-muted px-1.5 py-0.5 text-center font-mono text-[11px]">
                          {key}
                        </kbd>
                        <span className="text-muted-foreground">{label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Letter and digit keys follow the physical key, so a Russian
                (ЙЦУКЕН) layout triggers the same actions as an English one.
              </p>
            </TabsContent>
          </div>
        </Tabs>

        <div className="shrink-0 border-t px-4 py-3">
          <Link
            href="/help"
            onClick={() => onOpenChange(false)}
            className={cn(
              "group flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
            )}
          >
            Open the full guide, with screenshots
            <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5" />
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
