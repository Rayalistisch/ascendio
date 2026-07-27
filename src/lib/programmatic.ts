// Programmatic SEO kern-utilities.
//
// Een dataset (kolommen + rijen) gecombineerd met titel-/slug-/topic-patronen
// met {{variabelen}} levert per rij één "topic" op dat via de bestaande
// generatie-worker een volwaardige, unieke pagina wordt.

export interface ParsedCsv {
  columns: string[];
  rows: Record<string, string>[];
}

export interface ProgrammaticPatterns {
  titlePattern: string;
  slugPattern?: string | null;
  topicPattern?: string | null;
}

export interface PreviewTopic {
  rowIndex: number;
  title: string;
  slug: string;
  topic: string;
  keywords: string[];
  resolvedVars: Record<string, string>;
  error?: string;
}

const VARIABLE_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

/**
 * Parse a CSV string into columns + row objects.
 * Handles quoted fields (RFC-4180 style: doubled quotes to escape),
 * commas inside quotes, and both LF and CRLF line endings.
 * The first non-empty line is treated as the header row.
 */
export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else if (char === "\r") {
      // swallow; a following \n triggers the row push
      if (text[i + 1] !== "\n") pushRow();
    } else {
      field += char;
    }
  }
  // flush trailing field/row if the file doesn't end with a newline
  if (field.length > 0 || row.length > 0) pushRow();

  // Drop fully-empty rows (e.g. trailing blank line)
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonEmpty.length === 0) return { columns: [], rows: [] };

  const header = nonEmpty[0].map((c) => c.trim());
  const dataRows = nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((col, idx) => {
      obj[col] = (r[idx] ?? "").trim();
    });
    return obj;
  });

  return { columns: header, rows: dataRows };
}

/**
 * Return the unique variable names referenced in a pattern, in order of
 * first appearance. `"{{dienst}} in {{stad}}"` -> `["dienst", "stad"]`.
 */
export function extractVariables(pattern: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let match: RegExpExecArray | null;
  VARIABLE_RE.lastIndex = 0;
  while ((match = VARIABLE_RE.exec(pattern)) !== null) {
    const name = match[1].trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/**
 * Substitute {{variabelen}} in a pattern with values from a row.
 * Throws when a referenced column is missing or empty — a silently
 * half-resolved title/slug is worse than a loud failure during preview.
 */
export function resolvePattern(pattern: string, row: Record<string, string>): string {
  return pattern.replace(VARIABLE_RE, (_full, rawName: string) => {
    const name = rawName.trim();
    const value = row[name];
    if (value === undefined) {
      throw new Error(`Kolom "${name}" bestaat niet in de dataset`);
    }
    if (value.trim() === "") {
      throw new Error(`Kolom "${name}" is leeg in deze rij`);
    }
    return value.trim();
  });
}

/**
 * Turn arbitrary text into a URL slug (lowercase, hyphenated, ASCII-folded).
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Build preview topics from patterns + rows without touching the database.
 * Each row yields one PreviewTopic; rows that fail to resolve carry an
 * `error` string instead of throwing, so the UI can show which rows are bad.
 * `keywords` are the resolved variable values plus the resolved title —
 * these feed `targetKeywords` on the generation request.
 */
export function previewTopics(
  patterns: ProgrammaticPatterns,
  rows: Record<string, string>[],
  limit?: number
): PreviewTopic[] {
  const slice = typeof limit === "number" ? rows.slice(0, limit) : rows;
  return slice.map((row, rowIndex) => {
    try {
      const title = resolvePattern(patterns.titlePattern, row);
      const topic = patterns.topicPattern
        ? resolvePattern(patterns.topicPattern, row)
        : title;
      const slug = patterns.slugPattern
        ? slugify(resolvePattern(patterns.slugPattern, row))
        : slugify(title);

      // Keywords: resolved variable values are the ranking-intent signal.
      const varNames = extractVariables(
        [patterns.titlePattern, patterns.topicPattern ?? "", patterns.slugPattern ?? ""].join(" ")
      );
      const keywords = Array.from(
        new Set([
          title.toLowerCase(),
          ...varNames.map((n) => (row[n] ?? "").trim()).filter(Boolean),
        ])
      );

      return { rowIndex, title, slug, topic, keywords, resolvedVars: { ...row } };
    } catch (err) {
      return {
        rowIndex,
        title: "",
        slug: "",
        topic: "",
        keywords: [],
        resolvedVars: { ...row },
        error: err instanceof Error ? err.message : "Onbekende fout",
      };
    }
  });
}
