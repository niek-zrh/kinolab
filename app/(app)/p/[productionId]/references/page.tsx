"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Archive,
  ArrowUpRight,
  ImagePlus,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, PageShell } from "@/components/app/page-shell";
import { useStudio } from "@/components/app/studio-context";
import { ShotFrame } from "@/components/app/shot-frame";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { firstErrorLine } from "../review/_components/review-utils";
import { cn } from "@/lib/utils";

const CATEGORIES = {
  look: "Look & feel",
  character: "Characters",
  location: "Locations",
  costume: "Costume & props",
  lighting: "Lighting",
} as const;
type Category = keyof typeof CATEGORIES;
type Card = (typeof api.references.list._returnType)["cards"][number];

export default function ReferencesPage() {
  const { productionId: id } = useParams<{ productionId: string }>();
  const productionId = id as Id<"productions">;
  const { role, viewer } = useStudio();
  const [archived, setArchived] = useState(false);
  const data = useQuery(api.references.list, { productionId, archived });
  const archive = useMutation(api.references.setArchived);
  const [category, setCategory] = useState<Category | "all">("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Card | "new" | null>(null);
  const canCreate = role !== null && role !== "viewer";
  const editor = [
    "owner",
    "producer",
    "creative_director",
    "supervisor",
  ].includes(role ?? "");
  const cards = data?.cards.filter(
    (c) =>
      (category === "all" || c.category === category) &&
      `${c.title} ${c.notes}`.toLowerCase().includes(search.toLowerCase()),
  );
  const toggleArchive = async (card: Card) => {
    try {
      await archive({ cardId: card._id, archived: !archived });
      toast.success(
        archived ? "Reference restored" : "Reference archived",
        !archived
          ? {
              action: {
                label: "Undo",
                onClick: () => {
                  void archive({ cardId: card._id, archived: false }).catch(
                    (e) => toast.error(firstErrorLine(e)),
                  );
                },
              },
            }
          : undefined,
      );
    } catch (e) {
      toast.error(firstErrorLine(e));
    }
  };

  return (
    <PageShell width="sheet">
      <PageHeader
        title="Reference board"
        favoriteLabel="Reference board"
        description="A shared visual language for the film. Collect artwork, direction, sources, and color palettes."
        actions={
          canCreate && (
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus /> Add reference
            </Button>
          )
        }
      />
      <div className="editorial-banner mb-6 flex min-h-44 flex-wrap items-center justify-between gap-4 p-6">
        <img
          src="/brand/creative-workbench-v1.jpg"
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-black/70 sm:bg-transparent sm:bg-gradient-to-r sm:from-black/90 sm:via-black/75 sm:to-black/25" />
        <div className="relative flex max-w-xl items-center gap-4">
          <Palette className="hidden size-8 shrink-0 text-white/75 sm:block" />
          <div>
            <p className="font-display text-2xl font-semibold text-white">
              Make the vision tangible.
            </p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-white/75">
              From the first mood to the final lighting cue. Shared with
              everyone in this production.
            </p>
          </div>
        </div>
        <Link
          href={`/p/${id}/files`}
          className="relative inline-flex items-center gap-2 rounded-lg border border-white/30 bg-black/30 px-3 py-2 text-sm text-white hover:bg-black/50"
        >
          Open asset library <ArrowUpRight className="size-4" />
        </Link>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-label="Reference category"
        >
          {(["all", ...Object.keys(CATEGORIES)] as (Category | "all")[]).map(
            (key) => (
              <Button
                key={key}
                size="sm"
                variant={category === key ? "secondary" : "ghost"}
                aria-pressed={category === key}
                onClick={() => setCategory(key)}
              >
                {key === "all" ? "All references" : CATEGORIES[key]}
              </Button>
            ),
          )}
        </div>
        <div className="relative sm:ml-auto">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            aria-label="Search references"
            placeholder="Search references…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={archived}
          onClick={() => setArchived(!archived)}
        >
          <Archive /> {archived ? "Show active" : "Archived"}
        </Button>
      </div>
      {cards === undefined ? (
        <Skeleton className="h-80" />
      ) : cards.length === 0 ? (
        <EmptyState
          icon={<Palette />}
          title={
            data?.cards.length
              ? "No references match your filters."
              : archived
                ? "No archived references."
                : "Every film starts with a point of view."
          }
          description={
            archived
              ? "Archived references can be restored here."
              : "Pin an image from your production, add a palette, or write a creative direction note."
          }
        >
          {canCreate && !archived && (
            <Button variant="outline" onClick={() => setEditing("new")}>
              <Plus /> Add your first reference
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {cards.map((card) => (
            <article
              key={card._id}
              className="overflow-hidden rounded-xl border bg-card"
              aria-label={card.title}
            >
              {card.asset ? (
                <a
                  href={card.asset.fileUrl ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open image: ${card.title}`}
                >
                  <ShotFrame
                    src={card.asset.thumbUrl ?? card.asset.fileUrl}
                    code={card.title}
                    alt={card.title}
                    framed={false}
                  />
                </a>
              ) : (
                <div className="flex min-h-32 flex-col justify-center bg-muted/40 p-6">
                  <span className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-tape">
                    Creative direction
                  </span>
                  <p className="font-display text-xl leading-snug">
                    {card.title}
                  </p>
                </div>
              )}
              {card.colors.length > 0 && (
                <div className="flex h-8" aria-label="Color palette">
                  {card.colors.map((color, i) => (
                    <button
                      key={i}
                      title={`Copy ${color}`}
                      aria-label={`Copy color ${color}`}
                      style={{ backgroundColor: color }}
                      className="flex-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(color)
                          .then(() => toast.success(`${color} copied`))
                          .catch(() => toast.error("Could not copy color"));
                      }}
                    />
                  ))}
                </div>
              )}
              <div className="p-4">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {CATEGORIES[card.category]}
                </p>
                {card.asset && (
                  <h2 className="font-display text-lg font-medium">
                    {card.title}
                  </h2>
                )}
                {card.notes && (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                    {card.notes}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {card.sourceUrl && (
                    <a
                      href={card.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Source / credit <ArrowUpRight className="size-3" />
                    </a>
                  )}
                  {canCreate && (editor || card.createdBy === viewer?._id) && (
                    <div className="ml-auto flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Edit ${card.title}`}
                        onClick={() => setEditing(card)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`${archived ? "Restore" : "Archive"} ${card.title}`}
                        onClick={() => void toggleArchive(card)}
                      >
                        {archived ? <RotateCcw /> : <Archive />}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {data?.capped && (
        <p className="mt-4 text-sm text-muted-foreground">
          Showing the newest 300 references. Archive older references to make
          room.
        </p>
      )}
      {editing !== null && (
        <ReferenceDialog
          productionId={productionId}
          card={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </PageShell>
  );
}

function ReferenceDialog({
  productionId,
  card,
  onClose,
}: {
  productionId: Id<"productions">;
  card?: Card;
  onClose: () => void;
}) {
  const save = useMutation(api.references.save);
  const assets = useQuery(api.assets.listForProduction, { productionId });
  const [title, setTitle] = useState(card?.title ?? "");
  const [notes, setNotes] = useState(card?.notes ?? "");
  const [category, setCategory] = useState<Category>(card?.category ?? "look");
  const [assetId, setAssetId] = useState(card?.assetId ?? "");
  const [source, setSource] = useState(card?.sourceUrl ?? "");
  const [colors, setColors] = useState(card?.colors.join(", ") ?? "");
  const [busy, setBusy] = useState(false);
  const [imageSearch, setImageSearch] = useState("");
  const [error, setError] = useState("");
  const images = assets?.filter(
    (a) => a.mimeType?.startsWith("image/") && (a.thumbUrl || a.fileUrl),
  );
  const visibleImages = images?.filter((a) =>
    a.name.toLowerCase().includes(imageSearch.toLowerCase()),
  );
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await save({
        productionId,
        cardId: card?._id,
        title,
        notes,
        category,
        assetId: assetId ? (assetId as Id<"assets">) : undefined,
        sourceUrl: source || undefined,
        colors: colors.split(/[,\s]+/).filter(Boolean),
      });
      toast.success(card ? "Reference updated" : "Reference added");
      onClose();
    } catch (e) {
      setError(firstErrorLine(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{card ? "Edit reference" : "Add reference"}</DialogTitle>
          <DialogDescription>
            Use your production's artwork or create a direction card. Keep
            source credits with the reference.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="reference-title">Title</Label>
              <Input
                id="reference-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={120}
                placeholder="Dawn exterior · cold blue, warm windows"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reference-category">Department / category</Label>
              <select
                id="reference-category"
                className="native-select"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
              >
                {Object.entries(CATEGORIES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Image from the production library</Label>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setAssetId("")}
              >
                Text only
              </Button>
            </div>
            <Input
              aria-label="Find a reference image"
              value={imageSearch}
              onChange={(e) => setImageSearch(e.target.value)}
              placeholder="Find an image by filename…"
            />
            {assets === undefined ? (
              <Skeleton className="h-20" />
            ) : !images?.length ? (
              <p className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                <ImagePlus className="size-5 shrink-0" /> Upload artwork to a
                shot or character first; its images will appear here. You can
                save a text or palette reference now.
              </p>
            ) : (
              <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto">
                {visibleImages?.map((asset) => (
                  <button
                    type="button"
                    key={asset._id}
                    aria-label={`Select ${asset.name}`}
                    aria-pressed={assetId === asset._id}
                    onClick={() => setAssetId(asset._id)}
                    className={cn(
                      "overflow-hidden rounded-md border-2 text-left",
                      assetId === asset._id
                        ? "border-tape"
                        : "border-transparent",
                    )}
                  >
                    <ShotFrame
                      src={asset.thumbUrl ?? asset.fileUrl}
                      code={asset.name}
                      framed={false}
                    />
                    <p className="truncate p-1 text-[10px]">{asset.name}</p>
                  </button>
                ))}
              </div>
            )}
            {assets && assets.length >= 750 && (
              <p className="text-xs text-muted-foreground">
                Newest 750 library assets shown.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reference-notes">Creative direction</Label>
            <Textarea
              id="reference-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={4000}
              rows={3}
              placeholder="What should the team take from this reference?"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reference-colors">
              Palette · up to 6 hex colors
            </Label>
            <Input
              id="reference-colors"
              value={colors}
              onChange={(e) => setColors(e.target.value)}
              placeholder="#172a3a, #a6b5ba, #e4b378"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reference-source">Source / credit URL</Label>
            <Input
              id="reference-source"
              type="url"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              maxLength={2000}
              placeholder="https://…"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !title.trim()}>
              {busy ? "Saving…" : "Save reference"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
