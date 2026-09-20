"use client";

import type { Dispatch, SetStateAction } from "react";
import { ExternalLink, Minus, Plus } from "lucide-react";
import {
  IDENTITY_TRANSFORM,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomAboutCentre,
  type CanvasTransform,
} from "./compare-canvas";
import { cn } from "@/lib/utils";

/** One press of − or +. Matches the wheel's feel without overshooting. */
const STEP = 1.25;

/**
 * Canvas zoom HUD (v1.2) — the readout every image tool puts in a corner.
 *
 * The canvas has had wheel-zoom, drag-pan and reset-on-0 since v1, but no way
 * to see where the zoom was or to get back to a known state except by feel.
 * An artist comparing four generations needs the number, not the feel.
 *
 * The percentage is relative to FIT, not to the image's own pixels: the
 * transform is shared across every pane so that anatomy lines up between
 * options, and with 2–4 images of different sizes on screen there is no
 * single "100% of natural size" to show. 100% here means "fitted".
 */
export function ZoomHud({
  transform,
  setTransform,
  originalUrl,
}: {
  transform: CanvasTransform;
  setTransform: Dispatch<SetStateAction<CanvasTransform>>;
  /** Full-size file of the focused version, when it has one. */
  originalUrl?: string | null;
}) {
  const pct = Math.round(transform.scale * 100);
  const atFit =
    transform.scale === 1 && transform.tx === 0 && transform.ty === 0;

  // The canvas draws the cached thumbnail, not the original, so past roughly
  // this point the pixels are interpolated and detail judgements stop being
  // trustworthy. Say so rather than letting someone rule on a soft hand.
  const pastPreview = transform.scale > 1.75;

  const button =
    "flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-30 flex flex-col items-start gap-1.5">
      {pastPreview && originalUrl && (
        <a
          href={originalUrl}
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-border bg-background/90 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          <ExternalLink className="size-3" />
          Preview resolution — open the original
        </a>
      )}
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-md border border-border bg-background/90 p-0.5 backdrop-blur">
        <button
          type="button"
          className={button}
          title="Zoom out (−)"
          disabled={transform.scale <= ZOOM_MIN}
          onClick={() => setTransform((t) => zoomAboutCentre(t, 1 / STEP))}
        >
          <Minus className="size-3.5" />
          <span className="sr-only">Zoom out</span>
        </button>
        <span
          className="min-w-12 text-center font-mono text-[11px] tabular-nums text-foreground"
          title="Zoom, relative to fit"
        >
          {pct}%
        </span>
        <button
          type="button"
          className={button}
          title="Zoom in (+)"
          disabled={transform.scale >= ZOOM_MAX}
          onClick={() => setTransform((t) => zoomAboutCentre(t, STEP))}
        >
          <Plus className="size-3.5" />
          <span className="sr-only">Zoom in</span>
        </button>
        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
        <button
          type="button"
          title="Fit to pane (0)"
          disabled={atFit}
          onClick={() => setTransform(IDENTITY_TRANSFORM)}
          className={cn(
            "rounded px-1.5 py-0.5 text-[11px] transition-colors",
            atFit
              ? "text-muted-foreground/50"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          Fit
        </button>
      </div>
    </div>
  );
}
