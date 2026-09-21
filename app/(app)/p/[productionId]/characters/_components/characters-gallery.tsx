"use client";

import Link from "next/link";
import type { Id } from "@/convex/_generated/dataModel";
import { ArrowUpRight } from "lucide-react";
import { ShotFrame } from "@/components/app/shot-frame";
import { StatusPill } from "@/components/app/status-pill";
import { CharacterRowMenu } from "./characters-table";
import {
  characterHref,
  slotLabel,
  type CharacterRow,
} from "./characters-common";

export function CharactersGallery({
  rows,
  productionId,
  canEdit,
}: {
  rows: CharacterRow[];
  productionId: Id<"productions">;
  canEdit: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => {
        const hero =
          [...row.slots].reverse().find((s) => s.pickedThumbUrl) ??
          row.slots.find((s) => s.coverThumbUrl) ??
          row.slots[0];
        return (
          <article
            key={row._id}
            className="overflow-hidden rounded-xl border bg-card"
            aria-label={row.name}
          >
            <Link
              href={characterHref(productionId, row._id)}
              aria-label={`Open ${row.name}`}
              className="group block"
            >
              <ShotFrame
                code={row.code}
                src={hero?.pickedThumbUrl ?? hero?.coverThumbUrl}
                status={hero?.status}
                alt={row.name}
                label="Awaiting concept artwork"
                framed={false}
                className="aspect-[4/3] [&_img]:object-contain"
              />
            </Link>
            <div className="p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <Link
                    href={characterHref(productionId, row._id)}
                    className="font-display text-xl font-semibold hover:underline"
                  >
                    {row.name}
                  </Link>
                  <p className="mt-1 font-mono text-[10px] tracking-wider text-muted-foreground">
                    {row.code}
                  </p>
                </div>
                <CharacterRowMenu
                  row={row}
                  productionId={productionId}
                  canEdit={canEdit}
                />
              </div>
              {row.description && (
                <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                  {row.description}
                </p>
              )}
              <div className="space-y-2">
                {row.slots.map((slot) => (
                  <Link
                    key={slot.slot}
                    href={characterHref(productionId, row._id, slot.slot)}
                    aria-label={`${row.name} — ${slotLabel(slot.slot)}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs transition-colors hover:bg-muted"
                  >
                    <span className="font-medium">{slotLabel(slot.slot)}</span>
                    <span className="text-muted-foreground">
                      {slot.versionsCount} options
                    </span>
                    <span className="ml-auto">
                      <StatusPill status={slot.status} size="xs" />
                    </span>
                    <ArrowUpRight className="size-3 text-muted-foreground" />
                  </Link>
                ))}
              </div>
              {row.basePrompt && (
                <p
                  className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground"
                  title={row.basePrompt}
                >
                  {row.basePrompt}
                </p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
