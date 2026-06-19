// lib/parse.ts — Low-level cell/value parsers + a Promise wrapper around Papa Parse.

import Papa from 'papaparse';
import type { ParseResult } from 'papaparse';
import type { CsvPrimitive, RawRow } from './types';

export function toStringSafe(v: unknown): string { return String(v ?? '').trim(); }
export function asCell(v: unknown): CsvPrimitive { const s = toStringSafe(v); return s.length ? s : null; }

export function isTextual(v: unknown): v is string {
  const s = toStringSafe(v);
  if (!s) return false;
  // Treat cells with any non-numeric characters as text labels (e.g., 'Dec 5-11')
  return !/^[\d\s,\.\-]+$/.test(s);
}

export function parseNumber(value: unknown): number {
  if (value == null) return 0;
  let s = String(value).trim();
  s = s.replace(/[\u00A0\u2007\u202F\s]/g, '');
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  const usThousands = /^\d{1,3}(,\d{3})+$/;
  const euThousands = /^\d{1,3}(\.\d{3})+$/;

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) s = s.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(/,/, '.');
    else s = s.replace(/,(?=\d{3}(?:\D|$))/g, '');
  } else if (hasComma && !hasDot) {
    if (usThousands.test(s)) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
  } else if (!hasComma && hasDot) {
    if (euThousands.test(s)) s = s.replace(/\./g, '');
  }

  s = s.replace(/[^\d.\-]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function parseIntStrict(value: unknown): number {
  const s = String(value ?? '').replace(/[^\d\-]/g, '');
  const n = parseInt(s || '0', 10);
  return Number.isFinite(n) ? n : 0;
}

export function parseTimeToSeconds(value: unknown): number {
  const s = toStringSafe(value);
  if (!s) return 0;
  const parts = s.split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return 0;
  if (parts.length === 3) { const [h, m, sec] = parts as [number, number, number]; return h * 3600 + m * 60 + sec; }
  if (parts.length === 2) { const [m, sec] = parts as [number, number]; return m * 60 + sec; }
  return 0;
}

export function parseSleepDurationToMinutes(value: unknown): number {
  const s = toStringSafe(value);
  if (!s) return 0;
  const hhmm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) return parseInt(hhmm[1]!, 10) * 60 + parseInt(hhmm[2]!, 10);
  const mixed = s.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*(?:min|m))?/i);
  if (mixed) {
    const h = mixed[1] ? parseInt(mixed[1]!, 10) : 0;
    const m = mixed[2] ? parseInt(mixed[2]!, 10) : 0;
    return h * 60 + m;
  }
  return 0;
}

export function parseDateWithLocale(value: unknown): Date | null {
  const s = toStringSafe(value).replace(/\u00A0/g, ' ');
  if (!s) return null;
  const iso = new Date(s); if (!Number.isNaN(iso.getTime())) return iso;

  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (dmy) {
    const d = parseInt(dmy[1]!, 10), m = parseInt(dmy[2]!, 10), y = parseInt(dmy[3]!, 10);
    const hh = dmy[4] ? parseInt(dmy[4]!, 10) : 0; const mm = dmy[5] ? parseInt(dmy[5]!, 10) : 0;
    const year = y < 100 ? 2000 + y : y;
    const isDMY = d > 12;
    const month = (isDMY ? m : d) - 1; const day = isDMY ? d : m;
    const dt = new Date(year, month, day, hh, mm);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const dmyDot = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (dmyDot) {
    const d = parseInt(dmyDot[1]!, 10), m = parseInt(dmyDot[2]!, 10), y = parseInt(dmyDot[3]!, 10);
    const hh = dmyDot[4] ? parseInt(dmyDot[4]!, 10) : 0; const mm = dmyDot[5] ? parseInt(dmyDot[5]!, 10) : 0;
    const year = y < 100 ? 2000 + y : y;
    const dt = new Date(year, m - 1, d, hh, mm);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return null;
}

/* ----------------------------- Papa Parse wrapper ----------------------------- */

// Minimal Papa Parse config type (avoids BaseConfig/ParseConfig typing differences across papaparse versions)
export type PapaConfig<T> = {
  header?: boolean;
  dynamicTyping?: boolean | Record<string, boolean>;
  skipEmptyLines?: boolean | 'greedy';
  worker?: boolean;
  transformHeader?: (header: string, index: number) => string;
  step?: (results: ParseResult<T>, parser: unknown) => void;
  complete?: (results: ParseResult<T>) => void;
  error?: (error: unknown) => void;
  [key: string]: unknown;
};

export const PAPA_ROWS_CONFIG: PapaConfig<RawRow> = {
  header: false,
  skipEmptyLines: true,
};

/** Promise-based wrapper around Papa.parse (local File/Blob only). */
export function parseCsvFile<T = RawRow>(
  file: File | Blob,
  config?: PapaConfig<T>
): Promise<ParseResult<T>> {
  return new Promise<ParseResult<T>>((resolve, reject) => {
    // Build a config object that is correctly typed to the row shape `T`.
    const cfg = {
      skipEmptyLines: true,
      ...(config ?? {}),
      complete: (results: ParseResult<T>) => resolve(results),
      error: (err: unknown) => reject(err),
    } as PapaConfig<T>;

    const papaParse = Papa.parse as unknown as <U>(input: File | Blob, config: PapaConfig<U>) => void;
    papaParse<T>(file, cfg);
  });
}
