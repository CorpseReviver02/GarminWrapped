'use client';

import React, { useState, useRef, ChangeEvent } from 'react';
import Papa from 'papaparse';
import * as htmlToImage from 'html-to-image';
import {
  Activity,
  Flame,
  Footprints,
  Bike,
  Dumbbell,
  MoonStar,
  Download,
  Upload,
  Watch,
  BarChart3,
  Calendar,
  Zap,
} from 'lucide-react';

type ActivityRow = { [key: string]: string };

interface ActivityDetail {
  row: ActivityRow;
  date: Date;
  dateKey: string; // yyyy-mm-dd
  durationSeconds: number;
  distanceMiles: number;
  calories: number;
  sport: string;
}

interface DistanceBreakdown {
  totalMiles: number;
  runMiles: number;
  rideMiles: number;
  swimMiles: number;
  walkHikeMiles: number;
}

interface TimeBreakdown {
  totalHours: number;
  runHours: number;
  rideHours: number;
  swimHours: number;
  strengthHours: number;
  otherHours: number;
}

interface LongActivitySummary {
  title: string;
  date: string;
  duration: string;
  distance: string;
}

interface StreakSummary {
  longestStreakDays: number;
  longestStreakStart: string | null;
  longestStreakEnd: string | null;
  busiestWeekLabel: string | null;
  busiestWeekHours: number;
  busiestWeekActivities: number;
}

interface StepsMetrics {
  totalSteps: number;
  weeks: number;
  avgStepsPerDay: number;
  avgStepsPerWeek: number;
  bestWeekSteps: number;
  bestWeekLabel: string;
  approxMiles: number;
}

interface SleepMetrics {
  weeks: number;
  avgScore: number;
  totalSleepHours: number;
  avgSleepHours: number;
  bestScore: number;
  bestScoreWeekLabel: string;
  bestDurationHours: number;
  bestDurationWeekLabel: string;
}

interface Metrics {
  totalActivities: number;
  totalCalories: number;
  distance: DistanceBreakdown;
  time: TimeBreakdown;
  longestActivity?: LongActivitySummary;
  highestCalorie?: LongActivitySummary;
  streaks?: StreakSummary;
}

// ---------- helpers ----------

function parseHmsToSeconds(value: string | undefined): number {
  if (!value) return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;

  const parts = trimmed.split(':').map((p) => p.trim());
  if (parts.length === 3) {
    const [h, m, s] = parts.map((p) => Number(p) || 0);
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const [m, s] = parts.map((p) => Number(p) || 0);
    return m * 60 + s;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : 0;
}

function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/,/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toMilesFromMeters(meters: number): number {
  if (!meters || meters <= 0) return 0;
  return meters / 1609.34;
}

function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0 h';
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return `${mins} min`;
  }
  if (hours < 10) return `${hours.toFixed(1)} h`;
  return `${Math.round(hours)} h`;
}

function formatMiles(miles: number): string {
  if (!Number.isFinite(miles) || miles <= 0) return '0 mi';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

function formatDateDisplay(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getWeekKey(date: Date): string {
  // Week starting Monday
  const d = new Date(date);
  const day = d.getDay(); // 0–6, Sun–Sat
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  return `${d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })} – ${end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}`;
}

// ---------- Activity parsing + metrics ----------

function parseActivityCsv(rows: ActivityRow[]): ActivityDetail[] {
  const details: ActivityDetail[] = [];

  for (const row of rows) {
    const rawDate = row['Date'] || row['Start Time'] || row['Timestamp'] || '';
    if (!rawDate) continue;

    const date = new Date(rawDate);
    if (isNaN(date.getTime())) continue;

    const dateKey = date.toISOString().slice(0, 10);

    const sportRaw =
      row['Activity Type'] ||
      row['Sport'] ||
      row['Type'] ||
      row['Activity'] ||
      '';
    const sport = String(sportRaw).trim();

    const durationSeconds =
      parseHmsToSeconds(row['Time']) ||
      parseHmsToSeconds(row['Moving Time']) ||
      parseHmsToSeconds(row['Elapsed Time']);

    const calories = parseNumber(row['Calories']);

    const rawDistance = parseNumber(row['Distance']);
    let distanceMiles = 0;

    const lowerSport = sport.toLowerCase();
    const isSwim =
      lowerSport.includes('swim') || lowerSport.includes('swimming');
    const isTrackRun = lowerSport.includes('track running');

    if (isSwim || isTrackRun) {
      // Garmin exports those distances in meters
      distanceMiles = toMilesFromMeters(rawDistance);
    } else {
      // Assume this is already in miles (running, cycling, hiking, etc.)
      distanceMiles = rawDistance;
    }

    details.push({
      row,
      date,
      dateKey,
      durationSeconds,
      distanceMiles,
      calories,
      sport,
    });
  }

  return details;
}

function computeActivityMetrics(rows: ActivityRow[]): Metrics | null {
  const details = parseActivityCsv(rows);
  if (!details.length) return null;

  const totalActivities = details.length;

  let totalCalories = 0;
  let totalMiles = 0;
  let runMiles = 0;
  let rideMiles = 0;
  let swimMiles = 0;
  let walkHikeMiles = 0;

  let totalSeconds = 0;
  let runSeconds = 0;
  let rideSeconds = 0;
  let swimSeconds = 0;
  let strengthSeconds = 0;
  let otherSeconds = 0;

  const byDaySeconds: Record<string, number> = {};
  const byWeekSeconds: Record<string, number> = {};
  const byWeekActivities: Record<string, number> = {};

  for (const d of details) {
    const sportLower = d.sport.toLowerCase();

    totalCalories += d.calories;
    totalMiles += d.distanceMiles;
    totalSeconds += d.durationSeconds;

    const dayKey = d.dateKey;
    byDaySeconds[dayKey] = (byDaySeconds[dayKey] || 0) + d.durationSeconds;

    const weekKey = getWeekKey(d.date);
    byWeekSeconds[weekKey] = (byWeekSeconds[weekKey] || 0) + d.durationSeconds;
    byWeekActivities[weekKey] = (byWeekActivities[weekKey] || 0) + 1;

    if (sportLower.includes('run')) {
      runMiles += d.distanceMiles;
      runSeconds += d.durationSeconds;
    } else if (sportLower.includes('bike') || sportLower.includes('cycling')) {
      rideMiles += d.distanceMiles;
      rideSeconds += d.durationSeconds;
    } else if (sportLower.includes('swim')) {
      swimMiles += d.distanceMiles;
      swimSeconds += d.durationSeconds;
    } else if (
      sportLower.includes('walk') ||
      sportLower.includes('hike') ||
      sportLower.includes('treadmill')
    ) {
      walkHikeMiles += d.distanceMiles;
      otherSeconds += d.durationSeconds;
    } else if (sportLower.includes('strength') || sportLower.includes('lift')) {
      strengthSeconds += d.durationSeconds;
    } else {
      otherSeconds += d.durationSeconds;
    }
  }

  const time: TimeBreakdown = {
    totalHours: totalSeconds / 3600,
    runHours: runSeconds / 3600,
    rideHours: rideSeconds / 3600,
    swimHours: swimSeconds / 3600,
    strengthHours: strengthSeconds / 3600,
    otherHours: otherSeconds / 3600,
  };

  const distance: DistanceBreakdown = {
    totalMiles,
    runMiles,
    rideMiles,
    swimMiles,
    walkHikeMiles,
  };

  // Longest activity
  let longestActivity: LongActivitySummary | undefined;
  const longestDetail = details.reduce<ActivityDetail | null>(
    (best, curr) =>
      !best || curr.durationSeconds > best.durationSeconds ? curr : best,
    null,
  );
  if (longestDetail && longestDetail.durationSeconds > 0) {
    longestActivity = {
      title: String(
        longestDetail.row['Title'] || longestDetail.row['Activity Type'] || 'Unknown activity',
      ),
      date: formatDateDisplay(longestDetail.date),
      duration: formatHours(longestDetail.durationSeconds / 3600),
      distance: formatMiles(longestDetail.distanceMiles),
    };
  }

  // Highest calorie activity
  let highestCalorie: LongActivitySummary | undefined;
  const highestDetail = details.reduce<ActivityDetail | null>(
    (best, curr) => (!best || curr.calories > best.calories ? curr : best),
    null,
  );
  if (highestDetail && highestDetail.calories > 0) {
    highestCalorie = {
      title: String(
        highestDetail.row['Title'] || highestDetail.row['Activity Type'] || 'Unknown activity',
      ),
      date: formatDateDisplay(highestDetail.date),
      duration: formatHours(highestDetail.durationSeconds / 3600),
      distance: `${highestDetail.calories.toLocaleString()} kcal`,
    };
  }

  // Streaks + busiest week
  let longestStreakDays = 0;
  let longestStreakStart: string | null = null;
  let longestStreakEnd: string | null = null;

  const dayKeys = Object.keys(byDaySeconds)
    .filter((k) => byDaySeconds[k] > 0)
    .sort();
  let currentStreak = 0;
  let currentStreakStartKey: string | null = null;

  for (let i = 0; i < dayKeys.length; i++) {
    if (i === 0) {
      currentStreak = 1;
      currentStreakStartKey = dayKeys[i];
      longestStreakDays = 1;
      longestStreakStart = dayKeys[i];
      longestStreakEnd = dayKeys[i];
      continue;
    }
    const prevDate = new Date(dayKeys[i - 1]);
    const thisDate = new Date(dayKeys[i]);
    const diffDays =
      (thisDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

    if (Math.round(diffDays) === 1) {
      currentStreak += 1;
    } else {
      currentStreak = 1;
      currentStreakStartKey = dayKeys[i];
    }

    if (currentStreak > longestStreakDays) {
      longestStreakDays = currentStreak;
      longestStreakStart = currentStreakStartKey;
      longestStreakEnd = dayKeys[i];
    }
  }

  let busiestWeekLabel: string | null = null;
  let busiestWeekSeconds = 0;
  let busiestWeekActivities = 0;

  for (const [week, secs] of Object.entries(byWeekSeconds)) {
    if (secs > busiestWeekSeconds) {
      busiestWeekSeconds = secs;
      busiestWeekLabel = week;
      busiestWeekActivities = byWeekActivities[week] || 0;
    }
  }

  const streaks: StreakSummary = {
    longestStreakDays,
    longestStreakStart,
    longestStreakEnd,
    busiestWeekLabel,
    busiestWeekHours: busiestWeekSeconds / 3600,
    busiestWeekActivities,
  };

  return {
    totalActivities,
    totalCalories,
    distance,
    time,
    longestActivity,
    highestCalorie,
    streaks,
  };
}

// ---------- Steps parsing + metrics ----------

// Steps CSV sample:
// ['', 'Actual']
// ['1/4/2025', '60155']
// ['1/11/2025', '44134'] ...
function computeStepsMetricsFromRows(rows: string[][]): StepsMetrics | null {
  const dataRows = rows.filter(
    (r) =>
      r.length >= 2 &&
      r[0] &&
      r[0].trim() &&
      r[1] &&
      r[1].trim() &&
      !isNaN(Number(r[1].replace(/,/g, ''))),
  );

  if (!dataRows.length) return null;

  let totalSteps = 0;
  let weeks = 0;
  let bestWeekSteps = 0;
  let bestWeekLabel = '';

  for (const r of dataRows) {
    const label = r[0].trim();
    const steps = Number(r[1].replace(/,/g, ''));
    if (!Number.isFinite(steps) || steps <= 0) continue;

    totalSteps += steps;
    weeks += 1;

    if (steps > bestWeekSteps) {
      bestWeekSteps = steps;
      bestWeekLabel = label;
    }
  }

  if (!weeks || totalSteps <= 0) return null;

  const avgStepsPerWeek = totalSteps / weeks;
  const avgStepsPerDay = totalSteps / (weeks * 7);

  // Use your previous ratio ~1842 steps per mile (from your data)
  const stepsPerMile = 1842.4;
  const approxMiles = totalSteps / stepsPerMile;

  return {
    totalSteps,
    weeks,
    avgStepsPerDay,
    avgStepsPerWeek,
    bestWeekSteps,
    bestWeekLabel,
    approxMiles,
  };
}

// ---------- Sleep parsing + metrics ----------

// Sleep CSV sample:
// Date, Avg Score, Avg Quality, Avg Duration, Avg Bedtime, Avg Wake Time
// "Nov 29 - Dec 5", "83", "Good", "7h 33min", ...
function parseDurationToMinutes(s: string | undefined): number {
  if (!s) return 0;
  const str = s.trim().toLowerCase();
  if (!str) return 0;

  const hMatch = str.match(/(\d+)\s*h/);
  const mMatch = str.match(/(\d+)\s*min/);

  const hours = hMatch ? Number(hMatch[1]) || 0 : 0;
  const mins = mMatch ? Number(mMatch[1]) || 0 : 0;

  return hours * 60 + mins;
}

function computeSleepMetricsFromRows(rows: string[][]): SleepMetrics | null {
  if (!rows.length) return null;

  // First row is header
  const dataRows = rows.slice(1).filter((r) => r.length >= 4 && r[0].trim());

  if (!dataRows.length) return null;

  let totalMinutes = 0;
  let totalScore = 0;
  let count = 0;

  let bestScore = 0;
  let bestScoreWeekLabel = '';

  let bestDurationMinutes = 0;
  let bestDurationWeekLabel = '';

  for (const r of dataRows) {
    const label = r[0].trim();
    const score = Number((r[1] || '').trim());
    const durationStr = r[3] || '';

    const minutes = parseDurationToMinutes(durationStr);

    if (!minutes || !Number.isFinite(minutes)) continue;

    totalMinutes += minutes;
    count += 1;

    if (Number.isFinite(score) && score > 0) {
      totalScore += score;
      if (score > bestScore) {
        bestScore = score;
        bestScoreWeekLabel = label;
      }
    }

    if (minutes > bestDurationMinutes) {
      bestDurationMinutes = minutes;
      bestDurationWeekLabel = label;
    }
  }

  if (!count || totalMinutes <= 0) return null;

  const totalSleepHours = totalMinutes / 60;
  const avgSleepHours = totalSleepHours / count;
  const avgScore = totalScore > 0 ? totalScore / count : 0;

  return {
    weeks: count,
    avgScore,
    totalSleepHours,
    avgSleepHours,
    bestScore,
    bestScoreWeekLabel,
    bestDurationHours: bestDurationMinutes / 60,
    bestDurationWeekLabel,
  };
}

// ---------- Component ----------

export default function Home() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [stepsMetrics, setStepsMetrics] = useState<StepsMetrics | null>(null);
  const [sleepMetrics, setSleepMetrics] = useState<SleepMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const wrappedRef = useRef<HTMLDivElement | null>(null);

  const handleActivitiesUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setLoading(true);

    Papa.parse<ActivityRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const rows = results.data || [];
          const m = computeActivityMetrics(rows);
          if (!m) {
            setError('Could not read activity data from that CSV.');
          } else {
            setMetrics(m);
          }
        } catch (err) {
          console.error(err);
          setError('Something went wrong parsing your activities file.');
        } finally {
          setLoading(false);
        }
      },
      error: (err) => {
        console.error(err);
        setError('Failed to read the activities CSV file.');
        setLoading(false);
      },
    });
  };

  const handleStepsUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const rows = (results.data || []) as string[][];
          const m = computeStepsMetricsFromRows(rows);
          if (!m) {
            setError('Could not read steps data from that CSV.');
          } else {
            setStepsMetrics(m);
          }
        } catch (err) {
          console.error(err);
          setError('Something went wrong parsing your steps file.');
        }
      },
      error: (err) => {
        console.error(err);
        setError('Failed to read the steps CSV file.');
      },
    });
  };

  const handleSleepUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const rows = (results.data || []) as string[][];
          const m = computeSleepMetricsFromRows(rows);
          if (!m) {
            setError('Could not read sleep data from that CSV.');
          } else {
            setSleepMetrics(m);
          }
        } catch (err) {
          console.error(err);
          setError('Something went wrong parsing your sleep file.');
        }
      },
      error: (err) => {
        console.error(err);
        setError('Failed to read the sleep CSV file.');
      },
    });
  };

  const handleDownloadImage = async () => {
    if (!wrappedRef.current) return;

    try {
      const dataUrl = await htmlToImage.toPng(wrappedRef.current, {
        cacheBust: true,
      });
      const link = document.createElement('a');
      link.download = 'garmin-wrapped.png';
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error(err);
      alert('Sorry, something went wrong creating the image.');
    }
  };

  const totalMiles = metrics?.distance.totalMiles || 0;
  const totalHours = metrics?.time.totalHours || 0;
  const totalActivities = metrics?.totalActivities || 0;
  const totalCalories = metrics?.totalCalories || 0;

  const stepsTotal = stepsMetrics?.totalSteps || 0;
  const stepsMiles = stepsMetrics?.approxMiles || 0;

  const combinedWalkMiles =
    stepsMiles > 0
      ? stepsMiles
      : metrics?.distance.walkHikeMiles || 0;

  // ---------- UI ----------

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Top bar */}
      <header className="border-b border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Watch className="w-8 h-8 text-emerald-400" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Garmin Wrapped
              </h1>
              <p className="text-xs text-slate-400">
                Upload your Garmin exports & get a share-able training story.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-center justify-end">
            <label className="inline-flex items-center gap-2 px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 hover:border-emerald-400/70 cursor-pointer">
              <Upload className="w-4 h-4 text-emerald-400" />
              <span>Activities CSV</span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleActivitiesUpload}
              />
            </label>

            <label className="inline-flex items-center gap-2 px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-400/70 cursor-pointer">
              <Footprints className="w-4 h-4 text-cyan-400" />
              <span>Steps CSV</span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleStepsUpload}
              />
            </label>

            <label className="inline-flex items-center gap-2 px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 hover:border-indigo-400/70 cursor-pointer">
              <MoonStar className="w-4 h-4 text-indigo-300" />
              <span>Sleep CSV</span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleSleepUpload}
              />
            </label>

            <button
              onClick={handleDownloadImage}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold"
            >
              <Download className="w-4 h-4" />
              Download as image
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          {!metrics && !loading && (
            <div className="mt-8 max-w-2xl mx-auto text-center border border-slate-800 rounded-3xl bg-gradient-to-b from-slate-900/60 to-slate-950 px-6 py-10">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/40 mb-4">
                <Activity className="w-7 h-7 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">
                Drop in your Garmin activities export
              </h2>
              <p className="text-sm text-slate-400 mb-4">
                Export from Garmin Connect → Activities → Export All Activities
                (CSV), then upload here. Add optional Steps and Sleep exports
                for extra tiles.
              </p>
              <p className="text-xs text-slate-500">
                Once loaded, you&apos;ll get a share-ready dashboard with your
                total distance, training mix, biggest efforts, steps, and sleep.
              </p>
            </div>
          )}

          <div
            ref={wrappedRef}
            className="mt-4 space-y-4"
          >
            {/* Hero summary card */}
            {metrics && (
              <section className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-6 md:p-8 relative overflow-hidden">
                <div className="absolute -right-24 -top-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" />
                <div className="absolute -left-16 bottom-0 w-56 h-56 bg-cyan-500/10 rounded-full blur-3xl" />

                <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-emerald-300 mb-1">
                      2025 • GARMIN WRAPPED
                    </p>
                    <h2 className="text-3xl md:text-4xl font-semibold mb-2">
                      Your year in movement
                    </h2>
                    <p className="text-sm text-slate-300 max-w-md">
                      From lifts and Zwift to long runs and high-altitude
                      hiking, here&apos;s what your watch saw in 2025.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm relative z-10">
                    <div className="rounded-2xl bg-slate-900/80 border border-slate-700/70 px-4 py-3">
                      <p className="text-slate-400 text-[11px] uppercase">
                        Activities
                      </p>
                      <p className="text-lg font-semibold">
                        {totalActivities.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-900/80 border border-slate-700/70 px-4 py-3">
                      <p className="text-slate-400 text-[11px] uppercase">
                        Training time
                      </p>
                      <p className="text-lg font-semibold">
                        {formatHours(totalHours)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-900/80 border border-slate-700/70 px-4 py-3">
                      <p className="text-slate-400 text-[11px] uppercase">
                        Distance traveled
                      </p>
                      <p className="text-lg font-semibold">
                        {formatMiles(totalMiles)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-900/80 border border-slate-700/70 px-4 py-3">
                      <p className="text-slate-400 text-[11px] uppercase">
                        Calories
                      </p>
                      <p className="text-lg font-semibold">
                        {totalCalories.toLocaleString()} kcal
                      </p>
                    </div>
                  </div>
                </div>

                {stepsMetrics && (
                  <div className="relative mt-6 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 px-4 py-3 flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Footprints className="w-4 h-4 text-emerald-300" />
                      <p className="text-xs uppercase tracking-[0.18em] text-emerald-200">
                        Steps wrapped
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <p>
                        <span className="font-semibold">
                          {stepsTotal.toLocaleString()}
                        </span>{' '}
                        steps
                      </p>
                      <p>
                        ~
                        <span className="font-semibold">
                          {formatMiles(stepsMiles)}
                        </span>{' '}
                        on foot
                      </p>
                      <p className="text-slate-300">
                        Best week:{' '}
                        <span className="font-semibold">
                          {stepsMetrics.bestWeekSteps.toLocaleString()} steps
                        </span>{' '}
                        ({stepsMetrics.bestWeekLabel})
                      </p>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Distance / time breakdown */}
            {metrics && (
              <section className="grid md:grid-cols-[2fr,1.5fr] gap-4">
                <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 md:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="w-5 h-5 text-emerald-300" />
                    <h3 className="text-sm font-semibold">
                      Distance breakdown
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="rounded-2xl bg-slate-950/70 border border-slate-700/70 px-3 py-3">
                      <p className="text-[11px] text-slate-400 uppercase mb-1">
                        Running
                      </p>
                      <p className="text-base font-semibold">
                        {formatMiles(metrics.distance.runMiles)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-950/70 border border-slate-700/70 px-3 py-3">
                      <p className="text-[11px] text-slate-400 uppercase mb-1">
                        Cycling
                      </p>
                      <p className="text-base font-semibold">
                        {formatMiles(metrics.distance.rideMiles)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-950/70 border border-slate-700/70 px-3 py-3">
                      <p className="text-[11px] text-slate-400 uppercase mb-1">
                        Swimming*
                      </p>
                      <p className="text-base font-semibold">
                        {formatMiles(metrics.distance.swimMiles)}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1">
                        *Meters converted to miles
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-950/70 border border-slate-700/70 px-3 py-3">
                      <p className="text-[11px] text-slate-400 uppercase mb-1">
                        Walking / hiking
                      </p>
                      <p className="text-base font-semibold">
                        {formatMiles(combinedWalkMiles)}
                      </p>
                      {stepsMetrics && (
                        <p className="text-[10px] text-slate-500 mt-1">
                          From steps export
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 md:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-5 h-5 text-cyan-300" />
                    <h3 className="text-sm font-semibold">Time by sport</h3>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Running</span>
                      <span className="font-medium">
                        {formatHours(metrics.time.runHours)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Cycling</span>
                      <span className="font-medium">
                        {formatHours(metrics.time.rideHours)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Swimming</span>
                      <span className="font-medium">
                        {formatHours(metrics.time.swimHours)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Strength</span>
                      <span className="font-medium">
                        {formatHours(metrics.time.strengthHours)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-800 pt-2 mt-2">
                      <span className="text-slate-400 text-[11px] uppercase">
                        Total
                      </span>
                      <span className="font-semibold">
                        {formatHours(metrics.time.totalHours)}
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Big efforts + streaks */}
            {metrics && (
              <section className="grid md:grid-cols-2 gap-4">
                <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-5 md:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Flame className="w-5 h-5 text-orange-400" />
                    <h3 className="text-sm font-semibold">Biggest efforts</h3>
                  </div>
                  <div className="space-y-3 text-sm">
                    {metrics.longestActivity && (
                      <div className="rounded-2xl bg-slate-950/70 border border-slate-700/90 px-4 py-3">
                        <p className="text-[11px] uppercase text-slate-400 mb-1">
                          Longest activity
                        </p>
                        <p className="font-semibold">
                          {metrics.longestActivity.title}
                        </p>
                        <p className="text-slate-400 text-xs">
                          {metrics.longestActivity.date}
                        </p>
                        <p className="text-xs text-slate-300 mt-1">
                          {metrics.longestActivity.duration} •{' '}
                          {metrics.longestActivity.distance}
                        </p>
                      </div>
                    )}
                    {metrics.highestCalorie && (
                      <div className="rounded-2xl bg-slate-950/70 border border-slate-700/90 px-4 py-3">
                        <p className="text-[11px] uppercase text-slate-400 mb-1">
                          Most calories in one go
                        </p>
                        <p className="font-semibold">
                          {metrics.highestCalorie.title}
                        </p>
                        <p className="text-slate-400 text-xs">
                          {metrics.highestCalorie.date}
                        </p>
                        <p className="text-xs text-slate-300 mt-1">
                          {metrics.highestCalorie.distance}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-5 md:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="w-5 h-5 text-yellow-300" />
                    <h3 className="text-sm font-semibold">
                      Consistency & grind
                    </h3>
                  </div>
                  {metrics.streaks && metrics.streaks.longestStreakDays > 0 ? (
                    <div className="space-y-4 text-sm">
                      <div className="rounded-2xl bg-slate-950/70 border border-slate-700/90 px-4 py-3">
                        <p className="text-[11px] uppercase text-slate-400 mb-1">
                          Longest streak
                        </p>
                        <p className="text-2xl font-semibold">
                          {metrics.streaks.longestStreakDays} days
                        </p>
                        {metrics.streaks.longestStreakStart &&
                          metrics.streaks.longestStreakEnd && (
                            <p className="text-xs text-slate-300 mt-1">
                              {metrics.streaks.longestStreakStart} →{' '}
                              {metrics.streaks.longestStreakEnd}
                            </p>
                          )}
                        <p className="text-xs text-slate-500 mt-1 italic">
                          You refused to break the chain.
                        </p>
                      </div>

                      {metrics.streaks.busiestWeekLabel && (
                        <div className="rounded-2xl bg-slate-950/70 border border-slate-700/90 px-4 py-3">
                          <p className="text-[11px] uppercase text-slate-400 mb-1">
                            Busiest week
                          </p>
                          <p className="font-semibold">
                            {metrics.streaks.busiestWeekLabel}
                          </p>
                          <p className="text-xs text-slate-300 mt-1">
                            {formatHours(metrics.streaks.busiestWeekHours)} •{' '}
                            {metrics.streaks.busiestWeekActivities} activities
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">
                      Once activities are loaded, we&apos;ll show your longest
                      streak and busiest week here.
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* Steps Wrapped */}
            <section className="rounded-3xl border border-slate-800 bg-gradient-to-br from-cyan-900 via-slate-950 to-slate-900 p-5 md:p-6">
              <div className="flex items-center gap-2 mb-4">
                <Footprints className="w-5 h-5 text-cyan-300" />
                <h3 className="text-sm font-semibold">Steps wrapped</h3>
              </div>
              {stepsMetrics ? (
                <div className="grid md:grid-cols-4 gap-4 text-sm">
                  <div className="rounded-2xl bg-slate-950/60 border border-cyan-500/40 px-4 py-3">
                    <p className="text-[11px] uppercase text-slate-300 mb-1">
                      Total steps
                    </p>
                    <p className="text-xl font-semibold">
                      {stepsMetrics.totalSteps.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Across {stepsMetrics.weeks} weeks
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/60 border border-cyan-500/20 px-4 py-3">
                    <p className="text-[11px] uppercase text-slate-300 mb-1">
                      Avg per day
                    </p>
                    <p className="text-xl font-semibold">
                      {Math.round(stepsMetrics.avgStepsPerDay).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {Math.round(stepsMetrics.avgStepsPerWeek).toLocaleString()}{' '}
                      / week
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/60 border border-cyan-500/20 px-4 py-3">
                    <p className="text-[11px] uppercase text-slate-300 mb-1">
                      Best week
                    </p>
                    <p className="text-xl font-semibold">
                      {stepsMetrics.bestWeekSteps.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {stepsMetrics.bestWeekLabel}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/60 border border-cyan-500/20 px-4 py-3">
                    <p className="text-[11px] uppercase text-slate-300 mb-1">
                      Distance from steps
                    </p>
                    <p className="text-xl font-semibold">
                      {formatMiles(stepsMetrics.approxMiles)}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Based on ~1,842 steps / mile
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-300">
                  Upload a Steps CSV to see total steps, best week, and your
                  day-to-day walking vibe.
                </p>
              )}
            </section>

            {/* Sleep Wrapped */}
            <section className="rounded-3xl border border-slate-800 bg-gradient-to-br from-indigo-900 via-slate-950 to-slate-950 p-5 md:p-6">
              <div className="flex items-center gap-2 mb-4">
                <MoonStar className="w-5 h-5 text-indigo-300" />
                <h3 className="text-sm font-semibold">Sleep wrapped</h3>
              </div>
              {sleepMetrics ? (
                <div className="grid md:grid-cols-4 gap-4 text-sm">
                  <div className="rounded-2xl bg-slate-950/60 border border-indigo-400/50 px-4 py-3">
                    <p className="text-[11px] uppercase text-slate-300 mb-1">
                      Weeks of data
                    </p>
                    <p className="text-xl font-semibold">
                      {sleepMetrics.weeks}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/60 border border-indigo-400/30 px-4 py-3">
                    <p className="text-[11px] uppercase text-slate-300 mb-1">
                      Avg sleep / night
                    </p>
                    <p className="text-xl font-semibold">
                      {sleepMetrics.avgSleepHours.toFixed(1)} h
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Total {sleepMetrics.totalSleepHours.toFixed(0)} h tracked
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/60 border border-indigo-400/30 px-4 py-3">
                    <p className="text-[11px] uppercase text-slate-300 mb-1">
                      Avg sleep score
                    </p>
                    <p className="text-xl font-semibold">
                      {sleepMetrics.avgScore.toFixed(0)}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Best: {sleepMetrics.bestScore} ({sleepMetrics.bestScoreWeekLabel})
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/60 border border-indigo-400/30 px-4 py-3">
                    <p className="text-[11px] uppercase text-slate-300 mb-1">
                      Longest-sleep week
                    </p>
                    <p className="text-xl font-semibold">
                      {sleepMetrics.bestDurationHours.toFixed(1)} h
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {sleepMetrics.bestDurationWeekLabel}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-300">
                  Upload a Sleep CSV to see how your recovery stacked up against
                  all that training.
                </p>
              )}
            </section>

            {/* Closing card */}
            {(metrics || stepsMetrics || sleepMetrics) && (
              <section className="rounded-3xl border border-slate-800 bg-slate-950/90 p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Watch className="w-6 h-6 text-emerald-300" />
                  <div>
                    <p className="text-[11px] uppercase text-slate-400">
                      2025 wrapped up
                    </p>
                    <p className="text-sm text-slate-200">
                      In 2026, the only goal: make Future You impressed.
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 italic flex items-center gap-2 justify-end">
                  <span>See you next year, coach.</span>
                  <Activity className="w-4 h-4 text-slate-400" />
                </p>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
