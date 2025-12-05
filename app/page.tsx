'use client';

import React, { useState, useRef, ChangeEvent } from 'react';
import Papa from 'papaparse';
import * as htmlToImage from 'html-to-image';
import {
  Activity,
  Flame,
  Footprints,
  Bike,
  MoonStar,
  Download,
  Upload,
  Watch,
  Calendar,
  Zap,
  Mountain,
  Waves,
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

interface ElevationMetrics {
  totalFeet: number;
  maxFeet: number;
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
  elevation: ElevationMetrics;
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

// pacing helpers
function formatMinPer(mi: number): string {
  const m = Math.floor(mi);
  const s = Math.round((mi - m) * 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function runPace(distanceMiles: number, hours: number): string {
  if (distanceMiles <= 0 || hours <= 0) return '—';
  const totalMinutes = hours * 60;
  const pace = totalMinutes / distanceMiles; // min/mi
  return `${formatMinPer(pace)} /mi`;
}

function rideSpeed(distanceMiles: number, hours: number): string {
  if (distanceMiles <= 0 || hours <= 0) return '—';
  const mph = distanceMiles / hours;
  return `${mph.toFixed(1)} mph`;
}

function swimPace100m(distanceMiles: number, hours: number): string {
  if (distanceMiles <= 0 || hours <= 0) return '—';
  const meters = distanceMiles * 1609.34;
  if (meters <= 0) return '—';
  const totalSeconds = hours * 3600;
  const secPer100 = totalSeconds / (meters / 100);
  const m = Math.floor(secPer100 / 60);
  const s = Math.round(secPer100 % 60);
  return `${m}:${s.toString().padStart(2, '0')} /100m`;
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
      distanceMiles = toMilesFromMeters(rawDistance);
    } else {
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

  let totalElevationFt = 0;
  let maxElevationFt = 0;

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

    // elevation metrics (Garmin US exports are usually in feet)
    const ascentFt =
      parseNumber(d.row['Elevation Gain']) ||
      parseNumber(d.row['Elev Gain']) ||
      parseNumber(d.row['Total Ascent']) ||
      parseNumber(d.row['Ascent']);

    const maxFt =
      parseNumber(d.row['Max Elevation']) ||
      parseNumber(d.row['Maximum Elevation']) ||
      parseNumber(d.row['Max Elev']) ||
      0;

    totalElevationFt += ascentFt;
    if (maxFt > maxElevationFt) maxElevationFt = maxFt;
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

  const elevation: ElevationMetrics = {
    totalFeet: totalElevationFt,
    maxFeet: maxElevationFt,
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
        longestDetail.row['Title'] ||
          longestDetail.row['Activity Type'] ||
          'Unknown activity',
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
        highestDetail.row['Title'] ||
          highestDetail.row['Activity Type'] ||
          'Unknown activity',
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
    elevation,
    longestActivity,
    highestCalorie,
    streaks,
  };
}

// ---------- Steps parsing + metrics ----------

// Steps CSV sample:
// ['', 'Actual']
// ['1/4/2025', '60155'] ...
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

  const stepsPerMile = 1842.4; // calibrated from your data
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
    stepsMiles > 0 ? stepsMiles : metrics?.distance.walkHikeMiles || 0;

  // ---------- UI ----------

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Top bar */}
      <header className="border-b border-slate-900 bg-black/60 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center shadow-lg shadow-emerald-500/40">
              <Watch className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight tracking-tight">
                Garmin Wrapped
              </h1>
              <p className="text-[11px] text-slate-400">
                Drop in your CSVs and get a shareable story of your year.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center justify-end text-xs">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/80 border border-emerald-400/40 hover:border-emerald-300 cursor-pointer transition">
              <Upload className="w-4 h-4 text-emerald-300" />
              <span>Activities CSV</span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleActivitiesUpload}
              />
            </label>

            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/80 border border-cyan-400/40 hover:border-cyan-300 cursor-pointer transition">
              <Footprints className="w-4 h-4 text-cyan-300" />
              <span>Steps CSV</span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleStepsUpload}
              />
            </label>

            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/80 border border-indigo-400/40 hover:border-indigo-300 cursor-pointer transition">
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
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-950 font-semibold shadow-md hover:brightness-110 transition"
            >
              <Download className="w-4 h-4" />
              Save as image
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-4 md:py-6">
          {error && (
            <div className="mb-4 rounded-2xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          {!metrics && !loading && (
            <div className="mt-6 max-w-3xl mx-auto rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 px-6 py-8 md:px-8 md:py-10 relative overflow-hidden">
              <div className="absolute -right-16 -top-16 w-40 h-40 rounded-full bg-emerald-500/20 blur-3xl" />
              <div className="absolute -left-10 bottom-0 w-36 h-36 rounded-full bg-cyan-500/20 blur-3xl" />
              <div className="relative">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-700/70 text-[11px] text-slate-300 mb-4">
                  <Activity className="w-3 h-3 text-emerald-300" />
                  <span>Step 1 · Upload your Garmin exports</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-semibold mb-2">
                  Turn raw CSVs into your own Garmin Wrapped
                </h2>
                <p className="text-sm text-slate-300 mb-2">
                  Export activities from Garmin Connect as CSV, optionally add
                  Steps and Sleep exports, and this page builds a mini
                  Spotify-style recap you can screenshot or download.
                </p>
                <p className="text-[11px] text-slate-500">
                  Tip: Generate once for yourself, then share the link with
                  friends—they can upload their own files without touching your
                  data.
                </p>
              </div>
            </div>
          )}

          <div
            ref={wrappedRef}
            className="mt-4 space-y-4"
          >
            {/* HERO CARD */}
            {metrics && (
              <section className="rounded-3xl border border-slate-800 bg-gradient-to-br from-emerald-500/10 via-slate-950 to-cyan-500/10 px-5 py-5 md:px-8 md:py-6 relative overflow-hidden">
                <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-emerald-400/25 blur-3xl" />
                <div className="absolute -left-12 bottom-0 w-48 h-48 rounded-full bg-cyan-400/15 blur-3xl" />

                <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4 md:gap-6">
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-300">
                      2025 • Garmin Wrapped
                    </p>
                    <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
                      Your year in movement
                    </h2>
                    <p className="text-xs md:text-sm text-slate-200 max-w-md">
                      From lifts and Zwift to long runs and high-altitude
                      hiking, here&apos;s what your watch saw in 2025.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs md:text-[13px]">
                    <div className="rounded-2xl bg-slate-950/80 border border-slate-700/80 px-3 py-3">
                      <p className="text-[10px] text-slate-400 uppercase mb-1">
                        Activities
                      </p>
                      <p className="text-lg font-semibold leading-none">
                        {totalActivities.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-950/80 border border-slate-700/80 px-3 py-3">
                      <p className="text-[10px] text-slate-400 uppercase mb-1">
                        Training time
                      </p>
                      <p className="text-lg font-semibold leading-none">
                        {formatHours(totalHours)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-950/80 border border-slate-700/80 px-3 py-3">
                      <p className="text-[10px] text-slate-400 uppercase mb-1">
                        Distance traveled
                      </p>
                      <p className="text-lg font-semibold leading-none">
                        {formatMiles(totalMiles)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-950/80 border border-slate-700/80 px-3 py-3">
                      <p className="text-[10px] text-slate-400 uppercase mb-1">
                        Calories burned
                      </p>
                      <p className="text-lg font-semibold leading-none">
                        {totalCalories.toLocaleString()} kcal
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* DISTANCE BREAKDOWN */}
            {metrics && (
              <section className="rounded-3xl border border-slate-900 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-5 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Bike className="w-5 h-5 text-cyan-300" />
                    <h3 className="text-sm font-semibold">
                      Distance breakdown
                    </h3>
                  </div>
                  <p className="text-[11px] text-slate-400 uppercase tracking-[0.16em]">
                    {formatMiles(totalMiles)} total
                  </p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="rounded-2xl bg-slate-950 border border-slate-800 px-3 py-3">
                    <p className="text-[10px] text-slate-400 uppercase mb-1">
                      Running
                    </p>
                    <p className="text-base font-semibold">
                      {formatMiles(metrics.distance.runMiles)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-950 border border-slate-800 px-3 py-3">
                    <p className="text-[10px] text-slate-400 uppercase mb-1">
                      Cycling
                    </p>
                    <p className="text-base font-semibold">
                      {formatMiles(metrics.distance.rideMiles)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-950 border border-slate-800 px-3 py-3">
                    <p className="text-[10px] text-slate-400 uppercase mb-1">
                      Swimming*
                    </p>
                    <p className="text-base font-semibold">
                      {formatMiles(metrics.distance.swimMiles)}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      *Meters converted to miles
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-950 border border-slate-800 px-3 py-3">
                    <p className="text-[10px] text-slate-400 uppercase mb-1">
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
              </section>
            )}

            {/* TIME BY SPORT + VERTICAL GAINS */}
            {metrics && (
              <section className="grid lg:grid-cols-[2fr,1.1fr] gap-4">
                {/* time by sport cards */}
                <div className="rounded-3xl border border-slate-900 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-5 md:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-emerald-300" />
                      <h3 className="text-sm font-semibold">Time by sport</h3>
                    </div>
                    <p className="text-[11px] text-slate-400 uppercase tracking-[0.16em]">
                      Distance • Time • Pace
                    </p>
                  </div>

                  <div className="grid md:grid-cols-3 gap-3 text-sm">
                    {/* Running */}
                    <div className="rounded-2xl bg-gradient-to-br from-emerald-500/25 via-emerald-500/10 to-slate-950 border border-emerald-400/60 px-4 py-3 shadow-[0_0_25px_rgba(16,185,129,0.25)]">
                      <div className="flex items-center gap-2 mb-2">
                        <Footprints className="w-4 h-4 text-emerald-200" />
                        <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-100">
                          Running
                        </p>
                      </div>
                      <p className="text-lg font-semibold leading-none mb-1">
                        {formatMiles(metrics.distance.runMiles)}
                      </p>
                      <p className="text-[11px] text-emerald-50 mb-1">
                        Distance
                      </p>
                      <p className="text-sm">
                        {formatHours(metrics.time.runHours)}
                      </p>
                      <p className="text-[11px] text-emerald-50 mt-0.5">
                        {runPace(
                          metrics.distance.runMiles,
                          metrics.time.runHours,
                        )}
                      </p>
                    </div>

                    {/* Cycling */}
                    <div className="rounded-2xl bg-gradient-to-br from-cyan-500/25 via-cyan-500/10 to-slate-950 border border-cyan-400/60 px-4 py-3 shadow-[0_0_25px_rgba(34,211,238,0.25)]">
                      <div className="flex items-center gap-2 mb-2">
                        <Bike className="w-4 h-4 text-cyan-200" />
                        <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-100">
                          Cycling
                        </p>
                      </div>
                      <p className="text-lg font-semibold leading-none mb-1">
                        {formatMiles(metrics.distance.rideMiles)}
                      </p>
                      <p className="text-[11px] text-cyan-50 mb-1">
                        Distance
                      </p>
                      <p className="text-sm">
                        {formatHours(metrics.time.rideHours)}
                      </p>
                      <p className="text-[11px] text-cyan-50 mt-0.5">
                        {rideSpeed(
                          metrics.distance.rideMiles,
                          metrics.time.rideHours,
                        )}
                      </p>
                    </div>

                    {/* Swimming */}
                    <div className="rounded-2xl bg-gradient-to-br from-indigo-500/25 via-indigo-500/10 to-slate-950 border border-indigo-400/60 px-4 py-3 shadow-[0_0_25px_rgba(129,140,248,0.25)]">
                      <div className="flex items-center gap-2 mb-2">
                        <Waves className="w-4 h-4 text-indigo-200" />
                        <p className="text-[11px] uppercase tracking-[0.18em] text-indigo-100">
                          Swimming
                        </p>
                      </div>
                      <p className="text-lg font-semibold leading-none mb-1">
                        {formatMiles(metrics.distance.swimMiles)}
                      </p>
                      <p className="text-[11px] text-indigo-50 mb-1">
                        Distance
                      </p>
                      <p className="text-sm">
                        {formatHours(metrics.time.swimHours)}
                      </p>
                      <p className="text-[11px] text-indigo-50 mt-0.5">
                        {swimPace100m(
                          metrics.distance.swimMiles,
                          metrics.time.swimHours,
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Vertical gains */}
                <div className="rounded-3xl border border-slate-900 bg-gradient-to-br from-fuchsia-500/20 via-slate-950 to-amber-500/20 p-5 md:p-6 relative overflow-hidden">
                  <div className="absolute -right-10 -top-10 w-28 h-28 rounded-full bg-fuchsia-500/35 blur-3xl" />
                  <div className="absolute -left-12 bottom-0 w-32 h-32 rounded-full bg-amber-400/25 blur-3xl" />
                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Mountain className="w-5 h-5 text-amber-200" />
                        <h3 className="text-sm font-semibold">
                          Vertical gains
                        </h3>
                      </div>
                      <p className="text-[11px] text-amber-100/90 uppercase tracking-[0.16em]">
                        Elevation
                      </p>
                    </div>

                    <div className="space-y-3 text-sm">
                      <div className="rounded-2xl bg-slate-950/80 border border-amber-400/40 px-4 py-3">
                        <p className="text-[10px] uppercase text-amber-100 mb-1">
                          Total elevation climbed
                        </p>
                        <p className="text-xl font-semibold leading-none">
                          {metrics.elevation.totalFeet.toLocaleString()} ft
                        </p>
                      </div>
                      <div className="rounded-2xl bg-slate-950/80 border border-fuchsia-400/40 px-4 py-3">
                        <p className="text-[10px] uppercase text-fuchsia-100 mb-1">
                          Highest point reached
                        </p>
                        <p className="text-xl font-semibold leading-none">
                          {metrics.elevation.maxFeet.toLocaleString()} ft
                        </p>
                        <p className="text-[11px] text-slate-300 mt-1">
                          That&apos;s about{' '}
                          {(metrics.elevation.maxFeet / 5280).toFixed(1)} miles
                          above sea level.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* BIG EFFORTS + STREAKS */}
            {metrics && (
              <section className="grid md:grid-cols-2 gap-4">
                {/* Biggest efforts */}
                <div className="rounded-3xl border border-slate-900 bg-gradient-to-br from-indigo-500/15 via-slate-950 to-slate-900 p-5 md:p-6 relative overflow-hidden">
                  <div className="absolute -right-12 -top-12 w-32 h-32 rounded-full bg-indigo-500/25 blur-3xl" />
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-4">
                      <Flame className="w-5 h-5 text-orange-300" />
                      <h3 className="text-sm font-semibold">Biggest efforts</h3>
                    </div>
                    <div className="space-y-3 text-sm">
                      {metrics.longestActivity && (
                        <div className="rounded-2xl bg-slate-950/80 border border-slate-800 px-4 py-3 flex gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                            <Activity className="w-4 h-4 text-emerald-300" />
                          </div>
                          <div>
                            <p className="text-[11px] uppercase text-slate-400 mb-1">
                              Longest activity
                            </p>
                            <p className="font-semibold leading-snug">
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
                        </div>
                      )}

                      {metrics.highestCalorie && (
                        <div className="rounded-2xl bg-slate-950/80 border border-slate-800 px-4 py-3 flex gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-orange-500/20 flex items-center justify-center">
                            <Flame className="w-4 h-4 text-orange-300" />
                          </div>
                          <div>
                            <p className="text-[11px] uppercase text-slate-400 mb-1">
                              Most calories in one go
                            </p>
                            <p className="font-semibold leading-snug">
                              {metrics.highestCalorie.title}
                            </p>
                            <p className="text-slate-400 text-xs">
                              {metrics.highestCalorie.date}
                            </p>
                            <p className="text-xs text-slate-300 mt-1">
                              {metrics.highestCalorie.distance}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Consistency / grind */}
                <div className="rounded-3xl border border-slate-900 bg-gradient-to-br from-amber-500/10 via-slate-950 to-orange-600/10 p-5 md:p-6 relative overflow-hidden">
                  <div className="absolute -left-16 -top-16 w-32 h-32 rounded-full bg-amber-400/25 blur-3xl" />
                  <div className="absolute -right-10 bottom-0 w-32 h-32 rounded-full bg-orange-500/20 blur-3xl" />
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-4">
                      <Zap className="w-5 h-5 text-yellow-300" />
                      <h3 className="text-sm font-semibold">
                        Consistency & grind
                      </h3>
                    </div>

                    {metrics.streaks && metrics.streaks.longestStreakDays > 0 ? (
                      <div className="space-y-3 text-sm">
                        <div className="rounded-2xl bg-slate-950/80 border border-slate-800 px-4 py-3">
                          <p className="text-[11px] uppercase text-slate-400 mb-1">
                            Longest streak
                          </p>
                          <div className="flex items-baseline gap-2">
                            <p className="text-2xl font-semibold">
                              {metrics.streaks.longestStreakDays}
                            </p>
                            <p className="text-xs text-slate-300">days</p>
                          </div>
                          {metrics.streaks.longestStreakStart &&
                            metrics.streaks.longestStreakEnd && (
                              <p className="text-xs text-slate-300 mt-1">
                                {metrics.streaks.longestStreakStart} →{' '}
                                {metrics.streaks.longestStreakEnd}
                              </p>
                            )}
                          <p className="text-[11px] text-slate-500 mt-1 italic">
                            You refused to break the chain.
                          </p>
                        </div>

                        {metrics.streaks.busiestWeekLabel && (
                          <div className="rounded-2xl bg-slate-950/80 border border-slate-800 px-4 py-3 flex gap-3 items-center">
                            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-yellow-500/25 flex items-center justify-center">
                              <Calendar className="w-4 h-4 text-yellow-200" />
                            </div>
                            <div>
                              <p className="text-[11px] uppercase text-slate-400 mb-1">
                                Busiest week
                              </p>
                              <p className="font-semibold leading-tight">
                                {metrics.streaks.busiestWeekLabel}
                              </p>
                              <p className="text-xs text-slate-300 mt-1">
                                {formatHours(
                                  metrics.streaks.busiestWeekHours,
                                )}{' '}
                                • {metrics.streaks.busiestWeekActivities}{' '}
                                activities
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-200">
                        Once activities are loaded, we&apos;ll show your longest
                        streak and busiest week here.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* STEPS WRAPPED */}
            <section className="rounded-3xl border border-slate-900 bg-gradient-to-br from-cyan-500/20 via-slate-950 to-slate-900 p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Footprints className="w-5 h-5 text-cyan-200" />
                  <h3 className="text-sm font-semibold">Steps wrapped</h3>
                </div>
                <p className="text-[11px] text-cyan-100/80 uppercase tracking-[0.18em]">
                  Daily grind
                </p>
              </div>

              {stepsMetrics ? (
                <div className="grid md:grid-cols-4 gap-3 text-sm">
                  <div className="rounded-2xl bg-slate-950/80 border border-cyan-400/40 px-4 py-3">
                    <p className="text-[10px] uppercase text-slate-200 mb-1">
                      Total steps
                    </p>
                    <p className="text-xl font-semibold leading-none">
                      {stepsMetrics.totalSteps.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-300 mt-1">
                      Across {stepsMetrics.weeks} weeks
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/80 border border-cyan-400/20 px-4 py-3">
                    <p className="text-[10px] uppercase text-slate-200 mb-1">
                      Avg per day
                    </p>
                    <p className="text-xl font-semibold leading-none">
                      {Math.round(
                        stepsMetrics.avgStepsPerDay,
                      ).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-300 mt-1">
                      {Math.round(
                        stepsMetrics.avgStepsPerWeek,
                      ).toLocaleString()}{' '}
                      / week
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/80 border border-cyan-400/20 px-4 py-3">
                    <p className="text-[10px] uppercase text-slate-200 mb-1">
                      Best week
                    </p>
                    <p className="text-xl font-semibold leading-none">
                      {stepsMetrics.bestWeekSteps.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-300 mt-1">
                      {stepsMetrics.bestWeekLabel}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/80 border border-cyan-400/20 px-4 py-3">
                    <p className="text-[10px] uppercase text-slate-200 mb-1">
                      Distance from steps
                    </p>
                    <p className="text-xl font-semibold leading-none">
                      {formatMiles(stepsMetrics.approxMiles)}
                    </p>
                    <p className="text-[11px] text-slate-300 mt-1">
                      Based on ~1,842 steps / mile
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-100">
                  Upload a Steps CSV to see total steps, best week, and your
                  day-to-day walking vibe.
                </p>
              )}
            </section>

            {/* SLEEP WRAPPED */}
            <section className="rounded-3xl border border-slate-900 bg-gradient-to-br from-indigo-500/20 via-slate-950 to-purple-600/15 p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <MoonStar className="w-5 h-5 text-indigo-200" />
                  <h3 className="text-sm font-semibold">Sleep wrapped</h3>
                </div>
                <p className="text-[11px] text-indigo-100/80 uppercase tracking-[0.18em]">
                  Recovery mode
                </p>
              </div>

              {sleepMetrics ? (
                <div className="grid md:grid-cols-4 gap-3 text-sm">
                  <div className="rounded-2xl bg-slate-950/80 border border-indigo-400/40 px-4 py-3">
                    <p className="text-[10px] uppercase text-slate-200 mb-1">
                      Weeks of data
                    </p>
                    <p className="text-xl font-semibold leading-none">
                      {sleepMetrics.weeks}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/80 border border-indigo-400/30 px-4 py-3">
                    <p className="text-[10px] uppercase text-slate-200 mb-1">
                      Avg sleep / night
                    </p>
                    <p className="text-xl font-semibold leading-none">
                      {sleepMetrics.avgSleepHours.toFixed(1)} h
                    </p>
                    <p className="text-[11px] text-slate-300 mt-1">
                      Total {sleepMetrics.totalSleepHours.toFixed(0)} h tracked
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/80 border border-indigo-400/30 px-4 py-3">
                    <p className="text-[10px] uppercase text-slate-200 mb-1">
                      Avg sleep score
                    </p>
                    <p className="text-xl font-semibold leading-none">
                      {sleepMetrics.avgScore.toFixed(0)}
                    </p>
                    <p className="text-[11px] text-slate-300 mt-1">
                      Best {sleepMetrics.bestScore} (
                      {sleepMetrics.bestScoreWeekLabel})
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/80 border border-indigo-400/30 px-4 py-3">
                    <p className="text-[10px] uppercase text-slate-200 mb-1">
                      Longest-sleep week
                    </p>
                    <p className="text-xl font-semibold leading-none">
                      {sleepMetrics.bestDurationHours.toFixed(1)} h
                    </p>
                    <p className="text-[11px] text-slate-300 mt-1">
                      {sleepMetrics.bestDurationWeekLabel}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-100">
                  Upload a Sleep CSV to see how your recovery stacked up against
                  all that training.
                </p>
              )}
            </section>

            {/* CLOSING CARD */}
            {(metrics || stepsMetrics || sleepMetrics) && (
              <section className="rounded-3xl border border-slate-900 bg-slate-950/90 p-5 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
                    <Watch className="w-4 h-4 text-slate-950" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase text-slate-400">
                      2025 wrapped up
                    </p>
                    <p className="text-sm text-slate-200">
                      In 2026, the only goal: make Future You impressed.
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 italic flex items-center gap-2 justify-end">
                  <span>See you next year, coach.</span>
                  <Activity className="w-4 h-4 text-slate-500" />
                </p>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
