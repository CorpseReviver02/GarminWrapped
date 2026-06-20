// lib/detect.ts — Lightweight CSV-kind detection.
// Used to give a helpful "this file belongs in another slot" message when a user
// uploads the wrong Garmin export (e.g., a Sleep CSV into the Activities slot).

import { normalizeKey } from './activity-columns';

export type CsvKind = 'activities' | 'sleep' | 'steps' | 'unknown';

function str(v: unknown): string {
  return String(v ?? '').replace(/\u00A0/g, ' ').trim();
}

function isDurationLike(v: unknown): boolean {
  const s = str(v);
  return /^\d{1,2}:\d{2}$/.test(s) || /\d\s*h(\s|$)/i.test(s) || /\bmin\b/i.test(s);
}

function isScoreLike(v: unknown): boolean {
  const s = str(v);
  if (!/^\d{1,3}$/.test(s)) return false;
  const n = parseInt(s, 10);
  return n >= 1 && n <= 100;
}

function isStepCount(v: unknown): boolean {
  const s = str(v).replace(/[,\s]/g, '');
  if (!/^\d+$/.test(s)) return false;
  const n = parseInt(s, 10);
  return n >= 1500 && n <= 500000;
}

/**
 * Best-effort classification of a parsed (headerless) CSV grid.
 * "activities" is the most reliable signal (a dedicated Activity Type column or a
 * wide multi-metric export). Sleep/steps fall back to keyword + body heuristics.
 */
export function detectCsvKind(raw2D: unknown[][]): CsvKind {
  if (!raw2D.length) return 'unknown';

  const header = (raw2D[0] as unknown[]).map((h) => normalizeKey(str(h)));
  const headerStr = header.join('|');
  const cols = header.length;

  // Activities: a dedicated "Activity Type" column, or a wide multi-metric export.
  const hasActivityType = header.some((h) => h.includes('activitytype'));
  const wideMetric =
    cols >= 12 &&
    header.some((h) => h.includes('distance')) &&
    header.some((h) => h.includes('calories'));
  if (hasActivityType || wideMetric) return 'activities';

  // Header keyword hints (a few languages).
  if (/steps|pas|schritte|pasos|stappen/.test(headerStr)) return 'steps';
  if (/sleep|schlaf|sommeil|sueno|slaap/.test(headerStr)) return 'sleep';

  // Body heuristics on the first several rows.
  const body = raw2D.slice(1, 12) as unknown[][];
  let sleepish = 0;
  let stepsish = 0;
  for (const r of body) {
    if (!Array.isArray(r)) continue;
    const hasDur = r.some(isDurationLike);
    if (r.some(isScoreLike) && hasDur) sleepish += 1;
    if (r.some(isStepCount) && !hasDur) stepsish += 1;
  }
  if (sleepish >= 2 && sleepish >= stepsish) return 'sleep';
  if (stepsish >= 2) return 'steps';
  return 'unknown';
}
