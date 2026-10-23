/**
 * The signed in-app media route (drive.mediaUrl + GET /drive/media).
 *
 * Drive itself cannot be reached from the test backend, so the route is
 * exercised through its Convex-storage path (`proxy: true`), which shares
 * the grant check, the membership re-check and the range handling with the
 * Drive path. What differs there — the relay from Google — is reasoned
 * about in code review and checked on the pilot.
 */
import {
  createSuite,
  newOwner,
  newProduction,
  addMember,
  mutation,
  query,
  action,
  must,
  uploadVersion,
} from "./_harness.mjs";

function decodeGrant(url) {
  const token = new URL(url).searchParams.get("t");
  const [payload, mac] = token.split(".");
  const json = Buffer.from(
    payload.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf8");
  return { token, payload, mac, grant: JSON.parse(json) };
}

function encodeGrant(grant) {
  return Buffer.from(JSON.stringify(grant))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function get(url, range) {
  const res = await fetch(url, {
    headers: range ? { Range: range } : {},
    redirect: "manual",
  });
  const body = Buffer.from(await res.arrayBuffer());
  return { res, body };
}

export async function run() {
  const suite = createSuite("Media route — signed in-app playback");
  const owner = await newOwner("media");
  const artist = await addMember(owner.studioId, owner.token, "artist");
  const leaver = await addMember(
    owner.studioId,
    owner.token,
    "viewer",
    "media-leaver",
  );
  const other = await newOwner("media-foreign");
  const { productionId } = await newProduction(owner.studioId, owner.token, {
    name: "Media Lab",
    code: "MED",
  });
  const shotId = must(
    await mutation(
      "shots:create",
      { productionId, code: "SC010_SH010" },
      owner.token,
    ),
    "shot",
  );
  const { versionId } = await uploadVersion(productionId, shotId, artist.token);
  const version = must(
    await query("versions:listForShot", { shotId }, owner.token),
    "versions",
  ).find((v) => v._id === versionId);
  const assetId = version.asset._id;

  /* ------------------------------ grants -------------------------------- */
  const direct = await action("drive:mediaUrl", { assetId }, artist.token);
  suite.allowed("a member gets a URL for a stored file", direct);
  suite.check(
    "a stored file resolves to its storage URL, not the proxy",
    direct.ok &&
      !direct.value.url.includes("/drive/media") &&
      direct.value.expiresAt === null,
    direct.ok ? direct.value.url.slice(0, 60) : direct.error,
  );
  suite.allowed(
    "a viewer gets a URL too",
    await action("drive:mediaUrl", { assetId }, leaver.token),
  );
  suite.denied(
    "another studio cannot get a URL",
    await action("drive:mediaUrl", { assetId }, other.token),
  );
  suite.denied(
    "an anonymous caller cannot get a URL",
    await action("drive:mediaUrl", { assetId }),
  );
  suite.denied(
    "a bogus asset id is refused",
    await action("drive:mediaUrl", { assetId: "not-an-id" }, artist.token),
  );

  const proxied = await action(
    "drive:mediaUrl",
    { assetId, proxy: true },
    artist.token,
  );
  suite.allowed("the proxy can be forced for a stored file", proxied);
  if (!proxied.ok) return suite;
  const url = proxied.value.url;
  const now = Date.now();
  suite.check(
    "the proxy URL carries a signed grant on the actions origin",
    url.includes("/drive/media?t=") &&
      proxied.value.expiresAt > now + 1.5 * 3600_000 &&
      proxied.value.expiresAt < now + 2.5 * 3600_000,
    url.slice(0, 80),
  );
  const { grant } = decodeGrant(url);
  suite.check(
    "the grant names the asset and the viewer",
    grant.v === 1 && grant.a === assetId && grant.u === artist.userId,
    JSON.stringify(grant).slice(0, 120),
  );

  /* ------------------------------ bytes --------------------------------- */
  const reference = (await get(direct.value.url)).body;
  const whole = await get(url);
  suite.check(
    "a plain GET serves the whole file with media headers",
    whole.res.status === 200 &&
      whole.res.headers.get("content-type") === "image/png" &&
      whole.res.headers.get("accept-ranges") === "bytes" &&
      whole.res.headers.get("x-content-type-options") === "nosniff" &&
      (whole.res.headers.get("content-security-policy") ?? "").includes("sandbox") &&
      Number(whole.res.headers.get("content-length")) === reference.length &&
      whole.body.equals(reference),
    `${whole.res.status} ${whole.res.headers.get("content-type")} ${whole.body.length}/${reference.length} bytes`,
  );
  const n = reference.length;
  const head = await get(url, "bytes=0-9");
  suite.check(
    "a closed range answers 206 with the exact slice",
    head.res.status === 206 &&
      head.res.headers.get("content-range") === `bytes 0-9/${n}` &&
      head.body.equals(reference.subarray(0, 10)),
    `${head.res.status} ${head.res.headers.get("content-range")}`,
  );
  const tail = await get(url, "bytes=5-");
  suite.check(
    "an open range runs to the end",
    tail.res.status === 206 &&
      tail.res.headers.get("content-range") === `bytes 5-${n - 1}/${n}` &&
      tail.body.equals(reference.subarray(5)),
    `${tail.res.status} ${tail.res.headers.get("content-range")}`,
  );
  const suffix = await get(url, "bytes=-4");
  suite.check(
    "a suffix range returns the last bytes",
    suffix.res.status === 206 &&
      suffix.res.headers.get("content-range") === `bytes ${n - 4}-${n - 1}/${n}` &&
      suffix.body.equals(reference.subarray(n - 4)),
    `${suffix.res.status} ${suffix.res.headers.get("content-range")}`,
  );
  const beyond = await get(url, "bytes=99999-");
  suite.check(
    "a range past the end is unsatisfiable",
    beyond.res.status === 416 &&
      beyond.res.headers.get("content-range") === `bytes */${n}`,
    `${beyond.res.status} ${beyond.res.headers.get("content-range")}`,
  );
  const garbage = await get(url, "bytes=abc");
  suite.check(
    "a malformed range is unsatisfiable, not a 200",
    garbage.res.status === 416,
    String(garbage.res.status),
  );

  /* ------------------------------ grants that must fail ----------------- */
  const { token, payload, mac } = decodeGrant(url);
  const base = url.slice(0, url.indexOf("?t=") + 3);
  const flipped = mac.endsWith("A") ? `${mac.slice(0, -1)}B` : `${mac.slice(0, -1)}A`;
  suite.check(
    "a tampered signature is refused",
    (await get(`${base}${payload}.${flipped}`)).res.status === 401,
  );
  suite.check(
    "a grant re-pointed at another asset with the old signature is refused",
    (
      await get(
        `${base}${encodeGrant({ ...grant, a: grant.a.replace(/.$/, (c) => (c === "a" ? "b" : "a")) })}.${mac}`,
      )
    ).res.status === 401,
  );
  suite.check(
    "a grant for another viewer with the old signature is refused",
    (await get(`${base}${encodeGrant({ ...grant, u: other.userId })}.${mac}`)).res
      .status === 401,
  );
  suite.check(
    "an expired-looking grant with the old signature is refused",
    (await get(`${base}${encodeGrant({ ...grant, e: now - 1 })}.${mac}`)).res
      .status === 401,
  );
  suite.check(
    "a token without a signature is refused",
    (await get(`${base}${payload}`)).res.status === 401,
  );
  suite.check(
    "a missing token is refused",
    (await get(base)).res.status === 401,
  );
  suite.check(
    "the valid token still works after the forgeries",
    (await get(`${base}${token}`, "bytes=0-0")).res.status === 206,
  );

  /* ------------------------------ names, types, CORS ------------------- */
  const uploadNamed = async (name, mimeType) => {
    const uploadUrl = must(
      await mutation("versions:generateUploadUrl", { productionId }, artist.token),
      "upload url",
    );
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: reference,
    });
    const { storageId } = await res.json();
    const made = must(
      await mutation(
        "versions:addFromUpload",
        { shotId, storageId, name, mimeType, sizeBytes: reference.length },
        artist.token,
      ),
      `version ${name}`,
    );
    const row = must(
      await query("versions:listForShot", { shotId }, owner.token),
      "versions",
    ).find((v) => v._id === made.versionId);
    return row.asset._id;
  };
  const exotic = await uploadNamed("Take 3 — 映画.png", "image/png");
  const exoticUrl = must(
    await action("drive:mediaUrl", { assetId: exotic, proxy: true }, artist.token),
    "exotic grant",
  ).url;
  const exoticGet = await get(exoticUrl);
  const exoticRange = await get(exoticUrl, "bytes=0-1");
  suite.check(
    "a name outside Latin-1 is served, RFC 5987-encoded",
    exoticGet.res.status === 200 &&
      exoticRange.res.status === 206 &&
      (exoticGet.res.headers.get("content-disposition") ?? "").includes("filename*=UTF-8''") &&
      (exoticGet.res.headers.get("content-disposition") ?? "").includes(encodeURIComponent("映画")),
    `${exoticGet.res.status}/${exoticRange.res.status} ${exoticGet.res.headers.get("content-disposition")}`,
  );
  for (const variant of ["image/SVG+XML", "image/svg+xml; charset=utf-8"]) {
    const svg = await uploadNamed("vector.svg", variant);
    suite.denied(
      `an SVG registered as "${variant}" gets no media grant`,
      await action("drive:mediaUrl", { assetId: svg, proxy: true }, artist.token),
    );
  }
  const spaced = await uploadNamed("spaced.png", "image/PNG; charset=binary");
  const spacedUrl = must(
    await action("drive:mediaUrl", { assetId: spaced, proxy: true }, artist.token),
    "spaced grant",
  ).url;
  const spacedGet = await get(spacedUrl);
  suite.check(
    "the served Content-Type is the normalised essence, never the recorded string",
    spacedGet.res.status === 200 && spacedGet.res.headers.get("content-type") === "image/png",
    `${spacedGet.res.status} ${spacedGet.res.headers.get("content-type")}`,
  );
  suite.check(
    "media responses are CORS-readable with a short private cache",
    whole.res.headers.get("access-control-allow-origin") === "*" &&
      (whole.res.headers.get("access-control-expose-headers") ?? "").includes("Content-Range") &&
      whole.res.headers.get("cache-control") === "private, max-age=300",
    `${whole.res.headers.get("access-control-allow-origin")} ${whole.res.headers.get("cache-control")}`,
  );
  const preflight = await fetch(url, { method: "OPTIONS" });
  suite.check(
    "the preflight for a ranged probe is answered",
    preflight.status === 204 &&
      (preflight.headers.get("access-control-allow-headers") ?? "").includes("Range") &&
      preflight.headers.get("access-control-allow-origin") === "*",
    `${preflight.status} ${preflight.headers.get("access-control-allow-headers")}`,
  );
  const refused = await get(`${base}${payload}.${flipped}`);
  suite.check(
    "error bodies are CORS-readable too, so the player can show them",
    refused.res.status === 401 && refused.res.headers.get("access-control-allow-origin") === "*",
  );

  /* ------------------------------ offboarding --------------------------- */
  const leaverUrl = must(
    await action("drive:mediaUrl", { assetId, proxy: true }, leaver.token),
    "leaver grant",
  ).url;
  suite.check(
    "a member's link plays while they are in the studio",
    (await get(leaverUrl, "bytes=0-0")).res.status === 206,
  );
  const team = must(
    await query("studios:team", { studioId: owner.studioId }, owner.token),
    "team",
  );
  const leaverRow = team.find((m) => m.email === leaver.email);
  must(
    await mutation(
      "studios:removeMember",
      { membershipId: leaverRow._id },
      owner.token,
    ),
    "remove leaver",
  );
  suite.check(
    "the link stops the moment they are removed from the studio",
    (await get(leaverUrl, "bytes=0-0")).res.status === 403,
  );
  suite.denied(
    "and they cannot mint a new one",
    await action("drive:mediaUrl", { assetId }, leaver.token),
  );
  return suite;
}
