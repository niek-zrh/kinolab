"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/app/status-pill";
import { useStudio } from "@/components/app/studio-context";
import {
  MAX_ELEMENT_BASE_PROMPT_LENGTH,
  MAX_ELEMENT_DESCRIPTION_LENGTH,
  type ElementSlot,
} from "@/convex/lib/domain";
import { cn } from "@/lib/utils";
import { isContentEditor } from "../../shots/_components/shots-common";
import { showMutationError } from "../../shots/[shotId]/_components/error-toast";
import { RenameCharacterDialog } from "../_components/character-dialogs";
import {
  charactersHref,
  optionsLabel,
  slotLabel,
} from "../_components/characters-common";
import { CopyButton } from "../_components/copy-button";
import { InlineName, InlineTextarea } from "../_components/inline-fields";
import { SlotSection } from "../_components/slot-section";

export default function CharacterDetailPage() {
  // useSearchParams needs a Suspense boundary for prerendering.
  return (
    <Suspense
      fallback={
        <main className="flex-1 px-6 py-6">
          <Skeleton className="h-72 w-full" />
        </main>
      }
    >
      <CharacterDetailScreen />
    </Suspense>
  );
}

/**
 * One character: name, code, description and base prompt in the header;
 * below it one section per phase (Concept, Animation) — `?slot=` selects
 * which one is open, so the URL a notification or the list hands over lands
 * on the right phase. The section is the shot page's controls and tabs
 * bound to that phase's slot shot.
 */
function CharacterDetailScreen() {
  const params = useParams<{ productionId: string; elementId: string }>();
  const productionId = params.productionId as Id<"productions">;
  const elementId = params.elementId as Id<"elements">;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { studioId, role, viewer } = useStudio();

  const element = useQuery(api.elements.get, { elementId });
  const team = useQuery(api.studios.team, studioId ? { studioId } : "skip");
  const update = useMutation(api.elements.update);

  const canEdit = isContentEditor(role);
  const [renameOpen, setRenameOpen] = useState(false);

  const slotParam = searchParams.get("slot");
  const slots = element?.slots ?? [];
  const selected = slots.find((s) => s.slot === slotParam) ?? slots[0];
  const selectSlot = (slot: ElementSlot) =>
    router.replace(`${pathname}?slot=${slot}`, { scroll: false });

  if (element === undefined) {
    return (
      <main className="flex-1 px-6 py-6">
        <div className="mx-auto w-full max-w-6xl space-y-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-40" />
          <div className="grid gap-4 pt-2 md:grid-cols-2">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </main>
    );
  }

  const save = (patch: {
    name?: string;
    description?: string;
    basePrompt?: string;
  }) => void update({ elementId, ...patch }).catch(showMutationError);

  return (
    <main className="flex-1 px-6 py-6">
      <div className="mx-auto w-full max-w-6xl">
        <Link
          href={charactersHref(productionId)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Characters
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <InlineName
              value={element.name}
              canEdit={canEdit}
              onSave={(name) => save({ name })}
            />
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">
                {element.code}
              </span>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground"
                  onClick={() => setRenameOpen(true)}
                >
                  <Pencil /> Rename…
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Description">
            <InlineTextarea
              value={element.description ?? ""}
              canEdit={canEdit}
              ariaLabel="Description"
              placeholder="Who this character is — a line or two for the team"
              maxLength={MAX_ELEMENT_DESCRIPTION_LENGTH}
              onSave={(description) => save({ description })}
            />
          </Field>
          <Field
            label="Base prompt"
            action={
              <CopyButton
                text={element.basePrompt ?? ""}
                label="Copy base prompt"
                size="xs"
              />
            }
          >
            <InlineTextarea
              value={element.basePrompt ?? ""}
              canEdit={canEdit}
              ariaLabel="Base prompt"
              placeholder="The prompt every option starts from — paste it from your sheet"
              maxLength={MAX_ELEMENT_BASE_PROMPT_LENGTH}
              className="font-mono text-xs"
              onSave={(basePrompt) => save({ basePrompt })}
            />
          </Field>
        </div>

        {/* Phase switcher: one section is open at a time so the page holds a
            single set of Status / Assignee / Due controls and one uploader. */}
        <div
          role="group"
          aria-label="Phase"
          className="mt-6 flex flex-wrap items-center gap-1 rounded-lg border bg-background p-1"
        >
          {slots.map((slot) => {
            const active = selected?.slot === slot.slot;
            return (
              <button
                key={slot.slot}
                type="button"
                aria-pressed={active}
                onClick={() => selectSlot(slot.slot)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {slotLabel(slot.slot)}
                <StatusPill status={slot.status} size="xs" />
                <span className="text-xs text-muted-foreground">
                  {optionsLabel(slot.versionsCount)}
                  {slot.pickedVersionIndex !== null &&
                    ` · v${slot.pickedVersionIndex}`}
                </span>
              </button>
            );
          })}
        </div>

        {selected !== undefined ? (
          <SlotSection
            key={selected.shotId}
            productionId={productionId}
            slot={selected.slot}
            shotId={selected.shotId}
            team={team}
            role={role}
            viewerId={viewer?._id ?? null}
            canEditContent={canEdit}
          />
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            This character has no phases yet.
          </p>
        )}
      </div>

      {canEdit && (
        <RenameCharacterDialog
          element={element}
          open={renameOpen}
          onOpenChange={setRenameOpen}
        />
      )}
    </main>
  );
}

function Field({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex h-6 items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {action}
      </div>
      {children}
    </div>
  );
}
