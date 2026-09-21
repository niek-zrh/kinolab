/** Elapsed time, not SMPTE: no frame-rate assumptions are made. */
export function formatReviewTime(seconds: number): string {
  const milliseconds = Math.round(
    Math.max(0, Number.isFinite(seconds) ? seconds : 0) * 1000,
  );
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds / 60_000) % 60;
  const secs = Math.floor(milliseconds / 1000) % 60;
  const ms = milliseconds % 1000;
  return `${hours ? String(hours).padStart(2, "0") + ":" : ""}${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}
