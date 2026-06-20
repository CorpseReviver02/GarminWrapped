// lib/trends.ts — Within-year "improvement" metrics (progress over the year, not just totals).
//
// Derived entirely from a single year's mapped activity rows — no extra data needed.
// Powers month-by-month sparklines and "you got faster / went longer" callouts.

import type { CsvRow, UnitHint, UnitSystem } from './types';
import { parseDateWithLocale, parseTimeToSeconds, parseNumber } from './parse';
import { canonicalizeActivityType } from './activity-columns';
import { normalizeDistanceToMiles } from './normalize';

export type MonthlyPoint = {
  distanceMi: number;      // all activities, miles
  seconds: number;
  sessions: number;
  longestRunMi: number;
  runMi: number;           // running only, miles
  bikeMi: number;          // cycling only, miles
  swimMeters: number;      // swimming only, raw meters
  otherMi: number;         // everything else (hiking, rowing, walking, …), miles
};

export type TrendMetrics = {
  monthly: MonthlyPoint[];           // length 12, Jan..Dec
  activeMonths: number;              // months with >= 1 session
  busiestMonth: { monthIdx: number; distanceMi: number; seconds: number } | null;
  mostImprovedMonth: { monthIdx: number; deltaDistanceMi: number } | null;
  runningPace: {
    firstHalfSecPerMi: number | null;   // Jan–Jun avg running pace
    secondHalfSecPerMi: number | null;  // Jul–Dec avg running pace
    improvedSecPerMi: number | null;    // first - second; positive = got faster
  };
  longestRun: {
    earliestMi: number | null;          // longest run in the first month you ran
    peakMi: number;                     // longest single run of the year
    peakMonthIdx: number | null;
    grewBy: number | null;              // peak - earliest, when positive
  };
};

function emptyMonth(): MonthlyPoint {
  return { distanceMi: 0, seconds: 0, sessions: 0, longestRunMi: 0, runMi: 0, bikeMi: 0, swimMeters: 0, otherMi: 0 };
}

export function computeTrends(
  rows: CsvRow[],
  unitSystem: UnitSystem,
  unitHints: { distance: UnitHint; ascent: UnitHint; elevation: UnitHint }
): TrendMetrics {
  const monthly: MonthlyPoint[] = Array.from({ length: 12 }, emptyMonth);

  let h1RunMi = 0, h1RunSec = 0, h2RunMi = 0, h2RunSec = 0;

  for (const row of rows) {
    const date = parseDateWithLocale(row['Date']);
    if (!date) continue;
    const mIdx = date.getMonth();
    const pt = monthly[mIdx]!;

    const type = canonicalizeActivityType(String(row['Activity Type'] || ''));
    const seconds = parseTimeToSeconds(row['Time'] ?? row['Moving Time'] ?? row['Elapsed Time']);
    const distMi = normalizeDistanceToMiles(row['Distance'], type, unitHints.distance, unitSystem);

    pt.distanceMi += distMi;
    pt.seconds += seconds;
    pt.sessions += 1;

    if (type === 'Running') {
      pt.runMi += distMi;
      if (distMi > pt.longestRunMi) pt.longestRunMi = distMi;
      if (mIdx <= 5) { h1RunMi += distMi; h1RunSec += seconds; }
      else { h2RunMi += distMi; h2RunSec += seconds; }
    }
    if (type === 'Cycling') {
      pt.bikeMi += distMi;
    }
    if (type === 'Swimming') {
      pt.swimMeters += parseNumber(row['Distance']);
    }
    if (type !== 'Running' && type !== 'Cycling' && type !== 'Swimming') {
      pt.otherMi += distMi;
    }
  }

  const activeMonths = monthly.filter((p) => p.sessions > 0).length;

  let busiestMonth: TrendMetrics['busiestMonth'] = null;
  for (let i = 0; i < 12; i++) {
    const p = monthly[i]!;
    if (p.sessions === 0) continue;
    if (
      !busiestMonth ||
      p.distanceMi > busiestMonth.distanceMi ||
      (p.distanceMi === busiestMonth.distanceMi && p.seconds > busiestMonth.seconds)
    ) {
      busiestMonth = { monthIdx: i, distanceMi: p.distanceMi, seconds: p.seconds };
    }
  }

  // Largest positive jump in distance vs the previous active month.
  let mostImprovedMonth: TrendMetrics['mostImprovedMonth'] = null;
  let prevDist: number | null = null;
  for (let i = 0; i < 12; i++) {
    const p = monthly[i]!;
    if (p.sessions === 0) continue;
    if (prevDist != null) {
      const d = p.distanceMi - prevDist;
      if (d > 0 && (!mostImprovedMonth || d > mostImprovedMonth.deltaDistanceMi)) {
        mostImprovedMonth = { monthIdx: i, deltaDistanceMi: d };
      }
    }
    prevDist = p.distanceMi;
  }

  const firstHalfSecPerMi = h1RunMi > 0 ? h1RunSec / h1RunMi : null;
  const secondHalfSecPerMi = h2RunMi > 0 ? h2RunSec / h2RunMi : null;
  const improvedSecPerMi =
    firstHalfSecPerMi != null && secondHalfSecPerMi != null
      ? firstHalfSecPerMi - secondHalfSecPerMi
      : null;

  let earliestMi: number | null = null;
  let peakMi = 0;
  let peakMonthIdx: number | null = null;
  for (let i = 0; i < 12; i++) {
    const v = monthly[i]!.longestRunMi;
    if (v > 0 && earliestMi == null) earliestMi = v;
    if (v > peakMi) { peakMi = v; peakMonthIdx = i; }
  }
  const grewBy = earliestMi != null && peakMi > earliestMi ? peakMi - earliestMi : null;

  return {
    monthly,
    activeMonths,
    busiestMonth,
    mostImprovedMonth,
    runningPace: { firstHalfSecPerMi, secondHalfSecPerMi, improvedSecPerMi },
    longestRun: { earliestMi, peakMi, peakMonthIdx, grewBy },
  };
}
