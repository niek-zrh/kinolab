"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  PageHeader,
  PageShell,
} from "@/components/app/page-shell";

import type { Id } from "@/convex/_generated/dataModel";
import { NeedsDecision } from "./_components/needs-decision";
import { LedgerSection } from "./_components/ledger-table";

/**
 * Decisions (spec F9) — the audit trail as a feature. Pending approvals up
 * top (gates decide inline), the full ledger below with scope filters, the
 * ledger CSV export and — for production.manage — the provenance export
 * (v2 item c: every version's prompt, tool, model, seed, file and decision).
 */
export default function DecisionsPage() {
  const params = useParams<{ productionId: string }>();
  const productionId = params.productionId as Id<"productions">;
  const production = useQuery(api.productions.get, { productionId });

  return (
    <PageShell>
      <PageHeader
        title="Decisions"
        description="Who decided what, when — gates, picks, shots and delivery sign-offs."
        favoriteLabel="Decisions"
      />

        <NeedsDecision productionId={productionId} />
        <LedgerSection
          productionId={productionId}
          productionCode={production?.code}
          productionTimezone={production?.timezone}
        />
    </PageShell>
  );
}
