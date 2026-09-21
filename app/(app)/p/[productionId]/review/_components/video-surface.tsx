"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Film } from "lucide-react";
import type { VersionCard } from "./review-utils";
import { formatReviewTime } from "@/lib/timecode";

export type SeekRequest = {
  versionId: string;
  seconds: number;
  sequence: number;
};

/** Native, accessible playback. Drive web pages are never used as media URLs. */
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
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState(0);
  const url =
    version.asset?.provider === "storage" ? version.asset.fileUrl : null;
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
            ref={video}
            src={url}
            poster={version.asset?.thumbUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            aria-label={`Video version ${version.index}`}
            className="min-h-0 w-full flex-1 object-contain"
            onPlay={onFocus}
            onLoadedMetadata={seek}
            onError={() => setFailed(true)}
            onTimeUpdate={(e) => {
              const time = e.currentTarget.currentTime;
              setCurrent(time);
              onTimeChange(version._id, time);
            }}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-2 font-mono text-[10px] text-white/65">
            <span>{formatReviewTime(current)}</span>
            <span>Native playback · timestamped notes</span>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <Film className="size-8 text-white/50" />
          <p className="text-sm text-white/75">
            {failed
              ? "This browser cannot play this file. Upload an H.264 MP4 review copy or open the original."
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
