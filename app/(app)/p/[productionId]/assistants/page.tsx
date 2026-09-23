"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, CheckCheck, LockKeyhole } from "lucide-react";
import { PageHeader, PageShell } from "@/components/app/page-shell";
import { WorkspaceGlyph } from "@/components/app/workspace-glyph";
import { AssistantPreview } from "@/components/app/assistant-preview";
import { ASSISTANTS } from "@/lib/assistant-roadmap";
import { cn } from "@/lib/utils";

export default function AssistantsPage() {
  const { productionId } = useParams<{ productionId: string }>();
  const [phase, setPhase] = useState("All");
  return (
    <PageShell>
      <PageHeader
        title="AI workspace"
        favoriteLabel="AI workspace"
        description="A place for future collaborators. Your team stays in creative control."
      />
      <section
        className="editorial-banner mb-6 min-h-60"
        aria-label="AI workspace roadmap"
      >
        <img
          src="/brand/assistant-frames-v1.jpg"
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-black/70 sm:bg-transparent sm:bg-gradient-to-r sm:from-black/80 sm:via-black/50 sm:to-transparent" />
        <div className="relative max-w-lg p-6 sm:p-8">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/30 px-3 py-1 text-xs text-white/90">
            <span className="size-1.5 rounded-full bg-amber-300" />
            Design preview · Not connected
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-white">
            More room for the
            <br />
            human part of filmmaking.
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/80">
            Planned AI support for the repetitive work, the first draft, and the
            second pair of eyes. Never the final creative decision.
          </p>
        </div>
      </section>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Built around your process</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Explore where assistance could fit. Nothing runs or sends data.
          </p>
        </div>
        <div
          role="group"
          aria-label="Assistant workflow"
          className="segmented-control"
        >
          {["All", "Plan", "Create", "Finish"].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={phase === value}
              onClick={() => setPhase(value)}
              className={cn(
                "segmented-option",
                phase === value && "segmented-option-active",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ASSISTANTS.filter((a) => phase === "All" || a.phase === phase).map(
          (assistant) => (
            <article
              key={assistant.id}
              aria-label={assistant.title}
              className="studio-panel flex flex-col p-5"
            >
              <div className="mb-5 flex items-start justify-between">
                <span className="workspace-icon">
                  <WorkspaceGlyph kind={assistant.glyph} />
                </span>
                <span className="rounded-full border px-2 py-1 text-[10px] text-muted-foreground">
                  {assistant.phase} · Planned
                </span>
              </div>
              <h3 className="text-lg font-semibold tracking-tight">
                {assistant.title}
              </h3>
              <p className="mb-5 mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                {assistant.summary}
              </p>
              <AssistantPreview assistant={assistant} compact={false} />
              <Link
                className="mt-4 inline-flex items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-foreground hover:underline"
                href={`/p/${productionId}/${assistant.path}`}
              >
                {assistant.destination}
                <ArrowUpRight className="size-3.5" />
              </Link>
            </article>
          ),
        )}
      </div>
      <div className="mt-6 grid gap-4 rounded-xl border border-dashed p-5 sm:grid-cols-2">
        <div className="flex gap-3">
          <LockKeyhole className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-medium">
              Permission before processing
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Future activation will require an approved provider, clear data
              handling, rights to the selected material, and visible usage
              costs.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <CheckCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-medium">
              A draft is never an approval
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Planned outputs must preserve source links and generation details.
              Artists and production leads review every change.
            </p>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
