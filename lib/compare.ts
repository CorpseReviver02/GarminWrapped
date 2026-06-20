// lib/compare.ts — Year-over-year comparison built on the existing computeMetrics.
//
// Takes the full set of mapped activity rows (which may span multiple years),
// buckets them by calendar year, runs computeMetrics on each, and diffs the
// headline numbers. Activities-only by design (Steps/Sleep exports are single-year).

import type { CsvRow, Metrics, UnitHint, UnitSystem } from './types';
import { parseDateWithLocale } from './parse';
import { computeMetrics } from './metrics';

export type MetricDelta = {
  current: number;
  prior: number;
  abs: number;          // current - prior
  pct: number | null;   // percentage change, null when prior is 0
};

export type YearComparison = {
  currentYear: number;
  priorYear: number;
  current: Metrics;
  prior: Metrics;
  deltas: {
    totalDistanceMi: MetricDelta;
    sessions: MetricDelta;
    totalActivitySeconds: MetricDelta;
    totalCalories: MetricDelta;
    runDistanceMi: MetricDelta;
    bikeDistanceMi: MetricDelta;
    swimMeters: MetricDelta;
    /** Running pace in seconds per mile (lower is faster); abs < 0 means improvement. */
    runPaceSecPerMi: MetricDelta;
  };
};

function yearOf(row: CsvRow): number | null {
  const d = parseDateWithLocale(row['Date']);
  return d ? d.getFullYear() : null;
}

export function partitionByYear(rows: CsvRow[]): Map<number, CsvRow[]> {
  const map = new Map<number, CsvRow[]>();
  for (const row of rows) {
    const y = yearOf(row);
    if (y == null) continue;
    const bucket = map.get(y);
    if (bucket) bucket.push(row);
    else map.set(y, [row]);
  }
  return map;
}

/** Sorted list of calendar years present in the data (ascending). */
export function yearsPresent(rows: CsvRow[]): number[] {
  return Array.from(partitionByYear(rows).keys()).sort((a, b) => a - b);
}

function delta(current: number, prior: number): MetricDelta {
  const abs = current - prior;
  const pct = prior !== 0 ? (abs / prior) * 100 : null;
  return { current, prior, abs, pct };
}

function runPaceSecPerMi(m: Metrics): number {
  const mi = m.runDistanceMi ?? 0;
  const sec = m.runSeconds ?? 0;
  return mi > 0 ? sec / mi : 0;
}

/**
 * Compare a target year against the most recent year that precedes it.
 * `targetYear` defaults to the latest year present. Returns null when fewer
 * than two years of data are available, or no prior year exists.
 */
export function compareYears(
  rows: CsvRow[],
  unitSystem: UnitSystem,
  unitHints: { distance: UnitHint; ascent: UnitHint; elevation: UnitHint },
  targetYear?: number
): YearComparison | null {
  const byYear = partitionByYear(rows);
  const years = Array.from(byYear.keys()).sort((a, b) => a - b);
  if (years.length < 2) return null;

  const currentYear =
    targetYear != null && byYear.has(targetYear) ? targetYear : years[years.length - 1]!;

  const priorCandidates = years.filter((y) => y < currentYear);
  if (!priorCandidates.length) return null;
  const priorYear = priorCandidates[priorCandidates.length - 1]!;

  const current = computeMetrics(byYear.get(currentYear)!, unitSystem, unitHints);
  const prior = computeMetrics(byYear.get(priorYear)!, unitSystem, unitHints);

  return {
    currentYear,
    priorYear,
    current,
    prior,
    deltas: {
      totalDistanceMi: delta(current.totalDistanceMi, prior.totalDistanceMi),
      sessions: delta(current.sessions, prior.sessions),
      totalActivitySeconds: delta(current.totalActivitySeconds, prior.totalActivitySeconds),
      totalCalories: delta(current.totalCalories ?? 0, prior.totalCalories ?? 0),
      runDistanceMi: delta(current.runDistanceMi ?? 0, prior.runDistanceMi ?? 0),
      bikeDistanceMi: delta(current.bikeDistanceMi ?? 0, prior.bikeDistanceMi ?? 0),
      swimMeters: delta(current.swimMeters ?? 0, prior.swimMeters ?? 0),
      runPaceSecPerMi: delta(runPaceSecPerMi(current), runPaceSecPerMi(prior)),
    },
  };
}
