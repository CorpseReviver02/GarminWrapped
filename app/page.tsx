// app/page.tsx
'use client';

import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import * as htmlToImage from 'html-to-image';
import {
  Activity,
  Flame,
  HeartPulse,
  LineChart,
  Mountain,
  Timer,
  CalendarDays,
  Trophy,
  Dumbbell,
  Zap,
  Upload,
  Bike,
  Waves,
} from 'lucide-react';

type ActivityTypeSummary = {
  name: string;
  count: number;
  totalDistanceMi: number;
  totalSeconds: number;
};

type Metrics = {
  totalDistanceMi: number;
  earthPercent: number;
  totalActivitySeconds: number;
  sessions: number;
  maxHr?: number;
  avgHr?: number;
  totalCalories?: number;
  favoriteActivity?: { name: string; count: number };
  mostActiveMonth?: { name: string; totalHours: number };
  longestStreak?: { lengthDays: number; start: string; end: string };
  longestActivity?: {
    title: string;
    date: string;
    durationSeconds: number;
    calories?: number;
  };
  highestCalorie?: {
    title: string;
    date: string;
    calories: number;
    durationSeconds?: number;
  };
  totalAscent?: number;
  maxElevation?: number;
  avgDistanceMi?: number;
  avgDurationSeconds?: number;
  activityTypesCount: number;
  topActivityTypes?: ActivityTypeSummary[];
  startDateDisplay?: string;
  endDateDisplay?: string;
  grindDay?: {
    name: string;
    totalHours: number;
    activities: number;
  };

  runDistanceMi?: number;
  runSeconds?: number;
  runSessions?: number;
  bikeDistanceMi?: number;
  bikeSeconds?: number;
  bikeSessions?: number;
  swimMeters?: number;
  swimSeconds?: number;
  swimSessions?: number;

  runLongest?: { title: string; distanceMi: number };
  bikeLongest?: { title: string; distanceMi: number };
  swimLongest?: { title: string; distanceM: number };
};

type SleepMetrics = {
  weeks: number;
  avgScore: number;
  avgDurationMinutes: number;
  bestScoreWeek: { label: string; score: number; durationMinutes: number } | null;
  worstScoreWeek: { label: string; score: number; durationMinutes: number } | null;
  longestSleepWeek: { label: string; durationMinutes: number; score: number } | null;
};

type StepsMetrics = {
  weeks: number;
  totalSteps: number;
  avgStepsPerDay: number;
  bestWeek: { label: string; steps: number } | null;
};

type StatCardProps = {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  value: string;
  label: string;
  helper?: string;
};

// Internal accumulators
type LongestActivityDetail = {
  row: Record<string, unknown>;
  durationSeconds: number;
  date: Date | null;
};
type HighestCalorieDetail = {
  row: Record<string, unknown>;
  calories: number;
  date: Date | null;
  durationSeconds: number;
};

/** Type guard (why: stabilize CI build narrowing) */
function isLongestActivityDetail(x: unknown): x is LongestActivityDetail {
  return !!x && typeof (x as any).durationSeconds === 'number';
}

const EARTH_CIRCUMFERENCE_MI = 24901;
const MARATHON_MI = 26.2188;
const FIVEK_MI = 3.10686;
const EVEREST_FT = 29032;

function parseNumber(value: any): number {
  if (value == null) return 0;
  const s = String(value).replace(/[^\d.\-]/g, '');
  const num = parseFloat(s);
  return Number.isFinite(num) ? num : 0;
}

function parseTimeToSeconds(value: any): number {
  if (!value) return 0;
  const s = String(value).trim();
  if (!s) return 0;
  const parts = s.split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return 0;

  if (parts.length === 3) {
    const [h, m, sec] = parts as [number, number, number];
    return h * 3600 + m * 60 + sec;
  }
  if (parts.length === 2) {
    const [m, sec] = parts as [number, number];
    return m * 60 + sec;
  }
  return 0;
}

function parseDate(value: any): Date | null {
  if (!value) return null;
  const s = String(value).replace(/\u00A0/g, ' ').trim();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDurationLong(totalSeconds: number): string {
  let s = Math.round(totalSeconds);
  const days = Math.floor(s / 86400);
  s -= days * 86400;
  const hours = Math.floor(s / 3600);
  s -= hours * 3600;
  const minutes = Math.floor(s / 60);
  const parts: string[] = [];
  if (days) parts.push(`${days}day${days !== 1 ? 's' : ''}`);
  if (hours) parts.push(`${hours}hrs`);
  if (minutes || (!days && !hours)) parts.push(`${minutes}m`);
  return parts.join(' ');
}

function formatDurationHMS(totalSeconds: number): string {
  let s = Math.round(totalSeconds);
  const hours = Math.floor(s / 3600);
  s -= hours * 3600;
  const minutes = Math.floor(s / 60);
  s -= minutes * 60;
  const seconds = s;
  const parts: string[] = [];
  if (hours) parts.push(`${hours}hrs`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || (!hours && !minutes)) parts.push(`${seconds}s`);
  return parts.join(' ');
}

function formatDateDisplay(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatPacePerMile(totalSeconds: number, distanceMi: number): string {
  if (!totalSeconds || !distanceMi) return '--';
  const secPerMile = totalSeconds / distanceMi;
  const s = Math.round(secPerMile);
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${sec.toString().padStart(2, '0')}/mi`;
}

function formatSwimPacePer100m(totalSeconds: number, meters: number): string {
  if (!totalSeconds || !meters) return '--';
  const units = meters / 100;
  if (!units) return '--';
  const secPer100 = totalSeconds / units;
  const s = Math.round(secPer100);
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${sec.toString().padStart(2, '0')}/100m`;
}

function parseSleepDurationToMinutes(value: any): number {
  if (!value) return 0;
  const s = String(value).trim();
  if (!s) return 0;
  const match = s.match(/(?:(\d+)h)?\s*(?:(\d+)min)?/i);
  if (!match) return 0;
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const mins = match[2] ? parseInt(match[2], 10) : 0;
  return hours * 60 + mins;
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function distanceMilesFromRow(row: any): number {
  const raw = parseNumber(row['Distance']);
  const activityType = String(row['Activity Type'] || '').trim();
  if (!raw || !activityType) return 0;
  const meterActivities = ['Track Running', 'Pool Swim', 'Swimming', 'Open Water Swimming'];
  if (meterActivities.includes(activityType)) return raw / 1609.34;
  return raw;
}

function computeMetrics(rows: any[]): Metrics {
  let totalDistanceMi = 0;
  let totalActivitySeconds = 0;
  let sessions = 0;
  let totalCalories = 0;

  let maxHr = 0;
  let avgHrSum = 0;
  let avgHrCount = 0;

  let totalAscent = 0;
  let maxElevation = 0;

  const activityCounts: Record<string, number> = {};
  const typeDistance: Record<string, number> = {};
  const typeSeconds: Record<string, number> = {};
  const monthSeconds: Record<string, { seconds: number; sampleDate: Date }> = {};
  const daySet = new Set<string>();

  let earliestDate: Date | null = null;
  let latestDate: Date | null = null;

  // By-sport accumulators
  let runDistanceMi = 0, runSeconds = 0, runSessions = 0;
  let bikeDistanceMi = 0, bikeSeconds = 0, bikeSessions = 0;
  let swimMeters = 0, swimSeconds = 0, swimSessions = 0;

  // Typed accumulators
  let longestActivityDetail: LongestActivityDetail | null = null;
  let highestCalorieDetail: HighestCalorieDetail | null = null;

  // Per-sport bests
  let runLongest: { row: any; distanceMi: number } | null = null;
  let bikeLongest: { row: any; distanceMi: number } | null = null;
  let swimLongest: { row: any; distanceM: number } | null = null;

  const runTypes = ['Running', 'Treadmill Running', 'Track Running'];
  const bikeTypes = ['Cycling', 'Indoor Cycling', 'Virtual Cycling'];
  const swimTypes = ['Pool Swim', 'Swimming', 'Open Water Swimming'];

  const weekdayAgg: { seconds: number; count: number }[] =
    Array.from({ length: 7 }, () => ({ seconds: 0, count: 0 }));

  rows.forEach((row) => {
    const activityType = String(row['Activity Type'] || '').trim();

    const hasAnyData =
      activityType || row['Distance'] || row['Time'] || row['Elapsed Time'] || row['Calories'];
    if (!hasAnyData) return;

    sessions += 1;

    const distanceMi = distanceMilesFromRow(row);
    totalDistanceMi += distanceMi;

    const timeSeconds = parseTimeToSeconds(row['Time'] || row['Moving Time'] || row['Elapsed Time']);
    totalActivitySeconds += timeSeconds;

    const calories = parseNumber(row['Calories']);
    totalCalories += calories;

    const maxHrRow = parseNumber(row['Max HR']);
    if (maxHrRow > maxHr) maxHr = maxHrRow;

    const avgHrRow = parseNumber(row['Avg HR']);
    if (avgHrRow > 0) {
      avgHrSum += avgHrRow;
      avgHrCount += 1;
    }

    const ascent = parseNumber(row['Total Ascent']);
    totalAscent += ascent;

    const maxElev = parseNumber(row['Max Elevation']);
    if (maxElev > maxElevation) maxElevation = maxElev;

    if (activityType) {
      activityCounts[activityType] = (activityCounts[activityType] ?? 0) + 1;
      typeDistance[activityType] = (typeDistance[activityType] ?? 0) + distanceMi;
      typeSeconds[activityType] = (typeSeconds[activityType] ?? 0) + timeSeconds;
    }

    const date = parseDate(row['Date']);
    if (date) {
      const isoDay = date.toISOString().slice(0, 10);
      daySet.add(isoDay);

      if (!earliestDate || date < earliestDate) earliestDate = date;
      if (!latestDate || date > latestDate) latestDate = date;

      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      if (!monthSeconds[monthKey]) {
        monthSeconds[monthKey] = { seconds: 0, sampleDate: date };
      }
      monthSeconds[monthKey]!.seconds += timeSeconds;
    }

    const durationSeconds = timeSeconds;
    if (durationSeconds > 0) {
      if (!longestActivityDetail || durationSeconds > longestActivityDetail.durationSeconds) {
        longestActivityDetail = { row, durationSeconds, date: date ?? null };
      }
    }

    if (date) {
      const dow = date.getDay();
      weekdayAgg[dow]!.seconds += timeSeconds;
      weekdayAgg[dow]!.count += 1;
    }

    if (calories > 0) {
      if (!highestCalorieDetail || calories > highestCalorieDetail.calories) {
        highestCalorieDetail = { row, calories, date: date ?? null, durationSeconds };
      }
    }

    if (runTypes.includes(activityType)) {
      runDistanceMi += distanceMi;
      runSeconds += timeSeconds;
      runSessions += 1;
      if (!runLongest || distanceMi > runLongest.distanceMi) runLongest = { row, distanceMi };
    }

    if (bikeTypes.includes(activityType)) {
      bikeDistanceMi += distanceMi;
      bikeSeconds += timeSeconds;
      bikeSessions += 1;
      if (!bikeLongest || distanceMi > bikeLongest.distanceMi) bikeLongest = { row, distanceMi };
    }

    if (swimTypes.includes(activityType)) {
      const meters = parseNumber(row['Distance']);
      swimMeters += meters;
      swimSeconds += timeSeconds;
      swimSessions += 1;
      if (!swimLongest || meters > swimLongest.distanceM) swimLongest = { row, distanceM: meters };
    }
  });

  // Favorite activity
  let favoriteActivity: Metrics['favoriteActivity'] | undefined;
  const activityNames = Object.keys(activityCounts);
  if (activityNames.length) {
    activityNames.sort((a, b) => (activityCounts[b] ?? 0) - (activityCounts[a] ?? 0));
    const name = activityNames[0]!;
    favoriteActivity = { name, count: (activityCounts[name] ?? 0) };
  }

  // Most active month (by time)
  let mostActiveMonth: Metrics['mostActiveMonth'] | undefined;
  const monthKeys = Object.keys(monthSeconds);
  if (monthKeys.length) {
    monthKeys.sort((a, b) => monthSeconds[b]!.seconds - monthSeconds[a]!.seconds);
    const key = monthKeys[0]!;
    const [, monthIdxStr] = key.split('-');
    const monthIdx = parseInt(monthIdxStr!, 10);
    const monthName = MONTH_NAMES[Number.isFinite(monthIdx) ? monthIdx : 0] ?? 'Unknown';
    mostActiveMonth = { name: monthName, totalHours: monthSeconds[key]!.seconds / 3600 };
  }

  // Longest streak
  let longestStreak: Metrics['longestStreak'];
  const daysSorted = Array.from(daySet).sort();
  if (daysSorted.length) {
    const firstDay = daysSorted[0]!;
    let bestLen = 1, bestStart = firstDay, bestEnd = firstDay;
    let curLen = 1, curStart = firstDay;
    const toDate = (iso: string) => new Date(iso + 'T00:00:00');

    for (let i = 1; i < daysSorted.length; i++) {
      const prev = toDate(daysSorted[i - 1]!);
      const curr = toDate(daysSorted[i]!);
      const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

      if (Math.round(diffDays) === 1) {
        curLen += 1;
      } else {
        if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; bestEnd = daysSorted[i - 1]!; }
        curLen = 1; curStart = daysSorted[i]!;
      }
    }

    if (curLen > bestLen) {
      bestLen = curLen; bestStart = curStart; bestEnd = daysSorted[daysSorted.length - 1]!;
    }

    const startDate = toDate(bestStart);
    const endDate = toDate(bestEnd);

    longestStreak = {
      lengthDays: bestLen,
      start: formatDateDisplay(startDate),
      end: formatDateDisplay(endDate),
    };
  }

  // Grind day
  const WEEKDAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  let bestIdx = -1;
  for (let i = 0; i < 7; i++) {
    const cur = weekdayAgg[i]!;
    if (cur.count === 0) continue;
    if (bestIdx === -1) { bestIdx = i; continue; }
    const best = weekdayAgg[bestIdx]!;
    if (cur.count > best.count || (cur.count === best.count && cur.seconds > best.seconds)) {
      bestIdx = i;
    }
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

  // Longest activity summary (stable narrowing)
  let longestActivitySummary: Metrics['longestActivity'] | undefined;
  const lad = longestActivityDetail;
  if (isLongestActivityDetail(lad) && lad.durationSeconds > 0) {
    longestActivitySummary = {
      title: String(lad.row['Title'] ?? 'Unknown activity'),
      date: formatDateDisplay(lad.date),
      durationSeconds: lad.durationSeconds,
      calories: parseNumber((lad.row as any)['Calories']),
    };
  }

  // Highest calorie summary
  let highestCalorieSummary: Metrics['highestCalorie'] | undefined;
  if (highestCalorieDetail && highestCalorieDetail.calories > 0) {
    highestCalorieSummary = {
      title: String(highestCalorieDetail.row['Title'] ?? 'Unknown activity'),
      date: formatDateDisplay(highestCalorieDetail.date),
      calories: highestCalorieDetail.calories,
      durationSeconds: highestCalorieDetail.durationSeconds,
    };
  }

  const runLongestOut =
    runLongest && runLongest.distanceMi > 0
      ? { title: String(runLongest.row['Title'] ?? 'Longest run'), distanceMi: runLongest.distanceMi }
      : undefined;

  const bikeLongestOut =
    bikeLongest && bikeLongest.distanceMi > 0
      ? { title: String(bikeLongest.row['Title'] ?? 'Longest ride'), distanceMi: bikeLongest.distanceMi }
      : undefined;

  const swimLongestOut =
    swimLongest && swimLongest.distanceM > 0
      ? { title: String(swimLongest.row['Title'] ?? 'Longest swim'), distanceM: swimLongest.distanceM }
      : undefined;

  return {
    totalDistanceMi,
    earthPercent,
    totalActivitySeconds,
    sessions,
    maxHr: maxHr || undefined,
    avgHr: avgHr || undefined,
    totalCalories: totalCalories || undefined,
    favoriteActivity,
    mostActiveMonth,
    longestStreak,
    longestActivity: longestActivitySummary,
    highestCalorie: highestCalorieSummary,
    totalAscent: totalAscent || undefined,
    maxElevation: maxElevation || undefined,
    avgDistanceMi,
    avgDurationSeconds,
    activityTypesCount,
    topActivityTypes,
    startDateDisplay: formatDateDisplay(earliestDate),
    endDateDisplay: formatDateDisplay(latestDate),
    grindDay,

    runDistanceMi: runDistanceMi || undefined,
    runSeconds: runSeconds || undefined,
    runSessions: runSessions || undefined,
    bikeDistanceMi: bikeDistanceMi || undefined,
    bikeSeconds: bikeSeconds || undefined,
    bikeSessions: bikeSessions || undefined,
    swimMeters: swimMeters || undefined,
    swimSeconds: swimSeconds || undefined,
    swimSessions: swimSessions || undefined,

    runLongest: runLongestOut,
    bikeLongest: bikeLongestOut,
    swimLongest: swimLongestOut,
  };
}

function computeSleepMetrics(rows: any[]): SleepMetrics {
  let totalScore = 0, totalDurationMinutes = 0, count = 0;
  let bestScoreWeek: SleepMetrics['bestScoreWeek'] = null;
  let worstScoreWeek: SleepMetrics['worstScoreWeek'] = null;
  let longestSleepWeek: SleepMetrics['longestSleepWeek'] = null;

  rows.forEach((row) => {
    const score = parseNumber(row['Avg Score']);
    const label = String(row['Date'] || '').trim();
    const durationMinutes = parseSleepDurationToMinutes(row['Avg Duration']);

    if (!score && !durationMinutes && !label) return;

    totalScore += score;
    totalDurationMinutes += durationMinutes;
    count += 1;

    if (!bestScoreWeek || score > bestScoreWeek.score) bestScoreWeek = { label, score, durationMinutes };
    if (!worstScoreWeek || score < worstScoreWeek.score) worstScoreWeek = { label, score, durationMinutes };
    if (!longestSleepWeek || durationMinutes > longestSleepWeek.durationMinutes) {
      longestSleepWeek = { label, durationMinutes, score };
    }
  });

  return {
    weeks: count,
    avgScore: count ? totalScore / count : 0,
    avgDurationMinutes: count ? totalDurationMinutes / count : 0,
    bestScoreWeek,
    worstScoreWeek,
    longestSleepWeek,
  };
}

type RawRow = Record<string, any>;

function computeStepsMetrics(rows: RawRow[]): StepsMetrics {
  let periods = 0, totalSteps = 0, totalDays = 0;
  let bestWeek: StepsMetrics['bestWeek'] | null = null;

  const rowCount = rows.length || 0;
  let looksWeekly = rowCount > 0 && rowCount <= 60;

  for (const row of rows) {
    const weekCol = row['Week'];
    const labelCol = row['Label'];
    const dateCol = row['Date'];
    const blankCol = row[''];

    const dateStr = String(dateCol ?? '').trim();
    const blankStr = String(blankCol ?? '').trim();

    if (
      (weekCol && String(weekCol).trim() !== '') ||
      (typeof labelCol === 'string' && /week/i.test(labelCol)) ||
      (dateStr && dateStr.includes(' - ')) ||
      (blankStr && blankStr.includes(' - ')) ||
      (blankStr && /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(blankStr))
    ) {
      looksWeekly = true;
      break;
    }
  }

  rows.forEach((row) => {
    const steps = parseNumber(
      row['Steps'] ?? row['Total Steps'] ?? row['Total steps'] ?? row['Weekly Steps'] ?? row['Actual']
    );
    if (!steps) return;

    const label = (row['Week'] ?? row['Label'] ?? row['Start'] ?? row['Date'] ?? row[''] ?? '') + '';
    const daysInPeriod = parseNumber(row['Days']) || (looksWeekly ? 7 : 1);

    periods += 1;
    totalSteps += steps;
    totalDays += daysInPeriod;

    if (!bestWeek || steps > bestWeek.steps) {
      bestWeek = { label: label || (looksWeekly ? `Week ${periods}` : `Day ${periods}`), steps };
    }
  });

  const days = totalDays || (looksWeekly ? periods * 7 : periods || 1);
  const avgStepsPerDay = totalSteps / days;

  return { weeks: periods, totalSteps, avgStepsPerDay, bestWeek };
}

function StatCard({ icon: Icon, value, label, helper }: StatCardProps) {
  return (
    <div className="bg-zinc-900/80 border border-zinc-700/70 rounded-3xl p-5 sm:p-6 flex flex-col gap-2 shadow-[0_0_40px_rgba(0,0,0,0.7)] hover:-translate-y-0.5 hover:border-zinc-500 transition">
      <div className="flex items-center gap-2 text-xs text-zinc-400 uppercase tracking-wide">
        <Icon className="w-4 h-4 text-zinc-300" />
        <span>{label}</span>
      </div>
      <div className="text-2xl sm:text-3xl font-semibold text-zinc-50">{value || '--'}</div>
      {helper && <div className="text-xs text-zinc-500">{helper}</div>}
    </div>
  );
}

export default function Home() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sleepMetrics, setSleepMetrics] = useState<SleepMetrics | null>(null);
  const [sleepError, setSleepError] = useState<string | null>(null);

  const [stepsMetrics, setStepsMetrics] = useState<StepsMetrics | null>(null);
  const [stepsError, setStepsError] = useState<string | null>(null);

  const pageRef = useRef<HTMLDivElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const data = (results.data as any[]).filter((row) => row && Object.keys(row).length > 0);
          if (!data.length) {
            setError('Could not find any activity rows in that CSV.');
            setMetrics(null);
            return;
          }
          const m = computeMetrics(data);
          setMetrics(m);
        } catch (err) {
          console.error(err);
          setError('Sorry, something went wrong reading that CSV.');
          setMetrics(null);
        }
      },
      error: (err) => {
        console.error(err);
        setError('Failed to parse CSV file.');
        setMetrics(null);
      },
    });
  };

  const handleSleepFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSleepError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const data = (results.data as any[]).filter((row) => row && Object.keys(row).length > 0);
          if (!data.length) {
            setSleepError('Could not find any sleep rows in that CSV.');
            setSleepMetrics(null);
            return;
          }
          const m = computeSleepMetrics(data);
          setSleepMetrics(m);
        } catch (err) {
          console.error(err);
          setSleepError('Sorry, something went wrong reading that CSV.');
          setSleepMetrics(null);
        }
      },
      error: (err) => {
        console.error(err);
        setSleepError('Failed to parse sleep CSV file.');
        setSleepMetrics(null);
      },
    });
  };

  const handleStepsFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStepsError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const data = (results.data as any[]).filter((row) => row && Object.keys(row).length > 0);
          if (!data.length) {
            setStepsError('Could not find any step rows in that CSV.');
            setStepsMetrics(null);
            return;
          }
          const m = computeStepsMetrics(data);
          setStepsMetrics(m);
        } catch (err: any) {
          console.error(err);
          setStepsError(err?.message || 'Sorry, something went wrong reading the steps CSV.');
          setStepsMetrics(null);
        }
      },
      error: (err) => {
        console.error(err);
        setStepsError('Failed to parse steps CSV file.');
        setStepsMetrics(null);
      },
    });
  };

  const handleDownloadImage = async () => {
    if (!pageRef.current) return;
    const node = pageRef.current;

    try {
      const dataUrl = await htmlToImage.toPng(node, {
        cacheBust: true,
        width: node.scrollWidth,
        height: node.scrollHeight,
        backgroundColor: '#000000',
      });

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'garmin-wrapped.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to generate image', err);
      alert('Sorry, something went wrong generating the image.');
    }
  };

  const m = metrics;

  const distanceStr = m ? `${m.totalDistanceMi.toFixed(2)} mi` : '--';
  const earthPercentStr = m ? `${m.earthPercent.toFixed(2)}%` : '--';
  const totalTimeStr = m ? formatDurationLong(m.totalActivitySeconds) : '--';
  const maxHrStr = m?.maxHr ? `${Math.round(m.maxHr)} bpm` : '--';
  const avgHrStr = m?.avgHr ? `${Math.round(m.avgHr)} bpm` : '--';
  const caloriesStr = m?.totalCalories ? `${m.totalCalories.toLocaleString()} kcal` : '--';
  const sessionsStr = m ? `${m.sessions}` : '--';

  const favActivityStr = m?.favoriteActivity &&
    `${m.favoriteActivity.name} · ${m.favoriteActivity.count} sessions`;

  const mostActiveMonthStr =
    m?.mostActiveMonth &&
    `${m.mostActiveMonth.name} · ${m.mostActiveMonth.totalHours.toFixed(1)} hrs`;

  const streakStr = m?.longestStreak && m.longestStreak.lengthDays > 0
    ? `${m.longestStreak.lengthDays} days` : '--';

  const streakRange = m?.longestStreak &&
    `${m.longestStreak.start} → ${m.longestStreak.end}`;

  const totalAscentStr = m?.totalAscent != null ? `${Math.round(m.totalAscent)} ft` : '--';
  const maxElevationStr = m?.maxElevation != null ? `${Math.round(m.maxElevation)} ft` : '--';

  const avgDistanceStr = m?.avgDistanceMi != null ? `${m.avgDistanceMi.toFixed(2)} mi / session` : '--';
  const avgDurationStr = m?.avgDurationSeconds != null ? `${formatDurationHMS(m.avgDurationSeconds)} / session` : '--';
  const typesCountStr = m ? `${m.activityTypesCount}` : '--';

  const longestActivity = m?.longestActivity;
  const highestCal = m?.highestCalorie;
  const topTypes = m?.topActivityTypes || [];

  const dateRange =
    m?.startDateDisplay && m?.endDateDisplay
      ? `${m.startDateDisplay} – ${m.endDateDisplay}`
      : 'Upload a CSV to see your year';

  // Sport-specific strings
  const runDistanceStr = m?.runDistanceMi != null ? `${m.runDistanceMi.toFixed(1)} mi` : '--';
  const runTimeStr = m?.runSeconds != null ? formatDurationHMS(m.runSeconds) : '--';
  const runPaceStr = m?.runSeconds && m.runDistanceMi
    ? formatPacePerMile(m.runSeconds, m.runDistanceMi) : '--';

  const bikeDistanceStr = m?.bikeDistanceMi != null ? `${m.bikeDistanceMi.toFixed(1)} mi` : '--';
  const bikeTimeStr = m?.bikeSeconds != null ? formatDurationHMS(m.bikeSeconds) : '--';
  const bikeSpeedStr = m?.bikeDistanceMi && m.bikeSeconds
    ? `${(m.bikeDistanceMi / (m.bikeSeconds / 3600)).toFixed(1)} mph` : '--';

  const swimDistanceStr = m?.swimMeters != null ? `${m.swimMeters.toLocaleString()} m` : '--';
  const swimTimeStr = m?.swimSeconds != null ? formatDurationHMS(m.swimSeconds) : '--';
  const swimPaceStr = m?.swimSeconds && m.swimMeters
    ? formatSwimPacePer100m(m.swimSeconds, m.swimMeters) : '--';

  // Sleep
  const s = sleepMetrics;
  const avgSleepScoreStr = s ? s.avgScore.toFixed(1) : '--';
  const avgSleepDurationStr = s
    ? (() => {
        const mins = s.avgDurationMinutes;
        const h = Math.floor(mins / 60);
        const mR = Math.round(mins % 60);
        return `${h}h ${mR}m`;
      })()
    : '--';
  const sleepGrade = s && s.avgScore
    ? s.avgScore >= 85 ? 'A'
      : s.avgScore >= 80 ? 'B+'
      : s.avgScore >= 75 ? 'B' : 'C+'
    : '--';

  // Steps
  const step = stepsMetrics;
  const totalStepsStr = step ? step.totalSteps.toLocaleString() : null;
  const avgStepsStr = step && step.avgStepsPerDay
    ? `${Math.round(step.avgStepsPerDay).toLocaleString()} / day` : null;

  const marathonEqStr = m && m.totalDistanceMi ? (m.totalDistanceMi / MARATHON_MI).toFixed(1) : null;
  const fiveKEqStr = m && m.totalDistanceMi ? (m.totalDistanceMi / FIVEK_MI).toFixed(1) : null;

  const everestsStr = m?.totalAscent != null && m.totalAscent > 0
    ? (m.totalAscent / EVEREST_FT).toFixed(2) : null;

  return (
    <div ref={pageRef} className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold mb-2">Garmin Wrapped</h1>
            <p className="text-sm text-zinc-400">{dateRange}</p>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-2">
            <label className="inline-flex items-center gap-2 text-sm text-zinc-200 bg-zinc-900/80 border border-zinc-700 rounded-full px-4 py-2 cursor-pointer hover:bg-zinc-800 hover:border-zinc-500 transition">
              <Upload className="w-4 h-4" />
              <span>Upload Garmin activities CSV</span>
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
            </label>

            <label className="inline-flex items-center gap-2 text-xs text-zinc-300 bg-zinc-900/60 border border-zinc-700 rounded-full px-3 py-1 cursor-pointer hover:bg-zinc-800 hover:border-zinc-500 transition">
              <Upload className="w-3 h-3" />
              <span>Upload Sleep CSV (optional)</span>
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleSleepFileChange} />
            </label>

            <label className="inline-flex items-center gap-2 text-xs text-zinc-300 bg-zinc-900/60 border border-zinc-700 rounded-full px-3 py-1 cursor-pointer hover:bg-zinc-800 hover:border-zinc-500 transition">
              <Upload className="w-3 h-3" />
              <span>Upload Steps CSV (optional)</span>
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleStepsFileChange} />
            </label>

            {metrics && (
              <button
                type="button"
                onClick={handleDownloadImage}
                className="text-xs sm:text-sm text-zinc-100 bg-zinc-800/80 border border-zinc-600 rounded-full px-4 py-2 hover:bg-zinc-700 hover:border-zinc-400 transition"
              >
                Download as image
              </button>
            )}

            {!metrics && (
              <p className="text-xs text-zinc-500 max-w-xs text-right">
                Export your activities from Garmin Connect (&quot;All Activities&quot;) as CSV and drop it here.
              </p>
            )}
            {error && <p className="text-xs text-red-400 max-w-xs text-right">{error}</p>}
            {sleepError && <p className="text-xs text-red-400 max-w-xs text-right">{sleepError}</p>}
            {stepsError && <p className="text-xs text-red-400 max-w-xs text-right">{stepsError}</p>}
          </div>
        </header>

        {metrics && (
          <div className="space-y-8">
            {/* Distance */}
            <section className="grid gap-5 md:grid-cols-3">
              <div className="md:col-span-2 bg-gradient-to-br from-indigo-600/40 via-purple-700/30 to-zinc-900/90 border border-purple-500/40 rounded-3xl p-6 sm:p-7 shadow-[0_0_50px_rgba(0,0,0,0.9)]">
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-black/50 flex items-center justify-center border border-white/10">
                      <Activity className="w-5 h-5 text-indigo-200" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-indigo-200/80">Distance traveled</p>
                      <p className="text-xs text-zinc-300">Powered by Garmin activities</p>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-400">{m?.startDateDisplay} → {m?.endDateDisplay}</div>
                </div>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-4xl sm:text-5xl md:text-6xl font-semibold">{distanceStr}</div>
                    <div className="text-md text-zinc-300 mt-2">
                      That&apos;s <span className="font-semibold">{earthPercentStr}</span> of the way around Earth.
                    </div>
                    {step && totalStepsStr && (
                      <div className="text-lg text-zinc-300 mt-1">
                        <span className="font-semibold text-lg sm:text-xl">{totalStepsStr} steps</span>
                        {avgStepsStr && <> <span className="font-semibold text-lg sm:text-xl">{avgStepsStr}</span></>}
                      </div>
                    )}
                    {marathonEqStr && fiveKEqStr && (
                      <div className="text-md text-zinc-300 mt-1">
                        That&apos;s about <span className="font-semibold">{marathonEqStr} marathons</span> or{' '}
                        <span className="font-semibold">{fiveKEqStr} 5Ks</span>.
                      </div>
                    )}
                  </div>

                  <div className="bg-black/40 rounded-2xl px-4 py-3 border border-white/10 flex flex-col gap-1 min-w-[9rem]">
                    <div className="text-xs text-zinc-400 uppercase tracking-wide">Total time moving</div>
                    <div className="text-lg font-semibold">{totalTimeStr}</div>
                    <div className="text-xs text-zinc-500">Across {sessionsStr} sessions</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <StatCard icon={LineChart} value={sessionsStr} label="Total sessions" helper="Every recording counts as one." />
                <StatCard
                  icon={CalendarDays}
                  value={m?.grindDay ? m.grindDay.name : '--'}
                  label="Grind day"
                  helper={m?.grindDay ? `${m.grindDay.totalHours.toFixed(1)} hrs · ${m.grindDay.activities} activities` : undefined}
                />
              </div>
            </section>

            {/* HR + calories */}
            <section className="grid gap-5 md:grid-cols-3">
              <StatCard icon={HeartPulse} value={maxHrStr} label="Max heart rate" helper="Your highest recorded BPM." />
              <StatCard icon={HeartPulse} value={avgHrStr} label="Average heart rate" helper="Average across all sessions with HR data." />
              <StatCard icon={Flame} value={caloriesStr} label="Calories burned" helper="Total estimated energy output." />
            </section>

            {/* Averages */}
            <section className="grid gap-5 md:grid-cols-3">
              <StatCard icon={Timer} value={avgDurationStr} label="Avg duration" helper="Typical length of one session." />
              <StatCard icon={Activity} value={avgDistanceStr} label="Avg distance" helper="Average distance per recorded activity." />
              <StatCard icon={CalendarDays} value={mostActiveMonthStr || '--'} label="Most active month" helper="Where you stacked the most time." />
            </section>

            {/* Sports */}
            <section className="grid gap-5 md:grid-cols-3">
              {/* Running */}
              <div className="bg-gradient-to-br from-red-600/40 via-orange-500/30 to-zinc-900/90 border border-red-400/50 rounded-3xl p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-9 w-9 rounded-2xl bg-black/40 flex items-center justify-center border border-white/10">
                    <Activity className="w-5 h-5 text-red-200" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-red-200">Running</p>
                    <p className="text-xs text-zinc-300">Road, treadmill, and track</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-zinc-400">Distance</span><span className="font-semibold">{runDistanceStr}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Time</span><span className="font-semibold">{runTimeStr}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Pace</span><span className="font-semibold">{runPaceStr}</span></div>
                  {m?.runLongest && (
                    <div className="flex justify-between items-start">
                      <span className="text-zinc-400">Longest</span>
                      <div className="text-right max-w-[70%] whitespace-normal break-words leading-snug">
                        <div className="font-semibold">{m.runLongest.title}</div>
                        <div className="font-semibold text-xs sm:text-sm opacity-90">{m.runLongest.distanceMi.toFixed(1)} mi</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Cycling */}
              <div className="bg-gradient-to-br from-emerald-600/40 via-teal-500/30 to-zinc-900/90 border border-emerald-400/50 rounded-3xl p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-9 w-9 rounded-2xl bg-black/40 flex items-center justify-center border border-white/10">
                    <Bike className="w-5 h-5 text-emerald-200" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Cycling</p>
                    <p className="text-xs text-zinc-300">Road, indoor, and virtual</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-zinc-400">Distance</span><span className="font-semibold">{bikeDistanceStr}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Time</span><span className="font-semibold">{bikeTimeStr}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Avg speed</span><span className="font-semibold">{bikeSpeedStr}</span></div>
                  {m?.bikeLongest && (
                    <div className="flex justify-between items-start">
                      <span className="text-zinc-400">Longest</span>
                      <div className="text-right max-w-[70%] whitespace-normal break-words leading-snug">
                        <div className="font-semibold">{m.bikeLongest.title}</div>
                        <div className="font-semibold text-xs sm:text-sm opacity-90">{m.bikeLongest.distanceMi.toFixed(1)} mi</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Swimming */}
              <div className="bg-gradient-to-br from-blue-500/40 via-cyan-500/30 to-zinc-900/90 border border-cyan-400/50 rounded-3xl p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-9 w-9 rounded-2xl bg-black/40 flex items-center justify-center border border-white/10">
                    <Waves className="w-5 h-5 text-cyan-200" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Swimming</p>
                    <p className="text-xs text-zinc-300">Pool and open water (meters)</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-zinc-400">Distance</span><span className="font-semibold">{swimDistanceStr}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Time</span><span className="font-semibold">{swimTimeStr}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Pace</span><span className="font-semibold">{swimPaceStr}</span></div>
                  {m?.swimLongest && (
                    <div className="flex justify-between items-start">
                      <span className="text-zinc-400">Longest</span>
                      <div className="text-right max-w-[70%] whitespace-normal break-words leading-snug">
                        <div className="font-semibold">{m.swimLongest.title}</div>
                        <div className="font-semibold text-xs sm:text-sm opacity-90">{m.swimLongest.distanceM.toLocaleString()} m</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Big moments */}
            <section className="grid gap-5 md:grid-cols-2">
              {longestActivity && (
                <div className="bg-zinc-900/80 border border-zinc-700/70 rounded-3xl p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-9 w-9 rounded-2xl bg-yellow-500/10 flex items-center justify-center border border-yellow-400/50">
                      <Trophy className="w-5 h-5 text-yellow-300" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-yellow-300">Longest activity</p>
                      <p className="text-sm text-zinc-300">{longestActivity.date || '--'}</p>
                    </div>
                  </div>
                  <p className="text-lg sm:text-xl font-semibold mb-2">{longestActivity.title}</p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-zinc-400 text-xs">Duration</p>
                      <p className="text-zinc-100 font-medium">{formatDurationHMS(longestActivity.durationSeconds)}</p>
                    </div>
                    <div>
                      <p className="text-zinc-400 text-xs">Calories</p>
                      <p className="text-zinc-100 font-medium">
                        {longestActivity.calories != null ? `${longestActivity.calories} kcal` : '--'}
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-400 text-xs">Type</p>
                      <p className="text-zinc-100 font-medium">Long day out</p>
                    </div>
                  </div>
                </div>
              )}

              {highestCal && (
                <div className="bg-zinc-900/80 border border-zinc-700/70 rounded-3xl p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-9 w-9 rounded-2xl bg-orange-500/10 flex items-center justify-center border border-orange-400/50">
                      <Flame className="w-5 h-5 text-orange-300" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-orange-300">Highest calorie burn</p>
                      <p className="text-sm text-zinc-300">{highestCal.date || '--'}</p>
                    </div>
                  </div>
                  <p className="text-lg sm:text-xl font-semibold mb-2">{highestCal.title}</p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-zinc-400 text-xs">Duration</p>
                      <p className="text-zinc-100 font-medium">
                        {highestCal.durationSeconds ? formatDurationHMS(highestCal.durationSeconds) : '--'}
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-400 text-xs">Calories</p>
                      <p className="text-zinc-100 font-medium">{highestCal.calories} kcal</p>
                    </div>
                    <div>
                      <p className="text-zinc-400 text-xs">Effort</p>
                      <p className="text-zinc-100 font-medium">Big day in the pain cave</p>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Streak + elevation */}
            <section className="grid gap-5 md:grid-cols-2">
              <div className="bg-zinc-900/80 border border-zinc-700/70 rounded-3xl p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-9 w-9 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-400/60">
                    <Zap className="w-5 h-5 text-amber-300" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-amber-300">Consistency streak</p>
                    {streakRange && <p className="text-sm text-zinc-300">{streakRange}</p>}
                  </div>
                </div>
                <div className="text-3xl sm:text-4xl font-semibold mb-2">{streakStr}</div>
                <p className="text-xs text-zinc-500">Longest run of consecutive days with at least one activity.</p>
              </div>

              <div className="bg-zinc-900/80 border border-zinc-700/70 rounded-3xl p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-9 w-9 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-400/60">
                    <Mountain className="w-5 h-5 text-emerald-300" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Vertical gains</p>
                    <p className="text-sm text-zinc-300">Total climbing and highest point</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><p className="text-zinc-400 text-xs">Total ascent</p><p className="text-lg font-semibold">{totalAscentStr}</p></div>
                  <div><p className="text-zinc-400 text-xs">Highest point</p><p className="text-lg font-semibold">{maxElevationStr}</p></div>
                </div>
                {everestsStr && (
                  <div className="text-md text-zinc-400 mt-2">
                    ≈ <span className="font-semibold text-zinc-200">{everestsStr}</span> Mount Everests
                  </div>
                )}
              </div>
            </section>

            {/* By activity type */}
            {topTypes.length > 0 && (
              <section className="bg-zinc-900/80 border border-zinc-700/70 rounded-3xl p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-400/50">
                      <Dumbbell className="w-5 h-5 text-blue-300" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-blue-300">By activity type</p>
                      <p className="text-sm text-zinc-300">Your top sports by session count</p>
                    </div>
                  </div>
                  {favActivityStr && <p className="text-xs text-zinc-400 text-right max-w-[10rem]">Favorite: {favActivityStr}</p>}
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {topTypes.map((t) => (
                    <div key={t.name} className="bg-black/40 border border-zinc-700 rounded-2xl p-4 flex flex-col gap-2">
                      <div className="text-sm font-semibold truncate">{t.name}</div>
                      <div className="text-xs text-zinc-400">{t.count} session{t.count !== 1 ? 's' : ''}</div>
                      <div className="text-sm text-zinc-100">
                        {t.totalDistanceMi.toFixed(1)} mi · {formatDurationHMS(t.totalSeconds)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Sleep */}
        {sleepMetrics && (
          <section className="mt-8 bg-zinc-900/80 border border-zinc-700/70 rounded-3xl p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-400/50">
                  <HeartPulse className="w-5 h-5 text-indigo-200" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-indigo-200">Sleep Wrapped</p>
                  <p className="text-sm text-zinc-300">{sleepMetrics.weeks} weeks of tracked sleep</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3 text-sm">
              <div>
                <p className="text-zinc-400 text-xs">Average sleep score</p>
                <p className="text-2xl font-semibold">{avgSleepScoreStr}</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Roughly a solid <span className="font-semibold">{sleepGrade}</span>.
                </p>
              </div>

              <div>
                <p className="text-zinc-400 text-xs">Average nightly duration</p>
                <p className="text-2xl font-semibold">{avgSleepDurationStr}</p>
              </div>

              {sleepMetrics.bestScoreWeek && (
                <div>
                  <p className="text-zinc-400 text-xs">Best week</p>
                  <p className="text-sm text-zinc-100 font-semibold">{sleepMetrics.bestScoreWeek.label}</p>
                  <p className="text-sm text-zinc-300">
                    Score {sleepMetrics.bestScoreWeek.score} ·{' '}
                    {(() => {
                      const mins = sleepMetrics.bestScoreWeek!.durationMinutes;
                      const h = Math.floor(mins / 60);
                      const mR = Math.round(mins % 60);
                      return `${h}h ${mR}m avg`;
                    })()}
                  </p>
                </div>
              )}
            </div>

            {sleepMetrics.worstScoreWeek && (
              <div className="mt-4 text-xs text-zinc-400">
                Toughest week: <span className="text-zinc-200">{sleepMetrics.worstScoreWeek.label}</span> (score {sleepMetrics.worstScoreWeek.score}).
              </div>
            )}
          </section>
        )}

        <footer className="mt-10 text-xs text-zinc-500">
          <p>© 2025 Jordan Lindsay. Not affiliated with Garmin Ltd.</p>
        </footer>
      </main>
    </div>
  );
}
