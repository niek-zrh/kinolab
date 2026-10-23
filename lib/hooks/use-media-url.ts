"use client";

import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type MediaAsset = {
  _id: Id<"assets">;
  provider: "gdrive" | "url" | "storage";
  mimeType?: string;
  fileUrl: string | null;
};

type Resolved = { url: string; expiresAt: number | null };

/** Grants outlive a pane: the same asset in the filmstrip, compare and rail. */
const grants = new Map<string, Resolved>();
/** Refresh a little before the grant actually runs out. */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

/** Drop a cached grant (the route rejected it, or a retry should re-mint). */
export function invalidateMediaUrl(assetId: string): void {
  grants.delete(assetId);
}

function isFresh(grant: Resolved | undefined): grant is Resolved {
  return (
    grant !== undefined &&
    (grant.expiresAt === null || grant.expiresAt - EXPIRY_MARGIN_MS > Date.now())
  );
}

/** Convex errors can be multiline — surface only the human line. */
function humanError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  const match = message.match(/Uncaught (?:[A-Za-z]*Error): ([^\n]+)/);
  return (match?.[1] ?? message.split("\n")[0]).trim() || "Couldn't load this file";
}

/**
 * The URL a <video> or <img> can load for an asset. Convex-storage files and
 * links resolve at once from the query result; a file that lives in Drive
 * needs a signed grant from drive.mediaUrl (see convex/lib/mediaToken.ts),
 * fetched once per asset and reused until it nears expiry.
 */
export function useMediaUrl(asset: MediaAsset | null | undefined): {
  url: string | null;
  loading: boolean;
  error: string | null;
  /** Forget the current grant and mint a new one (after the route rejected it). */
  refresh: () => void;
} {
  const mediaUrl = useAction(api.drive.mediaUrl);
  const direct = asset && asset.provider !== "gdrive" ? asset.fileUrl : null;
  const needsGrant = asset?.provider === "gdrive";
  const assetId = asset?._id;
  const cached = assetId !== undefined ? grants.get(assetId) : undefined;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    forAsset: string | undefined;
    url: string | null;
    error: string | null;
  }>({ forAsset: assetId, url: isFresh(cached) ? cached.url : null, error: null });

  useEffect(() => {
    if (!needsGrant || assetId === undefined) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A pane left open must re-mint before its grant lapses, not 401 on the
    // next seek: bump `attempt` just inside the margin.
    const armRefresh = (grant: Resolved) => {
      if (grant.expiresAt === null) return;
      const delay = Math.max(1000, grant.expiresAt - EXPIRY_MARGIN_MS - Date.now());
      timer = setTimeout(() => setAttempt((a) => a + 1), delay);
    };
    const have = grants.get(assetId);
    if (isFresh(have)) {
      setState({ forAsset: assetId, url: have.url, error: null });
      armRefresh(have);
    } else {
      setState({ forAsset: assetId, url: null, error: null });
      mediaUrl({ assetId })
        .then((resolved) => {
          grants.set(assetId, resolved);
          if (cancelled) return;
          setState({ forAsset: assetId, url: resolved.url, error: null });
          armRefresh(resolved);
        })
        .catch((e: unknown) => {
          if (!cancelled) setState({ forAsset: assetId, url: null, error: humanError(e) });
        });
    }
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [needsGrant, assetId, mediaUrl, attempt]);

  const refresh = () => {
    if (assetId !== undefined) invalidateMediaUrl(assetId);
    setAttempt((a) => a + 1);
  };

  if (!asset) return { url: null, loading: false, error: null, refresh };
  if (!needsGrant) return { url: direct, loading: false, error: null, refresh };
  // State from a previous asset must not leak into this pane for a frame.
  const current = state.forAsset === assetId ? state : { url: null, error: null };
  return {
    url: current.url,
    loading: current.url === null && current.error === null,
    error: current.error,
    refresh,
  };
}
