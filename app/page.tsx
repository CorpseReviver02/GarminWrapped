"use client";

import React, { useState, useRef } from "react";
import Papa from "papaparse";
import * as htmlToImage from "html-to-image";
import {
  Activity,
  Zap,
  Moon,
  Footprints,
  Dumbbell,
  ArrowDownToLine,
  UploadCloud,
} from "lucide-react";

type CsvRow = Record<string, any>;

interface SportBestEffort {
  title: string;
  subtitle: string;
  statLabel: string;
}

interface SportSummary {
  distanceMi: number;
  timeHours: number;
  avgPaceLabel: string;
  bestEffort: SportBestEffort | null;
}

interface LongestActivitySummary {
  title: string;
  dateLabel: string;
  durationLabel: string;
  distanceLabel: string;
  caloriesLabel: string;
}

interface HighestCalorieSummary {
  title: string;
  dateLabel: string;
  durationLabel: string;
  caloriesLabel: string;
}

interface StreakSummary {
  days: number;
  startLabel: string;
  endLabel: string;
}

interface BusiestWeekSummary {
  rangeLabel: string;
  hoursLabel: string;
  activitiesLabel: string;
}

interface ActivityMetrics {
  totalActivities: number;
  totalDistanceMi: number;
  totalTimeHours: number;
  totalCalories: number;
  running: SportSummary;
  cycling: SportSummary;
  swimming: SportSummary;
  verticalGainFt: number;
  highestElevationFt: number;
  longestActivity: LongestActivitySummary | null;
  highestCalorie: HighestCalorieSummary | null;
  longestStreak: StreakSummary | null;
  busiestWeek: BusiestWeekSummary | null;
  yearLabel: string;
}

interface StepsMetrics {
  totalSteps: number;
  weeksOfData: number;
  avgPerDay: number;
  bestWeekSteps: number;
  bestWeekLabel: string;
  distanceFromStepsMi: number;
}

interface SleepMetrics {
  weeksOfData: number;
  avgSleepHours: number;
  avgSleepScore: number;
  bestWeekHours: number;
  bestWeekLabel: string;
}

// ---------- helpers ----------

function parseNumber(val: any): number {
  if (val === null || val === undefined) return 0;
  const s = String(val).trim();
  if (!s || s === "--") return 0;
  const cleaned = s.replace(/,/g, "").replace(/[^\d.\-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseTimeToSeconds(val: any): number {
  if (val === null || val === undefined) return 0;
  let s = String(val).trim();
  if (!s || s === "--") return 0;
  if (s.includes(".") && s.includes(":")) {
    s = s.split(".")[0];
  }
  const parts = s.split(":").map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return 0;
  let h = 0,
    m = 0,
    sec = 0;
  if (parts.length === 3) {
    [h, m, sec] = parts;
  } else if (parts.length === 2) {
    [m, sec] = parts;
  } else if (parts.length === 1) {
    sec = parts[0];
  }
  return h * 3600 + m * 60 + sec;
}

function parseDateOnly(val: any): Date | null {
  if (val === null || val === undefined) return null;
  let s = String(val).trim();
  if (!s) return null;

  // If it's a range like "Jan 11-17", keep first part
  if (s.includes("-")) {
    const parts = s.split("-");
    if (parts.length > 1 && /\d/.test(parts[1])) {
      s = parts[0].trim();
    }
  }

  // If it has a time, keep the date part
  if (s.includes(" ")) {
    s = s.split(" ")[0];
  }

  const slashParts = s.split("/");
  if (slashParts.length === 3) {
    let [m, d, y] = slashParts;
    let year = parseInt(y, 10);
    const month = parseInt(m, 10);
    const day = parseInt(d, 10);
    if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
      if (year < 100) year += 2000;
      return new Date(year, month - 1, day);
    }
  }

  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatDateDisplay(date: Date | null): string {
  if (!date) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateRange(start: Date | null, end: Date | null): string {
  if (!start || !end) return "";
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = start.getMonth() === end.getMonth();
  const startPart = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
  const endPart = end.toLocaleDateString("en-US", {
    month: sameMonth ? undefined : "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startPart} — ${endPart}`;
}

function formatHoursLabel(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0 h";
  return `${Math.round(hours)} h`;
}

function formatFeetLabel(ft: number): string {
  if (!Number.isFinite(ft) || ft <= 0) return "0 ft";
  return `${ft.toLocaleString("en-US")} ft`;
}

function formatPacePerMile(totalSeconds: number, miles: number): string {
  if (!Number.isFinite(totalSeconds) || !Number.isFinite(miles) || miles <= 0) {
    return "—";
  }
  const secPerMile = totalSeconds / miles;
  const mins = Math.floor(secPerMile / 60);
  const sec = Math.round(secPerMile % 60);
  return `${mins}:${sec.toString().padStart(2, "0")}/mi`;
}

function formatMph(miles: number, seconds: number): string {
  if (!Number.isFinite(miles) || !Number.isFinite(seconds) || seconds <= 0) {
    return "—";
  }
  const mph = miles / (seconds / 3600);
  return `${mph.toFixed(1)} mph`;
}

function formatSwimPacePer100m(seconds: number, meters: number): string {
  if (!Number.isFinite(seconds) || !Number.isFinite(meters) || meters <= 0) {
    return "—";
  }
  const secPer100 = seconds / (meters / 100);
  const mins = Math.floor(secPer100 / 60);
  const sec = Math.round(secPer100 % 60);
  return `${mins}:${sec.toString().padStart(2, "0")}/100m`;
}

function parseSleepDurationHours(raw: any): number {
  if (raw === null || raw === undefined) return 0;
  const s = String(raw);
  const hMatch = s.match(/(\d+)\s*h/);
  const mMatch = s.match(/(\d+)\s*min/);
  const h = hMatch ? parseInt(hMatch[1], 10) : 0;
  const m = mMatch ? parseInt(mMatch[1], 10) : 0;
  if (!h && !m) {
    return parseNumber(raw);
  }
  return h + m / 60;
}

function formatHoursDecimal(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0 h";
  return `${hours.toFixed(1)} h`;
}

function formatSteps(n: number): string {
  return n.toLocaleString("en-US");
}

function formatDistanceMiles(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 mi";
  return `${Math.round(n).toLocaleString("en-US")} mi`;
}

async function parseCsvFile(file: File): Promise<CsvRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = (results.data || []).filter((row) =>
          Object.values(row).some(
            (v) => v !== null && v !== undefined && String(v).trim() !== ""
          )
        );
        resolve(rows);
      },
      error: (err) => reject(err),
    });
  });
}

// ---------- metrics: activities ----------

function computeActivityMetrics(rows: CsvRow[]): ActivityMetrics | null {
  if (!rows.length) return null;

  type Norm = {
    row: CsvRow;
    type: string;
    date: Date | null;
    miles: number;
    meters: number;
    timeSec: number;
    ascentFt: number;
    maxElevationFt: number;
    calories: number;
    isRun: boolean;
    isCycle: boolean;
    isSwim: boolean;
  };

  const meterTypes = new Set(["Track Running", "Swimming", "Open Water Swimming", "Pool Swim"]);

  const norm: Norm[] = rows
    .map((row) => {
      const type = String(row["Activity Type"] ?? "").trim();
      const distanceVal = row["Distance"];
      const timeVal = row["Time"] ?? row["Elapsed Time"] ?? "";
      const ascentVal = row["Total Ascent"] ?? row["Elevation Gain"] ?? "";
      const maxElevVal = row["Max Elevation"] ?? "";
      const caloriesVal = row["Calories"] ?? "";
      const dateVal = row["Date"];

      const distanceNum = parseNumber(distanceVal);
      const timeSec = parseTimeToSeconds(timeVal);
      const ascentFt = parseNumber(ascentVal);
      const maxElevationFt = parseNumber(maxElevVal);
      const calories = parseNumber(caloriesVal);
      const date = parseDateOnly(dateVal);

      const isMeter = meterTypes.has(type);
      const miles = isMeter ? distanceNum / 1609.344 : distanceNum;
      const meters = isMeter ? distanceNum : miles * 1609.344;

      const isRun = /running/i.test(type);
      const isCycle = /cycling/i.test(type);
      const isSwim = /swim/i.test(type) || type === "Swimming";

      return {
        row,
        type,
        date,
        miles,
        meters,
        timeSec,
        ascentFt,
        maxElevationFt,
        calories,
        isRun,
        isCycle,
        isSwim,
      };
    })
    .filter((a) => a.miles > 0 || a.timeSec > 0 || a.calories > 0);

  if (!norm.length) return null;

  const totalActivities = norm.length;
  const totalDistanceMi = norm.reduce((s, a) => s + a.miles, 0);
  const totalTimeSec = norm.reduce((s, a) => s + a.timeSec, 0);
  const totalTimeHours = totalTimeSec / 3600;
  const totalCalories = norm.reduce((s, a) => s + a.calories, 0);

  const runActs = norm.filter((a) => a.isRun);
  const cycleActs = norm.filter((a) => a.isCycle);
  const swimActs = norm.filter((a) => a.isSwim);

  const sumMiles = (arr: Norm[]) => arr.reduce((s, a) => s + a.miles, 0);
  const sumTime = (arr: Norm[]) => arr.reduce((s, a) => s + a.timeSec, 0);
  const sumMeters = (arr: Norm[]) => arr.reduce((s, a) => s + a.meters, 0);

  const runningMiles = sumMiles(runActs);
  const runningTimeSec = sumTime(runActs);

  const cyclingMiles = sumMiles(cycleActs);
  const cyclingTimeSec = sumTime(cycleActs);

  const swimmingMiles = sumMiles(swimActs);
  const swimmingTimeSec = sumTime(swimActs);
  const swimmingMeters = sumMeters(swimActs);

  const runningSummary: SportSummary = {
    distanceMi: runningMiles,
    timeHours: runningTimeSec / 3600,
    avgPaceLabel: formatPacePerMile(runningTimeSec, runningMiles),
    bestEffort: null,
  };

  if (runActs.length) {
    const bestRun = [...runActs]
      .filter((a) => a.miles > 0 && a.timeSec > 0)
      .sort((a, b) => a.timeSec / a.miles - b.timeSec / b.miles)[0];
    if (bestRun) {
      runningSummary.bestEffort = {
        title: String(bestRun.row["Title"] ?? "Best run"),
        subtitle: bestRun.date ? formatDateDisplay(bestRun.date) : "Best pace",
        statLabel: formatPacePerMile(bestRun.timeSec, bestRun.miles),
      };
    }
  }

  const cyclingSummary: SportSummary = {
    distanceMi: cyclingMiles,
    timeHours: cyclingTimeSec / 3600,
    avgPaceLabel: formatMph(cyclingMiles, cyclingTimeSec),
    bestEffort: null,
  };

  if (cycleActs.length) {
    const bestRide = [...cycleActs]
      .filter((a) => a.miles > 0 && a.timeSec > 0)
      .sort(
        (a, b) => b.miles / (b.timeSec || 1) - a.miles / (a.timeSec || 1)
      )[0];
    if (bestRide) {
      cyclingSummary.bestEffort = {
        title: String(bestRide.row["Title"] ?? "Best ride"),
        subtitle: bestRide.date ? formatDateDisplay(bestRide.date) : "Best speed",
        statLabel: formatMph(bestRide.miles, bestRide.timeSec),
      };
    }
  }

  const swimmingSummary: SportSummary = {
    distanceMi: swimmingMiles,
    timeHours: swimmingTimeSec / 3600,
    avgPaceLabel: formatSwimPacePer100m(swimmingTimeSec, swimmingMeters),
    bestEffort: null,
  };

  if (swimActs.length) {
    const bestSwim = [...swimActs]
      .filter((a) => a.meters > 0 && a.timeSec > 0)
      .sort(
        (a, b) => a.timeSec / (a.meters || 1) - b.timeSec / (b.meters || 1)
      )[0];
    if (bestSwim) {
      swimmingSummary.bestEffort = {
        title: String(bestSwim.row["Title"] ?? "Best swim"),
        subtitle: bestSwim.date ? formatDateDisplay(bestSwim.date) : "Best pace",
        statLabel: formatSwimPacePer100m(bestSwim.timeSec, bestSwim.meters),
      };
    }
  }

  const verticalGainFt = norm.reduce((s, a) => s + a.ascentFt, 0);
  const highestElevationFt = norm.reduce(
    (max, a) => Math.max(max, a.maxElevationFt),
    0
  );

  let longestActivity: LongestActivitySummary | null = null;
  const longest = norm.reduce<Norm | null>(
    (best, a) => (!best || a.timeSec > best.timeSec ? a : best),
    null
  );
  if (longest && longest.timeSec > 0) {
    longestActivity = {
      title: String(longest.row["Title"] ?? "Longest activity"),
      dateLabel: longest.date ? formatDateDisplay(longest.date) : "",
      durationLabel: formatHoursDecimal(longest.timeSec / 3600),
      distanceLabel: longest.miles > 0 ? `${longest.miles.toFixed(1)} mi` : "",
      caloriesLabel: longest.calories
        ? `${Math.round(longest.calories).toLocaleString("en-US")} kcal`
        : "",
    };
  }

  let highestCalorie: HighestCalorieSummary | null = null;
  const mostCalories = norm.reduce<Norm | null>(
    (best, a) => (!best || a.calories > best.calories ? a : best),
    null
  );
  if (mostCalories && mostCalories.calories > 0) {
    highestCalorie = {
      title: String(mostCalories.row["Title"] ?? "Biggest burn"),
      dateLabel: mostCalories.date ? formatDateDisplay(mostCalories.date) : "",
      durationLabel: formatHoursDecimal(mostCalories.timeSec / 3600),
      caloriesLabel: `${Math.round(
        mostCalories.calories
      ).toLocaleString("en-US")} kcal`,
    };
  }

  // longest streak
  let longestStreak: StreakSummary | null = null;
  const dated = norm.filter((a) => a.date).map((a) => a.date as Date);
  const uniqueDates = Array.from(
    new Set(dated.map((d) => d.toISOString().slice(0, 10)))
  ).map((s) => new Date(s));
  uniqueDates.sort((a, b) => a.getTime() - b.getTime());

  if (uniqueDates.length) {
    let bestLen = 0;
    let bestStart: Date | null = null;
    let bestEnd: Date | null = null;
    let curStart = uniqueDates[0];
    let curPrev = uniqueDates[0];
    let curLen = 1;

    for (let i = 1; i < uniqueDates.length; i++) {
      const d = uniqueDates[i];
      const diff = (d.getTime() - curPrev.getTime()) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        curLen += 1;
      } else {
        if (curLen > bestLen) {
          bestLen = curLen;
          bestStart = curStart;
          bestEnd = curPrev;
        }
        curStart = d;
        curLen = 1;
      }
      curPrev = d;
    }
    if (curLen > bestLen) {
      bestLen = curLen;
      bestStart = curStart;
      bestEnd = curPrev;
    }

    if (bestStart && bestEnd) {
      longestStreak = {
        days: bestLen,
        startLabel: formatDateDisplay(bestStart),
        endLabel: formatDateDisplay(bestEnd),
      };
    }
  }

  // busiest week (by time)
  let busiestWeek: BusiestWeekSummary | null = null;
  type WeekAgg = { timeSec: number; count: number };
  const weekMap = new Map<string, WeekAgg>();

  norm.forEach((a) => {
    if (!a.date) return;
    const d = a.date;
    const monday = new Date(d);
    const day = monday.getDay(); // 0–6
    const diff = (day + 6) % 7; // Monday = 0
    monday.setDate(d.getDate() - diff);
    monday.setHours(0, 0, 0, 0);
    const key = monday.toISOString().slice(0, 10);
    const agg = weekMap.get(key) || { timeSec: 0, count: 0 };
    agg.timeSec += a.timeSec;
    agg.count += 1;
    weekMap.set(key, agg);
  });

  if (weekMap.size) {
    let bestKey = "";
    let bestAgg: WeekAgg | null = null;
    for (const [k, agg] of weekMap.entries()) {
      if (!bestAgg || agg.timeSec > bestAgg.timeSec) {
        bestAgg = agg;
        bestKey = k;
      }
    }
    if (bestAgg) {
      const start = new Date(bestKey);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      busiestWeek = {
        rangeLabel: formatDateRange(start, end),
        hoursLabel: `${(bestAgg.timeSec / 3600).toFixed(1)} h`,
        activitiesLabel: `${bestAgg.count} activities`,
      };
    }
  }

  const nonNullDates = norm
    .map((a) => a.date)
    .filter((d): d is Date => !!d);
  const yearLabel =
    nonNullDates.length > 0
      ? String(nonNullDates[0].getFullYear())
      : "2025";

  return {
    totalActivities,
    totalDistanceMi,
    totalTimeHours,
    totalCalories,
    running: runningSummary,
    cycling: cyclingSummary,
    swimming: swimmingSummary,
    verticalGainFt,
    highestElevationFt,
    longestActivity,
    highestCalorie,
    longestStreak,
    busiestWeek,
    yearLabel,
  };
}

// ---------- metrics: steps ----------

function computeStepsMetrics(rows: CsvRow[]): StepsMetrics | null {
  if (!rows.length) return null;
  const first = rows[0] || {};
  const headers = Object.keys(first);
  if (!headers.length) return null;

  const lower = headers.map((h) => h.toLowerCase());
  let dateKey =
    headers[
      lower.findIndex(
        (h) => h.includes("date") || h.includes("week")
      )
    ] ?? headers[0];

  let stepsKey =
    headers[lower.findIndex((h) => h.includes("step"))] ?? "";

  if (!stepsKey) {
    stepsKey =
      headers.find((h) =>
        rows.some((r) => parseNumber(r[h]) > 0)
      ) ?? headers[1] ?? headers[0];
  }

  const weeks = rows
    .map((row) => {
      const steps = parseNumber(row[stepsKey]);
      if (!steps) return null;
      const label = String(row[dateKey] ?? "").trim() || "Week";
      return { steps, label };
    })
    .filter(Boolean) as { steps: number; label: string }[];

  if (!weeks.length) return null;

  const totalSteps = weeks.reduce((s, w) => s + w.steps, 0);
  const weeksOfData = weeks.length;
  const avgPerDay = totalSteps / (weeksOfData * 7);
  const bestWeek = weeks.reduce(
    (best, w) => (!best || w.steps > best.steps ? w : best),
    weeks[0]
  );

  const distanceFromStepsMi = totalSteps / 1842;

  return {
    totalSteps,
    weeksOfData,
    avgPerDay,
    bestWeekSteps: bestWeek.steps,
    bestWeekLabel: bestWeek.label,
    distanceFromStepsMi,
  };
}

// ---------- metrics: sleep ----------

function computeSleepMetrics(rows: CsvRow[]): SleepMetrics | null {
  if (!rows.length) return null;
  const first = rows[0] || {};
  const headers = Object.keys(first);
  if (!headers.length) return null;

  const lower = headers.map((h) => h.toLowerCase());
  const dateKey =
    headers[lower.findIndex((h) => h.includes("date"))] ?? headers[0];
  const durationKey =
    headers[
      lower.findIndex(
        (h) => h.includes("duration") || h.includes("avg duration")
      )
    ] ?? headers[1] ?? headers[0];
  const scoreKey =
    headers[
      lower.findIndex(
        (h) => h.includes("score") || h.includes("avg score")
      )
    ] ?? "";

  const weeks = rows
    .map((row) => {
      const durationHours = parseSleepDurationHours(row[durationKey]);
      const score = scoreKey ? parseNumber(row[scoreKey]) : 0;
      if (!durationHours && !score) return null;
      const label = String(row[dateKey] ?? "").trim() || "Week";
      return { durationHours, score, label };
    })
    .filter(Boolean) as { durationHours: number; score: number; label: string }[];

  if (!weeks.length) return null;

  const weeksOfData = weeks.length;
  const avgSleepHours =
    weeks.reduce((s, w) => s + w.durationHours, 0) / weeksOfData;
  const avgSleepScore =
    weeks.reduce((s, w) => s + (w.score || 0), 0) / weeksOfData;
  const bestWeek = weeks.reduce(
    (best, w) =>
      !best || w.durationHours > best.durationHours ? w : best,
    weeks[0]
  );

  return {
    weeksOfData,
    avgSleepHours,
    avgSleepScore,
    bestWeekHours: bestWeek.durationHours,
    bestWeekLabel: bestWeek.label,
  };
}

// ---------- UI ----------

const Home: React.FC = () => {
  const [activityMetrics, setActivityMetrics] =
    useState<ActivityMetrics | null>(null);
  const [stepsMetrics, setStepsMetrics] =
    useState<StepsMetrics | null>(null);
  const [sleepMetrics, setSleepMetrics] =
    useState<SleepMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pageRef = useRef<HTMLDivElement | null>(null);

  const handleActivityUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setError(null);
      const rows = await parseCsvFile(file);
      const metrics = computeActivityMetrics(rows);
      setActivityMetrics(metrics);
    } catch (err) {
      console.error(err);
      setError("There was a problem reading that activities CSV.");
    }
  };

  const handleStepsUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setError(null);
      const rows = await parseCsvFile(file);
      const metrics = computeStepsMetrics(rows);
      setStepsMetrics(metrics);
    } catch (err) {
      console.error(err);
      setError("There was a problem reading that steps CSV.");
    }
  };

  const handleSleepUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setError(null);
      const rows = await parseCsvFile(file);
      const metrics = computeSleepMetrics(rows);
      setSleepMetrics(metrics);
    } catch (err) {
      console.error(err);
      setError("There was a problem reading that sleep CSV.");
    }
  };

  const handleDownloadImage = async () => {
    if (!pageRef.current) return;
    try {
      // Default pixelRatio avoids huge canvases that can get cropped
      const dataUrl = await htmlToImage.toPng(pageRef.current, {
        cacheBust: true,
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = "garmin-wrapped.png";
      link.click();
    } catch (err) {
      console.error(err);
      alert("Sorry, something went wrong creating the image.");
    }
  };

  const yearLabel = activityMetrics?.yearLabel ?? "2025";

  const running = activityMetrics?.running;
  const cycling = activityMetrics?.cycling;
  const swimming = activityMetrics?.swimming;

  const verticalGainFt = activityMetrics?.verticalGainFt ?? 0;
  const highestElevationFt = activityMetrics?.highestElevationFt ?? 0;
  const approxFloors = verticalGainFt ? Math.round(verticalGainFt / 10) : 0;
  const EVEREST_FT = 29029;
  const everestPct = highestElevationFt
    ? Math.round((highestElevationFt / EVEREST_FT) * 100)
    : 0;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div
        ref={pageRef}
        className="max-w-6xl mx-auto px-4 py-6 space-y-4"
      >
        {/* Top controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-2 rounded-full bg-slate-900/70 border border-cyan-400/40 px-3 py-2 text-[0.8rem] font-medium cursor-pointer hover:bg-slate-900">
              <UploadCloud className="w-4 h-4 text-cyan-300" />
              <span>Upload activities CSV</span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleActivityUpload}
              />
            </label>

            <label className="inline-flex items-center gap-2 rounded-full bg-slate-900/70 border border-emerald-400/40 px-3 py-2 text-[0.8rem] font-medium cursor-pointer hover:bg-slate-900">
              <Footprints className="w-4 h-4 text-emerald-300" />
              <span>Upload steps CSV</span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleStepsUpload}
              />
            </label>

            <label className="inline-flex items-center gap-2 rounded-full bg-slate-900/70 border border-indigo-400/40 px-3 py-2 text-[0.8rem] font-medium cursor-pointer hover:bg-slate-900">
              <Moon className="w-4 h-4 text-indigo-300" />
              <span>Upload sleep CSV</span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleSleepUpload}
              />
            </label>
          </div>

          <button
            onClick={handleDownloadImage}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-2 text-[0.8rem] font-semibold shadow-lg shadow-cyan-500/30 hover:brightness-110"
          >
            <ArrowDownToLine className="w-4 h-4" />
            Download as image
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-300 bg-red-950/60 border border-red-500/40 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {/* Hero */}
        <section className="rounded-3xl bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-600 p-[1px] shadow-[0_0_40px_rgba(34,211,238,0.25)]">
          <div className="rounded-[1.4rem] bg-slate-950/80 px-5 py-5 sm:px-8 sm:py-7 flex flex-col gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[0.8rem] uppercase tracking-[0.25em] text-cyan-200/80 mb-1">
                  {yearLabel} • Garmin wrapped
                </div>
                <div className="text-3xl sm:text-4xl font-semibold">
                  Your year in movement
                </div>
                <p className="mt-2 max-w-xl text-sm text-slate-200/80">
                  From lifts and Zwift to long runs and high-altitude
                  hiking, here&apos;s what your watch saw this year.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[0.8rem]">
                <div className="rounded-2xl bg-slate-900/70 px-3 py-3 border border-slate-700/60">
                  <div className="uppercase text-[0.7rem] text-slate-400">
                    Activities
                  </div>
                  <div className="mt-1 text-lg font-semibold">
                    {activityMetrics
                      ? activityMetrics.totalActivities.toLocaleString(
                          "en-US"
                        )
                      : "—"}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-900/70 px-3 py-3 border border-slate-700/60">
                  <div className="uppercase text-[0.7rem] text-slate-400">
                    Training time
                  </div>
                  <div className="mt-1 text-lg font-semibold">
                    {activityMetrics
                      ? formatHoursLabel(activityMetrics.totalTimeHours)
                      : "—"}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-900/70 px-3 py-3 border border-slate-700/60">
                  <div className="uppercase text-[0.7rem] text-slate-400">
                    Distance traveled
                  </div>
                  <div className="mt-1 text-lg font-semibold">
                    {activityMetrics
                      ? formatDistanceMiles(
                          activityMetrics.totalDistanceMi
                        )
                      : "—"}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-900/70 px-3 py-3 border border-slate-700/60">
                  <div className="uppercase text-[0.7rem] text-slate-400">
                    Calories burned
                  </div>
                  <div className="mt-1 text-lg font-semibold">
                    {activityMetrics
                      ? `${Math.round(
                          activityMetrics.totalCalories
                        ).toLocaleString("en-US")} kcal`
                      : "—"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Distance breakdown */}
        <section className="rounded-3xl bg-slate-950/90 border border-slate-800/80 shadow-[0_0_40px_rgba(15,23,42,0.7)]">
          <div className="flex items-center justify-between px-5 pt-4 pb-2 text-[0.8rem]">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-cyan-300" />
              <span className="uppercase tracking-[0.18em] text-slate-300">
                Distance breakdown
              </span>
            </div>
            <div className="text-[0.75rem] text-slate-400">
              {activityMetrics
                ? `${Math.round(
                    activityMetrics.totalDistanceMi
                  ).toLocaleString("en-US")} mi total`
                : ""}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-5 pb-4 text-[0.85rem]">
            <div className="rounded-2xl bg-slate-900/80 border border-slate-800 px-4 py-3">
              <div className="text-[0.7rem] uppercase text-slate-400 mb-1">
                Running
              </div>
              <div className="text-base font-semibold">
                {running ? `${Math.round(running.distanceMi)} mi` : "—"}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-900/80 border border-slate-800 px-4 py-3">
              <div className="text-[0.7rem] uppercase text-slate-400 mb-1">
                Cycling
              </div>
              <div className="text-base font-semibold">
                {cycling ? `${Math.round(cycling.distanceMi)} mi` : "—"}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-900/80 border border-slate-800 px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[0.7rem] uppercase text-slate-400">
                  Swimming*
                </div>
              </div>
              <div className="text-base font-semibold">
                {swimming
                  ? `${swimming.distanceMi.toFixed(1)} mi`
                  : "—"}
              </div>
              <div className="mt-1 text-[0.7rem] text-slate-500">
                *Meters converted to miles
              </div>
            </div>
            <div className="rounded-2xl bg-slate-900/80 border border-slate-800 px-4 py-3">
              <div className="text-[0.7rem] uppercase text-slate-400 mb-1">
                Walking / hiking
              </div>
              <div className="text-base font-semibold">
                {stepsMetrics
                  ? formatDistanceMiles(stepsMetrics.distanceFromStepsMi)
                  : "0 mi"}
              </div>
              <div className="mt-1 text-[0.7rem] text-slate-500">
                From steps export
              </div>
            </div>
          </div>
        </section>

        {/* Time by sport with best efforts */}
        <section className="rounded-3xl bg-slate-950/95 border border-slate-800/80 shadow-[0_0_40px_rgba(15,23,42,0.7)]">
          <div className="flex items-center justify-between px-5 pt-4 pb-2 text-[0.8rem]">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-sky-300" />
              <span className="uppercase tracking-[0.18em] text-slate-300">
                Time by sport
              </span>
            </div>
            <div className="text-[0.75rem] text-slate-400">
              Distance • Time • Pace • Best effort
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3 px-5 pb-4 text-[0.85rem]">
            {/* Running */}
            <div className="rounded-2xl bg-gradient-to-br from-emerald-500/15 via-sky-600/10 to-slate-900/90 border border-emerald-400/40 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[0.7rem] uppercase tracking-[0.18em] text-emerald-200">
                  Running
                </div>
                <div className="w-12 h-[2px] rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300" />
              </div>
              <div className="flex justify-between mb-2">
                <div>
                  <div className="text-[0.7rem] text-slate-400">Distance</div>
                  <div className="font-semibold">
                    {running
                      ? `${Math.round(running.distanceMi)} mi`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[0.7rem] text-slate-400">Time</div>
                  <div className="font-semibold">
                    {running ? formatHoursLabel(running.timeHours) : "—"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[0.7rem] text-slate-400">Pace</div>
                  <div className="font-semibold">
                    {running?.avgPaceLabel ?? "—"}
                  </div>
                </div>
              </div>
              <div className="mt-2 border-t border-emerald-400/25 pt-2">
                <div className="text-[0.7rem] uppercase text-emerald-200/90 mb-0.5">
                  Best effort
                </div>
                {running?.bestEffort ? (
                  <>
                    <div className="text-[0.85rem] font-medium truncate">
                      {running.bestEffort.title}
                    </div>
                    <div className="flex justify-between items-center mt-0.5 text-[0.75rem] text-slate-300/90">
                      <span>{running.bestEffort.subtitle}</span>
                      <span className="font-semibold text-emerald-200">
                        {running.bestEffort.statLabel}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-[0.75rem] text-slate-500">
                    Upload activities to see your fastest run.
                  </div>
                )}
              </div>
            </div>

            {/* Cycling */}
            <div className="rounded-2xl bg-gradient-to-br from-cyan-500/15 via-sky-500/10 to-slate-900/90 border border-cyan-400/40 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[0.7rem] uppercase tracking-[0.18em] text-cyan-200">
                  Cycling
                </div>
                <div className="w-12 h-[2px] rounded-full bg-gradient-to-r from-cyan-300 to-blue-400" />
              </div>
              <div className="flex justify-between mb-2">
                <div>
                  <div className="text-[0.7rem] text-slate-400">Distance</div>
                  <div className="font-semibold">
                    {cycling
                      ? `${Math.round(cycling.distanceMi)} mi`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[0.7rem] text-slate-400">Time</div>
                  <div className="font-semibold">
                    {cycling ? formatHoursLabel(cycling.timeHours) : "—"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[0.7rem] text-slate-400">Speed</div>
                  <div className="font-semibold">
                    {cycling?.avgPaceLabel ?? "—"}
                  </div>
                </div>
              </div>
              <div className="mt-2 border-t border-cyan-400/25 pt-2">
                <div className="text-[0.7rem] uppercase text-cyan-200/90 mb-0.5">
                  Best effort
                </div>
                {cycling?.bestEffort ? (
                  <>
                    <div className="text-[0.85rem] font-medium truncate">
                      {cycling.bestEffort.title}
                    </div>
                    <div className="flex justify-between items-center mt-0.5 text-[0.75rem] text-slate-300/90">
                      <span>{cycling.bestEffort.subtitle}</span>
                      <span className="font-semibold text-cyan-200">
                        {cycling.bestEffort.statLabel}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-[0.75rem] text-slate-500">
                    Upload activities to see your fastest ride.
                  </div>
                )}
              </div>
            </div>

            {/* Swimming */}
            <div className="rounded-2xl bg-gradient-to-br from-indigo-500/18 via-violet-500/12 to-slate-900/90 border border-violet-400/40 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[0.7rem] uppercase tracking-[0.18em] text-violet-200">
                  Swimming
                </div>
                <div className="w-12 h-[2px] rounded-full bg-gradient-to-r from-violet-300 to-pink-400" />
              </div>
              <div className="flex justify-between mb-2">
                <div>
                  <div className="text-[0.7rem] text-slate-400">Distance</div>
                  <div className="font-semibold">
                    {swimming
                      ? `${swimming.distanceMi.toFixed(1)} mi`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[0.7rem] text-slate-400">Time</div>
                  <div className="font-semibold">
                    {swimming ? formatHoursLabel(swimming.timeHours) : "—"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[0.7rem] text-slate-400">
                    Avg pace
                  </div>
                  <div className="font-semibold">
                    {swimming?.avgPaceLabel ?? "—"}
                  </div>
                </div>
              </div>
              <div className="mt-2 border-t border-violet-400/25 pt-2">
                <div className="text-[0.7rem] uppercase text-violet-200/90 mb-0.5">
                  Best effort
                </div>
                {swimming?.bestEffort ? (
                  <>
                    <div className="text-[0.85rem] font-medium truncate">
                      {swimming.bestEffort.title}
                    </div>
                    <div className="flex justify-between items-center mt-0.5 text-[0.75rem] text-slate-300/90">
                      <span>{swimming.bestEffort.subtitle}</span>
                      <span className="font-semibold text-violet-200">
                        {swimming.bestEffort.statLabel}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-[0.75rem] text-slate-500">
                    Upload activities to see your fastest swim.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Vertical gains */}
        <section className="rounded-3xl bg-gradient-to-r from-fuchsia-500/25 via-violet-600/20 to-amber-500/25 p-[1px] shadow-[0_0_40px_rgba(192,132,252,0.4)]">
          <div className="rounded-[1.4rem] bg-slate-950/95 px-5 py-4">
            <div className="flex items-center justify-between mb-3 text-[0.8rem]">
              <div className="flex items-center gap-2">
                <MountainIcon className="w-3.5 h-3.5 text-fuchsia-300" />
                <span className="uppercase tracking-[0.18em] text-slate-200">
                  Vertical gains
                </span>
              </div>
              <div className="text-[0.75rem] text-slate-300">Elevation</div>
            </div>
            <div className="grid md:grid-cols-2 gap-3 text-[0.85rem]">
              <div className="rounded-2xl bg-slate-900/70 border border-fuchsia-500/35 px-4 py-3">
                <div className="text-[0.7rem] uppercase text-slate-400 mb-1">
                  Total elevation climbed
                </div>
                <div className="text-lg font-semibold">
                  {formatFeetLabel(verticalGainFt)}
                </div>
                {approxFloors > 0 && (
                  <div className="mt-1 text-[0.75rem] text-slate-400">
                    Roughly {approxFloors.toLocaleString("en-US")} floors
                    climbed.
                  </div>
                )}
              </div>
              <div className="rounded-2xl bg-slate-900/70 border border-amber-500/35 px-4 py-3">
                <div className="text-[0.7rem] uppercase text-slate-400 mb-1">
                  Highest point reached
                </div>
                <div className="text-lg font-semibold">
                  {formatFeetLabel(highestElevationFt)}
                </div>
                <div className="mt-1 text-[0.75rem] text-slate-400">
                  That&apos;s about {(everestPct || 0)}% of Mount
                  Everest&apos;s height.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Biggest efforts / Consistency */}
        <section className="grid md:grid-cols-2 gap-3">
          {/* Biggest efforts */}
          <div className="rounded-3xl bg-slate-950/95 border border-slate-800/80 p-5 shadow-[0_0_40px_rgba(15,23,42,0.7)]">
            <div className="flex items-center gap-2 mb-4 text-[0.8rem]">
              <Dumbbell className="w-3.5 h-3.5 text-emerald-300" />
              <span className="uppercase tracking-[0.18em] text-slate-200">
                Biggest efforts
              </span>
            </div>
            <div className="space-y-3 text-[0.85rem]">
              <div className="rounded-2xl bg-slate-900/80 border border-slate-800 px-4 py-3">
                <div className="text-[0.7rem] uppercase text-slate-400 mb-1">
                  Longest activity
                </div>
                {activityMetrics?.longestActivity ? (
                  <>
                    <div className="font-medium text-[0.95rem]">
                      {activityMetrics.longestActivity.title}
                    </div>
                    <div className="mt-0.5 text-[0.75rem] text-slate-300">
                      {activityMetrics.longestActivity.dateLabel}
                    </div>
                    <div className="mt-1 flex gap-4 text-[0.75rem] text-slate-200">
                      <span>{activityMetrics.longestActivity.durationLabel}</span>
                      {activityMetrics.longestActivity.distanceLabel && (
                        <span>
                          {activityMetrics.longestActivity.distanceLabel}
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-[0.75rem] text-slate-500">
                    Upload activities to see your longest day out.
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-slate-900/80 border border-slate-800 px-4 py-3">
                <div className="text-[0.7rem] uppercase text-slate-400 mb-1">
                  Most calories in one go
                </div>
                {activityMetrics?.highestCalorie ? (
                  <>
                    <div className="font-medium text-[0.95rem]">
                      {activityMetrics.highestCalorie.title}
                    </div>
                    <div className="mt-0.5 text-[0.75rem] text-slate-300">
                      {activityMetrics.highestCalorie.dateLabel}
                    </div>
                    <div className="mt-1 flex gap-4 text-[0.75rem] text-slate-200">
                      <span>
                        {activityMetrics.highestCalorie.durationLabel}
                      </span>
                      <span>
                        {activityMetrics.highestCalorie.caloriesLabel}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-[0.75rem] text-slate-500">
                    Upload activities to find your biggest burn.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Consistency & grind */}
          <div className="rounded-3xl bg-gradient-to-br from-amber-500/18 via-orange-500/12 to-fuchsia-500/18 p-[1px] shadow-[0_0_40px_rgba(251,191,36,0.35)]">
            <div className="rounded-[1.4rem] bg-slate-950/95 px-5 py-4">
              <div className="flex items-center gap-2 mb-4 text-[0.8rem]">
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span className="uppercase tracking-[0.18em] text-slate-200">
                  Consistency & grind
                </span>
              </div>
              <div className="space-y-3 text-[0.85rem]">
                <div className="rounded-2xl bg-slate-900/80 border border-amber-500/35 px-4 py-3">
                  <div className="text-[0.7rem] uppercase text-slate-400 mb-1">
                    Longest streak
                  </div>
                  {activityMetrics?.longestStreak ? (
                    <>
                      <div className="text-xl font-semibold">
                        {activityMetrics.longestStreak.days} days
                      </div>
                      <div className="mt-0.5 text-[0.75rem] text-slate-300">
                        {activityMetrics.longestStreak.startLabel} —{" "}
                        {activityMetrics.longestStreak.endLabel}
                      </div>
                      <div className="mt-1 text-[0.75rem] text-slate-400">
                        You refused to break the chain.
                      </div>
                    </>
                  ) : (
                    <div className="text-[0.75rem] text-slate-500">
                      Upload activities to see your longest streak.
                    </div>
                  )}
                </div>

                <div className="rounded-2xl bg-slate-900/80 border border-amber-500/35 px-4 py-3">
                  <div className="text-[0.7rem] uppercase text-slate-400 mb-1">
                    Busiest week
                  </div>
                  {activityMetrics?.busiestWeek ? (
                    <>
                      <div className="text-[0.95rem] font-semibold">
                        {activityMetrics.busiestWeek.rangeLabel}
                      </div>
                      <div className="mt-0.5 text-[0.75rem] text-slate-300">
                        {activityMetrics.busiestWeek.hoursLabel} •{" "}
                        {activityMetrics.busiestWeek.activitiesLabel}
                      </div>
                    </>
                  ) : (
                    <div className="text-[0.75rem] text-slate-500">
                      Upload activities to see when you went all-in.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Steps wrapped */}
        <section className="rounded-3xl bg-slate-950/95 border border-slate-800/80 shadow-[0_0_40px_rgba(8,47,73,0.7)]">
          <div className="flex items-center justify-between px-5 pt-4 pb-2 text-[0.8rem]">
            <div className="flex items-center gap-2">
              <Footprints className="w-3.5 h-3.5 text-emerald-300" />
              <span className="uppercase tracking-[0.18em] text-slate-200">
                Steps wrapped
              </span>
            </div>
            <div className="text-[0.75rem] text-slate-400">
              Daily grind
            </div>
          </div>

          {stepsMetrics ? (
            <div className="grid md:grid-cols-4 gap-3 px-5 pb-4 text-[0.85rem]">
              <div className="rounded-2xl bg-slate-900/80 border border-slate-800 px-4 py-3">
                <div className="text-[0.7rem] uppercase text-slate-400 mb-1">
                  Total steps
                </div>
                <div className="text-lg font-semibold">
                  {formatSteps(stepsMetrics.totalSteps)}
                </div>
                <div className="mt-1 text-[0.75rem] text-slate-500">
                  Across {stepsMetrics.weeksOfData} weeks
                </div>
              </div>
              <div className="rounded-2xl bg-slate-900/80 border border-slate-800 px-4 py-3">
                <div className="text-[0.7rem] uppercase text-slate-400 mb-1">
                  Avg per day
                </div>
                <div className="text-lg font-semibold">
                  {Math.round(stepsMetrics.avgPerDay).toLocaleString(
                    "en-US"
                  )}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-900/80 border border-slate-800 px-4 py-3">
                <div className="text-[0.7rem] uppercase text-slate-400 mb-1">
                  Best week
                </div>
                <div className="text-lg font-semibold">
                  {formatSteps(stepsMetrics.bestWeekSteps)}
                </div>
                <div className="mt-1 text-[0.75rem] text-slate-500">
                  {stepsMetrics.bestWeekLabel}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-900/80 border border-slate-800 px-4 py-3">
                <div className="text-[0.7rem] uppercase text-slate-400 mb-1">
                  Distance from steps
                </div>
                <div className="text-lg font-semibold">
                  {formatDistanceMiles(stepsMetrics.distanceFromStepsMi)}
                </div>
                <div className="mt-1 text-[0.75rem] text-slate-500">
                  Based on ~1,842 steps / mile
                </div>
              </div>
            </div>
          ) : (
            <div className="px-5 pb-4 text-[0.8rem] text-slate-400">
              Upload a Steps CSV to see total steps, best week, and how
              far you walked just doing life.
            </div>
          )}
        </section>

        {/* Sleep wrapped */}
        <section className="rounded-3xl bg-slate-950/95 border border-slate-800/80 shadow-[0_0_40px_rgba(30,64,175,0.6)]">
          <div className="flex items-center justify-between px-5 pt-4 pb-2 text-[0.8rem]">
            <div className="flex items-center gap-2">
              <Moon className="w-3.5 h-3.5 text-indigo-300" />
              <span className="uppercase tracking-[0.18em] text-slate-200">
                Sleep wrapped
              </span>
            </div>
            <div className="text-[0.75rem] text-slate-400">
              Recovery mode
            </div>
          </div>

          {sleepMetrics ? (
            <div className="grid md:grid-cols-4 gap-3 px-5 pb-4 text-[0.85rem]">
              <div className="rounded-2xl bg-slate-900/80 border border-slate-800 px-4 py-3">
                <div className="text-[0.7rem] uppercase text-slate-400 mb-1">
                  Weeks of data
                </div>
                <div className="text-lg font-semibold">
                  {sleepMetrics.weeksOfData}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-900/80 border border-slate-800 px-4 py-3">
                <div className="text-[0.7rem] uppercase text-slate-400 mb-1">
                  Avg sleep / night
                </div>
                <div className="text-lg font-semibold">
                  {sleepMetrics.avgSleepHours.toFixed(1)} h
                </div>
              </div>
              <div className="rounded-2xl bg-slate-900/80 border border-slate-800 px-4 py-3">
                <div className="text-[0.7rem] uppercase text-slate-400 mb-1">
                  Avg sleep score
                </div>
                <div className="text-lg font-semibold">
                  {Math.round(sleepMetrics.avgSleepScore)}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-900/80 border border-slate-800 px-4 py-3">
                <div className="text-[0.7rem] uppercase text-slate-400 mb-1">
                  Longest sleep week
                </div>
                <div className="text-lg font-semibold">
                  {sleepMetrics.bestWeekHours.toFixed(1)} h
                </div>
                <div className="mt-1 text-[0.75rem] text-slate-500">
                  {sleepMetrics.bestWeekLabel}
                </div>
              </div>
            </div>
          ) : (
            <div className="px-5 pb-4 text-[0.8rem] text-slate-400">
              Upload a Sleep CSV to see how your recovery stacked up
              against all that training.
            </div>
          )}
        </section>

        {/* Footer */}
        <section className="rounded-3xl bg-slate-950/95 border border-slate-900 px-5 py-4 text-[0.8rem] flex items-center justify-between text-slate-400">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-emerald-300" />
            <span className="uppercase tracking-[0.18em]">
              {yearLabel} wrapped up
            </span>
          </div>
          <div className="text-right text-slate-300">
            In {parseInt(yearLabel, 10) + 1}, the only goal: make Future
            You impressed.
          </div>
        </section>
      </div>
    </main>
  );
};

// simple mountain icon for vertical gains
function MountainIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M3 19.5 10.5 6l3 5 2-3L21 19.5H3Z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default Home;
