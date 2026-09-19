import type { Id } from "@/convex/_generated/dataModel";
import { isReservedCode } from "@/convex/lib/domain";
import { parseDelimited } from "@/lib/csv";

/**
 * Pure parsing + per-row validation for New shots › Import (spec v2 item d).
 * Mirrors the rules shots.importRows applies server-side so the preview
 * table shows the same verdicts the mutation will return; the server stays
 * authoritative (codes taken between preview and submit come back skipped).
 * No DOM, no Convex — importable from tests.
 */

export const MAX_IMPORT_ROWS = 500;
export const MAX_SHOT_CODE_LENGTH = 64;
export const MAX_SHOT_TITLE_LENGTH = 200;
/** A–Z, 0–9, _ and - after trim + uppercase (shots.ts IMPORT_CODE_RE). */
export const SHOT_CODE_RE = /^[A-Z0-9_-]+$/;

export type ImportColumn =
  | "code"
  | "title"
  | "scene"
  | "episode"
  | "assignee"
  | "due"
  | "ignore";

export const COLUMN_LABELS: Record<ImportColumn, string> = {
  code: "Code",
  title: "Title",
  scene: "Scene",
  episode: "Episode",
  assignee: "Assignee",
  due: "Due date",
  ignore: "Ignore",
};

/** Header cells recognised (case-insensitive, trimmed) — spec item d. */
const HEADER_ALIASES: Record<Exclude<ImportColumn, "ignore">, string[]> = {
  code: ["code", "shot", "shot code", "shotcode", "shot_code"],
  title: ["title", "name", "shot title", "shot name"],
  scene: ["scene", "scene code", "scene_code"],
  episode: ["episode", "ep", "episode number"],
  assignee: ["assignee", "assigned to", "artist"],
  due: ["due", "due date", "due_date", "deadline"],
};

/** Positional mapping when the first row is not a header. */
export const POSITIONAL_COLUMNS: ImportColumn[] = ["code", "title", "scene"];

function normalizeHeaderCell(cell: string): string {
  return cell.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Map a first row to columns when any cell is a known header; null when the
 * row looks like data (then POSITIONAL_COLUMNS apply).
 */
export function detectHeader(row: string[]): ImportColumn[] | null {
  const columns = row.map((cell): ImportColumn => {
    const key = normalizeHeaderCell(cell);
    for (const [column, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(key)) return column as ImportColumn;
    }
    return "ignore";
  });
  return columns.some((c) => c !== "ignore") ? columns : null;
}

export type RowLevel = "ok" | "info" | "skip" | "error";

export type RowStatus = { level: RowLevel; label: string; reason?: string };

export type PreviewRow = {
  /** 1-based row number in the paste (header excluded). */
  index: number;
  code: string;
  title?: string;
  sceneCode?: string;
  /** The scene's episode when it exists, else the row's own. */
  episodeNumber?: number;
  /** What the sheet said, for the table. */
  assigneeText?: string;
  assigneeId?: Id<"users">;
  dueDate?: string;
  status: RowStatus;
};

export type PreviewInput = {
  text: string;
  /** Codes already in the production (uppercase). */
  existingCodes: ReadonlySet<string>;
  scenes: ReadonlyArray<{ code: string; episodeNumber?: number }>;
  episodes: ReadonlyArray<{ number: number }>;
  team: ReadonlyArray<{ userId?: string; name: string; email?: string }>;
  createMissingScenes: boolean;
};

export type Preview = {
  rows: PreviewRow[];
  columns: ImportColumn[];
  hasHeader: boolean;
  hasSceneColumn: boolean;
  /** Total data rows in the paste, before the cap. */
  total: number;
  /** More than MAX_IMPORT_ROWS data rows — nothing can be submitted. */
  tooMany: boolean;
  counts: { create: number; skipped: number; invalid: number; scenes: number };
};

const EMPTY_PREVIEW: Preview = {
  rows: [],
  columns: POSITIONAL_COLUMNS,
  hasHeader: false,
  hasSceneColumn: false,
  total: 0,
  tooMany: false,
  counts: { create: 0, skipped: 0, invalid: 0, scenes: 0 },
};

/** "EP01", "E1", "01", "1" → 1; anything else → undefined. */
export function parseEpisodeNumber(text: string): number | undefined {
  const match = /^(?:ep?)?0*(\d+)$/i.exec(text.trim());
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * YYYY-MM-DD as is; DD.MM.YYYY (the usual sheet format here) converted.
 * Anything else, or an impossible date, → undefined.
 */
export function parseDueDate(text: string): string | undefined {
  const raw = text.trim();
  let iso: string | undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) iso = raw;
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw);
  if (dotted) {
    iso = `${dotted[3]}-${dotted[2].padStart(2, "0")}-${dotted[1].padStart(2, "0")}`;
  }
  if (iso === undefined) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const valid =
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d;
  return valid ? iso : undefined;
}

/** Match a sheet's assignee cell to a claimed member by name or email. */
function resolveAssignee(
  text: string,
  team: PreviewInput["team"],
): Id<"users"> | undefined {
  const key = text.trim().toLowerCase();
  if (key.length === 0) return undefined;
  const member = team.find(
    (m) =>
      m.userId !== undefined &&
      (m.name.trim().toLowerCase() === key ||
        (m.email !== undefined && m.email.trim().toLowerCase() === key)),
  );
  return member?.userId as Id<"users"> | undefined;
}

/** The whole preview from one paste — recomputed on every keystroke. */
export function buildPreview(input: PreviewInput): Preview {
  if (input.text.trim().length === 0) return EMPTY_PREVIEW;
  const records = parseDelimited(input.text);
  if (records.length === 0) return EMPTY_PREVIEW;

  const headerColumns = detectHeader(records[0]);
  const hasHeader = headerColumns !== null;
  const columns = headerColumns ?? POSITIONAL_COLUMNS;
  const dataRows = hasHeader ? records.slice(1) : records;
  const total = dataRows.length;
  const tooMany = total > MAX_IMPORT_ROWS;
  const hasSceneColumn = columns.includes("scene");

  const sceneByCode = new Map(
    input.scenes.map((s) => [s.code.trim().toUpperCase(), s] as const),
  );
  const episodeNumbers = new Set(input.episodes.map((e) => e.number));
  const seen = new Set<string>();
  const scenesToCreate = new Set<string>();

  const cellFor = (record: string[], column: ImportColumn): string => {
    const i = columns.indexOf(column);
    return i === -1 ? "" : (record[i] ?? "");
  };

  const rows: PreviewRow[] = dataRows
    .slice(0, MAX_IMPORT_ROWS)
    .map((record, i) => {
      const code = cellFor(record, "code").trim().toUpperCase();
      const titleRaw = cellFor(record, "title").trim();
      const sceneRaw = cellFor(record, "scene").trim().toUpperCase();
      const episodeRaw = cellFor(record, "episode").trim();
      const assigneeRaw = cellFor(record, "assignee").trim();
      const dueRaw = cellFor(record, "due").trim();

      const row: PreviewRow = {
        index: i + 1,
        code,
        title: titleRaw.length > 0 ? titleRaw : undefined,
        sceneCode: sceneRaw.length > 0 ? sceneRaw : undefined,
        assigneeText: assigneeRaw.length > 0 ? assigneeRaw : undefined,
        status: { level: "ok", label: "ok" },
      };
      const fail = (label: string, reason: string, level: RowLevel = "error") => {
        row.status = { level, label, reason };
        return row;
      };

      // Code — same order as the server.
      if (code.length === 0)
        return fail("invalid code", "Shot code is required");
      if (code.length > MAX_SHOT_CODE_LENGTH)
        return fail(
          "invalid code",
          `Longer than ${MAX_SHOT_CODE_LENGTH} characters`,
        );
      if (isReservedCode(code))
        return fail(
          "invalid code",
          `${code.slice(0, code.indexOf("_") + 1)} codes are reserved for pre-production elements`,
        );
      if (!SHOT_CODE_RE.test(code))
        return fail("invalid code", "Use A–Z, 0–9, _ and - only");
      if (titleRaw.length > MAX_SHOT_TITLE_LENGTH)
        return fail(
          "title too long",
          `Longer than ${MAX_SHOT_TITLE_LENGTH} characters`,
        );

      // Episode from the row, when given.
      if (episodeRaw.length > 0) {
        const n = parseEpisodeNumber(episodeRaw);
        if (n === undefined || !episodeNumbers.has(n))
          return fail("unknown episode", `No episode "${episodeRaw}"`);
        row.episodeNumber = n;
      }

      // Assignee and due date.
      if (assigneeRaw.length > 0) {
        const assigneeId = resolveAssignee(assigneeRaw, input.team);
        if (assigneeId === undefined)
          return fail("unknown assignee", `No member "${assigneeRaw}"`);
        row.assigneeId = assigneeId;
      }
      if (dueRaw.length > 0) {
        const due = parseDueDate(dueRaw);
        if (due === undefined)
          return fail("bad date", `"${dueRaw}" is not YYYY-MM-DD`);
        row.dueDate = due;
      }

      // Scene: existing (its episode shows), new (info), or refused.
      let sceneInfo: RowStatus | null = null;
      if (sceneRaw.length > 0) {
        const scene = sceneByCode.get(sceneRaw);
        if (scene !== undefined) {
          if (row.episodeNumber === undefined && scene.episodeNumber !== undefined)
            row.episodeNumber = scene.episodeNumber;
        } else if (input.createMissingScenes) {
          sceneInfo = {
            level: "info",
            label: "unknown scene → will be created",
          };
        } else {
          return fail("unknown scene", `No scene ${sceneRaw}`);
        }
      }

      // Duplicates inside the paste, then codes the production already has.
      if (seen.has(code))
        return fail("duplicate in paste (skip)", "Listed above", "skip");
      seen.add(code);
      if (input.existingCodes.has(code))
        return fail("exists (skip)", "Already in this production", "skip");

      if (sceneInfo !== null) {
        row.status = sceneInfo;
        scenesToCreate.add(sceneRaw);
      }
      return row;
    });

  const counts = { create: 0, skipped: 0, invalid: 0, scenes: scenesToCreate.size };
  for (const row of rows) {
    if (row.status.level === "ok" || row.status.level === "info") counts.create += 1;
    else if (row.status.level === "skip") counts.skipped += 1;
    else counts.invalid += 1;
  }
  return { rows, columns, hasHeader, hasSceneColumn, total, tooMany, counts };
}

export type ImportRowPayload = {
  code: string;
  title?: string;
  sceneCode?: string;
  episodeNumber?: number;
  assigneeId?: Id<"users">;
  dueDate?: string;
};

/**
 * Rows to send: everything but errors and in-paste duplicates. Codes the
 * preview marked "exists" go too — the server decides (the shot may have
 * been removed since) and reports them in `skipped`.
 */
export function rowsToSubmit(preview: Preview): ImportRowPayload[] {
  return preview.rows
    .filter(
      (row) =>
        row.status.level === "ok" ||
        row.status.level === "info" ||
        row.status.label === "exists (skip)",
    )
    .map((row) => ({
      code: row.code,
      title: row.title,
      sceneCode: row.sceneCode,
      episodeNumber: row.episodeNumber,
      assigneeId: row.assigneeId,
      dueDate: row.dueDate,
    }));
}
