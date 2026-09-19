"use client";

import { useState } from "react";
import { useConvex, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/components/app/studio-context";
import { csvBlob, toCsv } from "@/lib/csv";
import { todayInTz } from "@/lib/format";
import { firstErrorLine } from "./approval-ui";

/** Roles holding `production.manage` (convex/lib/permissions.ts ROLE_CAPS). */
const PRODUCTION_MANAGE_ROLES = ["owner", "producer"];

type ProvenancePage = typeof api.exports.provenanceRows._returnType;
type ProvenanceRow = ProvenancePage["rows"][number];

/**
 * "Export provenance (CSV)" (spec v2 item c): every version of the production
 * with its prompt, tool, model, seed, file identity, creator and decision —
 * evidence for legal use, so cells are verbatim (every cell quoted, no
 * formula-lead guard), UTF-8 BOM for Excel, CRLF. Pages through
 * `exports.provenanceRows` with a progress toast, triggers the download,
 * then logs `export.generated` through `exports.logProvenanceExport`.
 *
 * Rendered only for production.manage (the server refuses anyone else).
 */
export function ProvenanceExportButton({
  productionId,
  productionCode,
  timezone,
}: {
  productionId: Id<"productions">;
  productionCode: string | undefined;
  timezone: string | undefined;
}) {
  const { role } = useStudio();
  const convex = useConvex();
  const logExport = useMutation(api.exports.logProvenanceExport);
  const [busy, setBusy] = useState(false);

  if (role === null || !PRODUCTION_MANAGE_ROLES.includes(role)) return null;

  const run = async () => {
    if (busy || !productionCode || !timezone) return;
    setBusy(true);
    const toastId = toast.loading("Exporting provenance…");
    try {
      const rows: ProvenanceRow[] = [];
      let columns: ProvenancePage["columns"] | undefined;
      let cursor: string | null = null;
      let done = false;
      while (!done) {
        const page: ProvenancePage = await convex.query(
          api.exports.provenanceRows,
          { productionId, cursor },
        );
        columns ??= page.columns;
        rows.push(...page.rows);
        cursor = page.cursor;
        done = page.done;
        toast.loading(
          `Exporting provenance… ${rows.length.toLocaleString("en-US")} rows`,
          { id: toastId },
        );
      }
      const header = columns ?? [];
      // Header from the server's column order; every cell verbatim.
      const csv = toCsv(
        [header, ...rows.map((row) => header.map((column) => row[column]))],
        { verbatim: true, newline: "\r\n" },
      );
      const filename = `${productionCode}_provenance_${todayInTz(timezone)}.csv`;
      download(csvBlob(csv), filename);
      // Logged once the download has started — the rows come from a query,
      // which cannot write the activity row itself.
      await logExport({ productionId, rowCount: rows.length });
      toast.success(
        `Provenance exported — ${rows.length.toLocaleString("en-US")} ${rows.length === 1 ? "row" : "rows"}`,
        { id: toastId },
      );
    } catch (e) {
      toast.error(
        e instanceof Error
          ? firstErrorLine(e.message)
          : "Something didn't work — try again",
        { id: toastId },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void run()}
      disabled={busy || !productionCode || !timezone}
      title="Every version with prompt, tool, model, seed, file and decision — verbatim cells, for legal use"
    >
      <FileSpreadsheet className="size-3.5" /> Export provenance (CSV)
    </Button>
  );
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke after the click has been handed to the browser's download path.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
