"use client";

import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { Check, Loader2, UploadCloud, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { copy } from "@/lib/copy";

// Up to 20MB goes through Convex storage; bigger files go straight from the
// browser to the Drive hub (drive.beginLargeUpload). Mirrors
// DIRECT_UPLOAD_MIN_BYTES in convex/drive.ts.
const MAX_BYTES = 20 * 1024 * 1024;
const NEEDS_HUB =
  "Files over 20 MB are stored in Google Drive — an owner or producer needs to set up the Drive hub in Settings first.";

/** Drive's resumable protocol wants chunks in multiples of 256 KiB. */
const CHUNK_BYTES = 32 * 1024 * 1024;
/** Dropped connections per upload before giving up; each one resumes, not restarts. */
const CHUNK_RETRIES = 3;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Translate Google's error body on the direct PUT. Mirrors driveFailure in
 * convex/lib/google.ts, which only sees requests Convex makes — here the
 * browser talks to Drive itself, and a shared drive's pooled quota is never
 * pre-checked, so storageQuotaExceeded can still arrive at the very end.
 */
function describeDriveUploadError(status: number, body: string): string {
  let reasons: string[] = [];
  let message = "";
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; errors?: { reason?: string }[] };
    };
    reasons = (parsed.error?.errors ?? []).map((e) => e.reason ?? "");
    message = parsed.error?.message ?? "";
  } catch {
    // Not JSON — the status alone has to do.
  }
  if (reasons.includes("storageQuotaExceeded")) {
    return "The Google Drive behind this production's hub is out of storage — extend its storage first, then upload again.";
  }
  if (status === 401 || status === 403) {
    return "Google Drive refused the upload — reconnect the Drive hub in Settings and try again.";
  }
  if (status === 404 || status === 410) {
    return "The Drive upload session expired — drop the file again.";
  }
  return `Google Drive refused the upload (${status})${message ? `: ${message}` : ""}`;
}

type ChunkOutcome =
  | { kind: "done"; id: string }
  | { kind: "more"; next: number }
  | { kind: "retry"; detail: string }
  | { kind: "fail"; detail: string };

/** Byte after the last one Drive confirmed, from a 308's Range header. */
function nextByteFrom(range: string | null, fallback: number): number {
  const last = range ? Number(/-(\d+)$/.exec(range)?.[1]) : NaN;
  return Number.isFinite(last) ? last + 1 : fallback;
}

function readOutcome(xhr: XMLHttpRequest, chunkEnd: number): ChunkOutcome {
  if (xhr.status === 200 || xhr.status === 201) {
    try {
      const { id } = JSON.parse(xhr.responseText) as { id?: string };
      if (id) return { kind: "done", id };
    } catch {
      // handled below
    }
    return { kind: "retry", detail: "Google Drive did not return the new file" };
  }
  if (xhr.status === 308) {
    // No readable Range header = this chunk landed whole.
    return {
      kind: "more",
      next: nextByteFrom(xhr.getResponseHeader("Range"), chunkEnd + 1),
    };
  }
  if (xhr.status >= 500 || xhr.status === 0) {
    return { kind: "retry", detail: `Google Drive answered ${xhr.status || "nothing"}` };
  }
  return { kind: "fail", detail: describeDriveUploadError(xhr.status, xhr.responseText) };
}

function sendChunk(
  uploadUrl: string,
  file: File,
  start: number,
  onLoaded: (bytes: number) => void,
): Promise<ChunkOutcome> {
  const end = Math.min(start + CHUNK_BYTES, file.size) - 1;
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("Content-Range", `bytes ${start}-${end}/${file.size}`);
    xhr.upload.onprogress = (e) => onLoaded(start + e.loaded);
    xhr.onload = () => resolve(readOutcome(xhr, end));
    xhr.onerror = () =>
      resolve({
        kind: "retry",
        detail: "Couldn't reach Google Drive — check the connection and try again",
      });
    xhr.send(file.slice(start, end + 1));
  });
}

/** Ask Drive how much of the session it holds: an empty PUT whose Content-Range is `bytes` star-slash total. */
function queryUploadStatus(uploadUrl: string, total: number): Promise<ChunkOutcome> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Range", `bytes */${total}`);
    // Without a readable Range header the safe answer is "start over".
    xhr.onload = () => resolve(readOutcome(xhr, -1));
    xhr.onerror = () => resolve({ kind: "retry", detail: "Couldn't reach Google Drive" });
    xhr.send();
  });
}

/**
 * Streams a file to a Drive resumable-upload session in chunks and resolves
 * with the new Drive file id. A dropped connection resumes from the byte
 * Drive confirms rather than restarting a multi-GB upload from zero.
 */
async function putToDrive(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<string> {
  let start = 0;
  let failures = 0;
  for (;;) {
    const outcome = await sendChunk(uploadUrl, file, start, (loaded) =>
      onProgress(Math.min(99, Math.round((loaded / file.size) * 100))),
    );
    if (outcome.kind === "done") {
      onProgress(100);
      return outcome.id;
    }
    if (outcome.kind === "fail") throw new Error(outcome.detail);
    if (outcome.kind === "more") {
      start = outcome.next;
      failures = 0;
      continue;
    }
    failures += 1;
    if (failures > CHUNK_RETRIES) throw new Error(outcome.detail);
    await wait(1000 * 2 ** (failures - 1));
    const status = await queryUploadStatus(uploadUrl, file.size);
    if (status.kind === "done") {
      onProgress(100);
      return status.id;
    }
    if (status.kind === "fail") throw new Error(status.detail);
    if (status.kind === "more") start = status.next;
  }
}

/** A server-side refusal is final; a dropped connection is worth another go. */
function isFinalError(e: unknown): boolean {
  return (
    e instanceof ConvexError ||
    (e instanceof Error && /ConvexError/.test(e.message))
  );
}

/** Convex errors can be multiline — surface only the human line. */
function firstErrorLine(message: string): string {
  const match = message.match(/Uncaught (?:[A-Za-z]*Error): ([^\n]+)/);
  const line = (match?.[1] ?? message.split("\n")[0]).trim();
  return line.length > 0 ? line : "Something didn't work — try again";
}

// Grid cards and the filmstrip render well under 320 CSS px, so 640 covers 2x
// screens; the Review Room compare canvas still loads the full file.
const THUMB_MAX_EDGE = 640;
const THUMB_QUALITY = 0.82; // high enough to judge a still, ~1% of the original
/** Raster decoder allowlist; video uses its own best-effort poster extraction. */
const THUMBABLE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

/**
 * canvas.toBlob is callback-based and silently falls back to image/png when it
 * cannot encode the requested type — compare the type back to detect that.
 */
function encodeCanvas(
  canvas: HTMLCanvasElement,
  type: string,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob !== null && blob.type === type ? blob : null),
      type,
      THUMB_QUALITY,
    );
  });
}

/**
 * Downscaled stand-in for the upload. Without one, addFromUpload registers an
 * image as its own thumbnail (CONTRACTS.md §versions), so a 200-shot grid pulls
 * 200 full-size stills — multiple GB for the AI frames this product compares.
 * Best-effort by design: null means "upload exactly as before".
 */
async function makeThumbnail(file: File): Promise<Blob | null> {
  if (file.type.startsWith("video/")) return makeVideoThumbnail(file);
  if (!THUMBABLE_TYPES.has(file.type)) return null;
  if (typeof createImageBitmap !== "function") return null;
  let bitmap: ImageBitmap | undefined;
  try {
    // from-image so a phone photo's EXIF rotation survives into the thumbnail.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(
      1, // never upscale — a tiny still stays its own size
      THUMB_MAX_EDGE / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob =
      (await encodeCanvas(canvas, "image/webp")) ??
      (await encodeCanvas(canvas, "image/jpeg"));
    // A "thumbnail" no smaller than the source isn't worth a second round-trip.
    if (blob === null || blob.size >= file.size) return null;
    return blob;
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

/** Extract a real poster from browser-decodable video; unsupported codecs still upload. */
async function makeVideoThumbnail(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  try {
    return await new Promise<Blob | null>((resolve) => {
      let finished = false;
      const finish = (blob: Blob | null) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        video.onloadeddata = null;
        video.onseeked = null;
        video.onerror = null;
        resolve(blob);
      };
      const timer = window.setTimeout(() => finish(null), 8000);
      const capture = async () => {
        try {
          if (!video.videoWidth || !video.videoHeight) return finish(null);
          const scale = Math.min(
            1,
            THUMB_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight),
          );
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) return finish(null);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          finish(
            (await encodeCanvas(canvas, "image/webp")) ??
              (await encodeCanvas(canvas, "image/jpeg")),
          );
        } catch {
          finish(null);
        }
      };
      video.onerror = () => finish(null);
      video.onloadeddata = () => {
        if (Number.isFinite(video.duration) && video.duration > 0.2) {
          video.onseeked = () => {
            void capture();
          };
          video.currentTime = Math.min(0.5, video.duration / 2);
        } else void capture();
      };
      video.src = url;
    });
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

type PromptMeta = {
  tool?: string;
  model?: string;
  prompt?: string;
  seed?: string;
};
type UploadState = "uploading" | "done" | "error";
type UploadItem = {
  key: string;
  name: string;
  state: UploadState;
  /** Set while a large file streams to Drive. */
  progress?: number;
  /** A large file that reached Drive but is not registered yet — retryable. */
  pending?: { driveFileId: string; promptMeta?: PromptMeta };
};

type PromptMetaDraft = {
  tool: string;
  model: string;
  prompt: string;
  seed: string;
};

const EMPTY_META: PromptMetaDraft = {
  tool: "",
  model: "",
  prompt: "",
  seed: "",
};

/**
 * Card-sized uploader for shot options (spec F6). Accepts drag-drop, paste
 * (while mounted) and click-to-browse. Each file: generateUploadUrl → POST
 * bytes → the same pair again for a downscaled thumbnail → addFromUpload.
 * Files over 20MB: drive.beginLargeUpload → PUT straight to Drive →
 * thumbnail → drive.finishLargeUpload. With a hub connected, every batch is
 * checked for Drive space first.
 * Optional prompt metadata applies to the next upload(s) until cleared.
 */
export function UploadDropzone({
  productionId,
  shotId,
  className,
}: {
  productionId: Id<"productions">;
  shotId: Id<"shots">;
  className?: string;
}) {
  const generateUploadUrl = useMutation(api.versions.generateUploadUrl);
  const addFromUpload = useMutation(api.versions.addFromUpload);
  const driveStatus = useQuery(api.drive.connectionStatus, { productionId });
  const checkUploadSpace = useAction(api.drive.checkUploadSpace);
  const beginLargeUpload = useAction(api.drive.beginLargeUpload);
  const finishLargeUpload = useAction(api.drive.finishLargeUpload);
  // undefined = still loading: never tell someone there is no hub yet.
  const hubState =
    driveStatus === undefined
      ? "checking"
      : driveStatus.hub.connected !== true
        ? "none"
        : driveStatus.hub.revoked === true
          ? "revoked"
          : "ready";
  // Why a >20 MB file cannot go to Drive right now; null while it can — or
  // while the answer is not in yet, when the server has the final say.
  const largeFileBlock =
    hubState === "none"
      ? NEEDS_HUB
      : hubState === "revoked"
        ? `${copy.errors.driveExpired} Reconnect the Drive hub in Settings before uploading files over 20 MB.`
        : null;

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [meta, setMeta] = useState<PromptMetaDraft>(EMPTY_META);
  const [metaOpen, setMetaOpen] = useState(false);

  const metaSet = Object.values(meta).some((v) => v.trim().length > 0);

  const setItemState = (key: string, state: UploadState) =>
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, state } : item)),
    );
  const patchItem = (key: string, patch: Partial<UploadItem>) =>
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  const settleItem = (key: string) => {
    setItemState(key, "done");
    setTimeout(
      () => setItems((prev) => prev.filter((item) => item.key !== key)),
      2500,
    );
  };
  const reportError = (e: unknown) =>
    toast.error(
      e instanceof Error
        ? firstErrorLine(e.message)
        : "Something didn't work — try again",
    );

  /**
   * Second trip through the signed-URL flow, after the original is safely
   * stored — a thumbnail must never cost us the upload, so failures stay
   * silent (the server falls back to the original or Drive's thumbnail).
   */
  async function uploadThumbnail(
    file: File,
  ): Promise<Id<"_storage"> | undefined> {
    const thumb = await makeThumbnail(file);
    if (thumb === null) return undefined;
    try {
      const thumbUrl = await generateUploadUrl({ productionId });
      const thumbRes = await fetch(thumbUrl, {
        method: "POST",
        headers: { "Content-Type": thumb.type },
        body: thumb,
      });
      if (!thumbRes.ok) return undefined;
      return ((await thumbRes.json()) as { storageId: Id<"_storage"> })
        .storageId;
    } catch {
      return undefined;
    }
  }

  /**
   * Registers a Drive file as the shot's next option. Retried on dropped
   * connections only — a refusal ("not in this shot's Options folder") is
   * final. The server side is idempotent, so a retry after a timeout is safe.
   */
  async function registerLarge(args: {
    driveFileId: string;
    promptMeta?: PromptMeta;
    thumbStorageId?: Id<"_storage">;
  }) {
    const delays = [1000, 3000, 8000];
    for (let attempt = 0; ; attempt++) {
      try {
        return await finishLargeUpload({ shotId, ...args });
      } catch (e) {
        if (isFinalError(e) || attempt >= delays.length) throw e;
        await wait(delays[attempt] ?? 8000);
      }
    }
  }

  /** Register first, thumbnail second: a thumbnail must never cost the version. */
  async function finishLarge(
    key: string,
    file: File | null,
    pending: NonNullable<UploadItem["pending"]>,
  ) {
    await registerLarge(pending);
    patchItem(key, { pending: undefined });
    if (file === null) return;
    try {
      const thumbStorageId = await uploadThumbnail(file);
      if (thumbStorageId !== undefined) {
        await finishLargeUpload({
          shotId,
          driveFileId: pending.driveFileId,
          thumbStorageId,
        });
      }
    } catch {
      // Drive's own thumbnail, or the next sync pass, fills it in.
    }
  }

  /** The file is in Drive; only the registration failed. Try that again. */
  async function retryPending(item: UploadItem) {
    if (!item.pending) return;
    setItemState(item.key, "uploading");
    try {
      await finishLarge(item.key, null, item.pending);
      settleItem(item.key);
    } catch (e) {
      setItemState(item.key, "error");
      reportError(e);
    }
  }

  async function uploadFiles(fileList: FileList | File[]) {
    const files: File[] = [];
    for (const file of Array.from(fileList)) {
      const isMedia =
        file.type.startsWith("image/") || file.type.startsWith("video/");
      if (!isMedia) {
        toast.error(`${file.name}: only images and video become options`);
      } else if (file.size > MAX_BYTES && largeFileBlock !== null) {
        toast.error(`${file.name}: ${largeFileBlock}`);
      } else {
        files.push(file);
      }
    }
    if (files.length === 0) return;
    // Everything ends up in the hub (small files via mirrorUploadToHub), so a
    // Drive that cannot hold the batch refuses it up front. The server keeps
    // the check advisory: only a real shortfall throws.
    try {
      await checkUploadSpace({
        productionId,
        bytes: files.reduce((sum, f) => sum + f.size, 0),
      });
    } catch (e) {
      toast.error(
        e instanceof Error
          ? firstErrorLine(e.message)
          : "Something didn't work — try again",
        { duration: 10000 },
      );
      return;
    }
    const promptMeta: PromptMeta | undefined = metaSet
      ? {
          tool: meta.tool.trim() || undefined,
          model: meta.model.trim() || undefined,
          prompt: meta.prompt.trim() || undefined,
          seed: meta.seed.trim() || undefined,
        }
      : undefined;
    for (const file of files) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setItems((prev) => [
        ...prev,
        { key, name: file.name, state: "uploading" },
      ]);
      try {
        if (file.size > MAX_BYTES) {
          const { uploadUrl } = await beginLargeUpload({
            shotId,
            name: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            origin: window.location.origin,
          });
          patchItem(key, { progress: 0 });
          const driveFileId = await putToDrive(uploadUrl, file, (percent) =>
            patchItem(key, { progress: percent }),
          );
          const pending = { driveFileId, promptMeta };
          patchItem(key, { pending, progress: undefined });
          await finishLarge(key, file, pending);
        } else {
          await uploadSmall(file, promptMeta);
        }
        settleItem(key);
      } catch (e) {
        setItemState(key, "error");
        reportError(e);
      }
    }
  }

  async function uploadSmall(file: File, promptMeta: PromptMeta | undefined) {
    const url = await generateUploadUrl({ productionId });
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    const { storageId } = (await res.json()) as {
      storageId: Id<"_storage">;
    };
    await addFromUpload({
      shotId,
      storageId,
      thumbStorageId: await uploadThumbnail(file),
      name: file.name,
      mimeType: file.type || undefined,
      sizeBytes: file.size,
      promptMeta,
    });
  }

  // Paste-to-add while this dropzone is mounted.
  const uploadRef = useRef(uploadFiles);
  uploadRef.current = uploadFiles;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        e.preventDefault();
        void uploadRef.current(files);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div className={cn("flex h-full flex-col gap-1.5", className)}>
      <div
        role="button"
        tabIndex={0}
        aria-label="Add options — drop, paste or browse"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files.length > 0)
            void uploadFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex min-h-44 flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          dragActive
            ? "border-foreground/60 bg-muted"
            : "border-border hover:bg-muted/50",
        )}
      >
        <UploadCloud className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium">Drop files, paste, or browse</p>
        <p className="text-xs text-muted-foreground">
          {hubState === "ready"
            ? "Images and video — files over 20MB go straight to Google Drive"
            : hubState === "checking"
              ? "Images and video — checking the Drive hub…"
              : hubState === "revoked"
                ? "Images and video up to 20MB — reconnect the Drive hub for bigger files"
                : "Images and video up to 20MB — bigger files need the Drive hub"}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0)
            void uploadFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1"
            >
              {item.state === "uploading" && (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
              )}
              {item.state === "done" && (
                <Check className="size-3.5 shrink-0 text-status-approved" />
              )}
              {item.state === "error" && (
                <X className="size-3.5 shrink-0 text-destructive" />
              )}
              <span className="truncate font-mono text-xs">{item.name}</span>
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                {item.state === "uploading"
                  ? item.progress !== undefined
                    ? `To Drive ${item.progress}%`
                    : item.pending
                      ? "Registering…"
                      : "Uploading…"
                  : item.state === "done"
                    ? "Added"
                    : item.pending
                      ? "In Drive, not registered"
                      : "Failed"}
              </span>
              {item.state === "error" && item.pending && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => void retryPending(item)}
                >
                  Retry
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Popover open={metaOpen} onOpenChange={setMetaOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="xs"
              className="self-start text-muted-foreground"
            />
          }
        >
          <Wand2 className="size-3" /> Generation details
          {metaSet && (
            <span
              className="size-1.5 rounded-full bg-foreground"
              aria-label="Generation details set"
            />
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <p className="text-xs text-muted-foreground">
            Tool, model, prompt and seed — so anyone can regenerate this option
            or show how it was made.
          </p>
          <p className="text-xs text-muted-foreground">
            Applied to the next uploads. You can edit them later on each option.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="pm-tool" className="text-xs">
                Tool
              </Label>
              <Input
                id="pm-tool"
                value={meta.tool}
                placeholder="Midjourney"
                className="h-7 text-sm"
                onChange={(e) => setMeta({ ...meta, tool: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pm-model" className="text-xs">
                Model
              </Label>
              <Input
                id="pm-model"
                value={meta.model}
                placeholder="v6.1"
                className="h-7 text-sm"
                onChange={(e) => setMeta({ ...meta, model: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pm-prompt" className="text-xs">
              Prompt
            </Label>
            <Textarea
              id="pm-prompt"
              value={meta.prompt}
              placeholder="wide shot, dusk, rain-soaked street…"
              className="min-h-16 text-sm"
              onChange={(e) => setMeta({ ...meta, prompt: e.target.value })}
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="pm-seed" className="text-xs">
                Seed
              </Label>
              <Input
                id="pm-seed"
                value={meta.seed}
                placeholder="82931"
                className="h-7 font-mono text-sm"
                onChange={(e) => setMeta({ ...meta, seed: e.target.value })}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={!metaSet}
              onClick={() => setMeta(EMPTY_META)}
            >
              Clear
            </Button>
            <Button size="sm" onClick={() => setMetaOpen(false)}>
              Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
