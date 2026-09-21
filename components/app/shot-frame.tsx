import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ShotStatusKey } from "@/convex/lib/domain";
import { STATUS_VAR } from "./status-pill";

/**
 * Every frame slot shows a frame (spec §9.2, extended v1.2).
 *
 * Before this component the same "no image yet" state was drawn five
 * different ways — a centred mono code (shots grid), nothing at all (board
 * card), an ImageIcon on flat muted (review queue, options tab) and a Film
 * icon (filmstrip). A grey hole reads as a broken image; unexposed film reads
 * as "this shot has not been shot yet", which is the truth. So the empty state
 * is drawn as raw stock: sprocket perforations, viewfinder ticks and a tint
 * carried from the shot's own status, seeded by the code so a grid of pending
 * shots varies instead of tiling.
 */

/** Stable hash — one shot always gets the same fill, across renders and users. */
function seedOf(code: string): number {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (Math.imul(h, 31) + code.charCodeAt(i)) | 0;
  return Math.abs(h);
}

type FrameSize = "sm" | "md" | "lg";

/** Perf count per size — enough to read as film, few enough to stay quiet. */
const PERFS: Record<FrameSize, number> = { sm: 6, md: 12, lg: 16 };

const LABEL_CLASSES: Record<FrameSize, string> = {
  sm: "text-[9px]",
  md: "text-[11px]",
  lg: "text-sm",
};

/** Sprocket strip along one edge of the stock. */
function Perforations({ count, className }: { count: number; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "absolute inset-x-0 flex h-[11%] min-h-[5px] items-center justify-around px-[3%]",
        className,
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="h-[52%] w-[2.2%] min-w-[2px] rounded-[1px] bg-foreground/[0.09]"
        />
      ))}
    </div>
  );
}

/** Viewfinder corner ticks — the frame is composed, just not exposed. */
function FramingTicks() {
  const base = "absolute size-2.5 border-foreground/15";
  return (
    <div aria-hidden className="absolute inset-[9%]">
      <span className={cn(base, "left-0 top-0 border-l border-t")} />
      <span className={cn(base, "right-0 top-0 border-r border-t")} />
      <span className={cn(base, "bottom-0 left-0 border-b border-l")} />
      <span className={cn(base, "bottom-0 right-0 border-b border-r")} />
    </div>
  );
}

/**
 * The unexposed-stock fill. Exported for slots that are not a whole frame
 * (e.g. a compare pane that sizes itself).
 */
export function SlateFill({
  code,
  status,
  size = "md",
  label,
  /** Showy: heavier grain and a wider bloom. For posters, not for the sheet. */
  poster = false,
  className,
}: {
  /** Seeds the fill. Not rendered — see `label`. */
  code: string;
  status?: ShotStatusKey;
  size?: FrameSize;
  /**
   * Text to print in the middle. Left unset almost everywhere: a slate strip
   * sits directly above nearly every frame and already names the shot, so
   * printing the code inside the frame said it twice — once as chrome, once
   * as texture — and made every getByText(code) ambiguous.
   */
  label?: string;
  poster?: boolean;
  className?: string;
}) {
  const seed = seedOf(code);
  // 5 fixed angles rather than a free rotation: a wall of cards should feel
  // varied, not noisy.
  const angle = 115 + (seed % 5) * 25;
  const tint = status ? STATUS_VAR[status] : "var(--color-chart-5)";

  // A gradient MESH rather than one sweep: two blooms at seeded positions
  // over a base wash. Deterministic, so a shot's fill never changes under
  // someone mid-review, and distinct enough that a sheet of not-yet-shot
  // frames reads as a set of different shots rather than one tile repeated.
  const bx = 18 + (seed % 7) * 9;
  const by = 20 + ((seed >> 3) % 5) * 12;
  const cx = 60 + ((seed >> 5) % 6) * 6;
  const cy = 55 + ((seed >> 7) % 4) * 10;

  const style = {
    "--halo-x": `${bx}%`,
    "--halo-y": `${by}%`,
    "--halo-tint": "var(--color-tape)",
    backgroundImage: [
      `radial-gradient(40% 50% at ${bx}% ${by}%, color-mix(in oklab, ${tint} ${poster ? 42 : 24}%, transparent), transparent 70%)`,
      `radial-gradient(35% 45% at ${cx}% ${cy}%, color-mix(in oklab, var(--color-chart-1) ${poster ? 30 : 16}%, transparent), transparent 72%)`,
      `linear-gradient(${angle}deg,
        color-mix(in oklab, ${tint} 16%, var(--muted)) 0%,
        var(--muted) 52%,
        color-mix(in oklab, ${tint} 7%, var(--muted)) 100%)`,
    ].join(", "),
  } as CSSProperties;

  return (
    <div
      className={cn(
        "relative size-full overflow-hidden bg-muted film-grain",
        poster && "film-grain-strong halation",
        className,
      )}
      style={style}
    >
      <Perforations count={PERFS[size]} className="top-0" />
      <Perforations count={PERFS[size]} className="bottom-0" />
      {size !== "sm" && <FramingTicks />}
      {label && (
        <div className="absolute inset-0 flex items-center justify-center px-2 text-center">
          <span
            className={cn(
              "max-w-full truncate font-mono tracking-tight text-foreground/55",
              LABEL_CLASSES[size],
            )}
          >
            {label}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * A 16:9 frame: the image when there is one, unexposed stock when there is
 * not. `overlay` rides on top of either (version badge, play affordance).
 */
export function ShotFrame({
  code,
  src,
  alt,
  status,
  size = "md",
  label,
  video = false,
  overlay,
  framed = true,
  poster = false,
  className,
}: {
  code: string;
  src?: string | null;
  alt?: string;
  status?: ShotStatusKey;
  size?: FrameSize;
  /** Printed in the middle of an empty frame; see SlateFill. */
  label?: string;
  video?: boolean;
  overlay?: ReactNode;
  /** The hairline + letterbox from .thumb-frame; off when the parent draws it. */
  framed?: boolean;
  /** Heavier treatment for hero-sized frames. See SlateFill. */
  poster?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden",
        framed && "thumb-frame",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt ?? code}
          loading="lazy"
          draggable={false}
          className={cn("size-full object-cover", video && "opacity-80")}
        />
      ) : (
        <SlateFill
          code={code}
          status={status}
          size={size}
          label={label}
          poster={poster}
        />
      )}
      {overlay}
    </div>
  );
}
