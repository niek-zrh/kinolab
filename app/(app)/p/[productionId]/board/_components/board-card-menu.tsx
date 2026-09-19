"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  Check,
  Copy,
  FileText,
  Film,
  History,
  MessageSquare,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/app/status-pill";
import { UserAvatar } from "@/components/app/user-avatar";
import { isCommittableDueDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  shotHref,
  statusLockedFor,
  statusOptionsFor,
  type BoardCardActions,
  type BoardMember,
  type BoardShot,
} from "./board-helpers";

/** A point on screen; the right-click menu anchors here instead of the ⋯ button. */
export type MenuPoint = { x: number; y: number };

/**
 * Menu popup that can anchor to a pointer position. The ⋯ button and the
 * right-click context menu share ONE Menu.Root per card, so the items render
 * once; DropdownMenuContent has no `anchor` prop, hence the primitives here.
 */
export function CardMenuPopup({
  point,
  children,
}: {
  point: MenuPoint | null;
  children: ReactNode;
}) {
  const anchor = useMemo(
    () =>
      point
        ? {
            getBoundingClientRect: () =>
              DOMRect.fromRect({ x: point.x, y: point.y, width: 0, height: 0 }),
          }
        : undefined,
    [point],
  );
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        anchor={anchor}
        align={point ? "start" : "end"}
        side={point ? "right" : "bottom"}
        sideOffset={4}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className="z-50 max-h-(--available-height) min-w-44 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

/** Status choices — the same list the shot page offers this role. */
export function StatusItems({
  shot,
  role,
  onSetStatus,
}: {
  shot: BoardShot;
  role: string | null;
  onSetStatus: BoardCardActions["onSetStatus"];
}) {
  return (
    <>
      {statusOptionsFor(role).map((s) => (
        <DropdownMenuItem
          key={s.key}
          onClick={() => {
            if (s.key !== shot.status) onSetStatus(shot._id, s.key);
          }}
        >
          <StatusPill status={s.key} size="xs" />
          {s.key === shot.status && (
            <Check className="ml-auto size-3.5 text-muted-foreground" />
          )}
        </DropdownMenuItem>
      ))}
    </>
  );
}

/** Studio members with an account (the server has no way to unassign). */
export function AssignItems({
  shot,
  members,
  onAssign,
}: {
  shot: BoardShot;
  members: BoardMember[];
  onAssign: BoardCardActions["onAssign"];
}) {
  if (members.length === 0) {
    return (
      <DropdownMenuItem disabled>
        <Users /> No members with an account yet
      </DropdownMenuItem>
    );
  }
  return (
    <>
      {members.map((m) => (
        <DropdownMenuItem
          key={m.userId}
          onClick={() => {
            if (m.userId !== shot.assigneeId) onAssign(shot._id, m.userId);
          }}
        >
          <UserAvatar name={m.name} image={m.image} className="size-4 text-[8px]" />
          <span className="truncate">{m.name}</span>
          {m.userId === shot.assigneeId && (
            <Check className="ml-auto size-3.5 text-muted-foreground" />
          )}
        </DropdownMenuItem>
      ))}
    </>
  );
}

/** Menu item that is a real link (middle-click, keyboard Enter both work). */
function MenuLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return <DropdownMenuItem render={<Link href={href} />}>{children}</DropdownMenuItem>;
}

/**
 * The full card menu (⋯ button and right-click). Status / Assign are
 * submenus so the pill and avatar can open the same lists on their own.
 */
export function CardMenuItems({
  shot,
  role,
  members,
  actions,
  onOpenDueDate,
}: {
  shot: BoardShot;
  role: string | null;
  members: BoardMember[];
  actions: BoardCardActions;
  onOpenDueDate: () => void;
}) {
  const href = shotHref(shot);
  const statusLocked = statusLockedFor(role, shot);
  return (
    <>
      {!statusLocked && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <StatusItems shot={shot} role={role} onSetStatus={actions.onSetStatus} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>Assign to</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <AssignItems shot={shot} members={members} onAssign={actions.onAssign} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuItem onClick={onOpenDueDate}>
        <CalendarDays /> Due date…
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <MenuLink href={href}>
        <Film /> Open shot
      </MenuLink>
      <MenuLink href={`/p/${shot.productionId}/review/${shot._id}`}>
        <Film /> Open in Review Room
      </MenuLink>
      <MenuLink href={`${href}?tab=discussion`}>
        <MessageSquare /> Discussion
      </MenuLink>
      <MenuLink href={`${href}?tab=files`}>
        <FileText /> Files
      </MenuLink>
      <MenuLink href={`${href}?tab=history`}>
        <History /> History
      </MenuLink>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => {
          void navigator.clipboard
            .writeText(shot.code)
            .then(() => toast.success(`Copied ${shot.code}`))
            .catch(() => toast.error("Couldn't copy — select the code instead"));
        }}
      >
        <Copy /> Copy code
      </DropdownMenuItem>
    </>
  );
}

/**
 * Due-date editor inside the card's popover. Commits on change like the shot
 * page (only a date that could really be a due date — typing a year fires
 * change per digit); Clear sends null.
 */
export function DueDateForm({
  shot,
  onSetDueDate,
  onDone,
}: {
  shot: BoardShot;
  onSetDueDate: BoardCardActions["onSetDueDate"];
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(shot.dueDate ?? "");
  useEffect(() => {
    setDraft(shot.dueDate ?? "");
  }, [shot.dueDate]);
  const inputId = `due-${shot._id}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={inputId} className="text-xs text-muted-foreground">
        Due date — {shot.code}
      </Label>
      <Input
        id={inputId}
        type="date"
        aria-label="Due date"
        autoFocus
        value={draft}
        onChange={(e) => {
          const value = e.target.value;
          setDraft(value);
          if (isCommittableDueDate(value) && value !== shot.dueDate)
            onSetDueDate(shot._id, value);
        }}
        className={cn("h-7 w-full text-[0.8rem]")}
      />
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          disabled={!shot.dueDate}
          onClick={() => {
            onSetDueDate(shot._id, null);
            onDone();
          }}
        >
          Clear
        </Button>
        <Button type="button" variant="outline" size="xs" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

