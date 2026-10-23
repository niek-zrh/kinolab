import type { HttpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { DriveAuthError, driveFailure, getFreshToken } from "./lib/google";
import { mediaEssence, verifyMediaGrant } from "./lib/mediaToken";

/**
 * Largest slice relayed per upstream request. Convex caps a buffered HTTP
 * action response at 20 MiB; a <video> that asked for `bytes=0-` happily
 * takes a shorter 206 and asks for the rest, and a client that sent no Range
 * gets the slices streamed back to back.
 */
const MEDIA_CHUNK_BYTES = 8 * 1024 * 1024;

type ByteRange =
  | { kind: "span"; start: number; end: number | undefined }
  | { kind: "suffix"; length: number };

/** RFC 7233 single range; null = no Range header, "invalid" = unusable shape. */
function parseRange(
  header: string | null,
  size: number | undefined,
): ByteRange | "invalid" | null {
  if (header === null) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (m === null) return "invalid";
  const [, first, last] = m;
  if (first === "" && last === "") return "invalid";
  if (first === "") {
    // Suffix range (the last N bytes). Resolved here when the size is
    // known; otherwise forwarded as-is, Drive resolves it.
    const n = Number(last);
    if (!Number.isSafeInteger(n) || n <= 0) return "invalid";
    if (size === undefined) return { kind: "suffix", length: n };
    return { kind: "span", start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(first);
  const end = last === "" ? undefined : Number(last);
  if (!Number.isSafeInteger(start)) return "invalid";
  if (end !== undefined && (!Number.isSafeInteger(end) || end < start)) {
    return "invalid";
  }
  return { kind: "span", start, end };
}

/**
 * The grant in the URL is the only credential (no cookies), so any origin
 * may read the response: that lets the Review Room fetch the route's own
 * error text when a <video> fails, instead of guessing at a codec problem.
 */
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
};

function plain(
  status: number,
  message: string,
  extra: Record<string, string> = {},
): Response {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS,
      ...extra,
    },
  });
}

function unsatisfiable(total: number | undefined): Response {
  return new Response(null, {
    status: 416,
    headers: {
      "Cache-Control": "no-store",
      ...CORS,
      // complete-length must be digits, so no header when it is unknown
      ...(total !== undefined ? { "Content-Range": `bytes */${total}` } : {}),
    },
  });
}

/**
 * Media headers. The bytes are whatever a member uploaded, served from the
 * actions origin: nosniff plus a sandboxing CSP so nothing in them can run
 * here, the normalised media type rather than anything Drive or the
 * uploader said, and a short private cache so seeking back does not re-hit
 * Drive while an offboarded member's replay window stays at minutes.
 */
function mediaHeaders(
  mimeType: string,
  name: string,
  extra: Record<string, string>,
): Record<string, string> {
  // Header values are byte strings: anything outside printable ASCII would
  // make the whole response invalid, so the plain filename is a fallback and
  // the real name travels RFC 5987-encoded.
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return {
    "Content-Type": mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    ...CORS,
    ...extra,
  };
}

type Slice = {
  bytes: Uint8Array<ArrayBuffer>;
  first: number;
  last: number;
  total: number | undefined;
};

/**
 * Read at most `want` bytes of a body after skipping `skip`, then cancel
 * the stream: a Drive 200 to a ranged request must never be buffered whole.
 */
async function readWindow(
  body: ReadableStream<Uint8Array>,
  skip: number,
  want: number,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; received: number }> {
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let kept = 0;
  let received = 0;
  try {
    while (kept < want) {
      const { value, done } = await reader.read();
      if (done || value === undefined) break;
      const chunkStart = received;
      received += value.byteLength;
      if (received <= skip) continue;
      const from = Math.max(0, skip - chunkStart);
      const to = Math.min(value.byteLength, from + (want - kept));
      parts.push(value.subarray(from, to));
      kept += to - from;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const out = new Uint8Array(new ArrayBuffer(kept));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return { bytes: out, received };
}

/** Everything a Drive relay can answer with when it is not bytes. */
async function driveSliceFailure(
  ctx: ActionCtx,
  res: Response,
  info: { driveFileId: string; ownerConnectionId: string; sizeBytes: number | undefined },
  token: string,
): Promise<Response> {
  if (res.status === 416) {
    const m = /\/(\d+)$/.exec(res.headers.get("Content-Range") ?? "");
    return unsatisfiable(m ? Number(m[1]) : info.sizeBytes);
  }
  const body = await res.text().catch(() => "");
  // Same classification as every other Drive call: an auth failure marks
  // the connection revoked so Settings shows "reconnect" at once instead of
  // the hub looking healthy for the rest of the token's hour.
  const err = await driveFailure(
    `GET /files/${info.driveFileId} (media)`,
    res.status,
    body,
    token,
  );
  if (err instanceof DriveAuthError || res.status === 401) {
    await ctx
      .runMutation(internal.drive.markRevoked, {
        connectionId: info.ownerConnectionId as never,
      })
      .catch(() => undefined);
    return plain(503, "The Drive hub connection expired — reconnect it in Settings");
  }
  const message =
    err instanceof ConvexError ? String(err.data) : `Google Drive answered ${res.status}`;
  if (res.status === 404) return plain(404, "This file is no longer in Drive");
  if (res.status === 429 || /rate/i.test(message)) {
    return plain(503, message, { "Retry-After": "5" });
  }
  if (res.status === 403) return plain(403, message);
  return plain(502, message);
}

/**
 * One ranged fetch from Drive: at most MEDIA_CHUNK_BYTES, as a 206 window
 * or, when Drive ignores the Range and answers 200, the same window read
 * out of the stream and the rest discarded.
 */
async function fetchDriveSlice(
  ctx: ActionCtx,
  token: string,
  info: { driveFileId: string; ownerConnectionId: string; sizeBytes: number | undefined },
  range: ByteRange,
): Promise<Slice | Response> {
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(info.driveFileId)}`,
  );
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");
  const start = range.kind === "span" ? range.start : undefined;
  const end =
    range.kind === "span"
      ? Math.min(range.end ?? Number.MAX_SAFE_INTEGER, range.start + MEDIA_CHUNK_BYTES - 1)
      : undefined;
  const suffix = range.kind === "suffix" ? Math.min(range.length, MEDIA_CHUNK_BYTES) : undefined;
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Range: suffix !== undefined ? `bytes=-${suffix}` : `bytes=${start}-${end}`,
    },
  });
  if (res.status !== 200 && res.status !== 206) {
    return await driveSliceFailure(ctx, res, info, token);
  }
  const declared = Number(res.headers.get("Content-Length") ?? "");
  if (res.status === 206) {
    if (Number.isFinite(declared) && declared > MEDIA_CHUNK_BYTES + 1) {
      await res.body?.cancel().catch(() => undefined);
      return plain(502, "Google Drive sent more than was asked for");
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const m = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(res.headers.get("Content-Range") ?? "");
    const first = m ? Number(m[1]) : (start ?? 0);
    const last = m ? Number(m[2]) : first + bytes.byteLength - 1;
    const total = m && m[3] !== "*" ? Number(m[3]) : info.sizeBytes;
    return { bytes, first, last, total };
  }
  // 200: Drive sent the whole file regardless. Keep only the window.
  const total = Number.isFinite(declared) && declared > 0 ? declared : undefined;
  if (res.body === null) return plain(502, "Google Drive sent no body");
  if (suffix !== undefined) {
    if (total === undefined) {
      await res.body.cancel().catch(() => undefined);
      return plain(416, "Suffix ranges need a known file size");
    }
    const from = Math.max(0, total - suffix);
    const { bytes } = await readWindow(res.body, from, total - from);
    return { bytes, first: from, last: from + bytes.byteLength - 1, total };
  }
  const from = start ?? 0;
  const want = (end ?? from + MEDIA_CHUNK_BYTES - 1) - from + 1;
  if (total !== undefined && from >= total) {
    await res.body.cancel().catch(() => undefined);
    return unsatisfiable(total);
  }
  const { bytes, received } = await readWindow(res.body, from, want);
  if (bytes.byteLength === 0) return unsatisfiable(total ?? received);
  return { bytes, first: from, last: from + bytes.byteLength - 1, total: total ?? undefined };
}

/**
 * OAuth code-flow callback for the "Connect Google Drive" flow (spec §7.2).
 * Route: GET {CONVEX_SITE_URL}/google/drive/callback
 */
export function registerDriveRoutes(http: HttpRouter) {
  /**
   * In-app playback of a file that lives in Drive (and, for tests and
   * debugging, of a Convex-storage file). GET {CONVEX_SITE_URL}/drive/media?t=
   * with a grant from drive.mediaUrl; the bytes are relayed from Drive with
   * the hub owner's token, one range-capped slice per upstream request.
   */
  http.route({
    path: "/drive/media",
    method: "OPTIONS",
    handler: httpAction(async () => {
      // A GET with a Range header is not a "simple" request, so the player's
      // error probe preflights.
      return new Response(null, {
        status: 204,
        headers: {
          ...CORS,
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Range",
          "Access-Control-Max-Age": "86400",
        },
      });
    }),
  });
  http.route({
    path: "/drive/media",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
      const token = new URL(request.url).searchParams.get("t") ?? "";
      const grant = await verifyMediaGrant(token, Date.now());
      if (grant === null) {
        return plain(401, "This media link is invalid or has expired — reopen the shot");
      }
      const info = await ctx.runQuery(internal.drive.mediaContext, {
        assetId: grant.a,
        userId: grant.u,
      });
      if (info === null) return plain(403, "No access to this file");
      const mimeType = mediaEssence(info.mimeType);
      if (mimeType === null) return plain(415, "Not a media file");

      if (info.provider === "storage") {
        if (info.storageId === null) return plain(404, "This file's bytes are gone");
        const blob = await ctx.storage.get(info.storageId);
        if (blob === null) return plain(404, "This file's bytes are gone");
        const total = blob.size;
        const range = parseRange(request.headers.get("Range"), total);
        if (range === "invalid" || (range !== null && range.kind === "suffix")) {
          return unsatisfiable(total);
        }
        if (range === null) {
          return new Response(blob, {
            status: 200,
            headers: mediaHeaders(mimeType, info.name, { "Content-Length": String(total) }),
          });
        }
        if (range.start >= total) return unsatisfiable(total);
        const end = Math.min(range.end ?? total - 1, total - 1, range.start + MEDIA_CHUNK_BYTES - 1);
        return new Response(blob.slice(range.start, end + 1), {
          status: 206,
          headers: mediaHeaders(mimeType, info.name, {
            "Content-Range": `bytes ${range.start}-${end}/${total}`,
            "Content-Length": String(end - range.start + 1),
          }),
        });
      }

      if (info.provider !== "gdrive" || info.driveFileId === null || info.ownerConnectionId === null) {
        return plain(404, "This file is not in Drive");
      }
      const drive = {
        driveFileId: info.driveFileId,
        ownerConnectionId: info.ownerConnectionId,
        sizeBytes: info.sizeBytes,
      };
      // The recorded size only resolves suffix ranges; Drive is the authority
      // on what exists (a replaced file keeps its id and may have grown).
      const range = parseRange(request.headers.get("Range"), info.sizeBytes);
      if (range === "invalid") return unsatisfiable(info.sizeBytes);
      let driveToken: string;
      try {
        driveToken = await getFreshToken(ctx, info.ownerConnectionId);
      } catch (e) {
        return plain(
          503,
          e instanceof DriveAuthError
            ? "The Drive hub connection expired — reconnect it in Settings"
            : "Google Drive is not reachable right now",
        );
      }

      if (range !== null) {
        const slice = await fetchDriveSlice(ctx, driveToken, drive, range);
        if (slice instanceof Response) return slice;
        return new Response(slice.bytes, {
          status: 206,
          headers: mediaHeaders(mimeType, info.name, {
            "Content-Length": String(slice.bytes.byteLength),
            "Content-Range": `bytes ${slice.first}-${slice.last}/${slice.total ?? "*"}`,
          }),
        });
      }

      // No Range: a 206 would be read as the whole file by an <img> or a
      // download, so answer 200 — in one piece when it fits, otherwise as a
      // stream of consecutive slices.
      const first = await fetchDriveSlice(ctx, driveToken, drive, { kind: "span", start: 0, end: MEDIA_CHUNK_BYTES - 1 });
      if (first instanceof Response) return first;
      const complete = first.total !== undefined && first.last >= first.total - 1;
      if (complete) {
        return new Response(first.bytes, {
          status: 200,
          headers: mediaHeaders(mimeType, info.name, { "Content-Length": String(first.bytes.byteLength) }),
        });
      }
      let cursor = first.last + 1;
      const total = first.total;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(first.bytes);
        },
        async pull(controller) {
          if (total !== undefined && cursor >= total) {
            controller.close();
            return;
          }
          const next = await fetchDriveSlice(ctx, driveToken, drive, {
            kind: "span",
            start: cursor,
            end: cursor + MEDIA_CHUNK_BYTES - 1,
          });
          if (next instanceof Response || next.bytes.byteLength === 0) {
            if (next instanceof Response && next.status !== 416) {
              controller.error(new Error(`Drive relay stopped: ${next.status}`));
            } else {
              controller.close();
            }
            return;
          }
          controller.enqueue(next.bytes);
          cursor = next.last + 1;
          if (total !== undefined && cursor >= total) controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: mediaHeaders(mimeType, info.name, {
          ...(total !== undefined ? { "Content-Length": String(total) } : {}),
        }),
      });
    }),
  });

  http.route({
    path: "/google/drive/callback",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
      const url = new URL(request.url);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
      const redirect = (path: string) =>
        new Response(null, {
          status: 302,
          headers: {
            Location: `${siteUrl}${path}`,
            // This URL carries a single-use authorization code: keep it out of
            // caches and out of the next page's Referer.
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
          },
        });

      if (error || !code || !state) {
        // Google's error codes are lowercase tokens (access_denied,
        // admin_policy_enforced…). Clamp before reflecting it: /drive/connected
        // prints this string, and the query is attacker-reachable.
        const reason = (error ?? "missing_code").toLowerCase();
        const safeReason = /^[a-z0-9_-]{1,40}$/.test(reason)
          ? reason
          : "unknown_error";
        return redirect(`/drive/connected?status=error&reason=${safeReason}`);
      }

      try {
        // CSRF: completeConnection resolves `state` against driveConnectStates
        // BEFORE the token exchange — an unknown, expired (>10 min) or already
        // used state row means no exchange happens, and saveConnection deletes
        // the row, so a replayed callback lands in the catch below.
        const result: { returnTo: string } = await ctx.runAction(
          internal.drive.completeConnection,
          { code, state },
        );
        const sep = result.returnTo.includes("?") ? "&" : "?";
        return redirect(`${result.returnTo}${sep}status=connected`);
      } catch (e) {
        console.error("Drive connect failed", e);
        return redirect(`/drive/connected?status=error&reason=exchange_failed`);
      }
    }),
  });
}
