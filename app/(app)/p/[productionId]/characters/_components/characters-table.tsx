"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ExternalLink,
  FileText,
  MonitorPlay,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { SlateFill } from "@/components/app/shot-frame";
import { StatusPill } from "@/components/app/status-pill";
import {
  MAX_ELEMENT_BASE_PROMPT_LENGTH,
  type ElementSlot,
} from "@/convex/lib/domain";
import { showMutationError } from "../../shots/[shotId]/_components/error-toast";
import {
  DeleteCharacterDialog,
  EditPromptDialog,
  RenameCharacterDialog,
} from "./character-dialogs";
import {
  CHARACTER_SLOTS,
  characterHref,
  finalSlot,
  optionsLabel,
  reviewRoomHref,
  reviewSlot,
  slotLabel,
  slotOf,
  type CharacterRow,
} from "./characters-common";
import { CopyButton } from "./copy-button";

/**
 * The Characters table mirrors the tester's Heroes sheet column for column:
 * № | Name | Concept | Animation | Prompt | Final | menu. Each phase cell is
 * the picked-or-cover thumbnail with its status; Prompt edits inline.
 */
export function CharactersTable({
  rows,
  productionId,
  canEdit,
}: {
  rows: CharacterRow[];
  productionId: Id<"productions">;
  canEdit: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10 text-right">№</TableHead>
            <TableHead>Name</TableHead>
            {CHARACTER_SLOTS.map((slot) => (
              <TableHead key={slot}>{slotLabel(slot)}</TableHead>
            ))}
            <TableHead>Prompt</TableHead>
            <TableHead>Final</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <CharacterTableRow
              key={row._id}
              row={row}
              index={i + 1}
              productionId={productionId}
              canEdit={canEdit}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CharacterTableRow({
  row,
  index,
  productionId,
  canEdit,
}: {
  row: CharacterRow;
  index: number;
  productionId: Id<"productions">;
  canEdit: boolean;
}) {
  return (
    <TableRow>
      <TableCell className="text-right">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {index}
        </span>
      </TableCell>
      <TableCell className="max-w-56">
        <Link
          href={characterHref(productionId, row._id)}
          className="block truncate font-medium hover:underline"
        >
          {row.name}
        </Link>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {row.code}
        </p>
      </TableCell>
      {CHARACTER_SLOTS.map((slot) => (
        <TableCell key={slot}>
          <SlotCell row={row} slot={slot} productionId={productionId} />
        </TableCell>
      ))}
      <TableCell className="w-80 max-w-80 whitespace-normal align-top">
        <PromptCell row={row} canEdit={canEdit} />
      </TableCell>
      <TableCell>
        <FinalCell row={row} />
      </TableCell>
      <TableCell>
        <CharacterRowMenu
          row={row}
          productionId={productionId}
          canEdit={canEdit}
        />
      </TableCell>
    </TableRow>
  );
}

/** Picked-or-cover thumbnail, status pill and option count; opens the phase. */
function SlotCell({
  row,
  slot,
  productionId,
}: {
  row: CharacterRow;
  slot: ElementSlot;
  productionId: Id<"productions">;
}) {
  const view = slotOf(row, slot);
  if (view === undefined) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const label = slotLabel(slot);
  const picked = view.pickedVersionIndex !== null;
  // coverThumbUrl is null once a pick exists (elements.list), so this is the
  // pick when there is one and the first option otherwise.
  const thumb = view.pickedThumbUrl ?? view.coverThumbUrl;
  const alt = picked
    ? `${row.name} — ${label} v${view.pickedVersionIndex}`
    : `${row.name} — ${label} cover`;
  return (
    <Link
      href={characterHref(productionId, row._id, slot)}
      aria-label={`${row.name} — ${label}`}
      className="-m-1 flex items-center gap-2.5 rounded-md p-1 transition-colors hover:bg-muted/60"
    >
      <span className="thumb-frame flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={alt}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          // Unexposed stock, same as every other empty frame — seeded by the
          // character's code so each row's square is its own.
          <SlateFill code={`${row.code}_${slot}`} status={view.status} size="sm" />
        )}
      </span>
      <span className="flex min-w-0 flex-col items-start gap-1">
        <StatusPill status={view.status} size="xs" />
        <span className="text-[11px] text-muted-foreground">
          {optionsLabel(view.versionsCount)}
          {picked && ` · v${view.pickedVersionIndex}`}
        </span>
      </span>
    </Link>
  );
}

/**
 * Base prompt, clamped to two lines; click → textarea, blur saves (spec C5),
 * Escape restores. Everyone can copy; content editors can edit.
 */
function PromptCell({ row, canEdit }: { row: CharacterRow; canEdit: boolean }) {
  const update = useMutation(api.elements.update);
  const prompt = row.basePrompt ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(prompt);
  const cancelled = useRef(false);

  const commit = () => {
    setEditing(false);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const next = draft.trim();
    if (next === prompt) return;
    void update({ elementId: row._id, basePrompt: next }).catch(
      showMutationError,
    );
  };

  if (editing) {
    return (
      <Textarea
        autoFocus
        value={draft}
        aria-label={`Base prompt for ${row.name}`}
        maxLength={MAX_ELEMENT_BASE_PROMPT_LENGTH}
        className="min-h-24 w-full text-xs"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            cancelled.current = true;
            setDraft(prompt);
            e.currentTarget.blur();
          }
        }}
      />
    );
  }

  const text =
    prompt.length > 0 ? (
      <p
        className="line-clamp-2 text-xs leading-snug"
        title={prompt}
      >
        {prompt}
      </p>
    ) : (
      <p className="text-xs text-muted-foreground">
        {canEdit ? "Add a prompt" : "—"}
      </p>
    );

  return (
    <div className="flex items-start gap-1">
      {canEdit ? (
        <button
          type="button"
          aria-label={`Edit base prompt for ${row.name}`}
          className="-m-1 min-w-0 flex-1 rounded-md p-1 text-left transition-colors hover:bg-muted/60"
          onClick={() => {
            setDraft(prompt);
            setEditing(true);
          }}
        >
          {text}
        </button>
      ) : (
        <div className="min-w-0 flex-1">{text}</div>
      )}
      <CopyButton text={prompt} label={`Copy prompt for ${row.name}`} />
    </div>
  );
}

/** "Open" → the picked file of the latest picked phase; disabled without a pick. */
function FinalCell({ row }: { row: CharacterRow }) {
  const final = finalSlot(row);
  if (final?.pickedFileUrl) {
    return (
      <a
        href={final.pickedFileUrl}
        target="_blank"
        rel="noreferrer"
        title={`Picked ${slotLabel(final.slot)} v${final.pickedVersionIndex}`}
        className={buttonVariants({ variant: "outline", size: "xs" })}
      >
        <ExternalLink /> Open
      </a>
    );
  }
  return (
    <Button
      variant="outline"
      size="xs"
      disabled
      title="Pick an option first"
    >
      <ExternalLink /> Open
    </Button>
  );
}

function CharacterRowMenu({
  row,
  productionId,
  canEdit,
}: {
  row: CharacterRow;
  productionId: Id<"productions">;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const room = reviewSlot(row);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              aria-label={`${row.name} menu`}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-48">
          {canEdit && (
            <>
              <DropdownMenuItem onClick={() => setRenameOpen(true)}>
                <Pencil /> Rename…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPromptOpen(true)}>
                <FileText /> Edit prompt…
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem
            disabled={room === undefined}
            onClick={() => {
              if (room !== undefined)
                router.push(reviewRoomHref(productionId, room.shotId));
            }}
          >
            <MonitorPlay /> Open in Review Room
          </DropdownMenuItem>
          {canEdit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {canEdit && (
        <>
          <RenameCharacterDialog
            element={row}
            open={renameOpen}
            onOpenChange={setRenameOpen}
          />
          <EditPromptDialog
            element={row}
            open={promptOpen}
            onOpenChange={setPromptOpen}
          />
          <DeleteCharacterDialog
            element={row}
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
          />
        </>
      )}
    </>
  );
}

