"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ClipboardList, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/empty-state";
import { useStudio } from "@/components/app/studio-context";
import { MAX_LIST_ELEMENTS } from "@/convex/lib/domain";
import { useHotkeys } from "@/lib/hooks/use-hotkeys";
import { isContentEditor } from "../shots/_components/shots-common";
import {
  NewCharacterDialog,
  PasteNamesDialog,
  PasteNamesForm,
} from "./_components/character-dialogs";
import { KIND } from "./_components/characters-common";
import { CharactersTable } from "./_components/characters-table";

/**
 * Characters (spec v2 item b): the tester's Heroes sheet as a table — one
 * row per character, a Concept and an Animation phase each with the
 * options → shortlist → pick loop, the base prompt, and the final still.
 * Copy is inline here on purpose: lib/copy.ts is not part of this change.
 */
export default function CharactersPage() {
  const params = useParams<{ productionId: string }>();
  const productionId = params.productionId as Id<"productions">;
  const { role } = useStudio();
  const rows = useQuery(api.elements.list, { productionId, kind: KIND });

  const canEdit = isContentEditor(role);
  const [newOpen, setNewOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  useHotkeys(
    {
      n: () => {
        if (!pasteOpen) setNewOpen(true);
      },
    },
    canEdit,
  );

  const capped = rows !== undefined && rows.length >= MAX_LIST_ELEMENTS;

  return (
    <main className="flex-1 px-6 py-6">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight">
              Characters
              {rows !== undefined && (
                // The literal space keeps the accessible name "Characters · 3".
                <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
                  {" "}· {rows.length}
                  {/* elements.list caps at MAX_LIST_ELEMENTS; say so rather
                      than quietly showing a subset. */}
                  {capped && ` (first ${MAX_LIST_ELEMENTS})`}
                </span>
              )}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              One row per character; Concept and Animation each collect
              options, shortlist and pick like a shot.
            </p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPasteOpen(true)}
              >
                <ClipboardList /> Paste names
              </Button>
              <Button
                size="sm"
                onClick={() => setNewOpen(true)}
                title="Press N"
              >
                <Plus /> New character
              </Button>
            </div>
          )}
        </div>

        {rows === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="No characters yet. Add one, or paste the names from your sheet."
          >
            {canEdit && (
              <div className="mt-1 w-full max-w-md text-left">
                <PasteNamesForm productionId={productionId} />
              </div>
            )}
          </EmptyState>
        ) : (
          <>
            <CharactersTable
              rows={rows}
              productionId={productionId}
              canEdit={canEdit}
            />
            {capped && (
              <p className="mt-2 text-xs text-muted-foreground">
                Showing the first {MAX_LIST_ELEMENTS} characters.
              </p>
            )}
          </>
        )}
      </div>

      {canEdit && (
        <>
          <NewCharacterDialog
            productionId={productionId}
            open={newOpen}
            onOpenChange={setNewOpen}
          />
          <PasteNamesDialog
            productionId={productionId}
            open={pasteOpen}
            onOpenChange={setPasteOpen}
          />
        </>
      )}
    </main>
  );
}
