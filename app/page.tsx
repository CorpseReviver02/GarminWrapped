'use client';

import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import * as htmlToImage from 'html-to-image';
import {
  Activity,
  Flame,
  Zap,
  Calendar,
  Moon,
  Footprints,
  Bike,
  Dumbbell,
  ArrowDownToLine,
} from 'lucide-react';

type AnyRow = { [key: string]: string };

type Sport = 'running' | 'cycling' | 'swimming' | 'strength' | 'other';

interface ParsedActivity {
  row: AnyRow;
  date: Date;
  durationSeconds: number;
  distanceMiles: number;
  sport: Sport;
  calories: number;
  elevationGainFeet: number;
  maxElevationFeet: number;
  swimMeters?: number;
}

interface StepsMetrics {
  totalSteps: number;
  daysWithData: number;
  avgPerDay: number;
  distanceMiles: number;
  weeksOfData: number;
  bestWeek?: {
    start: Date;
    end: Date;
    totalSteps: number;
  };
}

interface SleepMetrics {
  nights: number;
  totalHours: number;
  avgHours: number;
  weeksOfData: number;
  avgScore?: number;
  longestSleepWeek?: { start: Date; end: Date; avgHours: number };
  bestScoreWeek?: { start: Date; end: Date; avgScore: number };
}

interface Metrics {
  startDate: Date | null;
  endDate: Date | null;
  totalActivities: number;
  totalDurationHours: number;
  totalDistanceMiles: number;
  totalCalories: number;
  distanceBySport: {
    running: number;
    cycling: number;
    swimming: number;
    walkingFromSteps: number;
  };
  timeBySportHours: {
    running: number;
    cycling: number;
    swimming: number;
    strength: number;
  };
  paces: {
    runningSecPerMile: number | null;
    cyclingMph: number | null;
    swimSecPer100m: number | null;
  };
  bestEfforts: {
    running?: {
      title: string;
      paceSecPerMile: number;
      distanceMiles: number;
      date: Date;
    };
    cycling?: {
      title: string;
      speedMph: number;
      distanceMiles: number;
      date: Date;
    };
    swimming?: {
      title: string;
      paceSecPer100m: number;
      distanceMeters: number;
      date: Date;
    };
  };
  elevation: {
    totalGainFeet: number;
    maxElevationFeet: number;
  };
  longestActivity?: {
    title: string;
    date: Date;
    durationHours: number;
    distanceMiles: number;
  };
  highestCalorie?: {
    title: string;
    date: Date;
    calories: number;
    durationHours: number;
  };
  streak: {
    longestStreakDays: number;
    longestStreakRange?: { start: Date; end: Date };
  };
  busiestWeek?: {
    start: Date;
    end: Date;
    durationHours: number;
    activityCount: number;
  };
  steps?: StepsMetrics;
  sleep?: SleepMetrics;
}

function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  const n = parseFloat(value.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function parseGarminDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Try native parsing first
  let d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) return d;

  // Try replacing space with T (e.g. "2025-01-01 10:00:00")
  d = new Date(trimmed.replace(' ', 'T'));
  if (!Number.isNaN(d.getTime())) return d;

  return null;
}

function parseDurationToSeconds(raw: string | undefined): number {
  if (!raw) return 0;
  const s = raw.trim();
  if (!s) return 0;
  const parts = s.split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return 0;

  if (parts.length === 3) {
    const [h, m, sec] = parts;
    return h * 3600 + m * 60 + sec;
  }
  if (parts.length === 2) {
    const [m, sec] = parts;
    return m * 60 + sec;
  }
  return parts[0];
}

function classifySport(activityType: string): Sport {
  const t = activityType.toLowerCase();
  if (t.includes('swim')) return 'swimming';
  if (t.includes('run')) return 'running';
  if (t.includes('bike') || t.includes('ride') || t.includes('cycling')) return 'cycling';
  if (t.includes('strength') || t.includes('weights')) return 'strength';
  return 'other';
}

function parseActivityRow(row: AnyRow): ParsedActivity | null {
  const date =
    parseGarminDate(row['Date']) ||
    parseGarminDate(row['Start Time']) ||
    parseGarminDate(row['Begin Timestamp']);

  if (!date) return null;

  const activityType =
    row['Activity Type'] || row['Activity Type Name'] || row['Type'] || '';
  const sport = classifySport(activityType);

  // distance
  const distanceRaw = parseNumber(
    row['Distance'] ||
      row['Distance (km)'] ||
      row['Distance (m)'] ||
      row['Distance (Meters)'],
  );

  let distanceMiles = 0;
  let swimMeters: number | undefined;

  const typeLower = activityType.toLowerCase();

  if (sport === 'swimming' || typeLower.includes('pool') || typeLower.includes('track')) {
    // Garmin exports many swims and track runs in meters
    swimMeters = distanceRaw;
    distanceMiles = distanceRaw / 1609.34;
  } else if (row['Distance (km)']) {
    distanceMiles = distanceRaw * 0.621371;
  } else {
    // Assume miles
    distanceMiles = distanceRaw;
  }

  const durationSeconds = parseDurationToSeconds(
    row['Duration'] ||
      row['Elapsed Time'] ||
      row['Time'] ||
      row['Duration (h:m:s)'],
  );

  const calories = parseNumber(row['Calories'] || row['Calories Burned']);

  let elevationGainFeet = parseNumber(
    row['Elev Gain'] || row['Elevation Gain'] || row['Total Ascent'],
  );
  let maxElevationFeet = parseNumber(
    row['Max Elevation'] || row['Max Elev'] || row['Max Elevation (m)'],
  );

  // If we suspect meters for elevation, convert
  if (
    (row['Elev Gain (m)'] || activityType.toLowerCase().includes('trail')) &&
    elevationGainFeet > 0 &&
    elevationGainFeet < 10000
  ) {
    elevationGainFeet *= 3.28084;
  }
  if (row['Max Elevation (m)'] && maxElevationFeet > 0 && maxElevationFeet < 30000) {
    maxElevationFeet *= 3.28084;
  }

  return {
    row,
    date,
    durationSeconds,
    distanceMiles,
    sport,
    calories,
    elevationGainFeet,
    maxElevationFeet,
    swimMeters,
  };
}

function startOfWeekKey(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 (Sun) → 6 (Sat)
  const diff = (day + 6) % 7; // Monday as week start
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function formatShortDate(date: Date | null | undefined): string {
  if (!date) return '';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0 h';
  if (hours < 10) return `${hours.toFixed(1)} h`;
  return `${Math.round(hours)} h`;
}

function formatPace(secPerMile: number | null): string {
  if (!secPerMile || !Number.isFinite(secPerMile)) return '—';
  const m = Math.floor(secPerMile / 60);
  const s = Math.round(secPerMile % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}/mi`;
}

function formatSwimPace(secPer100m: number | null): string {
  if (!secPer100m || !Number.isFinite(secPer100m)) return '—';
  const m = Math.floor(secPer100m / 60);
  const s = Math.round(secPer100m % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}/100m`;
}

function computeStepsMetrics(rows: AnyRow[]): StepsMetrics | undefined {
  if (!rows?.length) return undefined;

  const daily: { date: Date; steps: number }[] = [];

  for (const row of rows) {
    const date =
      parseGarminDate(row['Date']) ||
      parseGarminDate(row['Start']) ||
      parseGarminDate(row['Day']);

    const stepsRaw = row['Steps'] || row['steps'] || row['Step Count'];
    const steps = parseInt((stepsRaw || '').replace(/,/g, ''), 10);

    if (date && !Number.isNaN(steps) && steps > 0) {
      daily.push({ date, steps });
    }
  }

  if (!daily.length) return undefined;

  const totalSteps = daily.reduce((sum, d) => sum + d.steps, 0);
  const daysWithData = daily.length;
  const avgPerDay = totalSteps / daysWithData;

  // Group into weeks
  const weeks = new Map<
    string,
    { start: Date; end: Date; totalSteps: number }
  >();

  for (const d of daily) {
    const key = startOfWeekKey(d.date);
    const existing = weeks.get(key);
    if (!existing) {
      const start = new Date(key);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      weeks.set(key, { start, end, totalSteps: d.steps });
    } else {
      existing.totalSteps += d.steps;
    }
  }

  let bestWeek: StepsMetrics['bestWeek'] | undefined;
  for (const w of weeks.values()) {
    if (!bestWeek || w.totalSteps > bestWeek.totalSteps) {
      bestWeek = { ...w };
    }
  }

  const weeksOfData = weeks.size;
  const distanceMiles = totalSteps / 1842; // ~1 mile per 1842 steps

  return {
    totalSteps,
    daysWithData,
    avgPerDay,
    distanceMiles,
    weeksOfData,
    bestWeek,
  };
}

function computeSleepMetrics(rows: AnyRow[]): SleepMetrics | undefined {
  if (!rows?.length) return undefined;

  const nights: { date: Date; hours: number; score?: number }[] = [];

  for (const row of rows) {
    const date =
      parseGarminDate(row['Date']) ||
      parseGarminDate(row['Day']) ||
      parseGarminDate(row['Start']);

    if (!date) continue;

    const hours =
      parseNumber(row['Hours of sleep']) ||
      parseNumber(row['Duration (hours)']) ||
      parseNumber(row['Sleep time']) / 60;

    if (!hours || hours <= 0) continue;

    const scoreRaw = row['Sleep score'] || row['Score'];
    const score = scoreRaw ? parseNumber(scoreRaw) : undefined;

    nights.push({ date, hours, score: Number.isFinite(score) ? score : undefined });
  }

  if (!nights.length) return undefined;

  const totalHours = nights.reduce((s, n) => s + n.hours, 0);
  const avgHours = totalHours / nights.length;

  const weeks = new Map<
    string,
    { start: Date; end: Date; totalHours: number; count: number; totalScore: number; scoreCount: number }
  >();

  for (const n of nights) {
    const key = startOfWeekKey(n.date);
    const existing = weeks.get(key);
    if (!existing) {
      const start = new Date(key);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      weeks.set(key, {
        start,
        end,
        totalHours: n.hours,
        count: 1,
        totalScore: n.score ?? 0,
        scoreCount: n.score ? 1 : 0,
      });
    } else {
      existing.totalHours += n.hours;
      existing.count += 1;
      if (n.score) {
        existing.totalScore += n.score;
        existing.scoreCount += 1;
      }
    }
  }

  let longestSleepWeek: SleepMetrics['longestSleepWeek'];
  let bestScoreWeek: SleepMetrics['bestScoreWeek'];

  for (const w of weeks.values()) {
    const avgH = w.totalHours / w.count;
    const avgScore =
      w.scoreCount > 0 ? w.totalScore / w.scoreCount : undefined;

    if (!longestSleepWeek || avgH > longestSleepWeek.avgHours) {
      longestSleepWeek = { start: w.start, end: w.end, avgHours: avgH };
    }

    if (
      avgScore &&
      (!bestScoreWeek || avgScore > bestScoreWeek.avgScore)
    ) {
      bestScoreWeek = { start: w.start, end: w.end, avgScore };
    }
  }

  const allScores = nights
    .map((n) => n.score)
    .filter((s): s is number => !!s);
  const avgScore =
    allScores.length > 0
      ? allScores.reduce((a, b) => a + b, 0) / allScores.length
      : undefined;

  return {
    nights: nights.length,
    totalHours,
    avgHours,
    weeksOfData: weeks.size,
    avgScore,
    longestSleepWeek,
    bestScoreWeek,
  };
}

function computeMetrics(
  activityRows: AnyRow[],
  stepsRows: AnyRow[],
  sleepRows: AnyRow[],
): Metrics | null {
  const activities: ParsedActivity[] = activityRows
    .map(parseActivityRow)
    .filter((a): a is ParsedActivity => a !== null);

  const steps = computeStepsMetrics(stepsRows);
  const sleep = computeSleepMetrics(sleepRows);

  if (!activities.length && !steps && !sleep) {
    return null;
  }

  // Date range
  const allDates = activities.map((a) => a.date);
  if (steps?.bestWeek) {
    allDates.push(steps.bestWeek.start, steps.bestWeek.end);
  }
  if (sleep?.longestSleepWeek) {
    allDates.push(sleep.longestSleepWeek.start, sleep.longestSleepWeek.end);
  }

  const startDate =
    allDates.length > 0
      ? new Date(Math.min(...allDates.map((d) => d.getTime())))
      : null;
  const endDate =
    allDates.length > 0
      ? new Date(Math.max(...allDates.map((d) => d.getTime())))
      : null;

  const totalActivities = activities.length;
  const totalDurationSeconds = activities.reduce(
    (sum, a) => sum + a.durationSeconds,
    0,
  );
  const totalDurationHours = totalDurationSeconds / 3600;

  const totalDistanceMiles = activities.reduce(
    (sum, a) => sum + a.distanceMiles,
    0,
  );
  const totalCalories = activities.reduce(
    (sum, a) => sum + a.calories,
    0,
  );

  const distanceBySport = {
    running: 0,
    cycling: 0,
    swimming: 0,
    walkingFromSteps: steps?.distanceMiles ?? 0,
  };

  const timeBySportSeconds = {
    running: 0,
    cycling: 0,
    swimming: 0,
    strength: 0,
  };

  for (const a of activities) {
    if (a.sport === 'running') {
      distanceBySport.running += a.distanceMiles;
      timeBySportSeconds.running += a.durationSeconds;
    } else if (a.sport === 'cycling') {
      distanceBySport.cycling += a.distanceMiles;
      timeBySportSeconds.cycling += a.durationSeconds;
    } else if (a.sport === 'swimming') {
      distanceBySport.swimming += a.distanceMiles;
      timeBySportSeconds.swimming += a.durationSeconds;
    } else if (a.sport === 'strength') {
      timeBySportSeconds.strength += a.durationSeconds;
    }
  }

  // Average paces & best efforts
  const runningActs = activities.filter(
    (a) => a.sport === 'running' && a.distanceMiles > 0.5 && a.durationSeconds > 0,
  );
  const cyclingActs = activities.filter(
    (a) => a.sport === 'cycling' && a.distanceMiles > 1 && a.durationSeconds > 0,
  );
  const swimActs = activities.filter(
    (a) => a.sport === 'swimming' && (a.swimMeters ?? 0) > 200 && a.durationSeconds > 0,
  );

  const totalRunTime = runningActs.reduce(
    (sum, a) => sum + a.durationSeconds,
    0,
  );
  const totalRunDist = runningActs.reduce(
    (sum, a) => sum + a.distanceMiles,
    0,
  );
  const totalBikeTime = cyclingActs.reduce(
    (sum, a) => sum + a.durationSeconds,
    0,
  );
  const totalBikeDist = cyclingActs.reduce(
    (sum, a) => sum + a.distanceMiles,
    0,
  );
  const totalSwimTime = swimActs.reduce(
    (sum, a) => sum + a.durationSeconds,
    0,
  );
  const totalSwimMeters = swimActs.reduce(
    (sum, a) => sum + (a.swimMeters ?? 0),
    0,
  );

  const runningSecPerMile =
    totalRunDist > 0 ? totalRunTime / totalRunDist : null;
  const cyclingMph =
    totalBikeTime > 0 ? (totalBikeDist / totalBikeTime) * 3600 : null;
  const swimSecPer100m =
    totalSwimMeters > 0 ? (totalSwimTime / totalSwimMeters) * 100 : null;

  // Best-effort per sport
  let bestRun: Metrics['bestEfforts']['running'];
  if (runningActs.length) {
    let bestPace = Infinity;
    let best: ParsedActivity | null = null;
    for (const a of runningActs) {
      const pace = a.durationSeconds / Math.max(a.distanceMiles, 0.1);
      if (pace < bestPace) {
        bestPace = pace;
        best = a;
      }
    }
    if (best && Number.isFinite(bestPace)) {
      bestRun = {
        title: String(best.row['Title'] || 'Fastest run'),
        paceSecPerMile: bestPace,
        distanceMiles: best.distanceMiles,
        date: best.date,
      };
    }
  }

  let bestRide: Metrics['bestEfforts']['cycling'];
  if (cyclingActs.length) {
    let bestSpeed = 0;
    let best: ParsedActivity | null = null;
    for (const a of cyclingActs) {
      const speed = (a.distanceMiles / a.durationSeconds) * 3600;
      if (speed > bestSpeed) {
        bestSpeed = speed;
        best = a;
      }
    }
    if (best && Number.isFinite(bestSpeed)) {
      bestRide = {
        title: String(best.row['Title'] || 'Fastest ride'),
        speedMph: bestSpeed,
        distanceMiles: best.distanceMiles,
        date: best.date,
      };
    }
  }

  let bestSwim: Metrics['bestEfforts']['swimming'];
  if (swimActs.length) {
    let bestPace100 = Infinity;
    let best: ParsedActivity | null = null;
    for (const a of swimActs) {
      const meters = a.swimMeters ?? 0;
      if (meters <= 0) continue;
      const pace100 = (a.durationSeconds / meters) * 100;
      if (pace100 < bestPace100) {
        bestPace100 = pace100;
        best = a;
      }
    }
    if (best && Number.isFinite(bestPace100) && best.swimMeters) {
      bestSwim = {
        title: String(best.row['Title'] || 'Fastest swim'),
        paceSecPer100m: bestPace100,
        distanceMeters: best.swimMeters,
        date: best.date,
      };
    }
  }

  // Elevation
  const totalGainFeet = activities.reduce(
    (sum, a) => sum + a.elevationGainFeet,
    0,
  );
  const maxElevationFeet = activities.reduce(
    (max, a) => Math.max(max, a.maxElevationFeet),
    0,
  );

  // Longest activity & highest calorie
  let longestActivity: Metrics['longestActivity'];
  let highestCalorie: Metrics['highestCalorie'];

  if (activities.length) {
    const longest = activities.reduce<ParsedActivity | undefined>(
      (acc, a) =>
        !acc || a.durationSeconds > acc.durationSeconds ? a : acc,
      undefined,
    );

    if (longest && longest.durationSeconds > 0) {
      longestActivity = {
        title: String(longest.row['Title'] || 'Longest activity'),
        date: longest.date,
        durationHours: longest.durationSeconds / 3600,
        distanceMiles: longest.distanceMiles,
      };
    }

    const highest = activities.reduce<ParsedActivity | undefined>(
      (acc, a) => (!acc || a.calories > acc.calories ? a : acc),
      undefined,
    );

    if (highest && highest.calories > 0) {
      highestCalorie = {
        title: String(highest.row['Title'] || 'Highest calorie burn'),
        date: highest.date,
        calories: highest.calories,
        durationHours: highest.durationSeconds / 3600,
      };
    }
  }

  // Streaks
  const activeDayTimestamps = Array.from(
    new Set(
      activities.map((a) => {
        const d = new Date(a.date);
        d.setUTCHours(0, 0, 0, 0);
        return d.getTime();
      }),
    ),
  ).sort((a, b) => a - b);

  let longestStreakDays = 0;
  let longestStreakRange: { start: Date; end: Date } | undefined;

  if (activeDayTimestamps.length) {
    let streakStart = activeDayTimestamps[0];
    let prev = activeDayTimestamps[0];

    for (let i = 1; i < activeDayTimestamps.length; i++) {
      const current = activeDayTimestamps[i];
      if (current - prev > 24 * 3600 * 1000 + 1000) {
        const streakLen =
          (prev - streakStart) / (24 * 3600 * 1000) + 1;
        if (streakLen > longestStreakDays) {
          longestStreakDays = streakLen;
          longestStreakRange = {
            start: new Date(streakStart),
            end: new Date(prev),
          };
        }
        streakStart = current;
      }
      prev = current;
    }
    const finalLen =
      (prev - streakStart) / (24 * 3600 * 1000) + 1;
    if (finalLen > longestStreakDays) {
      longestStreakDays = finalLen;
      longestStreakRange = {
        start: new Date(streakStart),
        end: new Date(prev),
      };
    }
  }

  // Busiest week (by hours)
  const weekMap = new Map<
    string,
    { start: Date; end: Date; durationSeconds: number; activityCount: number }
  >();

  for (const a of activities) {
    const key = startOfWeekKey(a.date);
    const existing = weekMap.get(key);
    if (!existing) {
      const start = new Date(key);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      weekMap.set(key, {
        start,
        end,
        durationSeconds: a.durationSeconds,
        activityCount: 1,
      });
    } else {
      existing.durationSeconds += a.durationSeconds;
      existing.activityCount += 1;
    }
  }

  let busiestWeek: Metrics['busiestWeek'];
  for (const w of weekMap.values()) {
    if (
      !busiestWeek ||
      w.durationSeconds > busiestWeek.durationHours * 3600
    ) {
      busiestWeek = {
        start: w.start,
        end: w.end,
        durationHours: w.durationSeconds / 3600,
        activityCount: w.activityCount,
      };
    }
  }

  return {
    startDate,
    endDate,
    totalActivities,
    totalDurationHours,
    totalDistanceMiles,
    totalCalories,
    distanceBySport,
    timeBySportHours: {
      running: timeBySportSeconds.running / 3600,
      cycling: timeBySportSeconds.cycling / 3600,
      swimming: timeBySportSeconds.swimming / 3600,
      strength: timeBySportSeconds.strength / 3600,
    },
    paces: {
      runningSecPerMile,
      cyclingMph,
      swimSecPer100m,
    },
    bestEfforts: {
      running: bestRun,
      cycling: bestRide,
      swimming: bestSwim,
    },
    elevation: {
      totalGainFeet,
      maxElevationFeet,
    },
    longestActivity,
    highestCalorie,
    streak: {
      longestStreakDays,
      longestStreakRange,
    },
    busiestWeek,
    steps,
    sleep,
  };
}

function formatMiles(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 mi';
  if (value < 10) return `${value.toFixed(1)} mi`;
  return `${Math.round(value)} mi`;
}

function formatFeet(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 ft';
  return `${Math.round(value).toLocaleString()} ft`;
}

function formatSteps(steps: number): string {
  return steps.toLocaleString();
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

export default function Home() {
  const [activitiesRows, setActivitiesRows] = useState<AnyRow[]>([]);
  const [stepsRows, setStepsRows] = useState<AnyRow[]>([]);
  const [sleepRows, setSleepRows] = useState<AnyRow[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const captureRef = useRef<HTMLDivElement | null>(null);

  const recompute = (
    newActivities: AnyRow[] = activitiesRows,
    newSteps: AnyRow[] = stepsRows,
    newSleep: AnyRow[] = sleepRows,
  ) => {
    const m = computeMetrics(newActivities, newSteps, newSleep);
    setMetrics(m);
  };

  const handleUpload =
    (kind: 'activities' | 'steps' | 'sleep') =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setError(null);

      Papa.parse<AnyRow>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = (results.data || []).filter(
            (r) => Object.keys(r).length > 0,
          );
          if (!rows.length) {
            setError(`No data rows found in ${kind} CSV.`);
            return;
          }

          if (kind === 'activities') {
            setActivitiesRows(rows);
            recompute(rows, stepsRows, sleepRows);
          } else if (kind === 'steps') {
            setStepsRows(rows);
            recompute(activitiesRows, rows, sleepRows);
          } else {
            setSleepRows(rows);
            recompute(activitiesRows, stepsRows, rows);
          }
        },
        error: (err) => {
          setError(`Failed to parse ${kind} CSV: ${err.message}`);
        },
      });
    };

  const handleDownloadImage = async () => {
    if (!captureRef.current) return;
    try {
      const dataUrl = await htmlToImage.toPng(captureRef.current, {
        cacheBust: true,
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'garmin-wrapped.png';
      link.click();
    } catch (err) {
      console.error('Download failed', err);
      setError('Unable to generate image. Try again after everything loads.');
    }
  };

  return (
    <main className="min-h-screen bg-[#020617] text-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-6 pb-12">
        {/* Top controls */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <div>
            <div className="uppercase text-[0.7rem] tracking-[0.25em] text-emerald-300">
              2025 • Garmin Wrapped
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Upload your Garmin exports to generate a shareable year-in-review.
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-start md:justify-end">
            <label className="text-xs cursor-pointer rounded-md border border-slate-700 bg-slate-900/70 px-3 py-1.5 hover:border-emerald-400/60 transition">
              <span className="text-slate-200">Activities CSV</span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleUpload('activities')}
              />
            </label>
            <label className="text-xs cursor-pointer rounded-md border border-slate-700 bg-slate-900/70 px-3 py-1.5 hover:border-teal-400/60 transition">
              <span className="text-slate-200">Steps CSV</span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleUpload('steps')}
              />
            </label>
            <label className="text-xs cursor-pointer rounded-md border border-slate-700 bg-slate-900/70 px-3 py-1.5 hover:border-indigo-400/60 transition">
              <span className="text-slate-200">Sleep CSV</span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleUpload('sleep')}
              />
            </label>
            <button
              onClick={handleDownloadImage}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-500/90 px-3 py-1.5 text-xs font-medium text-slate-900 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 transition"
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />
              Download as image
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-md border border-red-500/60 bg-red-950/40 px-3 py-2 text-xs text-red-100">
            {error}
          </div>
        )}

        {!metrics && (
          <div className="mt-6 rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-slate-950/90 px-4 py-6 text-sm text-slate-300">
            <p className="mb-1 font-medium text-slate-100">
              Upload your Garmin files to get started.
            </p>
            <p>
              You&apos;ll want an <span className="font-semibold">Activities</span>{' '}
              export (for distance &amp; workouts), plus optional{' '}
              <span className="font-semibold">Steps</span> and{' '}
              <span className="font-semibold">Sleep</span> exports for extra stats.
            </p>
          </div>
        )}

        {metrics && (
          <div ref={captureRef} className="mt-4 space-y-4">
            {/* HERO */}
            <section className="rounded-2xl border border-slate-800 bg-gradient-to-r from-emerald-500/10 via-sky-500/5 to-indigo-500/10 p-4 pb-3 shadow-[0_0_40px_rgba(16,185,129,0.25)]">
              <div className="flex flex-col gap-4 md:flex-row md:justify-between">
                <div>
                  <div className="uppercase text-[0.7rem] tracking-[0.25em] text-emerald-300">
                    {metrics.startDate
                      ? metrics.startDate.getFullYear()
                      : '2025'}{' '}
                    • Garmin Wrapped
                  </div>
                  <h1 className="mt-2 text-2xl md:text-[1.7rem] font-semibold tracking-tight">
                    Your year in movement
                  </h1>
                  <p className="mt-2 max-w-sm text-xs text-slate-200/80">
                    From lifts and Zwift to long runs and high-altitude hiking, here&apos;s
                    what your watch saw this year.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs md:w-64">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                    <div className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-400">
                      Activities
                    </div>
                    <div className="mt-1 text-sm font-semibold">
                      {metrics.totalActivities.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                    <div className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-400">
                      Training time
                    </div>
                    <div className="mt-1 text-sm font-semibold">
                      {formatHours(metrics.totalDurationHours)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                    <div className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-400">
                      Distance traveled
                    </div>
                    <div className="mt-1 text-sm font-semibold">
                      {formatMiles(metrics.totalDistanceMiles)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                    <div className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-400">
                      Calories burned
                    </div>
                    <div className="mt-1 text-sm font-semibold">
                      {metrics.totalCalories.toLocaleString()} kcal
                    </div>
                  </div>
                </div>
              </div>

              {metrics.steps && (
                <div className="mt-3 rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-sky-500/20 px-3 py-2 text-[0.7rem] text-emerald-50 flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Footprints className="h-3.5 w-3.5 text-emerald-300" />
                    <span className="uppercase tracking-[0.18em] text-emerald-200/80">
                      Steps wrapped
                    </span>
                  </div>
                  <div className="h-4 w-px bg-emerald-400/40" />
                  <span className="truncate">
                    {metrics.steps.totalSteps.toLocaleString()} steps · ~
                    {Math.round(metrics.steps.distanceMiles)} mi on foot
                  </span>
                  {metrics.steps.bestWeek && (
                    <>
                      <div className="hidden h-4 w-px bg-emerald-400/40 md:block" />
                      <span className="hidden md:inline">
                        Best week: {metrics.steps.bestWeek.totalSteps.toLocaleString()}{' '}
                        steps (
                        {formatShortDate(metrics.steps.bestWeek.end)})
                      </span>
                    </>
                  )}
                </div>
              )}
            </section>

            {/* Distance breakdown */}
            <section className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3">
              <div className="flex justify-between items-center mb-3 text-xs">
                <div className="flex items-center gap-1.5 text-slate-200">
                  <Activity className="w-3.5 h-3.5 text-sky-400" />
                  <span className="font-medium">Distance breakdown</span>
                </div>
                <div className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-400">
                  {formatMiles(metrics.totalDistanceMiles)} total
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-3">
                  <div className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-400">
                    Running
                  </div>
                  <div className="mt-1 text-sm font-semibold">
                    {formatMiles(metrics.distanceBySport.running)}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-3">
                  <div className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-400">
                    Cycling
                  </div>
                  <div className="mt-1 text-sm font-semibold">
                    {formatMiles(metrics.distanceBySport.cycling)}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-3">
                  <div className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-400">
                    Swimming*
                  </div>
                  <div className="mt-1 text-sm font-semibold">
                    {formatMiles(metrics.distanceBySport.swimming)}
                  </div>
                  <div className="mt-0.5 text-[0.6rem] text-slate-500">
                    *Meters converted to miles
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-3">
                  <div className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-400">
                    Walking / hiking
                  </div>
                  <div className="mt-1 text-sm font-semibold">
                    {formatMiles(metrics.distanceBySport.walkingFromSteps)}
                  </div>
                  <div className="mt-0.5 text-[0.6rem] text-slate-500">
                    From steps export
                  </div>
                </div>
              </div>
            </section>

            {/* Time by sport with BEST EFFORTS */}
            <section className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3">
              <div className="flex justify-between items-center mb-3 text-xs">
                <div className="flex items-center gap-1.5 text-slate-200">
                  <Activity className="w-3.5 h-3.5 text-cyan-300" />
                  <span className="font-medium">Time by sport</span>
                </div>
                <div className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-400">
                  Distance • Time • Pace • Best effort
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                {/* Running */}
                <div className="rounded-xl border border-cyan-500/50 bg-gradient-to-br from-emerald-500/15 via-sky-500/10 to-slate-900 px-3 py-3 shadow-[0_0_25px_rgba(34,197,235,0.35)]">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[0.6rem] uppercase tracking-[0.2em] text-emerald-200/90">
                      Running
                    </div>
                    <div className="w-10 h-[2px] rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" />
                  </div>
                  <div className="text-sm font-semibold">
                    {formatMiles(metrics.distanceBySport.running)}
                  </div>
                  <div className="mt-1 flex justify-between text-[0.7rem] text-slate-200/80">
                    <span>{formatHours(metrics.timeBySportHours.running)}</span>
                    <span>{formatPace(metrics.paces.runningSecPerMile)}</span>
                  </div>
                  {metrics.bestEfforts.running && (
                    <div className="mt-2 border-t border-emerald-500/40 pt-1.5 text-[0.7rem]">
                      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-emerald-300/90 mb-0.5">
                        Best effort
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="truncate">
                          {metrics.bestEfforts.running.title}
                        </span>
                        <span className="whitespace-nowrap">
                          {formatPace(metrics.bestEfforts.running.paceSecPerMile)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Cycling */}
                <div className="rounded-xl border border-sky-500/60 bg-gradient-to-br from-sky-500/15 via-cyan-500/10 to-slate-900 px-3 py-3 shadow-[0_0_25px_rgba(56,189,248,0.35)]">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[0.6rem] uppercase tracking-[0.2em] text-sky-200/90">
                      Cycling
                    </div>
                    <div className="w-10 h-[2px] rounded-full bg-gradient-to-r from-sky-400 to-cyan-300" />
                  </div>
                  <div className="text-sm font-semibold">
                    {formatMiles(metrics.distanceBySport.cycling)}
                  </div>
                  <div className="mt-1 flex justify-between text-[0.7rem] text-slate-200/80">
                    <span>{formatHours(metrics.timeBySportHours.cycling)}</span>
                    <span>
                      {metrics.paces.cyclingMph
                        ? `${metrics.paces.cyclingMph.toFixed(1)} mph`
                        : '—'}
                    </span>
                  </div>
                  {metrics.bestEfforts.cycling && (
                    <div className="mt-2 border-t border-sky-500/40 pt-1.5 text-[0.7rem]">
                      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-sky-300/90 mb-0.5">
                        Best effort
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="truncate">
                          {metrics.bestEfforts.cycling.title}
                        </span>
                        <span className="whitespace-nowrap">
                          {metrics.bestEfforts.cycling.speedMph.toFixed(1)} mph
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Swimming */}
                <div className="rounded-xl border border-purple-500/60 bg-gradient-to-br from-indigo-500/20 via-purple-500/15 to-slate-900 px-3 py-3 shadow-[0_0_25px_rgba(168,85,247,0.35)]">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[0.6rem] uppercase tracking-[0.2em] text-purple-200/90">
                      Swimming
                    </div>
                    <div className="w-10 h-[2px] rounded-full bg-gradient-to-r from-purple-400 to-fuchsia-300" />
                  </div>
                  <div className="text-sm font-semibold">
                    {formatMiles(metrics.distanceBySport.swimming)}
                  </div>
                  <div className="mt-1 flex justify-between text-[0.7rem] text-slate-200/80">
                    <span>{formatHours(metrics.timeBySportHours.swimming)}</span>
                    <span>{formatSwimPace(metrics.paces.swimSecPer100m)}</span>
                  </div>
                  {metrics.bestEfforts.swimming && (
                    <div className="mt-2 border-t border-purple-500/40 pt-1.5 text-[0.7rem]">
                      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-purple-300/90 mb-0.5">
                        Best effort
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="truncate">
                          {metrics.bestEfforts.swimming.title}
                        </span>
                        <span className="whitespace-nowrap">
                          {formatSwimPace(
                            metrics.bestEfforts.swimming.paceSecPer100m,
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Vertical gains */}
            <section className="rounded-2xl border border-slate-800 bg-gradient-to-r from-fuchsia-500/15 via-purple-500/10 to-amber-500/20 px-4 py-3 shadow-[0_0_30px_rgba(147,51,234,0.4)]">
              <div className="flex justify-between items-center mb-3 text-xs">
                <div className="flex items-center gap-1.5 text-slate-100">
                  <TrendingUp className="hidden" />
                  <span className="font-medium">Vertical gains</span>
                </div>
                <div className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-200/80">
                  Elevation
                </div>
              </div>
              <div className="rounded-xl border border-white/20 bg-black/15 px-3 py-3 text-xs">
                <div className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-300">
                  Total elevation climbed
                </div>
                <div className="mt-1 text-lg font-semibold">
                  {formatFeet(metrics.elevation.totalGainFeet)}
                </div>
              </div>
              <div className="mt-2 rounded-xl border border-white/15 bg-black/10 px-3 py-2 text-[0.7rem]">
                <div className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-300">
                  Highest point reached
                </div>
                <div className="mt-1 text-base font-semibold">
                  {formatFeet(metrics.elevation.maxElevationFeet)}
                </div>
                <div className="mt-0.5 text-[0.65rem] text-slate-200">
                  That&apos;s about {Math.round(metrics.elevation.maxElevationFeet / 5280 * 10) / 10} miles
                  above sea level.
                </div>
              </div>
            </section>

            {/* Biggest efforts + Consistency */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Biggest efforts */}
              <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 px-4 py-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-100 mb-3">
                  <Flame className="w-3.5 h-3.5 text-emerald-300" />
                  <span className="font-medium">Biggest efforts</span>
                </div>
                <div className="space-y-2 text-xs">
                  {metrics.longestActivity && (
                    <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-3">
                      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-emerald-200 mb-1">
                        Longest activity
                      </div>
                      <div className="text-sm font-semibold">
                        {metrics.longestActivity.title}
                      </div>
                      <div className="mt-0.5 text-[0.7rem] text-slate-100/90">
                        {formatShortDate(metrics.longestActivity.date)}
                      </div>
                      <div className="mt-0.5 text-[0.7rem] text-slate-100/90">
                        {metrics.longestActivity.durationHours.toFixed(1)} h ·{' '}
                        {formatMiles(metrics.longestActivity.distanceMiles)}
                      </div>
                    </div>
                  )}
                  {metrics.highestCalorie && (
                    <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-3">
                      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-amber-200 mb-1">
                        Most calories in one go
                      </div>
                      <div className="text-sm font-semibold">
                        {metrics.highestCalorie.title}
                      </div>
                      <div className="mt-0.5 text-[0.7rem] text-slate-100/90">
                        {formatShortDate(metrics.highestCalorie.date)}
                      </div>
                      <div className="mt-0.5 text-[0.7rem] text-slate-100/90">
                        {metrics.highestCalorie.durationHours.toFixed(1)} h ·{' '}
                        {metrics.highestCalorie.calories.toLocaleString()} kcal
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Consistency & grind */}
              <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-slate-900 px-4 py-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-100 mb-3">
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  <span className="font-medium">Consistency &amp; grind</span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="rounded-xl border border-amber-400/50 bg-black/20 px-3 py-3">
                    <div className="text-[0.6rem] uppercase tracking-[0.18em] text-amber-200 mb-1">
                      Longest streak
                    </div>
                    <div className="text-lg font-semibold">
                      {metrics.streak.longestStreakDays}{' '}
                      <span className="text-sm">days</span>
                    </div>
                    {metrics.streak.longestStreakRange && (
                      <div className="mt-0.5 text-[0.7rem] text-slate-100/90">
                        {formatShortDate(metrics.streak.longestStreakRange.start)} —{' '}
                        {formatShortDate(metrics.streak.longestStreakRange.end)}
                      </div>
                    )}
                    <div className="mt-0.5 text-[0.65rem] text-slate-200/80">
                      You refused to break the chain.
                    </div>
                  </div>
                  {metrics.busiestWeek && (
                    <div className="rounded-xl border border-orange-400/40 bg-black/15 px-3 py-3">
                      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-orange-200 mb-1">
                        Busiest week
                      </div>
                      <div className="text-sm font-semibold">
                        {formatShortDate(metrics.busiestWeek.start)} —{' '}
                        {formatShortDate(metrics.busiestWeek.end)}
                      </div>
                      <div className="mt-0.5 text-[0.7rem] text-slate-100/90">
                        {metrics.busiestWeek.durationHours.toFixed(1)} h ·{' '}
                        {metrics.busiestWeek.activityCount} activities
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Steps wrapped */}
            {metrics.steps && (
              <section className="rounded-2xl border border-slate-800 bg-gradient-to-r from-emerald-500/15 via-teal-500/15 to-sky-500/15 px-4 py-3 shadow-[0_0_30px_rgba(45,212,191,0.3)]">
                <div className="flex justify-between items-center mb-3 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-50">
                    <Footprints className="w-3.5 h-3.5 text-emerald-300" />
                    <span className="font-medium">Steps wrapped</span>
                  </div>
                  <div className="text-[0.65rem] uppercase tracking-[0.18em] text-emerald-100">
                    Daily grind
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-xl border border-slate-800 bg-black/20 px-3 py-3">
                    <div className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-300">
                      Total steps
                    </div>
                    <div className="mt-1 text-sm font-semibold">
                      {formatSteps(metrics.steps.totalSteps)}
                    </div>
                    <div className="mt-0.5 text-[0.65rem] text-slate-300/80">
                      Across {metrics.steps.weeksOfData}{' '}
                      {plural(metrics.steps.weeksOfData, 'week')}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-black/20 px-3 py-3">
                    <div className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-300">
                      Avg per day
                    </div>
                    <div className="mt-1 text-sm font-semibold">
                      {Math.round(metrics.steps.avgPerDay).toLocaleString()}
                    </div>
                    <div className="mt-0.5 text-[0.65rem] text-slate-300/80">
                      Total {metrics.steps.daysWithData} days tracked
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-black/20 px-3 py-3">
                    <div className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-300">
                      Best week
                    </div>
                    {metrics.steps.bestWeek ? (
                      <>
                        <div className="mt-1 text-sm font-semibold">
                          {metrics.steps.bestWeek.totalSteps.toLocaleString()}
                        </div>
                        <div className="mt-0.5 text-[0.65rem] text-slate-300/80">
                          {formatShortDate(metrics.steps.bestWeek.end)}
                        </div>
                      </>
                    ) : (
                      <div className="mt-1 text-sm">—</div>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-black/20 px-3 py-3">
                    <div className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-300">
                      Distance from steps
                    </div>
                    <div className="mt-1 text-sm font-semibold">
                      {formatMiles(metrics.steps.distanceMiles)}
                    </div>
                    <div className="mt-0.5 text-[0.65rem] text-slate-300/80">
                      Based on ~1,842 steps / mile
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Sleep wrapped */}
            {metrics.sleep && (
              <section className="rounded-2xl border border-slate-800 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-fuchsia-500/20 px-4 py-3 shadow-[0_0_30px_rgba(129,140,248,0.35)]">
                <div className="flex justify-between items-center mb-3 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-50">
                    <Moon className="w-3.5 h-3.5 text-indigo-200" />
                    <span className="font-medium">Sleep wrapped</span>
                  </div>
                  <div className="text-[0.65rem] uppercase tracking-[0.18em] text-indigo-100">
                    Recovery mode
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-xl border border-slate-800 bg-black/25 px-3 py-3">
                    <div className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-200">
                      Weeks of data
                    </div>
                    <div className="mt-1 text-sm font-semibold">
                      {metrics.sleep.weeksOfData}
                    </div>
                    <div className="mt-0.5 text-[0.65rem] text-slate-200/80">
                      {metrics.sleep.nights} nights tracked
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-black/25 px-3 py-3">
                    <div className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-200">
                      Avg sleep / night
                    </div>
                    <div className="mt-1 text-sm font-semibold">
                      {metrics.sleep.avgHours.toFixed(1)} h
                    </div>
                    <div className="mt-0.5 text-[0.65rem] text-slate-200/80">
                      Total {metrics.sleep.totalHours.toFixed(0)} h tracked
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-black/25 px-3 py-3">
                    <div className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-200">
                      Avg sleep score
                    </div>
                    <div className="mt-1 text-sm font-semibold">
                      {metrics.sleep.avgScore
                        ? Math.round(metrics.sleep.avgScore)
                        : '—'}
                    </div>
                    {metrics.sleep.bestScoreWeek && (
                      <div className="mt-0.5 text-[0.65rem] text-slate-200/80">
                        Best wk:{' '}
                        {formatShortDate(metrics.sleep.bestScoreWeek.start)} —{' '}
                        {formatShortDate(metrics.sleep.bestScoreWeek.end)}
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-black/25 px-3 py-3">
                    <div className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-200">
                      Longest sleep week
                    </div>
                    {metrics.sleep.longestSleepWeek ? (
                      <>
                        <div className="mt-1 text-sm font-semibold">
                          {metrics.sleep.longestSleepWeek.avgHours.toFixed(1)} h
                        </div>
                        <div className="mt-0.5 text-[0.65rem] text-slate-200/80">
                          {formatShortDate(metrics.sleep.longestSleepWeek.start)} —{' '}
                          {formatShortDate(metrics.sleep.longestSleepWeek.end)}
                        </div>
                      </>
                    ) : (
                      <div className="mt-1 text-sm">—</div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Footer */}
            <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/90 px-4 py-3 text-[0.7rem] text-slate-300 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-300" />
                <span className="uppercase tracking-[0.18em] text-emerald-200">
                  2025 wrapped up
                </span>
              </div>
              <div className="text-right">
                <div>
                  In 2026, the only goal: make Future You impressed.
                </div>
                <div className="mt-0.5 text-slate-500 text-[0.65rem]">
                  See you next year, coach.
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
