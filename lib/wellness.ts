// lib/wellness.ts — Sleep + Steps CSV mapping and metrics (optional uploads).

import type { CsvRow, SleepMetrics, StepsMetrics } from './types';
import {
  asCell, toStringSafe, isTextual,
  parseNumber, parseIntStrict, parseSleepDurationToMinutes,
} from './parse';

/* ----------------------- Sleep (headerless + heuristics) ----------------------- */

type SleepSchema = { name: string; columns: number; idx: { label: number; score: number; duration: number } };

const KNOWN_SLEEP_SCHEMAS: SleepSchema[] = [
  { name: 'sleep-weekly-4', columns: 4, idx: { label: 0, score: 1, duration: 2 } },
  // Fix: this export’s score is at col 1 (not 2); duration at 3
  { name: 'sleep-weekly-6', columns: 6, idx: { label: 0, score: 1, duration: 3 } },
  { name: 'sleep-weekly-7', columns: 7, idx: { label: 0, score: 1, duration: 3 } },
];

function isDurationLike(v: unknown): boolean {
  const s = toStringSafe(v);
  return /^(\d{1,2}):\d{2}$/.test(s) || /h/i.test(s) || /\bmin\b/i.test(s);
}

function isScoreLike(v: unknown): boolean {
  // Strict numeric-cell check (prevents parsing "27-Dec" as 27, or "2024 - Jan 2" as 2)
  const s = toStringSafe(v).replace(/\u00A0/g, ' ').trim();
  if (!/^\d{1,3}$/.test(s)) return false;
  const n = parseInt(s, 10);
  return n >= 1 && n <= 100;
}

export function mapSleepRowsByIndex(rows2D: unknown[][]): CsvRow[] {
  if (!rows2D.length) return [];
  const header = rows2D[0] as unknown[];
  const rows = rows2D.slice(1) as unknown[][];

  // Fast-path: if all rows are uniform, we can use known fixed indices.
  const uniform = rows.every(r => Array.isArray(r) && r.length === header.length);
  const known = KNOWN_SLEEP_SCHEMAS.find(s => s.columns === header.length);
  if (uniform && known) {
    return rows.map(r => ({
      'Date':         asCell(r[known.idx.label]),
      'Avg Score':    asCell(r[known.idx.score]),
      'Avg Duration': asCell(r[known.idx.duration]),
    }));
  }

  // Robust-path: some Garmin exports "split" the Date/week label into extra year columns
  // (e.g., weeks spanning Dec→Jan). In that case, the score/duration columns shift per-row.
  return rows
    .map((r) => {
      if (!Array.isArray(r) || r.length === 0) return null;

      // Score = first 1..100 number in the row
      let scoreIdx = -1;
      for (let i = 0; i < r.length; i++) {
        if (isScoreLike(r[i])) { scoreIdx = i; break; }
      }
      if (scoreIdx === -1) return null;

      // Duration = first duration-like cell AFTER the score (avoids Avg Sleep Need if present)
      let durationIdx = -1;
      for (let i = scoreIdx + 1; i < r.length; i++) {
        if (isDurationLike(r[i])) { durationIdx = i; break; }
      }

      // Label = everything before score (drop standalone year columns like "2024")
      const label = r
        .slice(0, scoreIdx)
        .map(toStringSafe)
        .map(s => s.replace(/\u00A0/g, ' ').trim())
        .filter(Boolean)
        .filter(s => !/^\d{4}$/.test(s))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      return {
        'Date':         asCell(label),
        'Avg Score':    asCell(r[scoreIdx]),
        'Avg Duration': asCell(durationIdx !== -1 ? r[durationIdx] : null),
      } as CsvRow;
    })
    .filter((x): x is CsvRow => !!x);
}

/* ----------------------- Steps (headerless + heuristics) ----------------------- */

type StepsSchema = { name: string; columns: number; idx: { label: number; steps: number; days?: number } };

const KNOWN_STEPS_SCHEMAS: StepsSchema[] = [
  { name: 'steps-weekly-3',  columns: 3, idx: { label: 0, steps: 1, days: 2 } },
  { name: 'steps-weekly-3b', columns: 3, idx: { label: 0, days: 1, steps: 2 } },
  { name: 'steps-weekly-4',  columns: 4, idx: { label: 0, steps: 2, days: 3 } },
];

function isLikelySteps(v: unknown): boolean { const n = parseIntStrict(v); return n >= 1000 && n <= 500000; }

export function mapStepsRowsByIndex(rows2D: unknown[][]): CsvRow[] {
  if (!rows2D.length) return [];
  const header = rows2D[0] as unknown[];
  const rows = rows2D.slice(1) as unknown[][];
  const colCount = header.length;

  const known = KNOWN_STEPS_SCHEMAS.find(s => s.columns === colCount);
  if (known) {
    return rows.map((r, i) => ({
      'Label': asCell(r[known.idx.label]) ?? `Period ${i + 1}`,
      'Steps': asCell(r[known.idx.steps]),
      'Days':  known.idx.days != null ? asCell(r[known.idx.days]) : '',
    }));
  }

  const sample = rows.slice(0, Math.min(10, rows.length));

  let stepsCol = -1, stepsHits = -1;
  for (let c = 0; c < colCount; c++) {
    let hits = 0; for (const r of sample) if (isLikelySteps(r[c])) hits++;
    if (hits > stepsHits) { stepsHits = hits; stepsCol = c; }
  }

  let daysCol = -1, sevenHits = -1;
  for (let c = 0; c < colCount; c++) {
    let hits = 0; for (const r of sample) if (parseIntStrict(r[c]) === 7) hits++;
    if (hits > sevenHits) { sevenHits = hits; daysCol = c; }
  }
  if (sevenHits <= 1) daysCol = -1;

  let labelCol = -1;
  for (let c = 0; c < colCount; c++) {
    if (c === stepsCol || c === daysCol) continue;
    const v = sample[0]?.[c];
    if (isTextual(v)) { labelCol = c; break; }
  }
  if (labelCol === -1) labelCol = 0;

  return rows.map((r, i) => ({
    'Label': asCell(r[labelCol]) ?? `Period ${i + 1}`,
    'Steps': asCell(r[stepsCol]),
    'Days':  daysCol !== -1 ? asCell(r[daysCol]) : '',
  }));
}

/* ----------------------------- Metrics ----------------------------- */

export function computeSleepMetrics(rows: CsvRow[]): SleepMetrics {
  // Keep score + duration averages resilient to any row-level parsing oddities.
  // (e.g., year-spanning rows where the "Date" cell is split into extra columns)
  let scoreSum = 0, scoreCount = 0;
  let durationSum = 0, durationCount = 0;

  let bestScoreWeek: SleepMetrics['bestScoreWeek'] = null;
  let worstScoreWeek: SleepMetrics['worstScoreWeek'] = null;
  let longestSleepWeek: SleepMetrics['longestSleepWeek'] = null;

  rows.forEach((row) => {
    const score = parseNumber(row['Avg Score']);
    const label = toStringSafe(row['Date'] ?? row['Label'] ?? '');
    const durationMinutes = parseSleepDurationToMinutes(row['Avg Duration']);

    const hasScore = score > 0 && score <= 100;
    const hasDuration = durationMinutes > 0;

    if (!label || (!hasScore && !hasDuration)) return;

    if (hasScore) {
      scoreSum += score;
      scoreCount += 1;

      if (!bestScoreWeek || score > bestScoreWeek.score) bestScoreWeek = { label, score, durationMinutes };
      if (!worstScoreWeek || score < worstScoreWeek.score) worstScoreWeek = { label, score, durationMinutes };
    }

    if (hasDuration) {
      durationSum += durationMinutes;
      durationCount += 1;

      if (!longestSleepWeek || durationMinutes > longestSleepWeek.durationMinutes) {
        longestSleepWeek = { label, durationMinutes, score };
      }
    }
  });

  return {
    weeks: durationCount || scoreCount,
    avgScore: scoreCount ? scoreSum / scoreCount : 0,
    avgDurationMinutes: durationCount ? durationSum / durationCount : 0,
    bestScoreWeek,
    worstScoreWeek,
    longestSleepWeek,
  };
}

export function computeStepsMetrics(rows: CsvRow[]): StepsMetrics {
  let periods = 0, totalSteps = 0, totalDays = 0;
  let bestWeek: StepsMetrics['bestWeek'] | null = null;
  let worstWeek: StepsMetrics['worstWeek'] | null = null;

  rows.forEach((row, idx) => {
    const steps = parseIntStrict(row['Steps']);
    if (!steps) return;

    const label = toStringSafe(row['Week'] ?? row['Label'] ?? row['Date'] ?? row[''] ?? `Period ${idx + 1}`);
    // Garmin's steps export is a weekly wellness report; default to a 7-day period
    // when an explicit "Days" column isn't present.
    const daysInPeriod = parseIntStrict(row['Days']) || 7;

    periods += 1; totalSteps += steps; totalDays += daysInPeriod;

    const resolvedLabel = label || `Week ${periods}`;

    if (!bestWeek || steps > bestWeek.steps) {
      bestWeek = { label: resolvedLabel, steps };
    }
    if (!worstWeek || steps < worstWeek.steps) {
      worstWeek = { label: resolvedLabel, steps };
    }
  });

  const days = totalDays || periods * 7 || 1;
  const avgStepsPerDay = totalSteps / days;

  return { weeks: periods, totalSteps, avgStepsPerDay, bestWeek, worstWeek };
}
