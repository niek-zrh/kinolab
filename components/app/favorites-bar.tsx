"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Star, X } from "lucide-react";
import { useFavorites } from "./favorites";
import { cn } from "@/lib/utils";

/**
 * The favourites strip in the top bar (v1.3): up to five pinned pages, one
 * click away from anywhere. Added with the star beside any page heading, so
 * a filtered view ("Shots · rework") can be pinned like any other.
 *
 * Renders nothing until something is pinned — an empty strip would just be
 * chrome, and the star teaches the feature where it is used.
 */
export function FavoritesBar() {
  const { favorites, remove } = useFavorites();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = searchParams.toString();
  const here = query ? `${pathname}?${query}` : pathname;

  return (
    <div
      aria-label="Favourites"
      className="ml-1 hidden min-w-0 items-center gap-0.5 rounded-lg border border-border/70 bg-muted/30 px-1.5 py-0.5 md:flex"
    >
      <Star className="mr-1 size-3 shrink-0 text-muted-foreground/60" aria-hidden />
      {/* The strip is always here, empty or not: a bar that appears only
          once you have used it cannot teach you that it exists. Empty, it
          says where pinned pages land. */}
      {favorites.length === 0 && (
        <span className="whitespace-nowrap px-1 py-1 text-xs text-muted-foreground/70">
          Star a page to pin it here
        </span>
      )}
      {favorites.map((favorite) => {
        const active = favorite.href === here;
        return (
          <span key={favorite.href} className="group/fav relative flex items-center">
            <Link
              href={favorite.href}
              title={favorite.href}
              className={cn(
                "max-w-32 truncate rounded-md py-1 pl-2 pr-5 text-xs transition-colors",
                active
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {favorite.label}
            </Link>
            <button
              type="button"
              onClick={() => remove(favorite.href)}
              aria-label={`Unpin ${favorite.label}`}
              title="Unpin"
              className="absolute right-0.5 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/fav:opacity-100"
            >
              <X className="size-3" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
