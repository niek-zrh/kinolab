/**
 * Signed grants for the in-app media route (drive_http.ts `/drive/media`).
 *
 * A <video> or <img> request carries no Convex auth, so playback of a file
 * that lives in Drive — fetched server-side with the hub owner's token —
 * needs its own proof: a short-lived HMAC token naming the asset and the
 * viewer, minted by `drive.mediaUrl` after the membership check and
 * re-checked by the route on every range request. The key is derived from
 * the deployment's JWT signing key (set by scripts/setup-auth.mjs), so no
 * extra secret has to be configured; MEDIA_SIGNING_SECRET overrides it.
 */

export type MediaGrant = {
  v: 1;
  /** assets._id */
  a: string;
  /** users._id the grant was issued to */
  u: string;
  /** expiry, ms since epoch */
  e: number;
};

/**
 * Two hours: long enough for a review session, short enough that a copied
 * link goes stale the same afternoon. Open panes re-mint before it lapses
 * (lib/hooks/use-media-url.ts).
 */
export const MEDIA_GRANT_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * The media type the route will serve, normalised to its essence (no
 * parameters, lower case), or null for anything that is not a picture, a
 * video or a sound. The asset's recorded type is member-supplied, so the
 * route emits only this canonical form. SVG is an image that can carry
 * scripts, so it keeps its Drive link.
 */
export function mediaEssence(mimeType: string | undefined): string | null {
  if (!mimeType) return null;
  const essence = (mimeType.split(";")[0] ?? "").trim().toLowerCase();
  if (!/^(image|video|audio)\/[a-z0-9][a-z0-9.+-]*$/.test(essence)) return null;
  if (essence === "image/svg+xml") return null;
  return essence;
}

export function playableMime(mimeType: string | undefined): boolean {
  return mediaEssence(mimeType) !== null;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  try {
    const binary = atob(padded);
    // A plain ArrayBuffer-backed view: WebCrypto's BufferSource excludes shared buffers.
    const out = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function signingKey(): Promise<CryptoKey> {
  const secret = process.env.MEDIA_SIGNING_SECRET ?? process.env.JWT_PRIVATE_KEY;
  if (!secret) {
    throw new Error(
      "No media signing key: run scripts/setup-auth.mjs (JWT_PRIVATE_KEY) or set MEDIA_SIGNING_SECRET",
    );
  }
  // Hash first so the HMAC key is fixed-size and never the raw private key.
  const raw = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`kinolab-media-v1:${secret}`),
  );
  return await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signMediaGrant(grant: MediaGrant): Promise<string> {
  const payload = new TextEncoder().encode(JSON.stringify(grant));
  const mac = await crypto.subtle.sign("HMAC", await signingKey(), payload);
  return `${base64url(payload)}.${base64url(new Uint8Array(mac))}`;
}

/** The grant when the token is well-formed, untampered and unexpired; else null. */
export async function verifyMediaGrant(
  token: string,
  now: number,
): Promise<MediaGrant | null> {
  const dot = token.indexOf(".");
  if (dot <= 0 || token.length > 2048) return null;
  const payload = fromBase64url(token.slice(0, dot));
  const mac = fromBase64url(token.slice(dot + 1));
  if (payload === null || mac === null) return null;
  const ok = await crypto.subtle.verify("HMAC", await signingKey(), mac, payload);
  if (!ok) return null;
  let grant: unknown;
  try {
    grant = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return null;
  }
  if (
    typeof grant !== "object" ||
    grant === null ||
    (grant as MediaGrant).v !== 1 ||
    typeof (grant as MediaGrant).a !== "string" ||
    typeof (grant as MediaGrant).u !== "string" ||
    typeof (grant as MediaGrant).e !== "number"
  ) {
    return null;
  }
  if ((grant as MediaGrant).e < now) return null;
  return grant as MediaGrant;
}
