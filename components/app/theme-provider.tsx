"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Theme plumbing (spec v2 §(a)). One next-themes provider for the whole
 * document — `class` attribute on <html>, default dark, System allowed, the
 * preference kept per device under `kinolab-theme`. next-themes' inline script
 * applies the stored class before first paint, so there is no flash.
 *
 * On top of it, a "hold": a surface that must stay dark regardless of the
 * preference (the Review Room — colour judgement on a neutral surround, spec
 * §9) calls `useForcedDark()` while mounted. The hold is passed to next-themes
 * as `forcedTheme`, which swaps the class on <html> itself, so every portal
 * (dialogs, menus, toasts) follows without per-dialog `dark` classes. When the
 * last holder unmounts the chosen theme comes back.
 */

export const THEME_STORAGE_KEY = "kinolab-theme";

/** The three choices, in the order every control shows them. */
export const THEME_OPTIONS = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
] as const;

export type ThemeChoice = (typeof THEME_OPTIONS)[number]["value"];

type HoldContextValue = {
  /** Registers a dark hold; returns the release for the effect cleanup. */
  hold: () => () => void;
};

const HoldContext = createContext<HoldContextValue>({ hold: () => () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Counted, not boolean: the room and anything else that wants the hold can
  // overlap without one release undoing the other.
  const [holders, setHolders] = useState(0);
  const hold = useCallback(() => {
    setHolders((n) => n + 1);
    return () => setHolders((n) => n - 1);
  }, []);
  const forced = holders > 0 ? "dark" : undefined;

  return (
    <HoldContext.Provider value={{ hold }}>
      <NextThemesProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        storageKey={THEME_STORAGE_KEY}
        disableTransitionOnChange
        forcedTheme={forced}
      >
        {children}
      </NextThemesProvider>
    </HoldContext.Provider>
  );
}

/**
 * Keep the document dark while the calling component is mounted. The
 * preference itself is untouched — `useTheme().theme` still reports it and the
 * Appearance controls still write it; only the applied class is held.
 */
export function useForcedDark() {
  const { hold } = useContext(HoldContext);
  useEffect(() => hold(), [hold]);
}
