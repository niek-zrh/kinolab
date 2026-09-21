"use client";

import { cn } from "@/lib/utils";

/**
 * The backdrop (v1.6) — the one place a big cinematic visual costs nothing,
 * because there is no work on screen for it to compete with.
 *
 * Drawn in code: layered blooms, a slow anamorphic streak, a vignette and
 * film grain. Nothing to download, sharp at any size, correct in both themes,
 * and it cannot go stale the way a baked image does.
 *
 * If you would rather use a generated still, drop it at
 * `public/brand/sign-in.jpg` and pass `image="/brand/sign-in.jpg"` — the
 * treatment (grain, vignette, letterbox) stays, so a raw render still sits
 * inside the same frame language. See docs/BRAND-ASSETS.md.
 */
export function CinemaBackdrop({
  image,
  className,
}: {
  image?: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "film-grain film-grain-strong pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          className="size-full object-cover opacity-70"
        />
      ) : (
        <>
          {/* Three blooms at fixed positions — a lit set rather than a
              gradient: a warm key, a cold fill, a tape-orange practical. */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: [
                "radial-gradient(48% 55% at 18% 22%, color-mix(in oklab, var(--color-chart-1) 38%, transparent), transparent 70%)",
                "radial-gradient(40% 48% at 82% 30%, color-mix(in oklab, var(--color-tape) 30%, transparent), transparent 72%)",
                "radial-gradient(60% 70% at 50% 100%, color-mix(in oklab, var(--color-chart-3) 20%, transparent), transparent 75%)",
              ].join(", "),
            }}
          />
          {/* The anamorphic streak: one long, very soft horizontal flare. */}
          <div
            className="absolute left-0 right-0 top-[27%] h-0.5"
            style={{
              background:
                "linear-gradient(90deg, transparent, color-mix(in oklab, var(--color-chart-1) 75%, transparent) 28%, color-mix(in oklab, #ffffff 70%, transparent) 50%, color-mix(in oklab, var(--color-tape) 70%, transparent) 72%, transparent)",
              filter: "blur(10px)",
              opacity: 0.8,
            }}
          />
          {/* A second, tighter pass right on the streak: a flare has a hot
              core and a wide falloff, not one uniform smear. */}
          <div
            className="absolute left-[12%] right-[12%] top-[27%] h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, color-mix(in oklab, #ffffff 85%, transparent) 50%, transparent)",
              filter: "blur(2px)",
              opacity: 0.55,
            }}
          />
        </>
      )}

      {/* Vignette — keeps the centre readable whatever is behind it. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(75% 65% at 50% 45%, transparent, color-mix(in oklab, var(--color-background) 88%, transparent) 100%)",
        }}
      />
    </div>
  );
}
