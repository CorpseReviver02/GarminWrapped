// lib/metrics.ts — Aggregate a list of activity rows into the Metrics summary.

import type { ActivityTypeSummary, CsvRow, Metrics, UnitHint, UnitSystem } from './types';
import { parseNumber, parseTimeToSeconds, parseDateWithLocale, toStringSafe } from './parse';
import { formatDateDisplay } from './format';
import { canonicalizeActivityType } from './activity-columns';
import { normalizeDistanceToMiles, normalizeFeet } from './normalize';
import { EARTH_CIRCUMFERENCE_MI } from './constants';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function computeMetrics(
  rows: CsvRow[],
  unitSystem: UnitSystem,
  unitHints: { distance: UnitHint; ascent: UnitHint; elevation: UnitHint }
): Metrics {
  let totalDistanceMi = 0, totalActivitySeconds = 0, sessions = 0, totalCalories = 0;
  let maxHr = 0, avgHrSum = 0, avgHrCount = 0;
  let totalAscentFt = 0, maxElevationFt = 0;

  const activityCounts: Record<string, number> = {};
  const typeDistance: Record<string, number> = {};
  const typeSeconds: Record<string, number> = {};
  const monthSeconds: Record<string, { seconds: number; sampleDate: Date }> = {};
  const daySet = new Set<string>();

  let earliestDate: Date | null = null;
  let latestDate: Date | null = null;

  let runDistanceMi = 0, runSeconds = 0, runSessions = 0;
  let bikeDistanceMi = 0, bikeSeconds = 0, bikeSessions = 0;
  let swimMeters = 0,  swimSeconds = 0,  swimSessions = 0;

  let longestActivityDetail: { row: CsvRow; durationSeconds: number; date: Date | null } | null = null;
  let highestCalorieDetail: { row: CsvRow; calories: number; date: Date | null; durationSeconds: number } | null = null;

  let runLongest:  { row: CsvRow; distanceMi: number } | null = null;
  let bikeLongest: { row: CsvRow; distanceMi: number } | null = null;
  let swimLongest: { row: CsvRow; distanceM: number }  | null = null;

  const weekdayAgg: { seconds: number; count: number }[] = Array.from({ length: 7 }, () => ({ seconds: 0, count: 0 }));

  for (const rowRaw of rows) {
    const row: CsvRow = { ...rowRaw };

    row['Activity Type'] = canonicalizeActivityType(String(row['Activity Type'] || ''));
    const activityType = String(row['Activity Type'] || '');
    const hasAnyData = activityType || row['Distance'] || row['Time'] || row['Elapsed Time'] || row['Calories'];
    if (!hasAnyData) continue;

    const timeSeconds = parseTimeToSeconds(row['Time'] ?? row['Moving Time'] ?? row['Elapsed Time']);

    sessions += 1;
    const distanceMi = normalizeDistanceToMiles(row['Distance'], activityType, unitHints.distance, unitSystem);
    totalDistanceMi += distanceMi;
    totalActivitySeconds += timeSeconds;

    const calories = parseNumber(row['Calories']);
    totalCalories += calories;

    const maxHrRow = parseNumber(row['Max HR']); if (maxHrRow > maxHr) maxHr = maxHrRow;
    const avgHrRow = parseNumber(row['Avg HR']); if (avgHrRow > 0) { avgHrSum += avgHrRow; avgHrCount += 1; }

    totalAscentFt += normalizeFeet(row['Total Ascent'], unitHints.ascent, unitSystem);
    const elevFt = normalizeFeet(row['Max Elevation'], unitHints.elevation, unitSystem);
    if (elevFt > maxElevationFt) maxElevationFt = elevFt;

    if (activityType) {
      activityCounts[activityType] = (activityCounts[activityType] ?? 0) + 1;
      typeDistance[activityType] = (typeDistance[activityType] ?? 0) + distanceMi;
      typeSeconds[activityType] = (typeSeconds[activityType] ?? 0) + timeSeconds;
    }

    const date = parseDateWithLocale(row['Date']);
    if (date) {
      const isoDay = date.toISOString().slice(0, 10);
      daySet.add(isoDay);
      if (!earliestDate || date < earliestDate) earliestDate = date;
      if (!latestDate || date > latestDate) latestDate = date;
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      if (!monthSeconds[key]) monthSeconds[key] = { seconds: 0, sampleDate: date };
      monthSeconds[key]!.seconds += timeSeconds;

      const dow = date.getDay();
      weekdayAgg[dow]!.seconds += timeSeconds;
      weekdayAgg[dow]!.count += 1;
    }

    if (timeSeconds > 0) {
      const prev = longestActivityDetail?.durationSeconds ?? -1;
      if (timeSeconds > prev) longestActivityDetail = { row, durationSeconds: timeSeconds, date: date ?? null };
    }

    if (calories > 0) {
      if (!highestCalorieDetail || calories > highestCalorieDetail.calories) {
        highestCalorieDetail = { row, calories, date: date ?? null, durationSeconds: timeSeconds };
      }
    }

    // Activity types are canonicalized above (e.g. "Treadmill Running" → "Running",
    // "Indoor Cycling" → "Cycling"), so a direct equality check is exact here.
    if (activityType === 'Running') {
      runDistanceMi += distanceMi; runSeconds += timeSeconds; runSessions += 1;
      if (!runLongest || distanceMi > runLongest.distanceMi) runLongest = { row, distanceMi };
    }
    if (activityType === 'Cycling') {
      bikeDistanceMi += distanceMi; bikeSeconds += timeSeconds; bikeSessions += 1;
      if (!bikeLongest || distanceMi > bikeLongest.distanceMi) bikeLongest = { row, distanceMi };
    }
    if (activityType === 'Swimming') {
      // Swim distance is treated as meters (standard Garmin swim export).
      // TODO(regional): route through header/unit detection once we have sample exports.
      const meters = parseNumber(row['Distance']);
      swimMeters += meters; swimSeconds += timeSeconds; swimSessions += 1;
      if (!swimLongest || meters > swimLongest.distanceM) swimLongest = { row, distanceM: meters };
    }
  }

  let favoriteActivity: Metrics['favoriteActivity'] | undefined;
  {
    const names = Object.keys(activityCounts);
    if (names.length) {
      names.sort((a, b) => (activityCounts[b] ?? 0) - (activityCounts[a] ?? 0));
      const name = names[0]!;
      favoriteActivity = { name, count: activityCounts[name] ?? 0 };
    }
  }

  let mostActiveMonth: Metrics['mostActiveMonth'] | undefined;
  {
    const keys = Object.keys(monthSeconds);
    if (keys.length) {
      keys.sort((a, b) => monthSeconds[b]!.seconds - monthSeconds[a]!.seconds);
      const key = keys[0]!;
      const monthIdx = parseInt(key.split('-')[1]!, 10);
      mostActiveMonth = { name: MONTH_NAMES[Number.isFinite(monthIdx) ? monthIdx : 0] ?? 'Unknown', totalHours: monthSeconds[key]!.seconds / 3600 };
    }
  }

  let longestStreak: Metrics['longestStreak'];
  {
    const daysSorted = Array.from(daySet).sort();
    if (daysSorted.length) {
      const toDate = (iso: string) => new Date(iso + 'T00:00:00');
      let bestLen = 1, bestStart = daysSorted[0]!, bestEnd = daysSorted[0]!;
      let curLen = 1, curStart = daysSorted[0]!;
      for (let i = 1; i < daysSorted.length; i++) {
        const prev = toDate(daysSorted[i - 1]!);
        const curr = toDate(daysSorted[i]!);
        const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
        if (Math.round(diffDays) === 1) curLen += 1;
        else {
          if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; bestEnd = daysSorted[i - 1]!; }
          curLen = 1; curStart = daysSorted[i]!;
        }
      }
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; bestEnd = daysSorted[daysSorted.length - 1]!; }
      longestStreak = { lengthDays: bestLen, start: formatDateDisplay(toDate(bestStart)), end: formatDateDisplay(toDate(bestEnd)) };
    }
  }

  const WEEKDAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  let bestIdx = -1;
  for (let i = 0; i < 7; i++) {
    const cur = weekdayAgg[i]!;
    if (cur.count === 0) continue;
    if (bestIdx === -1) { bestIdx = i; continue; }
    const best = weekdayAgg[bestIdx]!;
    if (cur.count > best.count || (cur.count === best.count && cur.seconds > best.seconds)) bestIdx = i;
  }
  let grindDay: Metrics['grindDay'];
  if (bestIdx !== -1) {
    const best = weekdayAgg[bestIdx]!;
    grindDay = { name: WEEKDAY_NAMES[bestIdx] ?? 'Unknown', totalHours: best.seconds / 3600, activities: best.count };
  }

  const avgHr = avgHrCount ? avgHrSum / avgHrCount : undefined;
  const earthPercent = totalDistanceMi > 0 ? (totalDistanceMi / EARTH_CIRCUMFERENCE_MI) * 100 : 0;
  const avgDistanceMi = sessions > 0 ? totalDistanceMi / sessions : undefined;
  const avgDurationSeconds = sessions > 0 ? totalActivitySeconds / sessions : undefined;

  const typeNames = Object.keys(activityCounts);
  const activityTypesCount = typeNames.length;
  let topActivityTypes: ActivityTypeSummary[] | undefined;
  if (activityTypesCount) {
    const arr: ActivityTypeSummary[] = typeNames.map((name) => ({
      name,
      count: activityCounts[name] ?? 0,
      totalDistanceMi: typeDistance[name] ?? 0,
      totalSeconds: typeSeconds[name] ?? 0,
    }));
    arr.sort((a, b) => b.count - a.count);
    topActivityTypes = arr.slice(0, 3);
  }

  const longestActivitySummary = (() => {
    const l = longestActivityDetail;
    if (l && l.durationSeconds > 0) {
      return {
        title: toStringSafe(l.row['Title']) || 'Unknown activity',
        date: formatDateDisplay(l.date),
        durationSeconds: l.durationSeconds,
        calories: parseNumber(l.row['Calories']),
        type: toStringSafe(l.row['Activity Type']) || 'Other',
      };
    }
    return undefined;
  })();

  const highestCalorieSummary = (() => {
    const h = highestCalorieDetail;
    if (h && h.calories > 0) {
      return {
        title: toStringSafe(h.row['Title']) || 'Unknown activity',
        date: formatDateDisplay(h.date),
        calories: h.calories,
        durationSeconds: h.durationSeconds,
        type: toStringSafe(h.row['Activity Type']) || 'Other',
      };
    }
    return undefined;
  })();

  const runLongestOut  = runLongest  && runLongest.distanceMi  > 0 ? { title: toStringSafe(runLongest.row['Title'])  || 'Longest run',  distanceMi: runLongest.distanceMi }   : undefined;
  const bikeLongestOut = bikeLongest && bikeLongest.distanceMi > 0 ? { title: toStringSafe(bikeLongest.row['Title']) || 'Longest ride', distanceMi: bikeLongest.distanceMi }  : undefined;
  const swimLongestOut = swimLongest && swimLongest.distanceM  > 0 ? { title: toStringSafe(swimLongest.row['Title']) || 'Longest swim', distanceM: swimLongest.distanceM } : undefined;

  return {
    totalDistanceMi, earthPercent, totalActivitySeconds, sessions,
    maxHr: maxHr || undefined, avgHr: avgHr || undefined, totalCalories: totalCalories || undefined,
    favoriteActivity, mostActiveMonth, longestStreak,
    longestActivity: longestActivitySummary, highestCalorie: highestCalorieSummary,
    totalAscent: totalAscentFt || undefined, maxElevation: maxElevationFt || undefined,
    avgDistanceMi, avgDurationSeconds,
    activityTypesCount, topActivityTypes,
    startDateDisplay: formatDateDisplay(earliestDate || undefined),
    endDateDisplay: formatDateDisplay(latestDate || undefined),
    grindDay,
    runDistanceMi: runDistanceMi || undefined, runSeconds: runSeconds || undefined, runSessions: runSessions || undefined,
    bikeDistanceMi: bikeDistanceMi || undefined, bikeSeconds: bikeSeconds || undefined, bikeSessions: bikeSessions || undefined,
    swimMeters: swimMeters || undefined, swimSeconds: swimSeconds || undefined, swimSessions: swimSessions || undefined,
    runLongest: runLongestOut, bikeLongest: bikeLongestOut, swimLongest: swimLongestOut,
  };
}
