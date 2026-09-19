"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { THEME_OPTIONS, type ThemeChoice } from "./theme-provider";

/**
 * The two Appearance controls (spec v2 §(a) req. 8). Both read and write the
 * same next-themes state; the Settings card is the discoverable one, the
 * avatar menu the quick one. Per device, no server round-trip (see
 * theme-provider.tsx).
 */

const ICONS = { dark: Moon, light: Sun, system: Monitor } as const;

// Copy inline on purpose (lib/copy.ts is only partially used and off-limits
// for this change).
export const APPEARANCE_HELPER =
  "The Review Room is always dark for colour judgement.";

/**
 * next-themes cannot know the stored choice during server render, so the
 * first client render would disagree with the HTML. Render the controls
 * without a selection until mounted; the switch is one frame and invisible.
 */
function useMountedTheme() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const choice: ThemeChoice | undefined = mounted
    ? (theme as ThemeChoice | undefined)
    : undefined;
  return { choice, setTheme, resolvedTheme: mounted ? resolvedTheme : undefined };
}

/** Segmented Dark | Light | System for the Settings › Appearance card. */
export function AppearanceSegmented({ className }: { className?: string }) {
  const { choice, setTheme, resolvedTheme } = useMountedTheme();

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        role="radiogroup"
        aria-label="Appearance"
        className="inline-flex w-fit items-center gap-0.5 rounded-lg bg-muted p-0.5"
      >
        {THEME_OPTIONS.map((option) => {
          const Icon = ICONS[option.value];
          const checked = choice === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              data-theme-choice={option.value}
              onClick={() => setTheme(option.value)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors duration-120 outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                // Selected segment reads "raised" in both themes: paper card on
                // the muted track in light, a lifted input tint on ink (the
                // dark card is darker than the track and would look sunk).
                checked
                  ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/10 dark:bg-input/40 dark:ring-foreground/15"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {choice === "system" && resolvedTheme
          ? `Following your device — ${resolvedTheme} right now. `
          : ""}
        {APPEARANCE_HELPER}
      </p>
    </div>
  );
}

/**
 * The same three choices as radio items for the avatar menu. Rendered inside
 * an open DropdownMenuContent; wrap with separators at the call site.
 */
export function AppearanceMenuItems() {
  const { choice, setTheme } = useMountedTheme();

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>Appearance</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={choice ?? ""}
        onValueChange={(value) => {
          if (value) setTheme(String(value));
        }}
      >
        {THEME_OPTIONS.map((option) => {
          const Icon = ICONS[option.value];
          return (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              data-theme-choice={option.value}
            >
              <Icon className="size-4" aria-hidden />
              {option.label}
            </DropdownMenuRadioItem>
          );
        })}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}
