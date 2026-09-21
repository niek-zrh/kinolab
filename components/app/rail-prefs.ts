"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Rail preferences (v1.3) — order, hidden items, collapsed state.
 *
 * Per device in localStorage, like the theme, the shots view and favourites.
 * Stored by href rather than index so adding or removing a destination in a
 * later release cannot scramble someone's saved order: unknown hrefs are
 * simply ignored and new ones appear in their default position.
 */

const KEY = "kinolab.rail";
const EVENT = "kinolab:rail";

export type RailPrefs = {
  /** Hrefs in the order the person arranged them; partial is fine. */
  order: string[];
  hidden: string[];
  collapsed: boolean;
};

const DEFAULTS: RailPrefs = { order: [], hidden: [], collapsed: false };

function read(): RailPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULTS;
    const p = parsed as Partial<RailPrefs>;
    return {
      order: Array.isArray(p.order)
        ? p.order.filter((h): h is string => typeof h === "string")
        : [],
      hidden: Array.isArray(p.hidden)
        ? p.hidden.filter((h): h is string => typeof h === "string")
        : [],
      collapsed: p.collapsed === true,
    };
  } catch {
    return DEFAULTS;
  }
}

function write(next: RailPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Blocked storage: the rail still works, it just will not remember.
  }
  window.dispatchEvent(new Event(EVENT));
}

let cache: RailPrefs | null = null;

function getSnapshot(): RailPrefs {
  if (cache === null) cache = read();
  return cache;
}

function subscribe(onChange: () => void): () => void {
  const handler = () => {
    cache = read();
    onChange();
  };
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function useRailPrefs() {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULTS);

  const setCollapsed = useCallback((collapsed: boolean) => {
    write({ ...read(), collapsed });
  }, []);

  const toggleHidden = useCallback((href: string) => {
    const current = read();
    const hidden = current.hidden.includes(href)
      ? current.hidden.filter((h) => h !== href)
      : [...current.hidden, href];
    write({ ...current, hidden });
  }, []);

  /** Move `href` so it sits where `beforeHref` was; null drops it at the end. */
  const move = useCallback((href: string, beforeHref: string | null, all: string[]) => {
    const current = read();
    // Start from the person's order, topped up with anything they have never
    // arranged, so a partial saved order still produces a full list.
    const base = [
      ...current.order.filter((h) => all.includes(h)),
      ...all.filter((h) => !current.order.includes(h)),
    ];
    const without = base.filter((h) => h !== href);
    const at = beforeHref === null ? without.length : without.indexOf(beforeHref);
    if (at < 0) return;
    without.splice(at, 0, href);
    write({ ...current, order: without });
  }, []);

  const reset = useCallback(() => write(DEFAULTS), []);

  /** Apply the saved order to a default list, keeping unknown items in place. */
  const ordered = useCallback(
    <T extends { href: string }>(items: T[]): T[] => {
      if (prefs.order.length === 0) return items;
      const rank = new Map(prefs.order.map((h, i) => [h, i]));
      return [...items].sort((a, b) => {
        const ra = rank.get(a.href);
        const rb = rank.get(b.href);
        // Anything the person has not arranged keeps its default position,
        // after everything they have.
        if (ra === undefined && rb === undefined) return 0;
        if (ra === undefined) return 1;
        if (rb === undefined) return -1;
        return ra - rb;
      });
    },
    [prefs.order],
  );

  return { prefs, setCollapsed, toggleHidden, move, reset, ordered };
}
