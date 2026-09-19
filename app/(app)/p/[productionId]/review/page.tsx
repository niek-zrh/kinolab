"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Clapperboard, ImageIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/empty-state";
import { SlateStrip } from "@/components/app/slate-strip";
import { UserAvatar } from "@/components/app/user-avatar";
import { copy } from "@/lib/copy";
import { todayInTz } from "@/lib/format";
import { cn } from "@/lib/utils";

type ShotCard = (typeof api.shots.list._returnType)[number];

/** A phase with a pick (or past it) has been decided; it leaves the queue. */
const DECIDED_STATUSES = new Set<ShotCard["status"]>([
  "picked",
  "approved",
  "final",
  "delivered",
  "killed",
]);

/** shots.list's MAX_LIST_SHOTS (convex/shots.ts). */
const LIST_CAP = 1000;

function GroupHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </h2>
  );
}

function CapNote({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-xs text-muted-foreground">{children}</p>;
}

export default function ReviewQueuePage() {
  const params = useParams<{ productionId: string }>();
  const productionId = params.productionId as Id<"productions">;

  const shots = useQuery(api.shots.list, { productionId });
  // Character phases are slot shots (v2 item b) — excluded from the default
  // list, so they get their own query and their own group below.
  const slotShots = useQuery(api.shots.list, {
    productionId,
    elements: "only",
  });
  const production = useQuery(api.productions.get, { productionId });
  const pickActivity = useQuery(api.activity.feed, {
    productionId,
    types: ["version.picked"],
    limit: 100,
  });

  const queue = useMemo(() => {
    if (!shots) return undefined;
    return shots
      .filter((s) => s.status === "options_ready" || s.status === "in_review")
      .sort(
        (a, b) =>
          (a.scene?.code ?? "").localeCompare(b.scene?.code ?? "") ||
          a.order - b.order,
      );
  }, [shots]);

  // Characters: phases holding options that nobody has decided on yet, in
  // sheet order (the slot shots were created in the characters' order).
  const characterQueue = useMemo(() => {
    if (!slotShots) return undefined;
    return slotShots
      .filter((s) => s.versionsCount > 0 && !DECIDED_STATUSES.has(s.status))
      .sort((a, b) => a.order - b.order);
  }, [slotShots]);

  const decidedToday = useMemo(() => {
    if (!shots || !slotShots || !pickActivity || !production) return [];
    const tz = production.timezone;
    const today = todayInTz(tz);
    const pickedTodayVersionIds = new Set(
      pickActivity
        .filter(
          (row) =>
            formatInTimeZone(new Date(row._creationTime), tz, "yyyy-MM-dd") ===
            today,
        )
        .map((row) => row.targetId),
    );
    return [...shots, ...slotShots]
      .filter(
        (s) =>
          s.pickedVersionId !== undefined &&
          pickedTodayVersionIds.has(s.pickedVersionId),
      )
      .sort(
        (a, b) =>
          (a.scene?.code ?? "").localeCompare(b.scene?.code ?? "") ||
          a.order - b.order,
      );
  }, [shots, slotShots, pickActivity, production]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Review
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Options waiting for a decision. Open a shot to compare and pick.
        </p>
      </div>

      {queue === undefined || characterQueue === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
        </div>
      ) : queue.length === 0 && characterQueue.length === 0 ? (
        <EmptyState icon={<Clapperboard />} title={copy.empty.review} />
      ) : (
        <>
          {queue.length > 0 && (
            <section aria-label="Shots">
              {characterQueue.length > 0 && <GroupHeading>Shots</GroupHeading>}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {queue.map((shot) => (
                  <QueueCard
                    key={shot._id}
                    shot={shot}
                    href={`/p/${productionId}/review/${shot._id}`}
                  />
                ))}
              </div>
              {/* shots.list caps at 1000 rows; say so rather than quietly
                  showing a subset of the queue. */}
              {shots !== undefined && shots.length >= LIST_CAP && (
                <CapNote>Showing the first {LIST_CAP} shots.</CapNote>
              )}
            </section>
          )}
          {characterQueue.length > 0 && (
            <section
              aria-label="Characters"
              className={cn(queue.length > 0 && "mt-10")}
            >
              <GroupHeading>Characters</GroupHeading>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {characterQueue.map((shot) => (
                  <QueueCard
                    key={shot._id}
                    shot={shot}
                    href={`/p/${productionId}/review/${shot._id}`}
                  />
                ))}
              </div>
              {slotShots !== undefined && slotShots.length >= LIST_CAP && (
                <CapNote>Showing the first {LIST_CAP} character phases.</CapNote>
              )}
            </section>
          )}
        </>
      )}

      {decidedToday.length > 0 && (
        <section className="mt-10">
          <GroupHeading>Decided today</GroupHeading>
          <div className="grid gap-4 opacity-70 sm:grid-cols-2 lg:grid-cols-3">
            {decidedToday.map((shot) => (
              <QueueCard
                key={shot._id}
                shot={shot}
                href={`/p/${productionId}/review/${shot._id}`}
                muted
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function QueueCard({
  shot,
  href,
  muted = false,
}: {
  shot: ShotCard;
  href: string;
  muted?: boolean;
}) {
  return (
    <Link href={href} className="group">
      <Card
        className={cn(
          "h-full gap-0 p-0 transition-shadow duration-150 group-hover:shadow-md",
          muted && "saturate-50",
        )}
      >
        <SlateStrip code={shot.code} status={shot.status} />
        <div className="relative aspect-video overflow-hidden border-b border-border bg-muted">
          {shot.coverThumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shot.coverThumbUrl}
              alt={shot.code}
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <ImageIcon className="size-6" />
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {shot.title ?? shot.code}
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{shot.versionsCount}</span>{" "}
              {shot.versionsCount === 1 ? "option" : "options"}
              {shot.scene ? (
                <>
                  {" "}
                  · <span className="font-mono">{shot.scene.code}</span>
                </>
              ) : null}
            </p>
          </div>
          {shot.assignee && (
            <UserAvatar
              name={shot.assignee.name}
              image={shot.assignee.image}
              className="shrink-0"
            />
          )}
        </div>
      </Card>
    </Link>
  );
}
