"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ArrowUpRight, Brush, Clapperboard, Palette } from "lucide-react";

export function OverviewWorkflow({
  productionId,
}: {
  productionId: Id<"productions">;
}) {
  const counts = useQuery(api.shots.counts, { productionId });
  const destinations = [
    {
      path: "my-work",
      icon: Brush,
      label: "Your next frame",
      text: "Your assignments & next steps",
      tint: "bg-status-options_ready/10 text-status-options_ready",
    },
    {
      path: "references",
      icon: Palette,
      label: "Define the look",
      text: "References, palettes & direction",
      tint: "bg-status-in_review/10 text-status-in_review",
    },
    {
      path: "review",
      icon: Clapperboard,
      label: counts?.reviewQueue
        ? `${counts.reviewQueue} ready for review`
        : "Meet in the Review Room",
      text: "Compare, discuss & make the pick",
      tint: "bg-status-approved/10 text-status-approved",
    },
  ];
  return (
    <div className="mb-6 grid gap-3 lg:grid-cols-3">
      {destinations.map(({ path, icon: Icon, label, text, tint }) => (
        <Link
          key={path}
          href={`/p/${productionId}/${path}`}
          className="studio-panel group flex items-center gap-3 p-4 transition-colors hover:border-foreground/30"
        >
          <span className={`rounded-xl p-2.5 ${tint}`}>
            <Icon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{label}</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              {text}
            </span>
          </span>
          <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-tape" />
        </Link>
      ))}
    </div>
  );
}
