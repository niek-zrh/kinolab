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
      text: "Assignments, deadlines, and work that needs another pass.",
    },
    {
      path: "references",
      icon: Palette,
      label: "Define the look",
      text: "Artwork, palettes, and creative direction for the whole team.",
    },
    {
      path: "review",
      icon: Clapperboard,
      label: counts?.reviewQueue
        ? `${counts.reviewQueue} ready for review`
        : "Meet in the Review Room",
      text: "Compare versions, leave precise feedback, and make the pick.",
    },
  ];
  return (
    <div className="mb-6 grid gap-3 lg:grid-cols-3">
      {destinations.map(({ path, icon: Icon, label, text }) => (
        <Link
          key={path}
          href={`/p/${productionId}/${path}`}
          className="group flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-tape/50"
        >
          <span className="rounded-lg bg-tape/10 p-2 text-tape">
            <Icon className="size-4" />
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
