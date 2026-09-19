/**
 * CSV helpers shared by the Decisions ledger export, the provenance export
 * (v2 item c) and the New shots › Import tab (v2 item d). No DOM or server
 * imports — usable from components, Convex functions and tests alike.
 */

/** UTF-8 byte-order mark. Excel on Windows assumes the system codepage
 * without it, which turns Cyrillic titles, names and notes into mojibake. */
export const CSV_BOM = "﻿";

/** Prepend the BOM once (never twice). */
export function withBom(text: string): string {
  return text.startsWith(CSV_BOM) ? text : CSV_BOM + text;
}

/** Strip a leading BOM — pasted and uploaded files often carry one. */
export function stripBom(text: string): string {
  return text.startsWith(CSV_BOM) ? text.slice(1) : text;
}

export type CsvNewline = "\r\n" | "\n";

export type CsvOptions = {
  /**
   * Quote EVERY cell and skip the formula-lead guard. For files that are
   * evidence (the provenance export): the cell must read back exactly as it
   * was stored, so no `'` is ever prepended. Default false — the guard is
   * on and cells are quoted only when they need it.
   */
  verbatim?: boolean;
  /** Line ending. Default "\r\n" (RFC 4180, what Excel expects). */
  newline?: CsvNewline;
  /** Column delimiter. Default ",". */
  delimiter?: string;
};

/**
 * Excel and Sheets evaluate any cell that starts with = + - @ (or a leading
 * tab/CR), so an exported decision note, shot code or member name can run as
 * a formula when the producer opens the file. Prefixing with a single quote
 * marks the cell as text — the value still reads the same in the sheet.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * One cell. Default mode: formula-lead guard, then quote when the cell holds
 * the delimiter, a quote or a line break (`"` doubled). Verbatim mode: no
 * guard, always quoted.
 */
export function csvEscape(value: string, options: CsvOptions = {}): string {
  const delimiter = options.delimiter ?? ",";
  if (options.verbatim === true) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  const cell = FORMULA_LEAD.test(value) ? `'${value}` : value;
  const needsQuotes =
    cell.includes(delimiter) ||
    cell.includes('"') ||
    cell.includes("\n") ||
    cell.includes("\r");
  return needsQuotes ? `"${cell.replaceAll('"', '""')}"` : cell;
}

/**
 * Serialise rows (header included, as the first row) to CSV text. No BOM —
 * wrap with `withBom` at the download site. Non-string cells are stringified
 * (`null`/`undefined` → empty) so callers can pass numbers and booleans.
 */
export function toCsv(
  rows: ReadonlyArray<ReadonlyArray<string | number | boolean | null | undefined>>,
  options: CsvOptions = {},
): string {
  const delimiter = options.delimiter ?? ",";
  const newline = options.newline ?? "\r\n";
  return rows
    .map((row) =>
      row
        .map((cell) =>
          csvEscape(
            cell === null || cell === undefined ? "" : String(cell),
            { ...options, delimiter },
          ),
        )
        .join(delimiter),
    )
    .join(newline);
}

/** A ready-to-download UTF-8 CSV blob with the BOM prepended. */
export function csvBlob(csv: string): Blob {
  return new Blob([withBom(csv)], { type: "text/csv;charset=utf-8" });
}

export type Delimiter = "\t" | "," | ";";

/**
 * Guess the delimiter from the first non-empty line, counting separators
 * outside quotes: a tab wins outright (Google Sheets pastes TSV), otherwise
 * whichever of `,` / `;` occurs more; comma when neither does.
 */
export function detectDelimiter(text: string): Delimiter {
  const body = stripBom(text);
  const firstLine =
    body.split(/\r\n|\r|\n/).find((line) => line.trim().length > 0) ?? "";
  let tabs = 0;
  let commas = 0;
  let semicolons = 0;
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (ch === "\t") tabs += 1;
      else if (ch === ",") commas += 1;
      else if (ch === ";") semicolons += 1;
    }
  }
  if (tabs > 0) return "\t";
  if (semicolons > commas) return ";";
  return ",";
}

/**
 * Small RFC 4180 parser for pasted sheets and uploaded .csv/.tsv files.
 * Tolerates a BOM, CRLF / CR / LF endings and a missing final newline;
 * `"…"` cells may hold the delimiter, line breaks and doubled quotes. The
 * delimiter is auto-detected unless given. Records whose cells are all empty
 * (blank lines, the trailing newline) are dropped; cells are NOT trimmed —
 * the Import tab decides what whitespace means.
 */
export function parseDelimited(
  text: string,
  options: { delimiter?: string } = {},
): string[][] {
  const body = stripBom(text);
  const delimiter = options.delimiter ?? detectDelimiter(body);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const endRow = () => {
    row.push(cell);
    cell = "";
    if (row.some((c) => c.length > 0)) rows.push(row);
    row = [];
  };
  while (i < body.length) {
    const ch = body[i];
    if (inQuotes) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && cell.length === 0) {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      endRow();
      i += body[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  // Last record without a trailing newline (or an unterminated quote — take
  // what we have rather than lose the row).
  if (cell.length > 0 || row.length > 0) endRow();
  return rows;
}
