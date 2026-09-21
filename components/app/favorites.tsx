"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Favourites (v1.3) — up to five pages pinned to the top bar.
 *
 * Any screen with a page header can be starred, including a filtered one
 * (`/shots?status=rework` is a different favourite from `/shots`), so people
 * can park the two or three views they actually live in.
 *
 * Stored per device in localStorage, like the theme and the shots view: it is
 * a personal convenience, not production data, and keeping it out of Convex
 * means no schema, no migration and no sync to reason about. The trade is
 * that favourites do not follow you to another machine.
 */

const KEY = "kinolab.favorites";
const EVENT = "kinolab:favorites";

export const MAX_FAVORITES = 5;

export type Favorite = { href: string; label: string };

function read(): Favorite[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (f): f is Favorite =>
          typeof f === "object" &&
          f !== null &&
          typeof (f as Favorite).href === "string" &&
          typeof (f as Favorite).label === "string",
      )
      .slice(0, MAX_FAVORITES);
  } catch {
    // Private windows and blocked site data throw on access; a missing
    // favourites list must never take the page down with it.
    return [];
  }
}

function write(next: Favorite[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next.slice(0, MAX_FAVORITES)));
  } catch {
    // Nothing to do — the bar simply will not persist this session.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Cached so getSnapshot returns a stable reference between changes. */
let cache: Favorite[] | null = null;

function getSnapshot(): Favorite[] {
  if (cache === null) cache = read();
  return cache;
}

function subscribe(onChange: () => void): () => void {
  const handler = () => {
    cache = read();
    onChange();
  };
  window.addEventListener(EVENT, handler);
  // `storage` fires when another tab edits the same key.
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

/** Server and first client render agree on empty, then the store hydrates. */
const EMPTY: Favorite[] = [];

export function useFavorites() {
  const favorites = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => EMPTY,
  );

  const isFavorite = useCallback(
    (href: string) => favorites.some((f) => f.href === href),
    [favorites],
  );

  const toggle = useCallback(
    (href: string, label: string) => {
      const current = read();
      const without = current.filter((f) => f.href !== href);
      if (without.length !== current.length) {
        write(without);
        return;
      }
      // Full: the oldest gives way, so starring never silently does nothing.
      write([...without, { href, label }].slice(-MAX_FAVORITES));
    },
    [],
  );

  const remove = useCallback((href: string) => {
    write(read().filter((f) => f.href !== href));
  }, []);

  return { favorites, isFavorite, toggle, remove };
}
