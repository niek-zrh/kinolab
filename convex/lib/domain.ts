/**
 * Domain vocabulary (spec §2). Values only — imported by both Convex
 * functions and client components, so keep this file free of server imports.
 */

export type StageKey =
  | "development"
  | "preproduction"
  | "previews"
  | "production"
  | "post"
  | "delivery";

export type ShotStatusKey =
  | "planned"
  | "generating"
  | "options_ready"
  | "in_review"
  | "picked"
  | "approved"
  | "rework"
  | "final"
  | "delivered"
  | "killed";

export type RoleKey =
  | "owner"
  | "producer"
  | "creative_director"
  | "supervisor"
  | "artist"
  | "viewer";

export const STAGES: {
  key: StageKey;
  label: string;
  short: string;
  order: number;
  typicalGateOwner: string;
}[] = [
  {
    key: "development",
    label: "Development",
    short: "Dev",
    order: 1,
    typicalGateOwner: "Creative Director / Story Lead",
  },
  {
    key: "preproduction",
    label: "Pre-Production",
    short: "Pre-Pro",
    order: 2,
    typicalGateOwner: "Production Designer / Creative Director",
  },
  {
    key: "previews",
    label: "Previews & Review",
    short: "Previews",
    order: 3,
    typicalGateOwner: "Showrunner / Creative Director",
  },
  {
    key: "production",
    label: "Production",
    short: "Production",
    order: 4,
    typicalGateOwner: "Director",
  },
  {
    key: "post",
    label: "Post-Production",
    short: "Post",
    order: 5,
    typicalGateOwner: "Post-Production Supervisor",
  },
  {
    key: "delivery",
    label: "Final Edit & Delivery",
    short: "Delivery",
    order: 6,
    typicalGateOwner: "Lead Editor / Delivery Engineer",
  },
];

export const STAGE_BY_KEY = Object.fromEntries(
  STAGES.map((s) => [s.key, s]),
) as Record<StageKey, (typeof STAGES)[number]>;

export const SHOT_STATUSES: { key: ShotStatusKey; label: string }[] = [
  { key: "planned", label: "Planned" },
  { key: "generating", label: "Generating" },
  { key: "options_ready", label: "Options ready" },
  { key: "in_review", label: "In review" },
  { key: "picked", label: "Picked" },
  { key: "approved", label: "Approved" },
  { key: "rework", label: "Rework" },
  { key: "final", label: "Final" },
  { key: "delivered", label: "Delivered" },
  { key: "killed", label: "Killed" },
];

export const SHOT_STATUS_BY_KEY = Object.fromEntries(
  SHOT_STATUSES.map((s) => [s.key, s]),
) as Record<ShotStatusKey, (typeof SHOT_STATUSES)[number]>;

export const ROLES: { key: RoleKey; label: string; blurb: string }[] = [
  { key: "owner", label: "Owner", blurb: "Everything, incl. studio settings" },
  {
    key: "producer",
    label: "Producer",
    blurb: "Configure productions, manage members, approve anything",
  },
  {
    key: "creative_director",
    label: "Creative Director",
    blurb: "Approve gates and picks anywhere",
  },
  {
    key: "supervisor",
    label: "Supervisor",
    blurb: "Approve within assigned stages, run QC",
  },
  {
    key: "artist",
    label: "Artist",
    blurb: "Create versions, comment, move own shots",
  },
  { key: "viewer", label: "Viewer", blurb: "Read-only + comment" },
];

/** Statuses an artist may move their own shots between. */
export const WORKING_STATUSES: ShotStatusKey[] = [
  "planned",
  "generating",
  "options_ready",
  "in_review",
  "rework",
];

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
  "application/pdf": "pdf",
};

/** File extension from a name, falling back to the mime type, then "bin". */
export function extensionFor(name: string, mimeType?: string): string {
  const dot = name.lastIndexOf(".");
  if (dot > 0 && dot < name.length - 1) return name.slice(dot + 1).toLowerCase();
  const fromMime = mimeType !== undefined ? EXT_BY_MIME[mimeType] : undefined;
  return fromMime ?? "bin";
}

/** Canonical approved filename (spec §7.4): SGL_EP01_SC010_SH020_v3.png */
export function canonicalApprovedName(args: {
  productionCode: string;
  episodeNumber?: number;
  shotCode: string;
  versionIndex: number;
  extension: string;
}): string {
  const ep =
    args.episodeNumber !== undefined
      ? `EP${String(args.episodeNumber).padStart(2, "0")}_`
      : "";
  const ext = args.extension.replace(/^\./, "");
  return `${args.productionCode}_${ep}${args.shotCode}_v${args.versionIndex}.${ext}`;
}

export const HUB_FOLDERS: { key: string; path: string[] }[] = [
  { key: "admin", path: ["00 Admin"] },
  { key: "development", path: ["01 Development"] },
  { key: "development.coreScript", path: ["01 Development", "Core Script"] },
  {
    key: "development.scriptOptions",
    path: ["01 Development", "Script Options"],
  },
  { key: "preproduction", path: ["02 Pre-Production"] },
  { key: "preproduction.concepts", path: ["02 Pre-Production", "Concepts"] },
  { key: "preproduction.locations", path: ["02 Pre-Production", "Locations"] },
  { key: "previews", path: ["03 Previews"] },
  { key: "previews.options", path: ["03 Previews", "Preview Options"] },
  { key: "production", path: ["04 Production"] },
  { key: "production.shots", path: ["04 Production", "Shots"] },
  { key: "post", path: ["05 Post"] },
  { key: "post.sound", path: ["05 Post", "Sound"] },
  { key: "post.vfx", path: ["05 Post", "VFX"] },
  { key: "delivery", path: ["06 Delivery"] },
  { key: "delivery.masters", path: ["06 Delivery", "Masters"] },
  { key: "delivery.qc", path: ["06 Delivery", "QC"] },
];

/* ------------------------------------------------------------------------ */
/* Pre-production elements (v2 item b)                                       */
/* ------------------------------------------------------------------------ */

export type ElementKind = "character" | "location" | "script";

/** Every kind the schema accepts; only "character" has a UI in v1.1. */
export const ELEMENT_KINDS: ElementKind[] = ["character", "location", "script"];

export const ELEMENT_KIND_LABELS: Record<
  ElementKind,
  { singular: string; plural: string }
> = {
  character: { singular: "Character", plural: "Characters" },
  location: { singular: "Location", plural: "Locations" },
  script: { singular: "Script", plural: "Scripts" },
};

/** A phase of an element; each one is stored as a "slot shot". */
export type ElementSlot = "concept" | "animation";

export const SLOT_LABELS: Record<ElementSlot, string> = {
  concept: "Concept",
  animation: "Animation",
};

/**
 * Slots created for a new element of each kind, in display order (lead
 * engineer's decision 2026-09-19: both character slots ship). Locations and
 * scripts are LATER; their entries only fix the shape.
 */
export const SLOTS_BY_KIND: Record<ElementKind, ElementSlot[]> = {
  character: ["concept", "animation"],
  location: ["concept"],
  script: [],
};

/** Code prefix of an element's slot shots: CH_PUSHISTIK_CONCEPT. */
export const ELEMENT_CODE_PREFIX: Record<ElementKind, string> = {
  character: "CH",
  location: "LOC",
  script: "SCR",
};

/**
 * Prefixes an ordinary shot code may never start with — they belong to
 * element slot shots. Derived from ELEMENT_CODE_PREFIX so the two never
 * drift. shots.create / bulkCreate / importRows refuse them.
 */
export const RESERVED_CODE_PREFIXES: string[] = ELEMENT_KINDS.map(
  (kind) => `${ELEMENT_CODE_PREFIX[kind]}_`,
);

const RESERVED_CODE_RE = new RegExp(
  `^(${ELEMENT_KINDS.map((kind) => ELEMENT_CODE_PREFIX[kind]).join("|")})_`,
  "i",
);

/**
 * True when a code (trimmed, any case) starts with a reserved element
 * prefix such as `CH_`. Case-insensitive because codes are uppercased on
 * write — "ch_x" would become CH_X.
 */
export function isReservedCode(code: string): boolean {
  return RESERVED_CODE_RE.test(code.trim());
}

/** Slot shots sit in Pre-Production and never move stage. */
export const ELEMENT_SLOT_STAGE: StageKey = "preproduction";

/** Validator caps shared by elements.ts and the Characters UI. */
export const MAX_ELEMENT_NAME_LENGTH = 120;
export const MAX_ELEMENT_CODE_LENGTH = 32;
export const MAX_ELEMENT_DESCRIPTION_LENGTH = 2000;
export const MAX_ELEMENT_BASE_PROMPT_LENGTH = 4000;
/** elements.list cap — ≈5 reads per element stays under the 4,096 ceiling. */
export const MAX_LIST_ELEMENTS = 300;
/** elements.bulkCreate: names per call. */
export const MAX_BULK_ELEMENTS = 200;

/** Element codes: A–Z, 0–9 and _ only, 1–32 characters. */
export const ELEMENT_CODE_RE = /^[A-Z0-9_]{1,32}$/;

export function isValidElementCode(code: string): boolean {
  return ELEMENT_CODE_RE.test(code);
}

/**
 * Auto-derive an element code from its name: ASCII letters and digits are
 * kept and uppercased, runs of whitespace / `-` / `_` become one `_`,
 * everything else (Cyrillic, punctuation) is dropped, and the result is cut
 * to MAX_ELEMENT_CODE_LENGTH without a dangling `_`. Returns "" when nothing
 * survives (a Cyrillic-only name) — the caller then requires a code.
 *   "Papa Tupik" → "PAPA_TUPIK", "Пушистик" → "", "Mama (mammoth)" → "MAMA_MAMMOTH"
 */
export function deriveElementCode(name: string): string {
  const words: string[] = [];
  let current = "";
  for (const ch of name) {
    if (/[A-Za-z0-9]/.test(ch)) {
      current += ch.toUpperCase();
    } else if (/[\s\-_]/.test(ch)) {
      if (current.length > 0) words.push(current);
      current = "";
    }
    // any other character is dropped
  }
  if (current.length > 0) words.push(current);
  return words
    .join("_")
    .slice(0, MAX_ELEMENT_CODE_LENGTH)
    .replace(/_+$/, "");
}

/** Code of an element's slot shot: slotShotCode("character", "PUSHISTIK", "concept") → "CH_PUSHISTIK_CONCEPT". */
export function slotShotCode(
  kind: ElementKind,
  code: string,
  slot: ElementSlot,
): string {
  return `${ELEMENT_CODE_PREFIX[kind]}_${code.trim().toUpperCase()}_${slot.toUpperCase()}`;
}

/** Title of an element's slot shot: slotTitle("Pushistik", "concept") → "Pushistik — Concept". */
export function slotTitle(name: string, slot: ElementSlot): string {
  return `${name.trim()} — ${SLOT_LABELS[slot]}`;
}

/* ------------------------------------------------------------------------ */
/* Shot code generator (v2 item d — "New shots › Generate")                  */
/* ------------------------------------------------------------------------ */

/** The Generate tab's default: SC010_SH010, SC010_SH020, … */
export const DEFAULT_SHOT_PATTERN = "{SCENE}_SH{N:3}";

/** Tokens the pattern accepts, for the "Customise pattern" help line. */
export const SHOT_PATTERN_TOKENS: { token: string; meaning: string }[] = [
  { token: "{SCENE}", meaning: "scene code" },
  { token: "{N}", meaning: "shot number" },
  { token: "{N:3}", meaning: "shot number zero-padded to 3 digits" },
  { token: "{EP}", meaning: "episode, EP01 (episodic only)" },
  { token: "{I}", meaning: "1-based row index" },
];

const PATTERN_TOKEN_RE = /\{(SCENE|N(?::(\d{1,2}))?|EP|I)\}/gi;
const PATTERN_N_RE = /\{N(?::\d{1,2})?\}/i;

/** A pattern must number its shots — "Pattern needs {N}" otherwise. */
export function patternHasNumberToken(pattern: string): boolean {
  return PATTERN_N_RE.test(pattern);
}

/** EP01 — the episode token; "" when the production is not episodic. */
export function episodeToken(episodeNumber: number | undefined): string {
  return episodeNumber !== undefined
    ? `EP${String(episodeNumber).padStart(2, "0")}`
    : "";
}

/**
 * Expand one shot code from a pattern. Tokens are case-insensitive;
 * `{N:pad}` zero-pads and grows past the pad (SH1000 for pad 3) so a long
 * scene never truncates; `{EP}` is "" without an episode number; the result
 * is trimmed and uppercased because every shot code is.
 *   expandShotPattern({ pattern: "{SCENE}_SH{N:3}", sceneCode: "SC010", n: 20, index: 2 }) → "SC010_SH020"
 */
export function expandShotPattern(args: {
  pattern: string;
  sceneCode: string;
  episodeNumber?: number;
  n: number;
  index: number;
}): string {
  const scene = args.sceneCode.trim().toUpperCase();
  const ep = episodeToken(args.episodeNumber);
  return args.pattern
    .replace(PATTERN_TOKEN_RE, (_match, token: string, pad?: string) => {
      const upper = token.toUpperCase();
      if (upper === "SCENE") return scene;
      if (upper === "EP") return ep;
      if (upper === "I") return String(args.index);
      // {N} / {N:pad}
      const digits = String(args.n);
      return pad !== undefined ? digits.padStart(Number(pad), "0") : digits;
    })
    .trim()
    .toUpperCase();
}

/**
 * The full list the Generate tab previews and importRows receives:
 * count codes from `start` stepping by `step`, row index 1-based.
 *   generateShotCodes({ pattern: DEFAULT_SHOT_PATTERN, sceneCode: "SC010", count: 3, start: 10, step: 10 })
 *   → ["SC010_SH010", "SC010_SH020", "SC010_SH030"]
 */
export function generateShotCodes(args: {
  pattern: string;
  sceneCode: string;
  episodeNumber?: number;
  count: number;
  start: number;
  step: number;
}): string[] {
  const codes: string[] = [];
  for (let i = 0; i < args.count; i += 1) {
    codes.push(
      expandShotPattern({
        pattern: args.pattern,
        sceneCode: args.sceneCode,
        episodeNumber: args.episodeNumber,
        n: args.start + i * args.step,
        index: i + 1,
      }),
    );
  }
  return codes;
}
