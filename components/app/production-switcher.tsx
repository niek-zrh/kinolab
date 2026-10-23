"use client";

import { useQuery } from "convex/react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Check, ChevronsUpDown, LayoutGrid, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { copy } from "@/lib/copy";
import { useStudio } from "./studio-context";

/**
 * Top-bar production switcher, beside the studio switcher. Switching keeps
 * the section you are in (Shots stays Shots); a page that only exists for
 * one production, like a single shot, lands on that section's list.
 */
export function ProductionSwitcher() {
  const { studioId, role } = useStudio();
  const productions = useQuery(
    api.productions.switcher,
    studioId ? { studioId } : "skip",
  );
  const params = useParams<{ productionId?: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const canManage = role === "owner" || role === "producer";

  const currentId = params.productionId;
  const current = productions?.find((p) => p._id === currentId);
  // /p/{id}/{section}/… → "section"; undefined on the overview.
  const section = currentId ? pathname.split("/")[3] : undefined;

  const go = (productionId: string) => {
    router.push(`/p/${productionId}${section ? `/${section}` : ""}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex min-w-0 shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-accent"
        aria-label={
          current ? `Switch production: ${current.name}` : "Switch production"
        }
      >
        {/* The list resolves a beat after the page: show a placeholder, not
            "All productions", while a production id is in the URL. Phones
            get the code alone — the full name is a tap away in the menu. */}
        {currentId && productions === undefined ? (
          <Skeleton className="h-4 w-24" />
        ) : current ? (
          <>
            <span className="font-mono text-xs text-muted-foreground">
              {current.code}
            </span>
            <span className="hidden max-w-44 truncate font-medium sm:inline">
              {current.name}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">All productions</span>
        )}
        <ChevronsUpDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Productions</DropdownMenuLabel>
          {productions === undefined ? (
            <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
          ) : productions.length === 0 ? (
            <DropdownMenuItem disabled>No productions yet</DropdownMenuItem>
          ) : (
            productions.map((p) => (
              <DropdownMenuItem key={p._id} onClick={() => go(p._id)}>
                <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">
                  {p.code}
                </span>
                <span className="flex-1 truncate">{p.name}</span>
                {p.status !== "active" && (
                  <span className="text-[10px] capitalize text-muted-foreground">
                    {p.status}
                  </span>
                )}
                {p._id === currentId && <Check className="size-4" />}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/")}>
          <LayoutGrid className="size-4" /> All productions
        </DropdownMenuItem>
        {canManage && (
          <DropdownMenuItem onClick={() => router.push("/new")}>
            <Plus className="size-4" /> {copy.actions.newProduction}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
