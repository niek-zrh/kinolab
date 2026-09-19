"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { CalendarDays, Check, MoreHorizontal, UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusPill, STATUS_VAR } from "@/components/app/status-pill";
import { UserAvatar } from "@/components/app/user-avatar";
import { cn } from "@/lib/utils";
import {
  AssignItems,
  CardMenuItems,
  CardMenuPopup,
  DueDateForm,
  StatusItems,
  type MenuPoint,
} from "./board-card-menu";
import {
  formatDueDate,
  SHOT_DRAG_TYPE,
  shotHref,
  statusLockedFor,
  type BoardCardActions,
  type BoardMember,
  type BoardShot,
} from "./board-helpers";

function optionsLabel(count: number): string {
  if (count === 0) return "No options";
  return count === 1 ? "1 option" : `${count} options`;
}

/**
 * A board card is a focusable `div` — the code and title are the links, so
 * the status pill, assignee avatar, due chip and ⋯ menu stay clickable and
 * keyboard-reachable inside it. Enter on the card itself opens the shot;
 * right-click (or Shift+F10) opens the same menu as the ⋯ button.
 */
export function BoardShotCard({
  shot,
  canDrag,
  canEdit,
  role,
  members,
  showThumb,
  actions,
}: {
  shot: BoardShot;
  canDrag: boolean;
  canEdit: boolean;
  role: string | null;
  members: BoardMember[];
  showThumb: boolean;
  actions: BoardCardActions;
}) {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPoint, setMenuPoint] = useState<MenuPoint | null>(null);
  const [dueOpen, setDueOpen] = useState(false);

  const href = shotHref(shot);
  const statusLocked = statusLockedFor(role, shot);
  const stripStyle = {
    "--strip-color": STATUS_VAR[shot.status],
  } as CSSProperties;

  const closeMenus = () => {
    setMenuOpen(false);
    setMenuPoint(null);
    setDueOpen(false);
  };

  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    // Right-clicks inside a portaled popup bubble here through React; leave those alone.
    if (!e.currentTarget.contains(e.target as Node)) return;
    e.preventDefault();
    // A keyboard-invoked context menu (Shift+F10) reports 0,0 — anchor to the ⋯ button then.
    setMenuPoint(e.clientX === 0 && e.clientY === 0 ? null : { x: e.clientX, y: e.clientY });
    setDueOpen(false);
    setMenuOpen(true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter") {
      e.preventDefault();
      router.push(href);
      return;
    }
    // Keyboard context menu (Shift+F10 / the Menu key) — browsers don't all
    // synthesise a contextmenu event for it, so open the menu here, anchored
    // to the ⋯ button.
    if (canEdit && (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey))) {
      e.preventDefault();
      setMenuPoint(null);
      setDueOpen(false);
      setMenuOpen(true);
    }
  };

  return (
    <div
      role="group"
      aria-label={shot.code}
      data-shot-card={shot.code}
      tabIndex={0}
      draggable={canDrag}
      onDragStart={(e) => {
        if (!canDrag) return;
        e.dataTransfer.setData(SHOT_DRAG_TYPE, shot._id);
        e.dataTransfer.setData("text/plain", shot.code);
        e.dataTransfer.effectAllowed = "move";
        closeMenus();
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
      className={cn(
        "group/card relative overflow-hidden rounded-lg border bg-card shadow-xs outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/60",
        canDrag && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40",
      )}
    >
      {/* Slate strip (spec §9.2) — same class as <SlateStrip>, with the code as a link. */}
      <div className="slate-strip" style={stripStyle}>
        <Link
          href={href}
          className="min-w-0 truncate text-muted-foreground transition-colors hover:text-foreground hover:underline"
        >
          {shot.code}
        </Link>
        {canEdit && !statusLocked ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={`Change status of ${shot.code}`}
                  title="Change status"
                  className="shrink-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                />
              }
            >
              <StatusPill status={shot.status} size="xs" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-40">
              <StatusItems shot={shot} role={role} onSetStatus={actions.onSetStatus} />
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <StatusPill status={shot.status} size="xs" />
        )}
      </div>

      {showThumb && shot.coverThumbUrl ? (
        <div className="thumb-frame aspect-video w-full border-x-0 border-t-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shot.coverThumbUrl}
            alt={`${shot.code} cover`}
            className="size-full object-cover"
            loading="lazy"
            draggable={false}
          />
        </div>
      ) : null}

      <div className="space-y-2 px-2.5 py-2">
        {shot.title ? (
          <Link
            href={href}
            className="line-clamp-2 block text-[13px] leading-snug hover:underline"
          >
            {shot.title}
          </Link>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <Link
              href={`${href}?tab=options`}
              className="whitespace-nowrap transition-colors hover:text-foreground hover:underline"
            >
              {optionsLabel(shot.versionsCount)}
            </Link>
            {shot.pickedVersionId !== undefined && (
              <Link
                href={`/p/${shot.productionId}/review/${shot._id}`}
                aria-label={`Picked${
                  typeof shot.pickedVersionIndex === "number"
                    ? ` v${shot.pickedVersionIndex}`
                    : ""
                } — open ${shot.code} in the Review Room`}
                title="Open in Review Room"
                className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-sm border border-status-picked/25 bg-status-picked/10 px-1 py-px text-[10px] font-medium text-status-picked transition-colors hover:bg-status-picked/20"
              >
                <Check className="size-3" />
                {typeof shot.pickedVersionIndex === "number"
                  ? `v${shot.pickedVersionIndex}`
                  : "Review"}
              </Link>
            )}
            {canEdit ? (
              <Popover open={dueOpen} onOpenChange={setDueOpen}>
                <PopoverTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`Due date of ${shot.code}`}
                      title={shot.dueDate ? "Change due date" : "Set due date"}
                      className={cn(
                        "-mx-1 flex items-center gap-1 whitespace-nowrap rounded-sm px-1 outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60",
                        !shot.dueDate &&
                          "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100",
                      )}
                    />
                  }
                >
                  <CalendarDays className="size-3" />
                  {shot.dueDate ? formatDueDate(shot.dueDate) : "Due"}
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56">
                  <DueDateForm
                    shot={shot}
                    onSetDueDate={actions.onSetDueDate}
                    onDone={() => setDueOpen(false)}
                  />
                </PopoverContent>
              </Popover>
            ) : shot.dueDate ? (
              <span className="flex items-center gap-1 whitespace-nowrap">
                <CalendarDays className="size-3" />
                {formatDueDate(shot.dueDate)}
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {canEdit ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`Assign ${shot.code}`}
                      title={shot.assignee ? `Assigned to ${shot.assignee.name}` : "Assign"}
                      className={cn(
                        "rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                        !shot.assignee &&
                          "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100",
                      )}
                    />
                  }
                >
                  {shot.assignee ? (
                    <UserAvatar
                      name={shot.assignee.name}
                      image={shot.assignee.image}
                      className="size-5 text-[9px]"
                    />
                  ) : (
                    <span className="flex size-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground">
                      <UserRoundPlus className="size-3" />
                    </span>
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-auto min-w-44">
                  <AssignItems shot={shot} members={members} onAssign={actions.onAssign} />
                </DropdownMenuContent>
              </DropdownMenu>
            ) : shot.assignee ? (
              <span title={shot.assignee.name}>
                <UserAvatar
                  name={shot.assignee.name}
                  image={shot.assignee.image}
                  className="size-5 text-[9px]"
                />
              </span>
            ) : null}

            {canEdit && (
              <DropdownMenu
                open={menuOpen}
                onOpenChange={(open) => {
                  setMenuOpen(open);
                  if (!open) setMenuPoint(null);
                }}
              >
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Actions for ${shot.code}`}
                      className="-my-1 text-muted-foreground opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
                    />
                  }
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <CardMenuPopup point={menuPoint}>
                  <CardMenuItems
                    shot={shot}
                    role={role}
                    members={members}
                    actions={actions}
                    onOpenDueDate={() => setDueOpen(true)}
                  />
                </CardMenuPopup>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
