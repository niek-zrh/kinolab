"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { episodeLabel } from "./shots-common";
import type { Preview, PreviewRow, RowLevel } from "./import-rows";

const LEVEL_CLASSES: Record<RowLevel, string> = {
  ok: "text-status-approved",
  info: "text-muted-foreground",
  skip: "text-muted-foreground",
  error: "text-destructive",
};

/**
 * The Import tab's preview: # | Code | Title | Scene | Episode | Assignee |
 * Due | Status, one row per pasted line, verdicts computed client-side by
 * buildPreview. Scrolls past ~10 rows; the paste itself is capped at 500.
 */
export function ImportPreviewTable({ preview }: { preview: Preview }) {
  return (
    <div
      className="max-h-64 overflow-auto rounded-lg border bg-card"
      aria-label="Import preview"
      role="region"
    >
      <Table className="text-xs">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-8 text-right">#</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Scene</TableHead>
            <TableHead>Episode</TableHead>
            <TableHead>Assignee</TableHead>
            <TableHead>Due</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {preview.rows.map((row) => (
            <PreviewTableRow key={row.index} row={row} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PreviewTableRow({ row }: { row: PreviewRow }) {
  const muted = row.status.level === "skip" || row.status.level === "error";
  return (
    <TableRow
      data-level={row.status.level}
      className={cn(muted && "text-muted-foreground")}
    >
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {row.index}
      </TableCell>
      <TableCell className="font-mono">
        {row.code.length > 0 ? (
          row.code
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="max-w-48">
        <span className="block truncate">{row.title ?? "—"}</span>
      </TableCell>
      <TableCell className="font-mono">{row.sceneCode ?? "—"}</TableCell>
      <TableCell className="font-mono">
        {row.episodeNumber !== undefined
          ? episodeLabel({ number: row.episodeNumber })
          : "—"}
      </TableCell>
      <TableCell className="max-w-32">
        <span className="block truncate">{row.assigneeText ?? "—"}</span>
      </TableCell>
      <TableCell className="tabular-nums">{row.dueDate ?? "—"}</TableCell>
      <TableCell
        className={cn("whitespace-nowrap", LEVEL_CLASSES[row.status.level])}
        title={row.status.reason}
      >
        {row.status.label}
      </TableCell>
    </TableRow>
  );
}
