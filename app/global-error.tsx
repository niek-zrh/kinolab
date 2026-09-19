"use client";

import "./globals.css";

/**
 * Last resort: an error thrown by the root layout (fonts, providers, the Convex
 * client) replaces the document itself, so this boundary renders its own <html>
 * and <body>. Deliberately minimal — no providers, no Convex, no shared
 * components, because whatever broke may be exactly those. Everything
 * recoverable is handled by the boundaries inside app/(app).
 */

/**
 * The theme provider is gone with the layout, so replay what its pre-hydration
 * script does: read the per-device choice (`kinolab-theme`, see
 * components/app/theme-provider.tsx) and put the class on <html> before paint.
 * Anything unreadable — blocked storage, private window — means dark, the app
 * default.
 */
const THEME_SCRIPT = `(function(){var c="dark";try{var t=localStorage.getItem("kinolab-theme");if(t==="light")c="light";else if(t==="system")c=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}catch(e){}document.documentElement.classList.add(c);document.documentElement.style.colorScheme=c;})();`;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    // The brand font variables come from the root layout, which is gone here —
    // name a stack directly so the fallback screen isn't rendered in serif.
    <html
      lang="en"
      suppressHydrationWarning
      style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-base font-semibold">Kinolab stopped unexpectedly</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The page couldn&apos;t finish loading. Try again — if it keeps
            happening, reload Kinolab from the start.
          </p>
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-8 items-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
            >
              Try again
            </button>
            <a
              href="/"
              className="inline-flex h-8 items-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
            >
              Back to Kinolab
            </a>
          </div>
          {error.digest && (
            <p className="mt-4 font-mono text-[11px] text-muted-foreground/70">
              {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
