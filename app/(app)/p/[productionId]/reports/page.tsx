"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  PageHeader,
  PageShell,
} from "@/components/app/page-shell";

import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/empty-state";
import { useStudio } from "@/components/app/studio-context";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { ReportList } from "./_components/report-list";
import { DetailSkeleton, ReportDetail } from "./_components/report-detail";
import { showMutationError } from "./_components/mutation-error";

export default function ReportsPage() {
  const params = useParams<{ productionId: string }>();
  const productionId = params.productionId as Id<"productions">;
  const { role } = useStudio();
  // report.publish capability: owner + producer (server enforces regardless).
  const canManageReports = role === "owner" || role === "producer";

  const reports = useQuery(api.reports.list, { productionId });
  const generateNow = useMutation(api.reports.generateNow);
  const [selectedId, setSelectedId] = useState<Id<"dailyReports"> | null>(null);
  const [generating, setGenerating] = useState(false);

  // Newest report is selected by default; explicit clicks win while valid.
  const activeId =
    selectedId && reports?.some((r) => r._id === selectedId)
      ? selectedId
      : (reports?.[0]?._id ?? null);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const reportId = await generateNow({ productionId });
      setSelectedId(reportId);
      toast.success("Report generated for today");
    } catch (e) {
      showMutationError(e);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="Daily reports"
        description="The day's activity, compiled at 18:00 production time."
        favoriteLabel="Daily reports"
      />

      {reports !== undefined && reports.length === 0 ? (
        <EmptyState icon={<FileText />} title={copy.empty.reports}>
          {canManageReports && (
            <Button size="sm" onClick={handleGenerate} disabled={generating}>
              <RefreshCw
                className={cn("size-4", generating && "animate-spin")}
              />
              {copy.actions.generateNow}
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6 md:flex-row">
          <aside className="w-full shrink-0 md:w-64">
            {canManageReports && (
              <Button
                variant="outline"
                size="sm"
                className="mb-3 w-full"
                onClick={handleGenerate}
                disabled={generating}
              >
                <RefreshCw
                  className={cn("size-3.5", generating && "animate-spin")}
                />
                {copy.actions.generateNow}
              </Button>
            )}
            {reports === undefined ? (
              <div className="space-y-1.5">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : (
              <ReportList
                reports={reports}
                activeId={activeId}
                onSelect={setSelectedId}
              />
            )}
          </aside>
          <section className="min-w-0 flex-1">
            {reports === undefined ? (
              <DetailSkeleton />
            ) : activeId ? (
              <ReportDetail reportId={activeId} canPublish={canManageReports} />
            ) : null}
          </section>
        </div>
      )}
    </PageShell>
  );
}
