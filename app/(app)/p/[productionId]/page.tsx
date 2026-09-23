"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { PageShell } from "@/components/app/page-shell";

import { OverviewVitals } from "./_components/overview-vitals";
import { OverviewWorkflow } from "./_components/overview-workflow";
import { OverviewReel } from "./_components/overview-reel";
import { OverviewStageStrip } from "./_components/overview-stage-strip";
import { OverviewShotSummary } from "./_components/overview-shot-summary";
import { OverviewActivity } from "./_components/overview-activity";
import { OverviewDecisions } from "./_components/overview-decisions";
import { OverviewQuickLinks } from "./_components/overview-quick-links";
import { OverviewReportTeaser } from "./_components/overview-report-teaser";

/**
 * Production Overview (spec F3) — the producer's one screen. At 1440px
 * everything fits with at most one scroll: stage strip + shot summary +
 * activity on the left, decisions/links/report on the right.
 */
export default function ProductionOverviewPage() {
  const params = useParams<{ productionId: string }>();
  const productionId = params.productionId as Id<"productions">;

  return (
    <PageShell>
      <OverviewVitals productionId={productionId} />
      <OverviewWorkflow productionId={productionId} />
      {/* The work first, then the numbers, then the paper trail. */}
      <OverviewReel productionId={productionId} />
      <section className="mb-6" aria-label="Production progress">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">
            From first idea to final frame
          </h2>
        </div>
        <OverviewStageStrip productionId={productionId} />
      </section>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
          <OverviewShotSummary productionId={productionId} />
          <OverviewActivity productionId={productionId} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-4">
          <OverviewDecisions productionId={productionId} />
          <OverviewQuickLinks productionId={productionId} />
          <OverviewReportTeaser productionId={productionId} />
        </div>
      </div>
    </PageShell>
  );
}
