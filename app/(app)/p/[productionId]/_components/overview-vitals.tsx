"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Brush,
  CheckCheck,
  Film,
  MonitorPlay,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app/page-shell";
import { buttonVariants } from "@/components/ui/button";

const DONE = new Set(["approved", "final", "delivered"]);

/** Production artwork takes the lead; generated brand art is only a fallback. */
export function OverviewVitals({
  productionId,
}: {
  productionId: Id<"productions">;
}) {
  const production = useQuery(api.productions.get, { productionId });
  const shots = useQuery(api.shots.list, { productionId });
  const counts = useQuery(api.shots.counts, { productionId });
  const base = `/p/${productionId}`;
  const live = (shots ?? []).filter((s) => s.status !== "killed");
  const done = live.filter((s) => DONE.has(s.status)).length;
  const cover =
    live.find((s) => s.coverThumbUrl && DONE.has(s.status)) ??
    live.find((s) => s.coverThumbUrl);
  const progress = live.length ? Math.round((done / live.length) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Overview"
        favoriteLabel="Overview"
        description="The creative work. The next decision. One shared view."
      />
      <section
        className="editorial-banner mb-5"
        aria-label="Production at a glance"
      >
        <img
          src={cover?.coverThumbUrl ?? "/brand/creative-workbench-v1.jpg"}
          alt=""
          className="absolute inset-0 size-full object-cover object-center"
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-black/70 sm:bg-transparent sm:bg-gradient-to-r sm:from-black/90 sm:via-black/65 sm:to-black/15" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="relative flex min-h-64 flex-col justify-center px-6 py-8 sm:px-8">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">
            Production workspace {production && ` / ${production.code}`}
          </p>
          <h2 className="max-w-2xl break-words text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {production?.name ?? "Your next story"}
          </h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-white/75">
            {production?.kind === "episodic" ? "Series" : "Film"} · A shared
            space to shape, make, and finish the story.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href={`${base}/storyboard`}
              className={buttonVariants({
                className: "border-white bg-white text-black hover:bg-white/90",
              })}
            >
              <BookOpen className="size-4" />
              Open storyboard
            </Link>
            <Link
              href={`${base}/my-work`}
              className={buttonVariants({
                variant: "outline",
                className:
                  "border-white/30 bg-black/20 text-white hover:bg-white/15 hover:text-white",
              })}
            >
              <Brush className="size-4" />
              My work
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <p className="mt-5 text-[10px] text-white/65">
            {cover
              ? `Production frame · ${cover.code}`
              : "Studio artwork · Add shot versions to make this space your own"}
          </p>
        </div>
        <div className="relative grid grid-cols-3 border-t border-white/15 bg-black/35 backdrop-blur-sm">
          {[
            {
              label: "Active shots",
              value: live.length,
              icon: Film,
              href: `${base}/shots`,
            },
            {
              label: "In review queue",
              value: counts?.reviewQueue ?? 0,
              icon: MonitorPlay,
              href: `${base}/review`,
            },
            {
              label: "Signed off",
              value: `${progress}%`,
              icon: CheckCheck,
              href: `${base}/board`,
            },
          ].map(({ label, value, icon: Icon, href }) => (
            <Link
              key={label}
              href={href}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-r border-white/10 px-4 py-3 transition-colors last:border-r-0 hover:bg-white/10 sm:px-6"
            >
              <Icon className="hidden size-4 text-white/60 sm:block" />
              {shots === undefined || counts === undefined ? (
                <Skeleton className="h-6 w-8 bg-white/10" />
              ) : (
                <span className="text-xl font-semibold tabular-nums text-white">
                  {value}
                </span>
              )}
              <span className="text-[11px] text-white/75 sm:text-xs">
                {label}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
