"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { CalendarDays, MonitorPlay } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { StatusPill, STATUS_DOT_CLASSES } from "@/components/app/status-pill";
import { UserAvatar } from "@/components/app/user-avatar";
import {
  SHOT_STATUSES,
  WORKING_STATUSES,
  type ElementSlot,
  type ShotStatusKey,
} from "@/convex/lib/domain";
import { formatDay, isCommittableDueDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OptionsTab } from "../../shots/[shotId]/_components/options-tab";
import { DiscussionTab } from "../../shots/[shotId]/_components/discussion-tab";
import { FilesTab } from "../../shots/[shotId]/_components/files-tab";
import { HistoryTab } from "../../shots/[shotId]/_components/history-tab";
import { showMutationError } from "../../shots/[shotId]/_components/error-toast";
import { optionsLabel, reviewRoomHref, slotLabel } from "./characters-common";

type TeamMember = (typeof api.studios.team._returnType)[number];

/**
 * One phase of a character — its slot shot, shown with the shot page's
 * controls (status / assignee / due, same aria-labels and the same
 * canEditShot gating) and its Options | Discussion | Files | History tabs
 * bound to the slot's shotId. Everything version-shaped stays the shot
 * page's components; nothing is copied.
 */
export function SlotSection({
  productionId,
  slot,
  shotId,
  team,
  role,
  viewerId,
  canEditContent,
}: {
  productionId: Id<"productions">;
  slot: ElementSlot;
  shotId: Id<"shots">;
  team: TeamMember[] | undefined;
  role: string | null;
  viewerId: Id<"users"> | null;
  canEditContent: boolean;
}) {
  const shot = useQuery(api.shots.get, { shotId });
  // Subscribed at section level so the Discussion tab count stays live.
  const comments = useQuery(api.comments.list, {
    targetType: "shot",
    targetId: shotId,
  });
  const updateShot = useMutation(api.shots.update);
  const setStatus = useMutation(api.shots.setStatus);

  const isAssignedArtist =
    role === "artist" &&
    shot !== undefined &&
    viewerId !== null &&
    shot.assigneeId === viewerId;
  // Status / assignee / due date: content.edit roles + the assigned artist.
  const canEditFields = canEditContent || isAssignedArtist;
  const canDecide = canEditContent; // supervisor scoped server-side
  const canUpload = role !== null && role !== "viewer";

  const statusOptions =
    role === "artist"
      ? SHOT_STATUSES.filter((s) => WORKING_STATUSES.includes(s.key))
      : SHOT_STATUSES;

  const members = (team ?? []).filter(
    (m): m is typeof m & { userId: Id<"users"> } => m.userId !== undefined,
  );

  if (shot === undefined) {
    return (
      <section aria-label={`${slotLabel(slot)} phase`} className="mt-4 space-y-4">
        <Skeleton className="h-8 w-96" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </section>
    );
  }

  const metaBits = [
    optionsLabel(shot.versionsCount),
    shot.pickedVersionIndex !== null ? `picked v${shot.pickedVersionIndex}` : null,
  ].filter((bit): bit is string => bit !== null);

  return (
    <section aria-label={`${slotLabel(slot)} phase`} className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-2 min-w-0">
          <p className="font-mono text-sm font-semibold tracking-tight">
            {shot.code}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {metaBits.join(" · ")}
          </p>
        </div>

        {canEditFields ? (
          <Select
            value={shot.status}
            onValueChange={(value) =>
              void setStatus({
                shotId,
                status: value as ShotStatusKey,
              }).catch(showMutationError)
            }
          >
            <SelectTrigger size="sm" aria-label="Status" className="gap-1.5">
              <StatusPill status={shot.status} />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      STATUS_DOT_CLASSES[s.key],
                    )}
                  />
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <StatusPill status={shot.status} />
        )}

        {canEditFields ? (
          <Select
            value={shot.assigneeId ?? null}
            onValueChange={(value) => {
              if (typeof value === "string" && value.length > 0)
                void updateShot({
                  shotId,
                  assigneeId: value as Id<"users">,
                }).catch(showMutationError);
            }}
          >
            <SelectTrigger size="sm" aria-label="Assignee">
              {shot.assignee ? (
                <span className="flex items-center gap-1.5">
                  <UserAvatar
                    name={shot.assignee.name}
                    image={shot.assignee.image}
                    className="size-4 text-[8px]"
                  />
                  {shot.assignee.name}
                </span>
              ) : (
                <span className="text-muted-foreground">Assign</span>
              )}
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  <UserAvatar
                    name={m.name}
                    image={m.image}
                    className="size-4 text-[8px]"
                  />
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          shot.assignee && (
            <span className="flex items-center gap-1.5 text-sm">
              <UserAvatar
                name={shot.assignee.name}
                image={shot.assignee.image}
                className="size-4 text-[8px]"
              />
              {shot.assignee.name}
            </span>
          )
        )}

        {canEditFields ? (
          <Input
            type="date"
            aria-label="Due date"
            value={shot.dueDate ?? ""}
            onChange={(e) => {
              const value = e.target.value;
              // Typing a year fires change per digit ("0002-09-01" …), and
              // every write also logs an activity row — only commit a date
              // that could actually be a due date.
              if (isCommittableDueDate(value))
                void updateShot({ shotId, dueDate: value }).catch(
                  showMutationError,
                );
            }}
            className="h-7 w-fit rounded-[min(var(--radius-md),12px)] text-[0.8rem]"
          />
        ) : (
          shot.dueDate && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarDays className="size-3.5" />
              Due {formatDay(shot.dueDate)}
            </span>
          )
        )}

        <Link
          href={reviewRoomHref(productionId, shotId)}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "ml-auto",
          )}
        >
          <MonitorPlay /> Open in Review Room
        </Link>
      </div>

      <Tabs defaultValue="options" className="mt-4">
        <TabsList
          variant="line"
          className="w-full justify-start gap-4 rounded-none border-b p-0"
        >
          <TabsTrigger value="options" className="flex-none px-1">
            Options
            {shot.versionsCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {shot.versionsCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="discussion" className="flex-none px-1">
            Discussion
            {comments !== undefined && comments.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {comments.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="files" className="flex-none px-1">
            Files
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-none px-1">
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="options" className="pt-4">
          <OptionsTab
            productionId={productionId}
            shotId={shotId}
            productionCode={shot.production.code}
            shotCode={shot.code}
            canDecide={canDecide}
            canUpload={canUpload}
          />
        </TabsContent>
        <TabsContent value="discussion" className="pt-4">
          <DiscussionTab
            productionId={productionId}
            shotId={shotId}
            canEditContent={canEditContent}
          />
        </TabsContent>
        <TabsContent value="files" className="pt-4">
          <FilesTab shotId={shotId} />
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <HistoryTab
            productionId={productionId}
            shotId={shotId}
            shotCode={shot.code}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
