// @ts-nocheck
'use client';

import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import * as htmlToImage from 'html-to-image';
import {
  Activity,
  Flame,
  Footprints,
  Bike,
  Dumbbell,
  Watch,
  Zap,
  Calendar,
  Mountain,
  Flag,
  Globe2,
  Moon,
} from 'lucide-react';

type RawRow = Record<string, any>;

type Metrics = {
  totalActivities: number;
  totalHours: number;
  totalCalories: number;
  totalDistanceMiles: number;
  totalElevationFeet: number;
  bySport: {
    run: { miles: number; hours: number };
    bike: { miles: number; hours: number };
    swim: { distance: number; hours: number };
    strength: { hours: number };
    other: { hours: number };
  };
  longestRun?: {
    title: string;
    date: string;
    distanceMiles: number;
    duration: string;
  };
  longestRide?: {
    title: string;
    date: string;
    distanceMiles: number;
    duration: string;
  };
  longestSwim?: {
    title: string;
    date: string;
    distance: number;
    duration: string;
  };
  busiestWeek?: {
    label: string;
    hours: number;
    activities: number;
  };
  longestStreak?: {
    length: number;
    start: string;
    end: string;
  };
  bestMonth?: {
    name: string;
    hours: number;
    activities: number;
  };
  grindDay?: {
    weekday: string;
    activities: number;
    hours: number;
  };
};

type SleepMetrics = {
  nights: number;
  avgSleepHours: number;
  bestNight?: {
    date: string;
    durationHours: number;
  };
  totalSleepHours: number;
};

type StepsMetrics = {
  weeks: number;
  totalSteps: number;
  avgStepsPerDay: number;
  bestWeek?: { label: string; steps: number };
};

function parseNumber(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  const s = String(value).replace(/,/g, '').trim();
  if (!s) return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseDurationToSeconds(raw: any): number {
  if (!raw) return 0;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  if (!s) return 0;

  if (s.includes(':')) {
    const parts = s.split(':').map((p) => parseInt(p, 10) || 0);
    if (parts.length === 3) {
      const [h, m, sec] = parts;
      return h * 3600 + m * 60 + sec;
    }
    if (parts.length === 2) {
      const [m, sec] = parts;
      return m * 60 + sec;
    }
  }

  const n = parseFloat(s);
  if (!isNaN(n)) {
    if (n > 10000) return n;
    return n * 60;
  }

  return 0;
}

function parseDate(raw: any): Date | null {
  if (!raw) return null;
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;

  const s = String(raw).trim();
  if (!s) return null;

  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  const parts = s.split(/[\/\-]/);
  if (parts.length === 3) {
    const [p1, p2, p3] = parts.map((p) => parseInt(p, 10));
    if (!isNaN(p1) && !isNaN(p2) && !isNaN(p3)) {
      if (p3 < 100) {
        const year = 2000 + p3;
        d = new Date(year, p1 - 1, p2);
      } else {
        d = new Date(p3, p1 - 1, p2);
      }
      if (!isNaN(d.getTime())) return d;
    }
  }

  return null;
}

function formatDateDisplay(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function weekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  const year = d.getUTCFullYear();
  const weekStartMonth = d.getUTCMonth();
  const weekStartDay = d.getUTCDate();
  return `${year}-${weekStartMonth + 1}-${weekStartDay}`;
}

function formatWeekLabel(key: string): string {
  const [y, m, d] = key.split('-').map((x) => parseInt(x, 10));
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return `${start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })} – ${end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}`;
}

function weekdayName(index: number): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[index] || '';
}

function secondsToHms(totalSeconds: number): string {
  const sec = Math.round(totalSeconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/* --------- ACTIVITY METRICS (unchanged logic) --------- */

function computeActivityMetrics(rows: RawRow[]): Metrics {
  let totalActivities = 0;
  let totalDurationSeconds = 0;
  let totalCalories = 0;
  let totalDistanceMiles = 0;
  let totalElevationFeet = 0;

  const bySport = {
    run: { miles: 0, hours: 0 },
    bike: { miles: 0, hours: 0 },
    swim: { distance: 0, hours: 0 },
    strength: { hours: 0 },
    other: { hours: 0 },
  };

  let longestRun: any = null;
  let longestRide: any = null;
  let longestSwim: any = null;

  const weekMap: Record<string, { seconds: number; activities: number }> = {};
  const daySet: Set<string> = new Set();
  const monthMap: Record<string, { seconds: number; activities: number }> = {};
  const weekdayMap: Record<number, { seconds: number; activities: number }> = {};

  rows.forEach((row) => {
    const typeRaw =
      (row['Activity Type'] ??
        row['ActivityType'] ??
        row['Sport'] ??
        '') + '';
    const type = typeRaw.toLowerCase();

    const date =
      parseDate(row['Date']) ||
      parseDate(row['Start Time']) ||
      parseDate(row['Start']) ||
      null;

    const durationSeconds =
      parseDurationToSeconds(row['Elapsed Time']) ||
      parseDurationToSeconds(row['Duration']) ||
      parseDurationToSeconds(row['Time']) ||
      0;

    const rawDistance = parseNumber(
      row['Distance'] ??
        row['Distance (km)'] ??
        row['Distance (mi)'] ??
        row['Distance (m)']
    );

    let distanceMiles = 0;
    if (
      type.includes('track') ||
      type.includes('swim') ||
      type.includes('pool')
    ) {
      const meters = rawDistance;
      distanceMiles = meters / 1609.34;
    } else {
      distanceMiles = rawDistance;
    }

    const calories = parseNumber(
      row['Calories'] ?? row['calories'] ?? row['Energy']
    );

    const elevMeters = parseNumber(
      row['Elevation Gain'] ??
        row['Total Ascent'] ??
        row['Elev Gain'] ??
        row['Elevation Gain (m)']
    );
    const elevFeet = elevMeters * 3.28084;

    if (durationSeconds <= 0 && distanceMiles <= 0 && calories <= 0) {
      return;
    }

    totalActivities += 1;
    totalDurationSeconds += durationSeconds;
    totalCalories += calories;
    totalDistanceMiles += distanceMiles;
    totalElevationFeet += elevFeet;

    let sport: 'run' | 'bike' | 'swim' | 'strength' | 'other' = 'other';
    if (type.includes('run')) sport = 'run';
    else if (type.includes('bike') || type.includes('ride') || type.includes('cycling'))
      sport = 'bike';
    else if (type.includes('swim')) sport = 'swim';
    else if (
      type.includes('strength') ||
      type.includes('weights') ||
      type.includes('conditioning')
    )
      sport = 'strength';

    const hours = durationSeconds / 3600;

    if (sport === 'run') {
      bySport.run.miles += distanceMiles;
      bySport.run.hours += hours;
      if (!longestRun || distanceMiles > longestRun.distanceMiles) {
        longestRun = {
          title: String(row['Title'] || row['Activity Name'] || 'Run'),
          date,
          distanceMiles,
          durationSeconds,
        };
      }
    } else if (sport === 'bike') {
      bySport.bike.miles += distanceMiles;
      bySport.bike.hours += hours;
      if (!longestRide || distanceMiles > longestRide.distanceMiles) {
        longestRide = {
          title: String(row['Title'] || row['Activity Name'] || 'Ride'),
          date,
          distanceMiles,
          durationSeconds,
        };
      }
    } else if (sport === 'swim') {
      bySport.swim.distance += rawDistance;
      bySport.swim.hours += hours;
      if (!longestSwim || rawDistance > longestSwim.distance) {
        longestSwim = {
          title: String(row['Title'] || row['Activity Name'] || 'Swim'),
          date,
          distance: rawDistance,
          durationSeconds,
        };
      }
    } else if (sport === 'strength') {
      bySport.strength.hours += hours;
    } else {
      bySport.other.hours += hours;
    }

    if (date) {
      const key = weekKey(date);
      if (!weekMap[key]) {
        weekMap[key] = { seconds: 0, activities: 0 };
      }
      weekMap[key].seconds += durationSeconds;
      weekMap[key].activities += 1;

      const dayKey = date.toISOString().slice(0, 10);
      daySet.add(dayKey);

      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      if (!monthMap[monthKey]) {
        monthMap[monthKey] = { seconds: 0, activities: 0 };
      }
      monthMap[monthKey].seconds += durationSeconds;
      monthMap[monthKey].activities += 1;

      const weekday = date.getDay();
      if (!weekdayMap[weekday]) {
        weekdayMap[weekday] = { seconds: 0, activities: 0 };
      }
      weekdayMap[weekday].seconds += durationSeconds;
      weekdayMap[weekday].activities += 1;
    }
  });

  let busiestWeek: Metrics['busiestWeek'] | undefined;
  let maxWeekSeconds = 0;
  Object.entries(weekMap).forEach(([key, val]) => {
    if (val.seconds > maxWeekSeconds) {
      maxWeekSeconds = val.seconds;
      busiestWeek = {
        label: formatWeekLabel(key),
        hours: val.seconds / 3600,
        activities: val.activities,
      };
    }
  });

  let longestStreak:
    | {
        length: number;
        start: string;
        end: string;
      }
    | undefined;

  if (daySet.size > 0) {
    const days = Array.from(daySet).sort();
    let bestLen = 1;
    let bestStart = days[0];
    let bestEnd = days[0];
    let curLen = 1;
    let curStart = days[0];

    function dateFromKey(k: string): Date {
      return new Date(k + 'T00:00:00Z');
    }

    for (let i = 1; i < days.length; i++) {
      const prevDate = dateFromKey(days[i - 1]);
      const curDate = dateFromKey(days[i]);
      const diff =
        (curDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        curLen += 1;
      } else {
        if (curLen > bestLen) {
          bestLen = curLen;
          bestStart = curStart;
          bestEnd = days[i - 1];
        }
        curLen = 1;
        curStart = days[i];
      }
    }
    if (curLen > bestLen) {
      bestLen = curLen;
      bestStart = curStart;
      bestEnd = days[days.length - 1];
    }

    longestStreak = {
      length: bestLen,
      start: bestStart,
      end: bestEnd,
    };
  }

  let bestMonth: Metrics['bestMonth'] | undefined;
  let maxMonthSeconds = 0;
  Object.entries(monthMap).forEach(([key, val]) => {
    if (val.seconds > maxMonthSeconds) {
      maxMonthSeconds = val.seconds;
      const [yearStr, monthStr] = key.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const tmpDate = new Date(year, month, 1);
      bestMonth = {
        name: tmpDate.toLocaleDateString(undefined, { month: 'long' }),
        hours: val.seconds / 3600,
        activities: val.activities,
      };
    }
  });

  let grindDay: Metrics['grindDay'] | undefined;
  let maxDayActivities = 0;
  Object.entries(weekdayMap).forEach(([weekdayStr, val]) => {
    if (val.activities > maxDayActivities) {
      maxDayActivities = val.activities;
      const idx = parseInt(weekdayStr, 10);
      grindDay = {
        weekday: weekdayName(idx),
        activities: val.activities,
        hours: val.seconds / 3600,
      };
    }
  });

  return {
    totalActivities,
    totalHours: totalDurationSeconds / 3600,
    totalCalories,
    totalDistanceMiles,
    totalElevationFeet,
    bySport,
    longestRun:
      longestRun && longestRun.distanceMiles > 0
        ? {
            title: longestRun.title,
            date: formatDateDisplay(longestRun.date),
            distanceMiles: longestRun.distanceMiles,
            duration: secondsToHms(longestRun.durationSeconds),
          }
        : undefined,
    longestRide:
      longestRide && longestRide.distanceMiles > 0
        ? {
            title: longestRide.title,
            date: formatDateDisplay(longestRide.date),
            distanceMiles: longestRide.distanceMiles,
            duration: secondsToHms(longestRide.durationSeconds),
          }
        : undefined,
    longestSwim:
      longestSwim && longestSwim.distance > 0
        ? {
            title: longestSwim.title,
            date: formatDateDisplay(longestSwim.date),
            distance: longestSwim.distance,
            duration: secondsToHms(longestSwim.durationSeconds),
          }
        : undefined,
    busiestWeek,
    longestStreak,
    bestMonth,
    grindDay,
  };
}

/* --------- SLEEP METRICS (more robust, auto-detect headers) --------- */

function computeSleepMetrics(rows: RawRow[]): SleepMetrics {
  if (!rows || rows.length === 0) {
    return {
      nights: 0,
      avgSleepHours: 0,
      totalSleepHours: 0,
    };
  }

  const sample = rows.find((r) => r && Object.keys(r).length > 0) || rows[0];
  const keys = Object.keys(sample);

  const durationField =
    keys.find((k) => {
      const l = k.toLowerCase();
      return (
        l.includes('sleep') &&
        (l.includes('time') ||
          l.includes('dur') ||
          l.includes('minutes') ||
          l.includes('mins') ||
          l.includes('min') ||
          l.includes('hours') ||
          l.includes('hrs'))
      );
    }) ||
    keys.find((k) =>
      ['total sleep time', 'duration', 'minutes asleep', 'sleep duration'].includes(
        k
      )
    ) ||
    '';

  const dateField =
    keys.find((k) => k.toLowerCase().includes('date')) ||
    keys.find((k) => k.toLowerCase().includes('day')) ||
    keys.find((k) => k.toLowerCase().includes('start')) ||
    '';

  let nights = 0;
  let totalMinutes = 0;
  let best: { date: Date | null; minutes: number } | null = null;

  rows.forEach((row) => {
    const rawDur = durationField ? row[durationField] : null;
    let minutes = 0;

    if (rawDur != null) {
      const s = String(rawDur).trim();
      if (s) {
        if (s.includes(':')) {
          const secs = parseDurationToSeconds(s);
          minutes = secs / 60;
        } else {
          const n = parseNumber(s);
          if (n > 0) {
            if (n > 24) {
              // assume minutes
              minutes = n;
            } else {
              // assume hours
              minutes = n * 60;
            }
          }
        }
      }
    }

    if (minutes <= 0) return;

    const date = dateField ? parseDate(row[dateField]) : null;

    nights += 1;
    totalMinutes += minutes;

    if (!best || minutes > best.minutes) {
      best = { date, minutes };
    }
  });

  if (nights === 0 || totalMinutes === 0) {
    return {
      nights: 0,
      avgSleepHours: 0,
      totalSleepHours: 0,
    };
  }

  const avgSleepHours = totalMinutes / nights / 60;
  const totalSleepHours = totalMinutes / 60;

  let bestNight: SleepMetrics['bestNight'] | undefined;
  if (best && best.minutes > 0) {
    bestNight = {
      date: formatDateDisplay(best.date),
      durationHours: best.minutes / 60,
    };
  }

  return {
    nights,
    avgSleepHours,
    bestNight,
    totalSleepHours,
  };
}

/* --------- STEPS METRICS (auto-detect headers) --------- */

function computeStepsMetrics(rows: RawRow[]): StepsMetrics {
  if (!rows || rows.length === 0) {
    return {
      weeks: 0,
      totalSteps: 0,
      avgStepsPerDay: 0,
    };
  }

  const sample = rows.find((r) => r && Object.keys(r).length > 0) || rows[0];
  const keys = Object.keys(sample);

  const stepsField =
    keys.find((k) => k.toLowerCase().includes('step')) || 'Steps';

  const daysField =
    keys.find((k) => k.toLowerCase().includes('day')) || '';

  const labelField =
    keys.find((k) => k.toLowerCase().includes('week')) ||
    keys.find((k) => k.toLowerCase().includes('date')) ||
    keys.find((k) => k.toLowerCase().includes('start')) ||
    '';

  let weeks = 0;
  let totalSteps = 0;
  let totalDays = 0;
  let bestWeek: StepsMetrics['bestWeek'] | undefined;

  rows.forEach((row) => {
    const steps = parseNumber(stepsField ? row[stepsField] : undefined);
    if (!steps) return;

    const daysInWeek = daysField ? parseNumber(row[daysField]) || 7 : 7;
    const label = labelField ? String(row[labelField] ?? '') : '';

    weeks += 1;
    totalSteps += steps;
    totalDays += daysInWeek;

    if (!bestWeek || steps > bestWeek.steps) {
      bestWeek = {
        label: label || `Week ${weeks}`,
        steps,
      };
    }
  });

  if (weeks === 0 || totalSteps === 0) {
    return {
      weeks: 0,
      totalSteps: 0,
      avgStepsPerDay: 0,
    };
  }

  const days = totalDays || weeks * 7 || 1;
  const avgStepsPerDay = totalSteps / days;

  return {
    weeks,
    totalSteps,
    avgStepsPerDay,
    bestWeek,
  };
}

/* --------- Small helpers for display --------- */

function formatNumber(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatNumber1(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function StatPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center px-3 py-2 rounded-xl bg-white/10 backdrop-blur border border-white/20 text-xs sm:text-sm">
      <div className="text-white font-semibold">{value}</div>
      <div className="text-white/70">{label}</div>
    </div>
  );
}

/* --------- MAIN COMPONENT --------- */

export default function Home() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [sleepMetrics, setSleepMetrics] = useState<SleepMetrics | null>(null);
  const [stepsMetrics, setStepsMetrics] = useState<StepsMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activitiesFileName, setActivitiesFileName] = useState<string | null>(
    null
  );
  const [sleepFileName, setSleepFileName] = useState<string | null>(null);
  const [stepsFileName, setStepsFileName] = useState<string | null>(null);

  const pageRef = useRef<HTMLDivElement | null>(null);

  const handleActivitiesUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setActivitiesFileName(file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const rows = results.data as RawRow[];
          const m = computeActivityMetrics(rows);
          setMetrics(m);
        } catch (e: any) {
          console.error(e);
          setError('Failed to parse activities CSV. Check formatting and try again.');
        }
      },
      error: (err) => {
        console.error(err);
        setError('Error reading activities file.');
      },
    });
  };

  const handleSleepUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setSleepFileName(file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const rows = results.data as RawRow[];
          const m = computeSleepMetrics(rows);
          setSleepMetrics(m);
        } catch (e: any) {
          console.error(e);
          setError('Failed to parse sleep CSV. Check formatting and try again.');
        }
      },
      error: (err) => {
        console.error(err);
        setError('Error reading sleep file.');
      },
    });
  };

  const handleStepsUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setStepsFileName(file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const rows = results.data as RawRow[];
          const m = computeStepsMetrics(rows);
          setStepsMetrics(m);
        } catch (e: any) {
          console.error(e);
          setError('Failed to parse steps CSV. Check formatting and try again.');
        }
      },
      error: (err) => {
        console.error(err);
        setError('Error reading steps file.');
      },
    });
  };

  const handleDownloadImage = async () => {
    if (!pageRef.current) return;
    try {
      const dataUrl = await htmlToImage.toPng(pageRef.current, {
        cacheBust: true,
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'garmin-wrapped.png';
      link.click();
    } catch (e) {
      console.error(e);
      alert('Failed to generate image. Try again or zoom out a little.');
    }
  };

  const hasData = !!metrics;

  return (
    <div
      ref={pageRef}
      className="min-h-screen bg-slate-950 text-white flex flex-col items-center pb-16"
    >
      {/* Top bar / upload controls */}
      <header className="w-full max-w-5xl px-4 pt-8 pb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Garmin Wrapped <span className="text-emerald-400">2025</span>
          </h1>
          <p className="text-sm text-slate-300 mt-1">
            Upload your Garmin exports to turn your year into a mini data movie.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 justify-start sm:justify-end">
          <label className="cursor-pointer text-xs sm:text-sm px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 transition flex items-center gap-2">
            <Activity className="w-4 h-4" />
            <span>Activities CSV</span>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleActivitiesUpload}
            />
          </label>
          <label className="cursor-pointer text-xs sm:text-sm px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition flex items-center gap-2">
            <Footprints className="w-4 h-4" />
            <span>Steps CSV</span>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleStepsUpload}
            />
          </label>
          <label className="cursor-pointer text-xs sm:text-sm px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition flex items-center gap-2">
            <Moon className="w-4 h-4" />
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
            className="text-xs sm:text-sm px-3 py-2 rounded-lg border border-white/30 hover:bg-white/10 flex items-center gap-2"
          >
            <Watch className="w-4 h-4" />
            <span>Download as image</span>
          </button>
        </div>
      </header>

      {/* Filenames / error */}
      <div className="w-full max-w-5xl px-4 text-xs text-slate-300 space-y-1">
        {activitiesFileName && (
          <div>
            Activities:{' '}
            <span className="text-emerald-300">{activitiesFileName}</span>
          </div>
        )}
        {stepsFileName && (
          <div>
            Steps: <span className="text-blue-300">{stepsFileName}</span>
          </div>
        )}
        {sleepFileName && (
          <div>
            Sleep: <span className="text-indigo-300">{sleepFileName}</span>
          </div>
        )}
        {error && <div className="text-red-400 mt-1">{error}</div>}
      </div>

      {!hasData && (
        <main className="flex-1 flex items-center justify-center w-full max-w-5xl px-4 pt-8 text-center">
          <div className="max-w-lg">
            <p className="text-slate-300 mb-4">
              Start by uploading your{' '}
              <span className="font-semibold">Activities CSV</span> from Garmin. Then
              add Steps and Sleep for the full &quot;Wrapped&quot; experience.
            </p>
            <p className="text-slate-500 text-sm">
              Tip: Use the standard Garmin export for activities. For steps and sleep,
              weekly or monthly CSVs work fine.
            </p>
          </div>
        </main>
      )}

      {hasData && metrics && (
        <main className="w-full max-w-5xl px-4 pt-6 space-y-6">
          {/* Hero tile */}
          <section className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-blue-600 via-emerald-500 to-slate-900 p-6 sm:p-8">
            <div className="absolute inset-0 opacity-20 pointer-events-none">
              <div className="absolute w-64 h-64 border border-white/40 rounded-full -left-10 top-10" />
              <div className="absolute w-80 h-80 border border-white/30 rounded-full left-1/3 -top-20" />
              <div className="absolute w-96 h-96 border border-white/20 rounded-full right-0 bottom-0" />
              <Footprints className="absolute w-10 h-10 text-white/40 top-10 left-6" />
              <Bike className="absolute w-10 h-10 text-white/40 bottom-10 right-8" />
              <Dumbbell className="absolute w-10 h-10 text-white/40 bottom-6 left-1/2" />
            </div>

            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="flex-1">
                <div className="text-xs font-semibold tracking-[0.2em] text-white/80 mb-1">
                  JORDAN&apos;S
                </div>
                <h2 className="text-3xl sm:text-4xl font-semibold text-white leading-tight">
                  Garmin Wrapped <span className="text-emerald-200">2025</span>
                </h2>
                <p className="mt-2 text-sm text-white/80 max-w-md">
                  Your watch wasn&apos;t just keeping time. It was keeping score.
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <StatPill
                    label="Activities"
                    value={formatNumber(metrics.totalActivities)}
                  />
                  <StatPill
                    label="Training time"
                    value={`${formatNumber1(metrics.totalHours)} hrs`}
                  />
                  <StatPill
                    label="Calories burned"
                    value={`${formatNumber(metrics.totalCalories)} kcal`}
                  />
                  <StatPill
                    label="Distance travelled"
                    value={`${formatNumber1(metrics.totalDistanceMiles)} mi`}
                  />
                  {stepsMetrics && stepsMetrics.totalSteps > 0 && (
                    <StatPill
                      label="Steps taken"
                      value={`${formatNumber(stepsMetrics.totalSteps)}`}
                    />
                  )}
                </div>
              </div>

              <div className="flex-1 flex justify-center sm:justify-end">
                <div className="w-52 h-52 sm:w-60 sm:h-60 rounded-full border-4 border-white/60 bg-white/10 backdrop-blur flex flex-col items-center justify-center shadow-2xl">
                  <div className="text-xs uppercase tracking-[0.2em] text-white/70 mb-2">
                    YEAR SUMMARY
                  </div>
                  <div className="text-4xl font-semibold text-white mb-1">
                    {formatNumber(metrics.totalActivities)}
                  </div>
                  <div className="text-xs text-white/80 mb-4">
                    logged activities
                  </div>
                  <div className="flex gap-3 text-xs text-white/80">
                    <div className="flex items-center gap-1">
                      <Activity className="w-3 h-3" />
                      <span>{formatNumber1(metrics.bySport.run.miles)} mi run</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Bike className="w-3 h-3" />
                      <span>{formatNumber1(metrics.bySport.bike.miles)} mi ride</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Steps + Equivalent distance */}
          <section className="grid gap-4 md:grid-cols-2">
            {/* Steps card */}
            <div className="relative rounded-3xl bg-gradient-to-br from-indigo-900 via-purple-800 to-slate-900 p-6 overflow-hidden">
              <div className="absolute inset-0 opacity-10 pointer-events-none">
                {Array.from({ length: 18 }).map((_, i) => (
                  <Footprints
                    key={i}
                    className="absolute w-8 h-8 text-white"
                    style={{
                      left: `${(i * 17) % 100}%`,
                      top: `${(i * 23) % 100}%`,
                      transform: `rotate(${i * 32}deg)`,
                    }}
                  />
                ))}
              </div>

              <div className="relative">
                <h3 className="text-sm uppercase tracking-[0.2em] text-white/70 mb-1 flex items-center gap-2">
                  <Footprints className="w-4 h-4" />
                  Steps Wrapped
                </h3>
                <div className="text-2xl font-semibold mb-4">Just a quick walk…</div>

                {stepsMetrics && stepsMetrics.totalSteps > 0 ? (
                  <>
                    <div className="bg-black/30 border border-white/20 rounded-2xl p-4 mb-4">
                      <div className="text-xs text-white/70 uppercase tracking-wide mb-1">
                        Total steps
                      </div>
                      <div className="text-3xl font-semibold text-white">
                        {formatNumber(stepsMetrics.totalSteps)}
                      </div>
                      <div className="text-xs text-white/60 mt-1">
                        ~{formatNumber(stepsMetrics.avgStepsPerDay)} steps per day
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {stepsMetrics.bestWeek && (
                        <div className="bg-white/10 rounded-xl p-3 border border-white/20">
                          <div className="text-white/70 mb-1">Best week</div>
                          <div className="text-white font-semibold text-lg">
                            {formatNumber(stepsMetrics.bestWeek.steps)}
                          </div>
                          <div className="text-white/60 text-[0.7rem] mt-1">
                            {stepsMetrics.bestWeek.label}
                          </div>
                        </div>
                      )}
                      <div className="bg-white/10 rounded-xl p-3 border border-white/20 flex flex-col justify-between">
                        <div>
                          <div className="text-white/70 mb-1">Pace of life</div>
                          <div className="text-white text-sm">
                            {stepsMetrics.avgStepsPerDay >= 10000
                              ? 'Certified 10k club.'
                              : stepsMetrics.avgStepsPerDay >= 7000
                              ? 'Quietly consistent.'
                              : 'Plenty of time to level up.'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-white/60 italic">
                      That&apos;s a lot of &quot;I&apos;m just going to stretch my
                      legs.&quot;
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-200">
                    Upload a Steps CSV to see total steps, best week, and your day-to-day
                    walking vibe.
                  </p>
                )}
              </div>
            </div>

            {/* Distance equivalents */}
            <div className="relative rounded-3xl bg-gradient-to-br from-cyan-600 via-blue-700 to-indigo-900 p-6 overflow-hidden">
              <div className="absolute inset-0 opacity-20 pointer-events-none">
                <Globe2 className="absolute w-16 h-16 text-white/40 top-6 left-6" />
                <Mountain className="absolute w-16 h-16 text-white/30 bottom-8 right-6" />
              </div>

              <div className="relative">
                <div className="text-xs uppercase tracking-[0.2em] text-white/70 mb-1">
                  How far did you
                </div>
                <h3 className="text-2xl font-semibold text-white mb-4">
                  really go?
                </h3>

                <div className="bg-white/10 rounded-2xl p-4 border border-white/20 mb-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Globe2 className="w-6 h-6 text-cyan-200" />
                    <div className="text-sm text-white/80">Distance on foot</div>
                  </div>
                  <div className="text-3xl font-semibold text-white mb-2">
                    {formatNumber1(metrics.totalDistanceMiles)} miles
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-black/30 rounded-xl p-3 border border-cyan-400/40 border-l-4">
                      <div className="text-white text-xl">
                        ~{formatNumber1(metrics.totalDistanceMiles / 26.2)}
                      </div>
                      <div className="text-cyan-100 mt-1">marathons</div>
                    </div>
                    <div className="bg-black/30 rounded-xl p-3 border border-cyan-400/40 border-l-4">
                      <div className="text-white text-xl">
                        ~
                        {formatNumber(
                          Math.round(
                            (metrics.totalDistanceMiles * 1609.34) / 5000
                          )
                        )}
                      </div>
                      <div className="text-cyan-100 mt-1">5k races</div>
                    </div>
                  </div>
                </div>

                <div className="bg-white/10 rounded-2xl p-4 border border-white/20">
                  <div className="flex items-center gap-3 mb-3">
                    <Mountain className="w-6 h-6 text-orange-200" />
                    <div className="text-sm text-white/80">Elevation gained</div>
                  </div>
                  <div className="text-3xl font-semibold text-white mb-2">
                    {formatNumber(Math.round(metrics.totalElevationFeet))} ft
                  </div>
                  <div className="text-xs text-white/70">
                    That&apos;s about{' '}
                    <span className="font-semibold">
                      {formatNumber1(metrics.totalElevationFeet / 29029)}
                    </span>{' '}
                    × Mount Everest.
                  </div>
                  <div className="mt-2 text-xs text-white/60 italic">
                    You vs. gravity: scoreboard heavily favors you.
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Sport-specific tiles */}
          <section className="grid gap-4 md:grid-cols-3">
            {/* Running */}
            <div className="relative rounded-3xl bg-gradient-to-br from-red-600 via-orange-500 to-pink-600 p-5 overflow-hidden">
              <div className="absolute inset-0 opacity-20 pointer-events-none">
                <svg
                  className="w-full h-full"
                  preserveAspectRatio="none"
                  viewBox="0 0 400 200"
                >
                  <path
                    d="M 0 180 Q 100 120 200 140 T 400 150"
                    stroke="white"
                    strokeWidth="40"
                    fill="none"
                  />
                  <path
                    d="M 0 185 Q 100 125 200 145 T 400 155"
                    stroke="white"
                    strokeWidth="4"
                    fill="none"
                    strokeDasharray="10 8"
                  />
                </svg>
              </div>
              <div className="relative">
                <div className="flex items-center gap-2 text-xs text-white/80 mb-2">
                  <Activity className="w-4 h-4" />
                  RUNNING
                </div>
                <div className="text-2xl font-semibold mb-2">
                  {formatNumber1(metrics.bySport.run.miles)} miles
                </div>
                <div className="text-xs text-white/80 mb-3">
                  {formatNumber1(metrics.bySport.run.hours)} hours on your feet.
                </div>
                {metrics.longestRun && (
                  <div className="bg-white/10 rounded-xl p-3 border border-white/30 text-xs">
                    <div className="text-yellow-200 uppercase tracking-wide mb-1">
                      Longest run
                    </div>
                    <div className="text-white text-lg font-semibold">
                      {formatNumber1(metrics.longestRun.distanceMiles)} mi
                    </div>
                    <div className="text-white/80">
                      {metrics.longestRun.date} – {metrics.longestRun.title}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Cycling */}
            <div className="relative rounded-3xl bg-gradient-to-br from-green-600 via-teal-500 to-cyan-700 p-5 overflow-hidden">
              <div className="absolute inset-0 opacity-10 pointer-events-none">
                <Bike className="absolute w-20 h-20 text-white/60 bottom-4 left-4" />
              </div>
              <div className="relative">
                <div className="flex items-center gap-2 text-xs text-white/80 mb-2">
                  <Bike className="w-4 h-4" />
                  CYCLING
                </div>
                <div className="text-2xl font-semibold mb-2">
                  {formatNumber1(metrics.bySport.bike.miles)} miles
                </div>
                <div className="text-xs text-white/80 mb-3">
                  {formatNumber1(metrics.bySport.bike.hours)} hours in the saddle.
                </div>
                {metrics.longestRide && (
                  <div className="bg-white/10 rounded-xl p-3 border border-white/30 text-xs">
                    <div className="text-emerald-200 uppercase tracking-wide mb-1">
                      Longest ride
                    </div>
                    <div className="text-white text-lg font-semibold">
                      {formatNumber1(metrics.longestRide.distanceMiles)} mi
                    </div>
                    <div className="text-white/80">
                      {metrics.longestRide.date} – {metrics.longestRide.title}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Swimming */}
            <div className="relative rounded-3xl bg-gradient-to-br from-blue-500 via-cyan-500 to-blue-800 p-5 overflow-hidden">
              <div className="absolute inset-0 opacity-20 pointer-events-none">
                <div className="grid grid-cols-6 grid-rows-8 w-full h-full">
                  {Array.from({ length: 48 }).map((_, i) => (
                    <div key={i} className="border border-white/30" />
                  ))}
                </div>
              </div>
              <div className="relative">
                <div className="flex items-center gap-2 text-xs text-white/80 mb-2">
                  <Activity className="w-4 h-4" />
                  SWIMMING
                </div>
                <div className="text-2xl font-semibold mb-2">
                  {formatNumber(metrics.bySport.swim.distance)} total (m/yd)
                </div>
                <div className="text-xs text-white/80 mb-3">
                  {formatNumber1(metrics.bySport.swim.hours)} hours staring at the black
                  line.
                </div>
                {metrics.longestSwim && (
                  <div className="bg-white/10 rounded-xl p-3 border border-white/30 text-xs">
                    <div className="text-cyan-200 uppercase tracking-wide mb-1">
                      Longest swim
                    </div>
                    <div className="text-white text-lg font-semibold">
                      {formatNumber(metrics.longestSwim.distance)}
                    </div>
                    <div className="text-white/80">
                      {metrics.longestSwim.date} – {metrics.longestSwim.title}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Strength + Consistency */}
          <section className="grid gap-4 md:grid-cols-2">
            {/* Strength */}
            <div className="relative rounded-3xl bg-gradient-to-br from-gray-900 via-slate-800 to-black p-6 overflow-hidden">
              <div className="absolute inset-0 opacity-15 pointer-events-none">
                <Dumbbell className="absolute w-20 h-20 text-white/50 top-4 right-6" />
              </div>
              <div className="relative">
                <div className="flex items-center gap-2 text-xs text-white/80 mb-2">
                  <Dumbbell className="w-4 h-4" />
                  STRENGTH & SUPPORT
                </div>
                <div className="text-2xl font-semibold mb-2">
                  {formatNumber1(metrics.bySport.strength.hours)} hours lifting
                </div>
                <div className="text-xs text-white/80 mb-3">
                  Enough to make Future-You&apos;s joints send a thank-you note.
                </div>
                <div className="flex gap-3 text-xs">
                  <div className="bg-red-500/20 border border-red-500/40 px-3 py-2 rounded-xl">
                    <div className="text-red-200 text-[0.7rem] uppercase">
                      Strength
                    </div>
                    <div className="text-white font-semibold">
                      {formatNumber1(metrics.bySport.strength.hours)} hrs
                    </div>
                  </div>
                  <div className="bg-emerald-500/20 border border-emerald-500/40 px-3 py-2 rounded-xl">
                    <div className="text-emerald-200 text-[0.7rem] uppercase">
                      Other work
                    </div>
                    <div className="text-white font-semibold">
                      {formatNumber1(metrics.bySport.other.hours)} hrs
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Consistency / streaks */}
            <div className="relative rounded-3xl bg-gradient-to-br from-orange-600 via-red-600 to-purple-900 p-6 overflow-hidden">
              <div className="absolute inset-0 opacity-15 pointer-events-none">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Flame
                    key={i}
                    className="absolute w-6 h-6 text-white"
                    style={{
                      left: `${10 + i * 12}%`,
                      top: `${30 + (i % 3) * 15}%`,
                    }}
                  />
                ))}
              </div>
              <div className="relative">
                <div className="flex items-center gap-2 text-xs text-white/80 mb-2">
                  <Flame className="w-4 h-4" />
                  CONSISTENCY FLEX
                </div>
                {metrics.longestStreak ? (
                  <>
                    <div className="text-2xl font-semibold mb-1">
                      {metrics.longestStreak.length}-day streak
                    </div>
                    <div className="text-xs text-white/80 mb-3">
                      {metrics.longestStreak.start} → {metrics.longestStreak.end}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-white/80 mb-3">
                    You had on-and-off bursts of training energy. The raw material for a
                    big streak next year.
                  </div>
                )}
                {metrics.busiestWeek && (
                  <div className="bg-white/10 rounded-xl p-3 border border-white/30 text-xs mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-4 h-4 text-yellow-300" />
                      <div className="text-yellow-200 uppercase tracking-wide text-[0.7rem]">
                        Busiest week
                      </div>
                    </div>
                    <div className="text-white text-sm">{metrics.busiestWeek.label}</div>
                    <div className="mt-1 text-white/80">
                      {formatNumber1(metrics.busiestWeek.hours)} hrs across{' '}
                      {metrics.busiestWeek.activities} activities.
                    </div>
                  </div>
                )}
                {metrics.grindDay && (
                  <div className="text-xs text-white/80">
                    Your grind day:{' '}
                    <span className="font-semibold">{metrics.grindDay.weekday}</span> –
                    when most of the work quietly got done.
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Most-you month & Boss workouts */}
          <section className="grid gap-4 md:grid-cols-2">
            {/* Most-you times */}
            <div className="relative rounded-3xl bg-gradient-to-br from-purple-600 via-pink-600 to-rose-700 p-6 overflow-hidden">
              <div className="absolute inset-0 opacity-15 pointer-events-none">
                <div className="grid grid-cols-7 grid-rows-5 w-full h-full">
                  {Array.from({ length: 35 }).map((_, i) => (
                    <div key={i} className="border border-white/20" />
                  ))}
                </div>
              </div>
              <div className="relative">
                <div className="flex items-center gap-2 text-xs text-white/80 mb-2">
                  <Calendar className="w-4 h-4" />
                  YOUR MOST &quot;YOU&quot; TIMES
                </div>
                {metrics.bestMonth ? (
                  <>
                    <div className="text-2xl font-semibold mb-2">
                      {metrics.bestMonth.name}
                    </div>
                    <div className="text-xs text-white/80 mb-3">
                      {formatNumber1(metrics.bestMonth.hours)} hours /{' '}
                      {metrics.bestMonth.activities} activities.
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-white/80 mb-3">
                    You spread the love pretty evenly this year. No single month hogged
                    all the gains.
                  </div>
                )}
                {metrics.grindDay && (
                  <div className="bg-white/10 rounded-xl p-3 border border-white/30 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-4 h-4 text-emerald-300" />
                      <div className="text-emerald-200 uppercase tracking-wide text-[0.7rem]">
                        Grind day
                      </div>
                    </div>
                    <div className="text-white">
                      {metrics.grindDay.weekday} – {formatNumber1(metrics.grindDay.hours)}{' '}
                      hrs / {metrics.grindDay.activities} activities.
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Boss workouts */}
            <div className="relative rounded-3xl bg-gradient-to-br from-slate-900 via-gray-800 to-black p-6 overflow-hidden">
              <div className="absolute inset-0 opacity-15 pointer-events-none">
                <Mountain className="absolute w-16 h-16 text-white/40 top-4 left-4" />
                <Flag className="absolute w-16 h-16 text-white/40 bottom-6 right-4" />
              </div>
              <div className="relative">
                <div className="flex items-center gap-2 text-xs text-white/80 mb-2">
                  <Mountain className="w-4 h-4" />
                  BOSS LEVEL WORKOUTS
                </div>
                <div className="space-y-3 text-xs">
                  {metrics.longestRun && (
                    <div className="bg-gradient-to-r from-red-500/30 to-pink-500/30 rounded-xl p-3 border border-red-400/40">
                      <div className="flex items-center gap-2 mb-1">
                        <Footprints className="w-4 h-4 text-red-200" />
                        <span className="text-red-100 uppercase tracking-wide text-[0.7rem]">
                          Longest run
                        </span>
                      </div>
                      <div className="text-white text-lg font-semibold">
                        {formatNumber1(metrics.longestRun.distanceMiles)} mi
                      </div>
                      <div className="text-white/80">{metrics.longestRun.title}</div>
                      <div className="text-white/60 text-[0.7rem]">
                        {metrics.longestRun.date} · {metrics.longestRun.duration}
                      </div>
                    </div>
                  )}

                  {metrics.longestRide && (
                    <div className="bg-gradient-to-r from-emerald-500/30 to-teal-500/30 rounded-xl p-3 border border-emerald-400/40">
                      <div className="flex items-center gap-2 mb-1">
                        <Bike className="w-4 h-4 text-emerald-200" />
                        <span className="text-emerald-100 uppercase tracking-wide text-[0.7rem]">
                          Longest ride
                        </span>
                      </div>
                      <div className="text-white text-lg font-semibold">
                        {formatNumber1(metrics.longestRide.distanceMiles)} mi
                      </div>
                      <div className="text-white/80">{metrics.longestRide.title}</div>
                      <div className="text-white/60 text-[0.7rem]">
                        {metrics.longestRide.date} · {metrics.longestRide.duration}
                      </div>
                    </div>
                  )}

                  {metrics.longestSwim && (
                    <div className="bg-gradient-to-r from-cyan-500/30 to-blue-500/30 rounded-xl p-3 border border-cyan-400/40">
                      <div className="flex items-center gap-2 mb-1">
                        <Activity className="w-4 h-4 text-cyan-200" />
                        <span className="text-cyan-100 uppercase tracking-wide text-[0.7rem]">
                          Longest swim
                        </span>
                      </div>
                      <div className="text-white text-lg font-semibold">
                        {formatNumber(metrics.longestSwim.distance)}
                      </div>
                      <div className="text-white/80">{metrics.longestSwim.title}</div>
                      <div className="text-white/60 text-[0.7rem]">
                        {metrics.longestSwim.date} · {metrics.longestSwim.duration}
                      </div>
                    </div>
                  )}
                </div>
                <p className="mt-3 text-xs text-white/70 italic">
                  If Garmin had a &quot;Boss Fight&quot; badge, these would be it.
                </p>
              </div>
            </div>
          </section>

          {/* Sleep Wrapped */}
          <section className="mt-4 rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 p-6 overflow-hidden">
            <div className="flex items-center gap-2 text-xs text-white/80 mb-3">
              <Moon className="w-4 h-4" />
              SLEEP WRAPPED
            </div>

            {sleepMetrics && sleepMetrics.totalSleepHours > 0 ? (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <div className="text-xs text-white/70 uppercase mb-1">
                    Total sleep
                  </div>
                  <div className="text-2xl font-semibold text-white">
                    {formatNumber1(sleepMetrics.totalSleepHours)} hrs
                  </div>
                  <div className="text-xs text-white/60 mt-1">
                    Across {sleepMetrics.nights} tracked nights.
                  </div>
                </div>

                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <div className="text-xs text-white/70 uppercase mb-1">
                    Average per night
                  </div>
                  <div className="text-2xl font-semibold text-white">
                    {formatNumber1(sleepMetrics.avgSleepHours)} hrs
                  </div>
                  <div className="text-xs text-white/60 mt-1">
                    {sleepMetrics.avgSleepHours >= 8
                      ? 'Elite slumber athlete.'
                      : sleepMetrics.avgSleepHours >= 7
                      ? 'Pretty solid recovery game.'
                      : 'You did more with less than you should have.'}
                  </div>
                </div>

                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <div className="text-xs text-white/70 uppercase mb-1">
                    Best night
                  </div>
                  {sleepMetrics.bestNight ? (
                    <>
                      <div className="text-2xl font-semibold text-white">
                        {formatNumber1(sleepMetrics.bestNight.durationHours)} hrs
                      </div>
                      <div className="text-xs text-white/60 mt-1">
                        {sleepMetrics.bestNight.date}
                      </div>
                      <div className="text-xs text-white/60 mt-2 italic">
                        Your body absolutely bookmarked that one.
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-white/60">
                      No standout night, just a rolling average of &quot;I&apos;m
                      doing my best.&quot;
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-200">
                Upload a Sleep CSV to see how your recovery stacked up against all that
                training.
              </p>
            )}
          </section>

          {/* Closing */}
          <section className="mt-2 rounded-3xl bg-gradient-to-r from-indigo-800 via-purple-800 to-slate-900 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="text-xs text-white/70 uppercase mb-1">
                2025 wrapped up
              </div>
              <div className="text-xl font-semibold text-white mb-1">
                The only goal for 2026:
              </div>
              <div className="text-lg text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-pink-300">
                make Future You impressed.
              </div>
              <p className="text-xs text-white/70 mt-2">
                More steps, more miles, more sleep… or just more fun. Your call.
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-white/70">
              <Watch className="w-5 h-5" />
              <span>See you next year, coach.</span>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
