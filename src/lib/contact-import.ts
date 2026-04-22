import "server-only";

import Papa from "papaparse";
import * as XLSX from "xlsx";

const EMAIL_COLUMN_NAMES = new Set([
  "email",
  "e-mail",
  "mail",
  "электронная почта",
  "почта",
]);

const EMAIL_RE = /^[a-zA-Z0-9._%+\-]{1,64}@[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

const MAX_CONTACTS = 100_000;

export interface ParsedContacts {
  columns: string[];
  emailColumn: string;
  rows: { email: string; data: Record<string, string> }[];
  duplicatesRemoved: number;
}

function detectEmailColumn(columns: string[], sampleRows: Record<string, string>[]): string | null {
  // 1. Check by name
  for (const col of columns) {
    if (EMAIL_COLUMN_NAMES.has(col.trim().toLowerCase())) return col;
  }

  // 2. Check by content — first column where all sample values look like emails
  for (const col of columns) {
    const values = sampleRows
      .map((r) => r[col])
      .filter((v) => v && v.trim());
    if (values.length > 0 && values.every((v) => EMAIL_RE.test(v.trim()))) {
      return col;
    }
  }

  return null;
}

function processRows(
  columns: string[],
  rawRows: Record<string, string>[],
  emailColumn: string,
): Omit<ParsedContacts, "columns" | "emailColumn"> {
  const seen = new Set<string>();
  const rows: ParsedContacts["rows"] = [];
  let duplicatesRemoved = 0;

  for (const raw of rawRows) {
    if (rows.length >= MAX_CONTACTS) break;

    const emailRaw = raw[emailColumn];
    if (!emailRaw) continue;

    const email = emailRaw.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) continue;

    if (seen.has(email)) {
      duplicatesRemoved++;
      continue;
    }
    seen.add(email);

    // Build data object with all non-email columns
    const data: Record<string, string> = {};
    for (const col of columns) {
      if (col === emailColumn) continue;
      const val = raw[col];
      if (val && val.trim()) data[col] = val.trim();
    }

    rows.push({ email, data });
  }

  return { rows, duplicatesRemoved };
}

export function parseCSV(buffer: Buffer): ParsedContacts {
  const text = decodeBuffer(buffer);
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const columns = result.meta.fields ?? [];
  if (columns.length === 0) throw new Error("CSV file has no columns");

  const emailColumn = detectEmailColumn(columns, result.data.slice(0, 10));
  if (!emailColumn) throw new Error("Could not detect email column");

  const { rows, duplicatesRemoved } = processRows(columns, result.data, emailColumn);
  return { columns, emailColumn, rows, duplicatesRemoved };
}

export function parseXLSX(buffer: Buffer): ParsedContacts {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("XLSX file has no sheets");

  const rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(
    workbook.Sheets[sheetName],
    { defval: "", raw: false },
  );

  if (rawRows.length === 0) throw new Error("XLSX file is empty");

  const columns = Object.keys(rawRows[0]).map((c) => c.trim());
  const emailColumn = detectEmailColumn(columns, rawRows.slice(0, 10));
  if (!emailColumn) throw new Error("Could not detect email column");

  const { rows, duplicatesRemoved } = processRows(columns, rawRows, emailColumn);
  return { columns, emailColumn, rows, duplicatesRemoved };
}

export function parseContactFile(buffer: Buffer, filename: string): ParsedContacts {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return parseCSV(buffer);
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return parseXLSX(buffer);
  throw new Error("Unsupported file type. Use CSV or XLSX.");
}

/** Decode a buffer trying BOM-aware UTF-8, then cp1251 fallback. */
function decodeBuffer(buf: Buffer): string {
  // UTF-8 BOM
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString("utf-8");
  }
  // UTF-16 LE/BE
  if ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff)) {
    return buf.toString("utf-16le");
  }
  return buf.toString("utf-8");
}
