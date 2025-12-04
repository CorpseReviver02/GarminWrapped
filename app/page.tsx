'use client';

import React, { useState } from 'react';
import Papa from 'papaparse';
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
  Layers,
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

  // By-sport breakdown
  runDistanceMi?: number;
  runSeconds?: number;
  runSessions?: number;
  bikeDistanceMi?: number;
  bikeSeconds?: number;
  bikeSessions?: number;
  swimMeters?: number;
  swimSeconds?: number;
  swimSessions?: number;
};

type StatCardProps = {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  value: string;
  label: string;
  helper?: string;
};

const EARTH_CIRCUMFERENCE_MI = 24901;

// ---------- helpers ----------

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
    const [h, m, sec] = parts;
    return h * 3600 + m * 60 + sec;
  }
  if (parts.length === 2) {
    const [m, sec] = parts;
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

function formatSwimPacePer100m(
  totalSeconds: number,
  meters: number,
): string {
  if (!totalSeconds || !meters) return '--';
  const units = meters / 100;
  if (!units) return '--';
  const secPer100 = totalSeconds / units;
  const s = Math.round(secPer100);
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${sec.toString().padStart(2, '0')}/100m`;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// distance conversion: meters → miles for specific sports
function distanceMilesFromRow(row: any): number {
  const raw = parseNumber(row['Distance']);
  const activityType = String(row['Activity Type'] || '').trim();

  if (!raw || !activityType) return 0;

  const meterActivities = [
    'Track Running',
    'Pool Swim',
    'Swimming',
    'Open Water Swimming',
  ];

  if (meterActivities.includes(activityType)) {
    // meters → miles
    return raw / 1609.34;
  }

  // everything else already in miles
  return raw;
}

// ---------- metric computation from CSV ----------

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
  const monthSeconds: Record<string, { seconds: number; sampleDate: Date }> =
    {};
  const daySet = new Set<string>();

  let earliestDate: Date | null = null;
  let latestDate: Date | null = null;

  // By-sport accumulators
  let runDistanceMi = 0;
  let runSeconds = 0;
  let runSessions = 0;

  let bikeDistanceMi = 0;
  let bikeSeconds = 0;
  let bikeSessions = 0;

  let swimMeters = 0;
  let swimSeconds = 0;
  let swimSessions = 0;

  let longestActivity: {
    row: any;
    durationSeconds: number;
    date: Date | null;
  } | null = null;

  let highestCalorie: {
    row: any;
    calories: number;
    date: Date | null;
    durationSeconds: number;
  } | null = null;

  const runTypes = ['Running', 'Treadmill Running', 'Track Running'];
  const bikeTypes = ['Cycling', 'Indoor Cycling', 'Virtual Cycling'];
  const swimTypes = ['Pool Swim', 'Swimming', 'Open Water Swimming'];

  rows.forEach((row) => {
    const activityType = String(row['Activity Type'] || '').trim();

    const hasAnyData =
      activityType ||
      row['Distance'] ||
      row['Time'] ||
      row['Elapsed Time'] ||
      row['Calories'];
    if (!hasAnyData) return;

    sessions += 1;

    const distanceMi = distanceMilesFromRow(row);
    totalDistanceMi += distanceMi;

    const timeSeconds = parseTimeToSeconds(
      row['Time'] || row['Moving Time'] || row['Elapsed Time'],
    );
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
      activityCounts[activityType] = (activityCounts[activityType] || 0) + 1;
      typeDistance[activityType] =
        (typeDistance[activityType] || 0) + distanceMi;
      typeSeconds[activityType] =
        (typeSeconds[activityType] || 0) + timeSeconds;
    }

    // Date-based stuff
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
      monthSeconds[monthKey].seconds += timeSeconds;
    }

    // Longest & highest-calorie activities
    const durationSeconds = timeSeconds;
    if (
      durationSeconds > 0 &&
      (!longestActivity || durationSeconds > longestActivity.durationSeconds)
    ) {
      longestActivity = { row, durationSeconds, date };
    }

    if (
      calories > 0 &&
      (!highestCalorie || calories > highestCalorie.calories)
    ) {
      highestCalorie = {
        row,
        calories,
        date,
        durationSeconds,
      };
    }

    // By-sport accumulation
    if (runTypes.includes(activityType)) {
      runDistanceMi += distanceMi;
      runSeconds += timeSeconds;
      runSessions += 1;
    }

    if (bikeTypes.includes(activityType)) {
      bikeDistanceMi += distanceMi;
      bikeSeconds += timeSeconds;
      bikeSessions += 1;
    }

    if (swimTypes.includes(activityType)) {
      const meters = parseNumber(row['Distance']); // swimming distance is meters
      swimMeters += meters;
      swimSeconds += timeSeconds;
      swimSessions += 1;
    }
  });

  // Favorite activity
  let favoriteActivity: Metrics['favoriteActivity'] | undefined;
  const activityNames = Object.keys(activityCounts);
  if (activityNames.length) {
    activityNames.sort((a, b) => activityCounts[b] - activityCounts[a]);
    const name = activityNames[0];
    favoriteActivity = { name, count: activityCounts[name] };
  }

  // Most active month
  let mostActiveMonth: Metrics['mostActiveMonth'] | undefined;
  const monthKeys = Object.keys(monthSeconds);
  if (monthKeys.length) {
    monthKeys.sort(
      (a, b) => monthSeconds[b].seconds - monthSeconds[a].seconds,
    );
    const key = monthKeys[0];
    const [, monthIdxStr] = key.split('-');
    const monthIdx = parseInt(monthIdxStr, 10);
    const name = `${MONTH_NAMES[monthIdx]}`;
    mostActiveMonth = {
      name,
      totalHours: monthSeconds[key].seconds / 3600,
    };
  }

  // Longest streak
  let longestStreak: Metrics['longestStreak'];
  const daysSorted = Array.from(daySet).sort();
  if (daysSorted.length) {
    let bestLen = 1;
    let bestStart = daysSorted[0];
    let bestEnd = daysSorted[0];

    let curLen = 1;
    let curStart = daysSorted[0];

    const toDate = (iso: string) => new Date(iso + 'T00:00:00');

    for (let i = 1; i < daysSorted.length; i++) {
      const prev = toDate(daysSorted[i - 1]);
      const curr = toDate(daysSorted[i]);
      const diffDays =
        (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

      if (Math.round(diffDays) === 1) {
        curLen += 1;
      } else {
        if (curLen > bestLen) {
          bestLen = curLen;
          bestStart = curStart;
          bestEnd = daysSorted[i - 1];
        }
        curLen = 1;
        curStart = daysSorted[i];
      }
    }

    if (curLen > bestLen) {
      bestLen = curLen;
      bestStart = curStart;
      bestEnd = daysSorted[daysSorted.length - 1];
    }

    const startDate = toDate(bestStart);
    const endDate = toDate(bestEnd);

    longestStreak = {
      lengthDays: bestLen,
      start: formatDateDisplay(startDate),
      end: formatDateDisplay(endDate),
    };
  }

  const avgHr = avgHrCount ? avgHrSum / avgHrCount : undefined;
  const earthPercent =
    totalDistanceMi > 0
      ? (totalDistanceMi / EARTH_CIRCUMFERENCE_MI) * 100
      : 0;

  const avgDistanceMi =
    sessions > 0 ? totalDistanceMi / sessions : undefined;
  const avgDurationSeconds =
    sessions > 0 ? totalActivitySeconds / sessions : undefined;

  const typeNames = Object.keys(activityCounts);
  const activityTypesCount = typeNames.length;
  let topActivityTypes: ActivityTypeSummary[] | undefined;
  if (activityTypesCount) {
    const arr: ActivityTypeSummary[] = typeNames.map((name) => ({
      name,
      count: activityCounts[name],
      totalDistanceMi: typeDistance[name] || 0,
      totalSeconds: typeSeconds[name] || 0,
    }));
    arr.sort((a, b) => b.count - a.count);
    topActivityTypes = arr.slice(0, 3);

  // Build longest activity summary
  let longestActivitySummary: Metrics['longestActivity'] | undefined;
  if (longestActivity && longestActivity.durationSeconds > 0) {
    longestActivitySummary = {
      title: String(longestActivity.row['Title'] || 'Unknown activity'),
      date: formatDateDisplay(longestActivity.date),
      durationSeconds: longestActivity.durationSeconds,
      calories: parseNumber(longestActivity.row['Calories']),
    };
  }

  // Build highest calorie summary
  let highestCalorieSummary: Metrics['highestCalorie'] | undefined;
  if (highestCalorie && highestCalorie.calories > 0) {
    highestCalorieSummary = {
      title: String(highestCalorie.row['Title'] || 'Unknown activity'),
      date: formatDateDisplay(highestCalorie.date),
      calories: highestCalorie.calories,
      durationSeconds: highestCalorie.durationSeconds,
    };
  }

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
    runDistanceMi: runDistanceMi || undefined,
    runSeconds: runSeconds || undefined,
    runSessions: runSessions || undefined,
    bikeDistanceMi: bikeDistanceMi || undefined,
    bikeSeconds: bikeSeconds || undefined,
    bikeSessions: bikeSessions || undefined,
    swimMeters: swimMeters || undefined,
    swimSeconds: swimSeconds || undefined,
    swimSessions: swimSessions || undefined,
  };
}

// ---------- UI components ----------

function StatCard({ icon: Icon, value, label, helper }: StatCardProps) {
  return (
    <div className="bg-zinc-900/80 border border-zinc-700/70 rounded-3xl p-5 sm:p-6 flex flex-col gap-2 shadow-[0_0_40px_rgba(0,0,0,0.7)] hover:-translate-y-0.5 hover:border-zinc-500 transition">
      <div className="flex items-center gap-2 text-xs text-zinc-400 uppercase tracking-wide">
        <Icon className="w-4 h-4 text-zinc-300" />
        <span>{label}</span>
      </div>
      <div className="text-2xl sm:text-3xl font-semibold text-zinc-50">
        {value || '--'}
      </div>
      {helper && (
        <div className="text-xs text-zinc-500">{helper}</div>
      )}
    </div>
  );
}

export default function Home() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const data = (results.data as any[]).filter(
            (row) => row && Object.keys(row).length > 0,
          );
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

  const m = metrics;

  const distanceStr = m
    ? `${m.totalDistanceMi.toFixed(2)} mi`
    : '--';
  const earthPercentStr = m
    ? `${m.earthPercent.toFixed(2)}%`
    : '--';
  const totalTimeStr = m
    ? formatDurationLong(m.totalActivitySeconds)
    : '--';
  const maxHrStr = m?.maxHr ? `${Math.round(m.maxHr)} bpm` : '--';
  const avgHrStr = m?.avgHr ? `${Math.round(m.avgHr)} bpm` : '--';
  const caloriesStr = m?.totalCalories
    ? `${m.totalCalories.toLocaleString()} kcal`
    : '--';
  const sessionsStr = m ? `${m.sessions}` : '--';

  const favActivityStr =
    m?.favoriteActivity &&
    `${m.favoriteActivity.name} · ${m.favoriteActivity.count} sessions`;

  const mostActiveMonthStr =
    m?.mostActiveMonth &&
    `${m.mostActiveMonth.name} · ${m.mostActiveMonth.totalHours.toFixed(
      1,
    )} hrs`;

  const streakStr =
    m?.longestStreak && m.longestStreak.lengthDays > 0
      ? `${m.longestStreak.lengthDays} days`
      : '--';

  const streakRange =
    m?.longestStreak &&
    `${m.longestStreak.start} → ${m.longestStreak.end}`;

  const totalAscentStr =
    m?.totalAscent != null
      ? `${Math.round(m.totalAscent)} ft`
      : '--';
  const maxElevationStr =
    m?.maxElevation != null ? `${Math.round(m.maxElevation)} ft` : '--';

  const avgDistanceStr =
    m?.avgDistanceMi != null
      ? `${m.avgDistanceMi.toFixed(2)} mi / session`
      : '--';

  const avgDurationStr =
    m?.avgDurationSeconds != null
      ? `${formatDurationHMS(m.avgDurationSeconds)} / session`
      : '--';

  const typesCountStr = m ? `${m.activityTypesCount}` : '--';

  const longestActivity = m?.longestActivity;
  const highestCal = m?.highestCalorie;
  const topTypes = m?.topActivityTypes || [];

  const dateRange =
    m?.startDateDisplay && m?.endDateDisplay
      ? `${m.startDateDisplay} – ${m.endDateDisplay}`
      : 'Upload a CSV to see your year';

  // Sport-specific strings
  const runDistanceStr =
    m?.runDistanceMi != null
      ? `${m.runDistanceMi.toFixed(1)} mi`
      : '--';
  const runTimeStr =
    m?.runSeconds != null ? formatDurationHMS(m.runSeconds) : '--';
  const runPaceStr =
    m?.runSeconds && m.runDistanceMi
      ? formatPacePerMile(m.runSeconds, m.runDistanceMi)
      : '--';

  const bikeDistanceStr =
    m?.bikeDistanceMi != null
      ? `${m.bikeDistanceMi.toFixed(1)} mi`
      : '--';
  const bikeTimeStr =
    m?.bikeSeconds != null ? formatDurationHMS(m.bikeSeconds) : '--';
  const bikeSpeedStr =
    m?.bikeDistanceMi && m.bikeSeconds
      ? `${(
          m.bikeDistanceMi /
          (m.bikeSeconds / 3600)
        ).toFixed(1)} mph`
      : '--';

  const swimDistanceStr =
    m?.swimMeters != null
      ? `${m.swimMeters.toLocaleString()} m`
      : '--';
  const swimTimeStr =
    m?.swimSeconds != null ? formatDurationHMS(m.swimSeconds) : '--';
  const swimPaceStr =
    m?.swimSeconds && m.swimMeters
      ? formatSwimPacePer100m(m.swimSeconds, m.swimMeters)
      : '--';

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Top header + upload */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold mb-2">
              Garmin Wrapped
            </h1>
            <p className="text-sm text-zinc-400">{dateRange}</p>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-2">
            <label className="inline-flex items-center gap-2 text-sm text-zinc-200 bg-zinc-900/80 border border-zinc-700 rounded-full px-4 py-2 cursor-pointer hover:bg-zinc-800 hover:border-zinc-500 transition">
              <Upload className="w-4 h-4" />
              <span>Upload Garmin activities CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
            {!metrics && (
              <p className="text-xs text-zinc-500 max-w-xs text-right">
                Export your activities from Garmin Connect (&quot;All
                Activities&quot;) as CSV and drop it here.
              </p>
            )}
            {error && (
              <p className="text-xs text-red-400 max-w-xs text-right">
                {error}
              </p>
            )}
          </div>
        </header>

        {metrics && (
          <div className="space-y-8">
            {/* Hero + key stats grid */}
            <section className="grid gap-5 md:grid-cols-3">
              {/* Hero distance tile */}
              <div className="md:col-span-2 bg-gradient-to-br from-indigo-600/40 via-purple-700/30 to-zinc-900/90 border border-purple-500/40 rounded-3xl p-6 sm:p-7 shadow-[0_0_50px_rgba(0,0,0,0.9)]">
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-black/50 flex items-center justify-center border border-white/10">
                      <Activity className="w-5 h-5 text-indigo-200" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-indigo-200/80">
                        Distance traveled
                      </p>
                      <p className="text-xs text-zinc-300">
                        Powered by Garmin activities
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-400">
                    {m?.startDateDisplay} → {m?.endDateDisplay}
                  </div>
                </div>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-4xl sm:text-5xl md:text-6xl font-semibold">
                      {distanceStr}
                    </div>
                    <div className="text-sm text-zinc-300 mt-2">
                      That&apos;s{' '}
                      <span className="font-semibold">{earthPercentStr}</span>{' '}
                      of the way around Earth.
                    </div>
                  </div>

                  <div className="bg-black/40 rounded-2xl px-4 py-3 border border-white/10 flex flex-col gap-1 min-w-[9rem]">
                    <div className="text-xs text-zinc-400 uppercase tracking-wide">
                      Total time moving
                    </div>
                    <div className="text-lg font-semibold">{totalTimeStr}</div>
                    <div className="text-xs text-zinc-500">
                      Across {sessionsStr} sessions
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick stats column */}
              <div className="flex flex-col gap-4">
                <StatCard
                  icon={LineChart}
                  value={sessionsStr}
                  label="Total sessions"
                  helper="Every recording counts as one."
                />
                <StatCard
                  icon={Layers}
                  value={typesCountStr}
                  label="Activity types"
                  helper="Different sports you tracked this year."
                />
              </div>
            </section>

            {/* Performance + effort tiles */}
            <section className="grid gap-5 md:grid-cols-3">
              <StatCard
                icon={HeartPulse}
                value={maxHrStr}
                label="Max heart rate"
                helper="Your highest recorded BPM."
              />
              <StatCard
                icon={HeartPulse}
                value={avgHrStr}
                label="Average heart rate"
                helper="Average across all sessions with HR data."
              />
              <StatCard
                icon={Flame}
                value={caloriesStr}
                label="Calories burned"
                helper="Total estimated energy output."
              />
            </section>

            {/* Averages + cadence */}
            <section className="grid gap-5 md:grid-cols-3">
              <StatCard
                icon={Timer}
                value={avgDurationStr}
                label="Avg duration"
                helper="Typical length of one session."
              />
              <StatCard
                icon={Activity}
                value={avgDistanceStr}
                label="Avg distance"
                helper="Average distance per recorded activity."
              />
              <StatCard
                icon={CalendarDays}
                value={mostActiveMonthStr || '--'}
                label="Most active month"
                helper="Where you stacked the most time."
              />
            </section>

            {/* Sport-specific row: Running / Cycling / Swimming */}
            <section className="grid gap-5 md:grid-cols-3">
              {/* Running */}
              <div className="bg-gradient-to-br from-red-600/40 via-orange-500/30 to-zinc-900/90 border border-red-400/50 rounded-3xl p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-9 w-9 rounded-2xl bg-black/40 flex items-center justify-center border border-white/10">
                    <Activity className="w-5 h-5 text-red-200" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-red-200">
                      Running
                    </p>
                    <p className="text-xs text-zinc-300">
                      Road, treadmill, and track
                    </p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Distance</span>
                    <span className="font-semibold">{runDistanceStr}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Time</span>
                    <span className="font-semibold">{runTimeStr}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Pace</span>
                    <span className="font-semibold">{runPaceStr}</span>
                  </div>
                </div>
              </div>

              {/* Cycling */}
              <div className="bg-gradient-to-br from-emerald-600/40 via-teal-500/30 to-zinc-900/90 border border-emerald-400/50 rounded-3xl p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-9 w-9 rounded-2xl bg-black/40 flex items-center justify-center border border-white/10">
                    <Bike className="w-5 h-5 text-emerald-200" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                      Cycling
                    </p>
                    <p className="text-xs text-zinc-300">
                      Road, indoor, and virtual
                    </p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Distance</span>
                    <span className="font-semibold">{bikeDistanceStr}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Time</span>
                    <span className="font-semibold">{bikeTimeStr}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Avg speed</span>
                    <span className="font-semibold">{bikeSpeedStr}</span>
                  </div>
                </div>
              </div>

              {/* Swimming */}
              <div className="bg-gradient-to-br from-blue-500/40 via-cyan-500/30 to-zinc-900/90 border border-cyan-400/50 rounded-3xl p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-9 w-9 rounded-2xl bg-black/40 flex items-center justify-center border border-white/10">
                    <Waves className="w-5 h-5 text-cyan-200" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">
                      Swimming
                    </p>
                    <p className="text-xs text-zinc-300">
                      Pool and open water (meters)
                    </p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Distance</span>
                    <span className="font-semibold">{swimDistanceStr}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Time</span>
                    <span className="font-semibold">{swimTimeStr}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Pace</span>
                    <span className="font-semibold">{swimPaceStr}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Big moments row */}
            <section className="grid gap-5 md:grid-cols-2">
              {longestActivity && (
                <div className="bg-zinc-900/80 border border-zinc-700/70 rounded-3xl p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-9 w-9 rounded-2xl bg-yellow-500/10 flex items-center justify-center border border-yellow-400/50">
                      <Trophy className="w-5 h-5 text-yellow-300" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-yellow-300">
                        Longest activity
                      </p>
                      <p className="text-sm text-zinc-300">
                        {longestActivity.date || '--'}
                      </p>
                    </div>
                  </div>
                  <p className="text-lg sm:text-xl font-semibold mb-2">
                    {longestActivity.title}
                  </p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-zinc-400 text-xs">Duration</p>
                      <p className="text-zinc-100 font-medium">
                        {formatDurationHMS(longestActivity.durationSeconds)}
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-400 text-xs">Calories</p>
                      <p className="text-zinc-100 font-medium">
                        {longestActivity.calories != null
                          ? `${longestActivity.calories} kcal`
                          : '--'}
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-400 text-xs">Type</p>
                      <p className="text-zinc-100 font-medium">
                        Long day out
                      </p>
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
                      <p className="text-xs uppercase tracking-[0.2em] text-orange-300">
                        Highest calorie burn
                      </p>
                      <p className="text-sm text-zinc-300">
                        {highestCal.date || '--'}
                      </p>
                    </div>
                  </div>
                  <p className="text-lg sm:text-xl font-semibold mb-2">
                    {highestCal.title}
                  </p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-zinc-400 text-xs">Duration</p>
                      <p className="text-zinc-100 font-medium">
                        {highestCal.durationSeconds
                          ? formatDurationHMS(highestCal.durationSeconds)
                          : '--'}
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-400 text-xs">Calories</p>
                      <p className="text-zinc-100 font-medium">
                        {highestCal.calories} kcal
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-400 text-xs">Effort</p>
                      <p className="text-zinc-100 font-medium">
                        Big day in the pain cave
                      </p>
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
                    <p className="text-xs uppercase tracking-[0.2em] text-amber-300">
                      Consistency streak
                    </p>
                    {streakRange && (
                      <p className="text-sm text-zinc-300">{streakRange}</p>
                    )}
                  </div>
                </div>
                <div className="text-3xl sm:text-4xl font-semibold mb-2">
                  {streakStr}
                </div>
                <p className="text-xs text-zinc-500">
                  Longest run of consecutive days with at least one activity.
                </p>
              </div>

              <div className="bg-zinc-900/80 border border-zinc-700/70 rounded-3xl p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-9 w-9 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-400/60">
                    <Mountain className="w-5 h-5 text-emerald-300" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">
                      Vertical gains
                    </p>
                    <p className="text-sm text-zinc-300">
                      Total climbing and highest point
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-zinc-400 text-xs">Total ascent</p>
                    <p className="text-lg font-semibold">{totalAscentStr}</p>
                  </div>
                  <div>
                    <p className="text-zinc-400 text-xs">Highest point</p>
                    <p className="text-lg font-semibold">
                      {maxElevationStr}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* By activity type (top 3) */}
            {topTypes.length > 0 && (
              <section className="bg-zinc-900/80 border border-zinc-700/70 rounded-3xl p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-400/50">
                      <Dumbbell className="w-5 h-5 text-blue-300" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-blue-300">
                        By activity type
                      </p>
                      <p className="text-sm text-zinc-300">
                        Your top sports by session count
                      </p>
                    </div>
                  </div>
                  {favActivityStr && (
                    <p className="text-xs text-zinc-400 text-right max-w-[10rem]">
                      Favorite: {favActivityStr}
                    </p>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {topTypes.map((t) => (
                    <div
                      key={t.name}
                      className="bg-black/40 border border-zinc-700 rounded-2xl p-4 flex flex-col gap-2"
                    >
                      <div className="text-sm font-semibold truncate">
                        {t.name}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {t.count} session{t.count !== 1 ? 's' : ''}
                      </div>
                      <div className="text-sm text-zinc-100">
                        {t.totalDistanceMi.toFixed(1)} mi ·{' '}
                        {formatDurationHMS(t.totalSeconds)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-10 text-xs text-zinc-500">
          <p>© 2025 Jordan Lindsay. Not affiliated with Garmin Ltd.</p>
        </footer>
      </main>
    </div>
  );
}
