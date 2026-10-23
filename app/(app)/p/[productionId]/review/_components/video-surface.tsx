"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Film, Loader2 } from "lucide-react";
import type { VersionCard } from "./review-utils";
import { formatReviewTime } from "@/lib/timecode";
import { useMediaUrl } from "@/lib/hooks/use-media-url";

export type SeekRequest = {
  versionId: string;
  seconds: number;
  sequence: number;
};

const CODEC_MESSAGE =
  "This browser cannot play this file. Upload an H.264 MP4 review copy or open the original.";
const DRIVE_MESSAGE =
  "Streaming from Drive failed. Reload the room to retry; if it keeps failing, open the file in Drive or ask the hub owner to reconnect Google Drive in Settings.";

/**
 * Native, accessible playback. Drive web pages are never used as media URLs:
 * a file that lives in Drive streams through Kinolab's media route instead
 * (useMediaUrl), so the same <video>, timestamps and seeking apply.
 */
export function VideoSurface({
  version,
  focused,
  onFocus,
  onTimeChange,
  seekRequest,
}: {
  version: VersionCard;
  focused: boolean;
  onFocus: () => void;
  onTimeChange: (versionId: string, seconds: number) => void;
  seekRequest: SeekRequest | null;
}) {
  const video = useRef<HTMLVideoElement>(null);
  // null = fine; a string is what to tell the reviewer instead of a player.
  const [failed, setFailed] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const media = useMediaUrl(version.asset);
  const url = media.url;
  const fromDrive = version.asset?.provider === "gdrive";
  // One automatic re-mint per pane when the route rejects a grant.
  const remintedFor = useRef<string | null>(null);
  // A new source gets a fresh chance; "failed" belongs to one URL.
  useEffect(() => setFailed(null), [url]);

  /**
   * A <video> reports every failure as "source not supported", so for a
   * Drive-relayed source ask the route itself (its error bodies are CORS-
   * readable): an expired grant is re-minted once, any other refusal is
   * shown as the route words it, and only a served file is a codec problem.
   */
  const explainFailure = async () => {
    if (!fromDrive || !url) {
      setFailed(CODEC_MESSAGE);
      return;
    }
    try {
      const res = await fetch(url, { headers: { Range: "bytes=0-0" } });
      if (res.ok) {
        setFailed(CODEC_MESSAGE);
        return;
      }
      if (res.status === 401 && remintedFor.current !== url) {
        remintedFor.current = url;
        media.refresh();
        return;
      }
      const text = (await res.text().catch(() => "")).trim();
      setFailed(text || DRIVE_MESSAGE);
    } catch {
      setFailed(DRIVE_MESSAGE);
    }
  };
  const seek = () => {
    const el = video.current;
    if (
      !el ||
      !seekRequest ||
      seekRequest.versionId !== version._id ||
      !Number.isFinite(el.duration)
    )
      return;
    el.pause();
    el.currentTime = Math.min(seekRequest.seconds, el.duration);
  };
  useEffect(() => {
    seek();
  }, [seekRequest]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!focused) video.current?.pause();
  }, [focused]);
  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col justify-center bg-black"
      onClick={onFocus}
    >
      {url && !failed ? (
        <>
          <video
            key={url}
            ref={video}
            src={url}
            poster={version.asset?.thumbUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            aria-label={`Video version ${version.index}`}
            className="min-h-0 w-full flex-1 object-contain"
            onPlay={onFocus}
            onLoadedMetadata={(e) => {
              // Report a playhead as soon as there is one, so the rail can
              // offer "Attach 0:00" only for a video that actually loaded.
              onTimeChange(version._id, e.currentTarget.currentTime);
              seek();
            }}
            onError={() => void explainFailure()}
            onTimeUpdate={(e) => {
              const time = e.currentTarget.currentTime;
              setCurrent(time);
              onTimeChange(version._id, time);
            }}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-2 font-mono text-[10px] text-white/65">
            <span>{formatReviewTime(current)}</span>
            <span>
              {fromDrive ? "Streamed from Drive" : "Native playback"} ·
              timestamped notes
            </span>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          {media.loading ? (
            <Loader2 className="size-8 animate-spin text-white/50" />
          ) : (
            <Film className="size-8 text-white/50" />
          )}
          <p className="text-sm text-white/75">
            {failed !== null
              ? failed
              : media.loading
                ? "Loading from Drive…"
                : media.error
                  ? `${media.error} Open it in Drive instead.`
                  : "This video lives in Drive. Open it there, or upload an MP4 review copy for playback here."}
          </p>
        </div>
      )}
      {version.asset?.fileUrl && (
        <a
          href={version.asset.fileUrl}
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center justify-center gap-1 border-t border-white/10 py-2 text-xs text-white/60 hover:text-white"
        >
          <ExternalLink className="size-3" /> Open original
        </a>
      )}
    </div>
  );
}
