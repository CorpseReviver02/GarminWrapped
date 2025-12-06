'use client';

import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import * as htmlToImage from 'html-to-image';
import {
  Activity,
  Footprints,
  Moon,
  Download,
  Flame,
  Bolt,
  BarChart3,
} from 'lucide-react';

// ---------- Types ----------

type CsvRow = Record<string, string | number | null | undefined>;

type SportSummary = {
  distanceMiles: number;
  hours: number;
  paceLabel: string;
  bestTitle: string | null;
  bestStat: string | null;
  bestDate: Date | null;
};

type EffortSummary = {
  longestTitle: string | null;
  longestDate: Date | null;
  longestHours: number;
  longestDistanceMiles: number;
  highestCalTitle: string | null;
  highestCalDate: Date | null;
  highestCalHours: number;
  highestCalories: number;
};

type StreakSummary = {
  longestStreakDays: number;
  longestStreakStart: Date | null;
  longestStreakEnd: Date | null;
  busiestWeekHours: number;
  busiestWeekActivities: number;
  busiestWeekStart: Date | null;
  busiestWeekEnd: Date | null;
};

type StepsSummary = {
  totalSteps: number;
  weeks: number;
  avgPerDay: number;
  bestWeekSteps: number;
  bestWeekLabel: string | null;
  milesFromSteps: number;
};

type SleepSummary = {
  weeks: number;
  avgHours: number;
  avgScore: number;
  bestHours: number;
  bestWeekLabel: string | null;
};

type Metrics = {
  year: number;
  totalActivities: number;
  totalTrainingHours: number;
  totalDistanceMiles: number;
  totalCalories: number;
  // distance breakdown
  runningMiles: number;
  cyclingMiles: number;
  swimMiles: number;
  // time by sport
  running: SportSummary;
  cycling: SportSummary;
  swimming: SportSummary;
  strengthHours: number;
  // vertical
  totalElevationFt: number;
  maxElevationFt: number;
  // efforts / streak
  efforts: EffortSummary;
  streak: StreakSummary;
  // steps
  steps: StepsSummary | null;
  // sleep
  sleep: SleepSummary | null;
};

// ---------- Parsing helpers ----------

function parseNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  const cleaned = value.replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function parseHms(value: unknown): number {
  if (typeof value !== 'string') return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(':').map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  let h = 0;
  let m = 0;
  let s = 0;
  if (parts.length === 3) {
    [h, m, s] = parts;
  } else if (parts.length === 2) {
    [m, s] = parts;
  } else if (parts.length === 1) {
    [s] = parts;
  }
  return h * 3600 + m * 60 + s;
}

function parseDate(value: unknown): Date | null {
  if (value == null) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatInt(num: number): string {
  return Math.round(num).toLocaleString('en-US');
}

function formatOneDecimal(num: number): string {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatPaceFromSeconds(secPerMile: number | null): string {
  if (!secPerMile || !Number.isFinite(secPerMile) || secPerMile <= 0) return '--';
  const total = Math.round(secPerMile);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}/mi`;
}

function formatSpeedMph(distanceMiles: number, hours: number): string {
  if (!distanceMiles || !hours) return '--';
  const mph = distanceMiles / hours;
  return `${mph.toFixed(1)} mph`;
}

function formatSwimPace(per100mSeconds: number | null): string {
  if (!per100mSeconds || per100mSeconds <= 0) return '--';
  const total = Math.round(per100mSeconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}/100m`;
}

function formatDateShort(d: Date | null): string {
  if (!d) return '--';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateRange(start: Date | null, end: Date | null): string {
  if (!start || !end) return '--';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const s = start.toLocaleDateString('en-US', opts);
  const e = end.toLocaleDateString('en-US', opts);
  return `${s} — ${e}`;
}

// ---------- Activity metrics ----------

type ParsedActivity = {
  date: Date | null;
  type: string;
  title: string;
  durationSec: number;
  distanceMiles: number;
  calories: number;
  elevationGainFt: number;
  maxElevationFt: number;
};

function inferDistanceMiles(activityType: string, distanceRaw: number): number {
  const t = activityType.toLowerCase();
  const metersSports =
    t.includes('swim') || t.includes('pool swim') || t.includes('open water') || t.includes('track running');
  if (metersSports) {
    return distanceRaw / 1609.34;
  }
  return distanceRaw;
}

function parseActivities(rows: CsvRow[]): ParsedActivity[] {
  const parsed: ParsedActivity[] = [];

  rows.forEach((row) => {
    const type = String(row['Activity Type'] ?? '').trim();
    if (!type) return;

    const date = parseDate(row['Date']);
    const durationSec = parseHms(row['Time'] ?? row['Elapsed Time']);
    const distanceRaw = parseNumber(row['Distance']);
    const distanceMiles = inferDistanceMiles(type, distanceRaw);
    const calories = parseNumber(row['Calories']);
    const elevationGainFt = parseNumber(row['Elevation Gain']);
    const maxElevationFt = parseNumber(row['Max Elevation']);
    const title = String(row['Title'] ?? type);

    parsed.push({
      date,
      type,
      title,
      durationSec,
      distanceMiles,
      calories,
      elevationGainFt,
      maxElevationFt,
    });
  });

  return parsed;
}

function computeActivitiesMetrics(rows: CsvRow[], steps: StepsSummary | null, sleep: SleepSummary | null): Metrics {
  const activities = parseActivities(rows);
  const totalActivities = activities.length;

  const totalDurationSec = activities.reduce((sum, a) => sum + a.durationSec, 0);
  const totalTrainingHours = totalDurationSec / 3600;

  const totalDistanceMiles = activities.reduce((sum, a) => sum + a.distanceMiles, 0);
  const totalCalories = activities.reduce((sum, a) => sum + a.calories, 0);

  const year =
    activities.find((a) => a.date)?.date?.getFullYear() ??
    new Date().getFullYear();

  // Sport filters
  const running = activities.filter((a) =>
    a.type.toLowerCase().includes('running'),
  );
  const cycling = activities.filter((a) =>
    a.type.toLowerCase().includes('cycling'),
  );
  const swimming = activities.filter((a) =>
    a.type.toLowerCase().includes('swim'),
  );
  const strength = activities.filter((a) =>
    a.type.toLowerCase().includes('strength'),
  );

  const sumMiles = (arr: ParsedActivity[]) =>
    arr.reduce((sum, a) => sum + a.distanceMiles, 0);
  const sumSec = (arr: ParsedActivity[]) =>
    arr.reduce((sum, a) => sum + a.durationSec, 0);

  const runningMiles = sumMiles(running);
  const runningHours = sumSec(running) / 3600;
  const runningPace = runningMiles ? sumSec(running) / runningMiles : null;

  const cyclingMiles = sumMiles(cycling);
  const cyclingHours = sumSec(cycling) / 3600;

  const swimMiles = sumMiles(swimming);
  const swimMetersTotal = swimMiles * 1609.34;
  const swimHours = sumSec(swimming) / 3600;
  const swimPacePer100m =
    swimMetersTotal > 0 ? (swimHours * 3600) / (swimMetersTotal / 100) : null;

  const strengthHours = sumSec(strength) / 3600;

  // Best-effort per sport (longest distance)
  const byDistanceDesc = (a: ParsedActivity, b: ParsedActivity) =>
    b.distanceMiles - a.distanceMiles;

  const bestRun = [...running].sort(byDistanceDesc)[0];
  const bestCycle = [...cycling].sort(byDistanceDesc)[0];
  const bestSwim = [...swimming].sort(byDistanceDesc)[0];

  const sportSummary = (base: ParsedActivity | undefined, sportMiles: number, sportHours: number, extraStat: string) => {
    if (!sportMiles || !sportHours) {
      return {
        distanceMiles: 0,
        hours: 0,
        paceLabel: '--',
        bestTitle: null,
        bestStat: null,
        bestDate: null,
      };
    }
    return {
      distanceMiles: sportMiles,
      hours: sportHours,
      paceLabel: extraStat,
      bestTitle: base ? base.title : null,
      bestStat: base
        ? `${formatOneDecimal(base.distanceMiles)} mi`
        : null,
      bestDate: base?.date ?? null,
    };
  };

  const runningSummary: SportSummary = sportSummary(
    bestRun,
    runningMiles,
    runningHours,
    formatPaceFromSeconds(runningPace),
  );

  const cyclingSummary: SportSummary = sportSummary(
    bestCycle,
    cyclingMiles,
    cyclingHours,
    formatSpeedMph(cyclingMiles, cyclingHours),
  );

  const swimmingSummary: SportSummary = sportSummary(
    bestSwim,
    swimMiles,
    swimHours,
    formatSwimPace(swimPacePer100m),
  );

  // Vertical
  const totalElevationFt = activities.reduce(
    (sum, a) => sum + a.elevationGainFt,
    0,
  );
  const maxElevationFt = activities.reduce(
    (max, a) => Math.max(max, a.maxElevationFt),
    0,
  );

  // Efforts
  const longest = activities.reduce<ParsedActivity | null>(
    (best, a) => (!best || a.durationSec > best.durationSec ? a : best),
    null,
  );
  const highestCal = activities.reduce<ParsedActivity | null>(
    (best, a) => (!best || a.calories > best.calories ? a : best),
    null,
  );

  const efforts: EffortSummary = {
    longestTitle: longest?.title ?? null,
    longestDate: longest?.date ?? null,
    longestHours: longest ? longest.durationSec / 3600 : 0,
    longestDistanceMiles: longest?.distanceMiles ?? 0,
    highestCalTitle: highestCal?.title ?? null,
    highestCalDate: highestCal?.date ?? null,
    highestCalHours: highestCal ? highestCal.durationSec / 3600 : 0,
    highestCalories: highestCal?.calories ?? 0,
  };

  // Streaks
  const uniqueDays = Array.from(
    new Set(
      activities
        .map((a) => (a.date ? new Date(a.date.getFullYear(), a.date.getMonth(), a.date.getDate()).getTime() : null))
        .filter((v): v is number => v !== null),
    ),
  )
    .sort()
    .map((t) => new Date(t));

  let longestStreakDays = 0;
  let longestStreakStart: Date | null = null;
  let longestStreakEnd: Date | null = null;

  if (uniqueDays.length) {
    let currentStart = uniqueDays[0];
    let currentPrev = uniqueDays[0];
    let currentLen = 1;

    for (let i = 1; i < uniqueDays.length; i++) {
      const d = uniqueDays[i];
      const diffDays = (d.getTime() - currentPrev.getTime()) / 86400000;
      if (diffDays === 1) {
        currentLen += 1;
      } else {
        if (currentLen > longestStreakDays) {
          longestStreakDays = currentLen;
          longestStreakStart = currentStart;
          longestStreakEnd = currentPrev;
        }
        currentStart = d;
        currentLen = 1;
      }
      currentPrev = d;
    }

    if (currentLen > longestStreakDays) {
      longestStreakDays = currentLen;
      longestStreakStart = currentStart;
      longestStreakEnd = currentPrev;
    }
  }

// Busiest week (by hours)
  type WeekAgg = {
    key: string;
    start: Date;
    end: Date;
    totalSec: number;
    activities: number;
  };

  const weeksMap = new Map<string, WeekAgg>();

  activities.forEach((a) => {
    if (!a.date) return;
    const d = a.date;

    // Compute Monday-based week
    const day = d.getDay(); // 0 = Sunday
    const mondayOffset = (day + 6) % 7;
    const start = new Date(d);
    start.setDate(d.getDate() - mondayOffset);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const key = start.toISOString();
    const existing = weeksMap.get(key);
    if (existing) {
      existing.totalSec += a.durationSec;
      existing.activities += 1;
    } else {
      weeksMap.set(key, {
        key,
        start,
        end,
        totalSec: a.durationSec,
        activities: 1,
      });
    }
  });

  let busiestWeek: WeekAgg | null = null;
  weeksMap.forEach((w) => {
    if (!busiestWeek || w.totalSec > busiestWeek.totalSec) {
      busiestWeek = w;
    }
  });

  // Pull fields out into plain variables so TS is happy
  let busiestWeekHours = 0;
  let busiestWeekActivities = 0;
  let busiestWeekStart: Date | null = null;
  let busiestWeekEnd: Date | null = null;

  if (busiestWeek) {
    busiestWeekHours = busiestWeek.totalSec / 3600;
    busiestWeekActivities = busiestWeek.activities;
    busiestWeekStart = busiestWeek.start;
    busiestWeekEnd = busiestWeek.end;
  }

  const streak: StreakSummary = {
    longestStreakDays,
    longestStreakStart,
    longestStreakEnd,
    busiestWeekHours,
    busiestWeekActivities,
    busiestWeekStart,
    busiestWeekEnd,
  };

  return {
    year,
    totalActivities,
    totalTrainingHours,
    totalDistanceMiles,
    totalCalories,
    runningMiles,
    cyclingMiles,
    swimMiles,
    running: runningSummary,
    cycling: cyclingSummary,
    swimming: swimmingSummary,
    strengthHours,
    totalElevationFt,
    maxElevationFt,
    efforts,
    streak,
    steps,
    sleep,
  };
}

// ---------- Steps metrics ----------

function computeStepsMetrics(rows: CsvRow[]): StepsSummary | null {
  // Expect weekly export: Date, Actual, Goal, Change
  const weekly: { label: string; steps: number }[] = [];

  rows.forEach((row) => {
    const raw =
      row['Actual'] ??
      row['Steps'] ??
      row['Total Steps'] ??
      row['total_steps'];
    const steps = parseNumber(raw);
    if (!steps || steps <= 0) return;

    const label = String(row['Date'] ?? row['Week'] ?? '').trim();
    weekly.push({ label, steps });
  });

  if (!weekly.length) return null;

  const totalSteps = weekly.reduce((sum, w) => sum + w.steps, 0);
  const weeks = weekly.length;
  const avgPerDay = totalSteps / (weeks * 7);

  let best = weekly[0];
  weekly.forEach((w) => {
    if (w.steps > best.steps) best = w;
  });

  const stepsPerMile = 1842; // from your earlier sheet
  const milesFromSteps = totalSteps / stepsPerMile;

  return {
    totalSteps,
    weeks,
    avgPerDay,
    bestWeekSteps: best.steps,
    bestWeekLabel: best.label || null,
    milesFromSteps,
  };
}

// ---------- Sleep metrics ----------

function parseSleepHours(text: unknown): number {
  if (typeof text !== 'string') return 0;
  const t = text.trim();
  if (!t) return 0;
  const hMatch = t.match(/(\d+)\s*h/);
  const mMatch = t.match(/(\d+)\s*min/);
  const hours = hMatch ? parseInt(hMatch[1], 10) : 0;
  const minutes = mMatch ? parseInt(mMatch[1], 10) : 0;
  return hours + minutes / 60;
}

function computeSleepMetrics(rows: CsvRow[]): SleepSummary | null {
  const weeksData: { label: string; hours: number; score: number }[] = [];

  rows.forEach((row) => {
    const hours = parseSleepHours(row['Avg Duration']);
    const score = parseNumber(row['Avg Score']);
    if (!hours || hours <= 0) return;

    const label = String(row['Date'] ?? row['Week'] ?? '').trim();
    weeksData.push({ label, hours, score });
  });

  if (!weeksData.length) return null;

  const weeks = weeksData.length;
  const avgHours =
    weeksData.reduce((sum, w) => sum + w.hours, 0) / weeks;
  const avgScore =
    weeksData.reduce((sum, w) => sum + w.score, 0) / weeks;

  let best = weeksData[0];
  weeksData.forEach((w) => {
    if (w.hours > best.hours) best = w;
  });

  return {
    weeks,
    avgHours,
    avgScore,
    bestHours: best.hours,
    bestWeekLabel: best.label || null,
  };
}

// ---------- UI components ----------

function UploadButton({
  label,
  icon: Icon,
  onChange,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onChange: (file: File) => void;
}) {
  return (
    <label className="relative flex items-center gap-2 rounded-full border border-emerald-400/60 bg-slate-900/70 px-4 py-1.5 text-xs font-medium text-slate-50 shadow-[0_0_25px_rgba(45,212,191,0.4)] backdrop-blur hover:border-emerald-300 hover:bg-slate-900/90 cursor-pointer">
      <Icon className="h-3.5 w-3.5 text-emerald-300" />
      <span>{label}</span>
      <input
        type="file"
        accept=".csv"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onChange(file);
          e.target.value = '';
        }}
      />
    </label>
  );
}

function Tile({
  children,
  className = '',
  gradient = 'from-cyan-400/40 via-emerald-400/20 to-blue-500/40',
}: {
  children: React.ReactNode;
  className?: string;
  gradient?: string;
}) {
  return (
    <section
      className={`relative overflow-hidden rounded-3xl border border-white/8 bg-slate-950/90 px-5 py-4 shadow-[0_0_45px_rgba(15,23,42,0.95)] backdrop-blur-xl ${className}`}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${gradient} opacity-70 mix-blend-screen`}
      />
      <div className="pointer-events-none absolute -top-20 left-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-10 h-48 w-48 rounded-full bg-white/5 blur-3xl" />
      <div className="relative z-10">{children}</div>
    </section>
  );
}

// ---------- Main Page ----------

export default function Home() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [stepsSummary, setStepsSummary] = useState<StepsSummary | null>(null);
  const [sleepSummary, setSleepSummary] = useState<SleepSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const handleActivitiesUpload = (file: File) => {
    setError(null);
    Papa.parse<CsvRow>(file, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = (result.data ?? []) as CsvRow[];
        const merged = computeActivitiesMetrics(
          rows,
          stepsSummary,
          sleepSummary,
        );
        setMetrics(merged);
      },
      error: (err) => setError(`Failed to parse activities CSV: ${err.message}`),
    });
  };

  const handleStepsUpload = (file: File) => {
    setError(null);
    Papa.parse<CsvRow>(file, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = (result.data ?? []) as CsvRow[];
        const steps = computeStepsMetrics(rows);
        setStepsSummary(steps);
        setMetrics((prev) =>
          prev ? { ...prev, steps } : prev,
        );
      },
      error: (err) => setError(`Failed to parse steps CSV: ${err.message}`),
    });
  };

  const handleSleepUpload = (file: File) => {
    setError(null);
    Papa.parse<CsvRow>(file, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = (result.data ?? []) as CsvRow[];
        const sleep = computeSleepMetrics(rows);
        setSleepSummary(sleep);
        setMetrics((prev) =>
          prev ? { ...prev, sleep } : prev,
        );
      },
      error: (err) => setError(`Failed to parse sleep CSV: ${err.message}`),
    });
  };

  const handleDownloadImage = async () => {
    if (!wrapperRef.current) return;
    try {
      const dataUrl = await htmlToImage.toPng(wrapperRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#020617',
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'garmin-wrapped-2025.png';
      link.click();
    } catch (err) {
      console.error(err);
      setError('Unable to generate image. Try again after the page fully loads.');
    }
  };

  const year = metrics?.year ?? new Date().getFullYear();
  const steps = metrics?.steps ?? stepsSummary ?? null;
  const sleep = metrics?.sleep ?? sleepSummary ?? null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-20 pt-6">
        {/* Top controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs font-medium text-slate-400">
            Garmin Wrapped <span className="text-emerald-300">{year}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <UploadButton
              label="Upload activities CSV"
              icon={Activity}
              onChange={handleActivitiesUpload}
            />
            <UploadButton
              label="Upload steps CSV"
              icon={Footprints}
              onChange={handleStepsUpload}
            />
            <UploadButton
              label="Upload sleep CSV"
              icon={Moon}
              onChange={handleSleepUpload}
            />
            <button
              onClick={handleDownloadImage}
              className="flex items-center gap-2 rounded-full border border-slate-500/60 bg-slate-900/80 px-4 py-1.5 text-xs font-medium text-slate-100 hover:border-slate-300 hover:bg-slate-800/90"
            >
              <Download className="h-3.5 w-3.5" />
              Download as image
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-xs text-red-100">
            {error}
          </div>
        )}

        {/* Wrapped content */}
        <div
          ref={wrapperRef}
          className="mx-auto flex w-full max-w-5xl flex-col gap-5 rounded-[40px] bg-slate-950/90 p-5 shadow-[0_0_55px_rgba(15,23,42,0.95)]"
        >
          {/* HERO */}
          <Tile
            gradient="from-cyan-400/40 via-emerald-300/25 to-purple-500/40"
            className="pb-5 pt-6"
          >
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-200/80">
                  {year} • GARMIN WRAPPED
                </div>
                <h1 className="mt-2 text-2xl font-semibold text-slate-50">
                  Your year in movement
                </h1>
                <p className="mt-2 max-w-md text-xs text-slate-100/90">
                  From lifts and Zwift to long runs and high-altitude hiking,
                  here&apos;s what your watch saw this year.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[0.65rem] md:grid-cols-4">
                <div className="rounded-2xl bg-slate-950/60 px-3 py-2">
                  <div className="uppercase tracking-[0.18em] text-slate-400">
                    Activities
                  </div>
                  <div className="mt-1 text-sm font-semibold">
                    {metrics ? formatInt(metrics.totalActivities) : '—'}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-950/60 px-3 py-2">
                  <div className="uppercase tracking-[0.18em] text-slate-400">
                    Training time
                  </div>
                  <div className="mt-1 text-sm font-semibold">
                    {metrics
                      ? `${formatInt(metrics.totalTrainingHours)} h`
                      : '—'}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-950/60 px-3 py-2">
                  <div className="uppercase tracking-[0.18em] text-slate-400">
                    Distance travelled
                  </div>
                  <div className="mt-1 text-sm font-semibold">
                    {metrics
                      ? `${formatInt(metrics.totalDistanceMiles)} mi`
                      : '—'}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-950/60 px-3 py-2">
                  <div className="uppercase tracking-[0.18em] text-slate-400">
                    Calories burned
                  </div>
                  <div className="mt-1 text-sm font-semibold">
                    {metrics
                      ? `${formatInt(metrics.totalCalories)} kcal`
                      : '—'}
                  </div>
                </div>
              </div>
            </div>
            {/* steps hero strip */}
            <div className="mt-4 rounded-2xl border border-emerald-300/40 bg-slate-950/80 px-4 py-2 text-[0.65rem] text-slate-100 shadow-[0_0_25px_rgba(45,212,191,0.35)]">
              {steps ? (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                  <span className="flex items-center gap-1 font-semibold text-emerald-300">
                    <Footprints className="h-3 w-3" />
                    Steps wrapped
                  </span>
                  <span>
                    {formatInt(steps.totalSteps)} steps • ~
                    {formatInt(steps.milesFromSteps)} mi on foot
                  </span>
                  <span className="text-slate-300/90">
                    Best week:{' '}
                    <span className="font-semibold">
                      {formatInt(steps.bestWeekSteps)} steps
                    </span>{' '}
                    {steps.bestWeekLabel && `(${steps.bestWeekLabel})`}
                  </span>
                </div>
              ) : (
                <span className="flex items-center gap-1">
                  <Footprints className="h-3 w-3 text-emerald-300" />
                  Upload a Steps CSV to see total steps, best week, and your
                  day-to-day walking vibe.
                </span>
              )}
            </div>
          </Tile>

          {/* Distance breakdown */}
          <Tile className="pt-4">
            <div className="mb-3 flex items-center justify-between text-[0.65rem]">
              <div className="flex items-center gap-2 text-slate-200/90">
                <Activity className="h-3.5 w-3.5 text-cyan-300" />
                <span className="uppercase tracking-[0.18em]">
                  Distance breakdown
                </span>
              </div>
              <div className="text-slate-300/80">
                {metrics
                  ? `${formatInt(metrics.totalDistanceMiles)} mi total`
                  : '—'}
              </div>
            </div>
            <div className="grid gap-3 text-xs md:grid-cols-4">
              <div className="rounded-2xl bg-slate-950/70 px-4 py-3">
                <div className="text-[0.60rem] uppercase tracking-[0.16em] text-slate-400">
                  Running
                </div>
                <div className="mt-1 text-base font-semibold">
                  {metrics ? formatInt(metrics.runningMiles) : '—'}{' '}
                  <span className="text-xs font-normal text-slate-200">mi</span>
                </div>
              </div>
              <div className="rounded-2xl bg-slate-950/70 px-4 py-3">
                <div className="text-[0.60rem] uppercase tracking-[0.16em] text-slate-400">
                  Cycling
                </div>
                <div className="mt-1 text-base font-semibold">
                  {metrics ? formatInt(metrics.cyclingMiles) : '—'}{' '}
                  <span className="text-xs font-normal text-slate-200">mi</span>
                </div>
              </div>
              <div className="rounded-2xl bg-slate-950/70 px-4 py-3">
                <div className="text-[0.60rem] uppercase tracking-[0.16em] text-slate-400">
                  Swimming*
                </div>
                <div className="mt-1 text-base font-semibold">
                  {metrics ? formatOneDecimal(metrics.swimMiles) : '—'}{' '}
                  <span className="text-xs font-normal text-slate-200">mi</span>
                </div>
                <div className="mt-1 text-[0.6rem] text-slate-400">
                  *Meters converted to miles
                </div>
              </div>
              <div className="rounded-2xl bg-slate-950/70 px-4 py-3">
                <div className="text-[0.60rem] uppercase tracking-[0.16em] text-slate-400">
                  Walking / hiking
                </div>
                <div className="mt-1 text-base font-semibold">
                  {steps ? formatInt(steps.milesFromSteps) : '—'}{' '}
                  <span className="text-xs font-normal text-slate-200">mi</span>
                </div>
                <div className="mt-1 text-[0.6rem] text-slate-400">
                  Based on steps export
                </div>
              </div>
            </div>
          </Tile>

          {/* Time by sport */}
          <Tile
            gradient="from-cyan-400/35 via-teal-500/20 to-sky-500/35"
            className="pt-4"
          >
            <div className="mb-3 flex items-center justify-between text-[0.65rem]">
              <div className="flex items-center gap-2 text-slate-200/90">
                <BarChart3 className="h-3.5 w-3.5 text-teal-300" />
                <span className="uppercase tracking-[0.18em]">
                  Time by sport
                </span>
              </div>
              <div className="text-slate-300/80">
                {metrics
                  ? `${formatInt(metrics.totalTrainingHours)} h total`
                  : '—'}
              </div>
            </div>
            <div className="grid gap-3 text-xs md:grid-cols-3">
              {/* Running */}
              <div className="rounded-2xl bg-slate-950/75 px-4 py-3">
                <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.18em] text-cyan-200">
                  <span>Running</span>
                  <span className="text-slate-400">Distance • Time • Pace</span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <div>
                    <div className="text-[0.6rem] text-slate-400">
                      Distance
                    </div>
                    <div className="text-sm font-semibold">
                      {metrics ? formatInt(metrics.running.distanceMiles) : '—'}{' '}
                      <span className="text-xs font-normal text-slate-200">
                        mi
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[0.6rem] text-slate-400">Time</div>
                    <div className="text-sm font-semibold">
                      {metrics
                        ? `${formatInt(metrics.running.hours)} h`
                        : '—'}
                    </div>
                    <div className="mt-1 text-[0.6rem] text-slate-400">
                      {metrics ? metrics.running.paceLabel : '--'}
                    </div>
                  </div>
                </div>
                {metrics?.running.bestTitle && (
                  <div className="mt-3 border-t border-slate-800/90 pt-2 text-[0.6rem]">
                    <div className="text-slate-400">Best effort</div>
                    <div className="mt-0.5 text-[0.7rem] text-slate-100">
                      {metrics.running.bestTitle}
                    </div>
                    <div className="mt-0.5 flex justify-between text-slate-300">
                      <span>
                        {metrics.running.bestDate &&
                          formatDateShort(metrics.running.bestDate)}
                      </span>
                      <span>{metrics.running.bestStat}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Cycling */}
              <div className="rounded-2xl bg-slate-950/75 px-4 py-3">
                <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.18em] text-teal-200">
                  <span>Cycling</span>
                  <span className="text-slate-400">Distance • Time • Speed</span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <div>
                    <div className="text-[0.6rem] text-slate-400">
                      Distance
                    </div>
                    <div className="text-sm font-semibold">
                      {metrics ? formatInt(metrics.cycling.distanceMiles) : '—'}{' '}
                      <span className="text-xs font-normal text-slate-200">
                        mi
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[0.6rem] text-slate-400">Time</div>
                    <div className="text-sm font-semibold">
                      {metrics
                        ? `${formatInt(metrics.cycling.hours)} h`
                        : '—'}
                    </div>
                    <div className="mt-1 text-[0.6rem] text-slate-400">
                      {metrics ? metrics.cycling.paceLabel : '--'}
                    </div>
                  </div>
                </div>
                {metrics?.cycling.bestTitle && (
                  <div className="mt-3 border-t border-slate-800/90 pt-2 text-[0.6rem]">
                    <div className="text-slate-400">Best effort</div>
                    <div className="mt-0.5 text-[0.7rem] text-slate-100">
                      {metrics.cycling.bestTitle}
                    </div>
                    <div className="mt-0.5 flex justify-between text-slate-300">
                      <span>
                        {metrics.cycling.bestDate &&
                          formatDateShort(metrics.cycling.bestDate)}
                      </span>
                      <span>{metrics.cycling.bestStat}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Swimming */}
              <div className="rounded-2xl bg-slate-950/75 px-4 py-3">
                <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.18em] text-purple-200">
                  <span>Swimming</span>
                  <span className="text-slate-400">Distance • Time • Pace</span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <div>
                    <div className="text-[0.6rem] text-slate-400">
                      Distance
                    </div>
                    <div className="text-sm font-semibold">
                      {metrics ? formatOneDecimal(metrics.swimming.distanceMiles) : '—'}{' '}
                      <span className="text-xs font-normal text-slate-200">
                        mi
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[0.6rem] text-slate-400">Time</div>
                    <div className="text-sm font-semibold">
                      {metrics
                        ? `${formatOneDecimal(metrics.swimming.hours)} h`
                        : '—'}
                    </div>
                    <div className="mt-1 text-[0.6rem] text-slate-400">
                      {metrics ? metrics.swimming.paceLabel : '--'}
                    </div>
                  </div>
                </div>
                {metrics?.swimming.bestTitle && (
                  <div className="mt-3 border-t border-slate-800/90 pt-2 text-[0.6rem]">
                    <div className="text-slate-400">Best effort</div>
                    <div className="mt-0.5 text-[0.7rem] text-slate-100">
                      {metrics.swimming.bestTitle}
                    </div>
                    <div className="mt-0.5 flex justify-between text-slate-300">
                      <span>
                        {metrics.swimming.bestDate &&
                          formatDateShort(metrics.swimming.bestDate)}
                      </span>
                      <span>{metrics.swimming.bestStat}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Tile>

          {/* Vertical gains */}
          <Tile
            gradient="from-fuchsia-400/35 via-purple-500/25 to-amber-400/35"
            className="pt-4"
          >
            <div className="mb-3 flex items-center justify-between text-[0.65rem]">
              <div className="flex items-center gap-2 text-slate-200/90">
                <Bolt className="h-3.5 w-3.5 text-fuchsia-300" />
                <span className="uppercase tracking-[0.18em]">
                  Vertical gains
                </span>
              </div>
              <div className="text-slate-300/80 uppercase tracking-[0.18em]">
                Elevation
              </div>
            </div>
            <div className="grid gap-3 text-xs md:grid-cols-2">
              <div className="rounded-2xl bg-slate-950/75 px-4 py-3">
                <div className="text-[0.6rem] uppercase tracking-[0.16em] text-slate-400">
                  Total elevation climbed
                </div>
                <div className="mt-1 text-base font-semibold">
                  {metrics ? formatInt(metrics.totalElevationFt) : '—'}{' '}
                  <span className="text-xs font-normal text-slate-200">ft</span>
                </div>
                {metrics && (
                  <div className="mt-1 text-[0.6rem] text-slate-400">
                    Roughly {formatInt(metrics.totalElevationFt / 10)} floors
                    climbed.
                  </div>
                )}
              </div>
              <div className="rounded-2xl bg-slate-950/75 px-4 py-3">
                <div className="text-[0.6rem] uppercase tracking-[0.16em] text-slate-400">
                  Highest point reached
                </div>
                <div className="mt-1 text-base font-semibold">
                  {metrics ? formatInt(metrics.maxElevationFt) : '—'}{' '}
                  <span className="text-xs font-normal text-slate-200">ft</span>
                </div>
                {metrics && (
                  <div className="mt-1 text-[0.6rem] text-slate-400">
                    That&apos;s about {(metrics.maxElevationFt / 5280).toFixed(1)} miles
                    above sea level.
                  </div>
                )}
              </div>
            </div>
          </Tile>

          {/* Biggest efforts + Consistency */}
          <div className="grid gap-4 md:grid-cols-2">
            <Tile
              gradient="from-emerald-400/30 via-sky-500/20 to-cyan-400/30"
              className="pt-4"
            >
              <div className="mb-3 flex items-center gap-2 text-[0.65rem] text-slate-200/90">
                <Flame className="h-3.5 w-3.5 text-emerald-300" />
                <span className="uppercase tracking-[0.18em]">
                  Biggest efforts
                </span>
              </div>
              <div className="space-y-3 text-xs">
                <div className="rounded-2xl bg-slate-950/75 px-4 py-3">
                  <div className="text-[0.6rem] uppercase tracking-[0.16em] text-slate-400">
                    Longest activity
                  </div>
                  {metrics?.efforts.longestTitle ? (
                    <>
                      <div className="mt-1 text-[0.8rem] font-semibold text-slate-100">
                        {metrics.efforts.longestTitle}
                      </div>
                      <div className="mt-0.5 flex justify-between text-[0.7rem] text-slate-300">
                        <span>
                          {formatDateShort(metrics.efforts.longestDate)}
                        </span>
                        <span>
                          {formatOneDecimal(metrics.efforts.longestHours)} h •{' '}
                          {formatOneDecimal(
                            metrics.efforts.longestDistanceMiles,
                          )}{' '}
                          mi
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="mt-1 text-[0.7rem] text-slate-400">
                      Upload activities to see your marathon-level grinds.
                    </div>
                  )}
                </div>

                <div className="rounded-2xl bg-slate-950/75 px-4 py-3">
                  <div className="text-[0.6rem] uppercase tracking-[0.16em] text-slate-400">
                    Most calories in one go
                  </div>
                  {metrics?.efforts.highestCalTitle ? (
                    <>
                      <div className="mt-1 text-[0.8rem] font-semibold text-slate-100">
                        {metrics.efforts.highestCalTitle}
                      </div>
                      <div className="mt-0.5 flex justify-between text-[0.7rem] text-slate-300">
                        <span>
                          {formatDateShort(metrics.efforts.highestCalDate)}
                        </span>
                        <span>
                          {formatOneDecimal(
                            metrics.efforts.highestCalHours,
                          )}{' '}
                          h • {formatInt(metrics.efforts.highestCalories)} kcal
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="mt-1 text-[0.7rem] text-slate-400">
                      Your biggest sweat-fest of the year shows up here.
                    </div>
                  )}
                </div>
              </div>
            </Tile>

            <Tile
              gradient="from-amber-400/35 via-orange-400/25 to-pink-500/35"
              className="pt-4"
            >
              <div className="mb-3 flex items-center gap-2 text-[0.65rem] text-slate-200/90">
                <Bolt className="h-3.5 w-3.5 text-amber-200" />
                <span className="uppercase tracking-[0.18em]">
                  Consistency &amp; grind
                </span>
              </div>
              <div className="space-y-3 text-xs">
                <div className="rounded-2xl bg-slate-950/75 px-4 py-3">
                  <div className="text-[0.6rem] uppercase tracking-[0.16em] text-slate-400">
                    Longest streak
                  </div>
                  {metrics?.streak.longestStreakDays ? (
                    <>
                      <div className="mt-1 text-base font-semibold">
                        {metrics.streak.longestStreakDays}{' '}
                        <span className="text-xs font-normal text-slate-200">
                          days
                        </span>
                      </div>
                      <div className="mt-0.5 text-[0.7rem] text-slate-300">
                        {formatDateRange(
                          metrics.streak.longestStreakStart,
                          metrics.streak.longestStreakEnd,
                        )}
                      </div>
                      <div className="mt-1 text-[0.6rem] text-slate-400">
                        You refused to break the chain.
                      </div>
                    </>
                  ) : (
                    <div className="mt-1 text-[0.7rem] text-slate-400">
                      Once you start stacking days, your longest streak will
                      show here.
                    </div>
                  )}
                </div>

                <div className="rounded-2xl bg-slate-950/75 px-4 py-3">
                  <div className="text-[0.6rem] uppercase tracking-[0.16em] text-slate-400">
                    Busiest week
                  </div>
                  {metrics?.streak.busiestWeekHours ? (
                    <>
                      <div className="mt-1 text-[0.8rem] font-semibold text-slate-100">
                        {formatDateRange(
                          metrics.streak.busiestWeekStart,
                          metrics.streak.busiestWeekEnd,
                        )}
                      </div>
                      <div className="mt-0.5 text-[0.7rem] text-slate-300">
                        {formatOneDecimal(metrics.streak.busiestWeekHours)} h •{' '}
                        {metrics.streak.busiestWeekActivities} activities
                      </div>
                    </>
                  ) : (
                    <div className="mt-1 text-[0.7rem] text-slate-400">
                      When you have a week that feels like a training camp,
                      it&apos;ll land here.
                    </div>
                  )}
                </div>
              </div>
            </Tile>
          </div>

          {/* Steps wrapped */}
          <Tile
            gradient="from-teal-400/35 via-cyan-500/25 to-blue-500/35"
            className="pt-4"
          >
            <div className="mb-3 flex items-center justify-between text-[0.65rem]">
              <div className="flex items-center gap-2 text-slate-200/90">
                <Footprints className="h-3.5 w-3.5 text-emerald-300" />
                <span className="uppercase tracking-[0.18em]">
                  Steps wrapped
                </span>
              </div>
              {steps && (
                <div className="text-slate-300/80 text-[0.6rem]">
                  Across {steps.weeks} weeks of data
                </div>
              )}
            </div>
            {steps ? (
              <div className="grid gap-3 text-xs md:grid-cols-4">
                <div className="rounded-2xl bg-slate-950/75 px-4 py-3">
                  <div className="text-[0.6rem] uppercase tracking-[0.16em] text-slate-400">
                    Total steps
                  </div>
                  <div className="mt-1 text-base font-semibold">
                    {formatInt(steps.totalSteps)}
                  </div>
                  <div className="mt-1 text-[0.6rem] text-slate-400">
                    Across {steps.weeks} weeks
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-950/75 px-4 py-3">
                  <div className="text-[0.6rem] uppercase tracking-[0.16em] text-slate-400">
                    Avg per day
                  </div>
                  <div className="mt-1 text-base font-semibold">
                    {formatInt(steps.avgPerDay)}
                  </div>
                  <div className="mt-1 text-[0.6rem] text-slate-400">
                    ~{formatInt(steps.milesFromSteps)} mi on foot
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-950/75 px-4 py-3">
                  <div className="text-[0.6rem] uppercase tracking-[0.16em] text-slate-400">
                    Best week
                  </div>
                  <div className="mt-1 text-base font-semibold">
                    {formatInt(steps.bestWeekSteps)}
                  </div>
                  <div className="mt-1 text-[0.6rem] text-slate-400">
                    {steps.bestWeekLabel || 'Week of max hustle'}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-950/75 px-4 py-3">
                  <div className="text-[0.6rem] uppercase tracking-[0.16em] text-slate-400">
                    Distance from steps
                  </div>
                  <div className="mt-1 text-base font-semibold">
                    {formatInt(steps.milesFromSteps)}{' '}
                    <span className="text-xs font-normal text-slate-200">
                      mi
                    </span>
                  </div>
                  <div className="mt-1 text-[0.6rem] text-slate-400">
                    Based on ~1,842 steps / mile
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[0.7rem] text-slate-300">
                Upload a Steps CSV to see how far your everyday walking really
                took you.
              </div>
            )}
          </Tile>

          {/* Sleep wrapped */}
          <Tile
            gradient="from-indigo-400/35 via-violet-500/25 to-fuchsia-500/35"
            className="pt-4"
          >
            <div className="mb-3 flex items-center justify-between text-[0.65rem]">
              <div className="flex items-center gap-2 text-slate-200/90">
                <Moon className="h-3.5 w-3.5 text-indigo-300" />
                <span className="uppercase tracking-[0.18em]">
                  Sleep wrapped
                </span>
              </div>
              {sleep && (
                <div className="text-[0.6rem] text-slate-300/80">
                  Recovery mode • {sleep.weeks} weeks logged
                </div>
              )}
            </div>
            {sleep ? (
              <div className="grid gap-3 text-xs md:grid-cols-4">
                <div className="rounded-2xl bg-slate-950/75 px-4 py-3">
                  <div className="text-[0.6rem] uppercase tracking-[0.16em] text-slate-400">
                    Weeks of data
                  </div>
                  <div className="mt-1 text-base font-semibold">
                    {sleep.weeks}
                  </div>
                  <div className="mt-1 text-[0.6rem] text-slate-400">
                    That&apos;s most of the year tracked.
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-950/75 px-4 py-3">
                  <div className="text-[0.6rem] uppercase tracking-[0.16em] text-slate-400">
                    Avg sleep / night
                  </div>
                  <div className="mt-1 text-base font-semibold">
                    {sleep.avgHours.toFixed(1)}{' '}
                    <span className="text-xs font-normal text-slate-200">
                      h
                    </span>
                  </div>
                  <div className="mt-1 text-[0.6rem] text-slate-400">
                    Total {formatInt(sleep.avgHours * sleep.weeks * 7)} h tracked
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-950/75 px-4 py-3">
                  <div className="text-[0.6rem] uppercase tracking-[0.16em] text-slate-400">
                    Avg sleep score
                  </div>
                  <div className="mt-1 text-base font-semibold">
                    {Math.round(sleep.avgScore)}
                  </div>
                  <div className="mt-1 text-[0.6rem] text-slate-400">
                    Out of 100 • more green than red.
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-950/75 px-4 py-3">
                  <div className="text-[0.6rem] uppercase tracking-[0.16em] text-slate-400">
                    Longest-sleep week
                  </div>
                  <div className="mt-1 text-base font-semibold">
                    {sleep.bestHours.toFixed(1)}{' '}
                    <span className="text-xs font-normal text-slate-200">
                      h
                    </span>
                  </div>
                  <div className="mt-1 text-[0.6rem] text-slate-400">
                    {sleep.bestWeekLabel || 'Your chillest week of the year.'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[0.7rem] text-slate-300">
                Upload a Sleep CSV to see how your recovery stacked up against
                all that training.
              </div>
            )}
          </Tile>

          {/* Closing */}
          <Tile
            gradient="from-emerald-400/25 via-cyan-400/25 to-purple-500/25"
            className="py-4"
          >
            <div className="flex items-center justify-between text-[0.7rem] text-slate-100">
              <div>
                <div className="text-[0.6rem] uppercase tracking-[0.18em] text-emerald-200">
                  {year} wrapped up
                </div>
                <div className="mt-1 text-[0.8rem]">
                  In {year + 1}, the only goal: make Future You impressed.
                </div>
              </div>
              <div className="hidden text-[0.6rem] text-slate-300 sm:block">
                See you next year, coach.
              </div>
            </div>
          </Tile>
        </div>
      </div>
    </div>
  );
}
