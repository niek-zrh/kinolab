"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  MAX_BULK_ELEMENTS,
  SLOT_LABELS,
  SLOTS_BY_KIND,
  type ElementSlot,
} from "@/convex/lib/domain";

/**
 * Shared shapes and helpers for the Characters pages (spec v2 item b). A
 * character is an `elements` row plus one "slot shot" per phase (Concept,
 * Animation); the list query returns each phase enriched as a SlotView.
 */

export type CharacterRow = (typeof api.elements.list._returnType)[number];
export type SlotView = CharacterRow["slots"][number];

/** The one element kind with a UI in v1.1 (CONTRACTS §elements.ts). */
export const KIND = "character" as const;

/** Phases in display order — the columns of the Heroes sheet. */
export const CHARACTER_SLOTS: readonly ElementSlot[] = SLOTS_BY_KIND.character;

export function slotLabel(slot: ElementSlot): string {
  return SLOT_LABELS[slot];
}

export function slotOf(
  row: { slots: SlotView[] },
  slot: ElementSlot,
): SlotView | undefined {
  return row.slots.find((s) => s.slot === slot);
}

/**
 * The "Final" column: the last phase with a picked file (Animation over
 * Concept), like the sheet's approved still.
 */
export function finalSlot(row: { slots: SlotView[] }): SlotView | undefined {
  for (let i = row.slots.length - 1; i >= 0; i -= 1) {
    if (row.slots[i].pickedFileUrl !== null) return row.slots[i];
  }
  return undefined;
}

/**
 * The phase the row menu's "Open in Review Room" opens: the first one with
 * options to compare, else the first phase (the room is empty either way).
 */
export function reviewSlot(row: { slots: SlotView[] }): SlotView | undefined {
  return row.slots.find((s) => s.versionsCount > 0) ?? row.slots[0];
}

export function charactersHref(productionId: Id<"productions">): string {
  return `/p/${productionId}/characters`;
}

export function characterHref(
  productionId: Id<"productions">,
  elementId: Id<"elements">,
  slot?: ElementSlot,
): string {
  const base = `${charactersHref(productionId)}/${elementId}`;
  return slot === undefined ? base : `${base}?slot=${slot}`;
}

export function reviewRoomHref(
  productionId: Id<"productions">,
  shotId: Id<"shots">,
): string {
  return `/p/${productionId}/review/${shotId}`;
}

export function optionsLabel(count: number): string {
  return `${count} ${count === 1 ? "option" : "options"}`;
}

/** elements.bulkCreate takes at most this many names per call. */
export const MAX_PASTE_NAMES = MAX_BULK_ELEMENTS;

/**
 * Pasted sheet cells → names: one per line (commas and semicolons separate
 * too), trimmed, blanks dropped, exact repeats collapsed. Names keep their
 * inner spaces ("Papa Tupik"); codes are derived server-side.
 */
export function parseNames(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\n\r,;]+/)
        .map((name) => name.trim())
        .filter((name) => name.length > 0),
    ),
  );
}
