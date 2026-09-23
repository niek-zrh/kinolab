import type { Assistant } from "@/lib/assistant-roadmap";
import { cn } from "@/lib/utils";

/** Original, optically consistent 32px line symbols; decoration, never labels. */
export function WorkspaceGlyph({
  kind,
  className,
}: {
  kind: Assistant["glyph"] | "assist";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-8 shrink-0", className)}
    >
      {kind === "story" && (
        <>
          <rect x="3" y="6" width="26" height="20" rx="3" />
          <path d="M3 12h26M13 12v14M19 17h6m-6 4h4M6 9h1m3 0h1" />
          <path d="m6 22 2-4 3 4" />
        </>
      )}
      {kind === "look" && (
        <>
          <rect x="4" y="8" width="16" height="20" rx="3" />
          <rect
            x="12"
            y="4"
            width="16"
            height="20"
            rx="3"
            className="fill-card"
          />
          <circle cx="17" cy="10" r="1.5" />
          <path d="m13 20 5-5 4 3 5-6M8 13v9" />
        </>
      )}
      {kind === "character" && (
        <>
          <path d="M9 4H4v5m19-5h5v5M4 23v5h5m19-5v5h-5" />
          <circle cx="16" cy="12" r="4" />
          <path d="M8 25v-2a8 8 0 0 1 16 0v2M12 12h.1m7.9 0h.1" />
        </>
      )}
      {kind === "review" && (
        <>
          <rect x="3" y="5" width="26" height="18" rx="3" />
          <path d="m13 10 7 4-7 4V10m-4 17h14m-7-4v4" />
          <circle cx="26" cy="23" r="4" className="fill-card" />
          <path d="m24 23 1.4 1.4L28 22" />
        </>
      )}
      {kind === "production" && (
        <>
          <rect x="5" y="6" width="22" height="23" rx="3" />
          <path d="M10 3v6m12-6v6M5 13h22M10 18h5m-5 5h8" />
          <circle cx="23" cy="23" r="4" className="fill-card" />
          <path d="M23 21v2l1 1" />
        </>
      )}
      {kind === "delivery" && (
        <>
          <path d="m16 3 11 5v8c0 6-6 10-11 13C11 26 5 22 5 16V8l11-5Z" />
          <path d="m10 16 4 4 8-9" />
        </>
      )}
      {kind === "assist" && (
        <>
          <rect x="4" y="12" width="16" height="15" rx="3" />
          <path d="M10 8V6a2 2 0 0 1 2-2h13a3 3 0 0 1 3 3v13a2 2 0 0 1-2 2h-2" />
          <path d="m20 7 1.4 3.6L25 12l-3.6 1.4L20 17l-1.4-3.6L15 12l3.6-1.4L20 7Z" />
        </>
      )}
    </svg>
  );
}
