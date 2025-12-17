// File: app/page.tsx v4.6.7 - papaparse types compat + dynamic copy + export instructions

'use client';

import React, { useRef, useState } from 'react';
import Papa from 'papaparse';
import type { ParseResult } from 'papaparse';
import * as htmlToImage from 'html-to-image';
import {
  Activity, Flame, HeartPulse, LineChart, Mountain, Timer,
  CalendarDays, Trophy, Dumbbell, Zap, Upload, Bike, Waves,
} from 'lucide-react';

/* ============================== Types ============================== */

type CsvPrimitive = string | number | boolean | null | undefined;
type CsvRow = Record<string, CsvPrimitive>;
type UnitSystem = 'imperial' | 'metric';

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
  longestActivity?: { title: string; date: string; durationSeconds: number; calories?: number };
  highestCalorie?: { title: string; date: string; calories: number; durationSeconds?: number };
  totalAscent?: number;
  maxElevation?: number;
  avgDistanceMi?: number;
  avgDurationSeconds?: number;
  activityTypesCount: number;
  topActivityTypes?: ActivityTypeSummary[];
  startDateDisplay?: string;
  endDateDisplay?: string;
  grindDay?: { name: string; totalHours: number; activities: number };

  runDistanceMi?: number; runSeconds?: number; runSessions?: number;
  bikeDistanceMi?: number; bikeSeconds?: number; bikeSessions?: number;
  swimMeters?: number;   swimSeconds?: number;  swimSessions?: number;

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

/* ============================== Consts ============================== */

const EARTH_CIRCUMFERENCE_MI = 24901;
const MARATHON_MI = 26.2188;
const FIVEK_MI = 3.10686;
const EVEREST_FT = 29032;
const FEET_PER_STEP = 2.3;

/* ============================== Utils ============================== */

function toStringSafe(v: unknown): string { return String(v ?? '').trim(); }
function asCell(v: unknown): CsvPrimitive { const s = toStringSafe(v); return s.length ? s : null; }

function isTextual(v: unknown): v is string {
  const s = toStringSafe(v);
  if (!s) return false;
  // Treat cells with any non-numeric characters as text labels (e.g., 'Dec 5-11')
  return !/^[\d\s,\.\-]+$/.test(s);
}

/* ======================== Dynamic copy (stable per user) ======================== */

function hashToUint32(s: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pickStable(seed: string, options: string[]): string {
  if (!options.length) return '';
  const idx = hashToUint32(seed) % options.length;
  return options[idx]!;
}

type LongestActivityOut = NonNullable<Metrics['longestActivity']>;
type HighestCalorieOut = NonNullable<Metrics['highestCalorie']>;

const LONGEST_TYPE_SHORT = [
  'Long day out',
  'Solid session',
  'Time-on-feet',
  'Steady grind',
  'Mileage mission',
  'Clocked in',
];

const LONGEST_TYPE_EPIC = [
  'All-day adventure',
  'Endurance flex',
  'The main event',
  'Epic session',
  'The long-haul special',
  'A proper mission',
  'Duration destroyer',
  'You were out there',
];

const EFFORT_LIGHT = [
  'Cruise control',
  'Comfortably hard',
  'Good work',
  'Steady burn',
  'Smooth operator',
];

const EFFORT_HEAVY = [
  'Big day in the pain cave',
  'Full-send effort',
  'Calorie furnace mode',
  'Gas tank emptied',
  'Brutal (in the best way)',
  'You cooked today',
  'No chill, all thrill',
  'Suffering, but make it stats',
];

function getLongestTypeLabel(l: LongestActivityOut): string {
  const hours = (l.durationSeconds || 0) / 3600;
  const pool = hours >= 4 ? LONGEST_TYPE_EPIC : LONGEST_TYPE_SHORT;
  const seed = `longest|${l.title}|${l.date}|${Math.round((l.durationSeconds || 0) / 60)}`;
  return pickStable(seed, pool);
}

function getHighestEffortLabel(h: HighestCalorieOut): string {
  const cal = h.calories || 0;
  const pool = cal >= 1200 ? EFFORT_HEAVY : EFFORT_LIGHT;
  const seed = `calories|${h.title}|${h.date}|${cal}`;
  return pickStable(seed, pool);
}

function normalizeKey(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function parseNumber(value: unknown): number {
  if (value == null) return 0;
  let s = String(value).trim();
  s = s.replace(/[\u00A0\u2007\u202F\s]/g, '');
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  const usThousands = /^\d{1,3}(,\d{3})+$/;
  const euThousands = /^\d{1,3}(\.\d{3})+$/;

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) s = s.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(/,/, '.');
    else s = s.replace(/,(?=\d{3}(?:\D|$))/g, '');
  } else if (hasComma && !hasDot) {
    if (usThousands.test(s)) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
  } else if (!hasComma && hasDot) {
    if (euThousands.test(s)) s = s.replace(/\./g, '');
  }

  s = s.replace(/[^\d.\-]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function parseIntStrict(value: unknown): number {
  const s = String(value ?? '').replace(/[^\d\-]/g, '');
  const n = parseInt(s || '0', 10);
  return Number.isFinite(n) ? n : 0;
}

function parseTimeToSeconds(value: unknown): number {
  const s = toStringSafe(value);
  if (!s) return 0;
  const parts = s.split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return 0;
  if (parts.length === 3) { const [h, m, sec] = parts as [number, number, number]; return h * 3600 + m * 60 + sec; }
  if (parts.length === 2) { const [m, sec] = parts as [number, number]; return m * 60 + sec; }
  return 0;
}

function parseSleepDurationToMinutes(value: unknown): number {
  const s = toStringSafe(value);
  if (!s) return 0;
  const hhmm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) return parseInt(hhmm[1]!, 10) * 60 + parseInt(hhmm[2]!, 10);
  const mixed = s.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*(?:min|m))?/i);
  if (mixed) {
    const h = mixed[1] ? parseInt(mixed[1]!, 10) : 0;
    const m = mixed[2] ? parseInt(mixed[2]!, 10) : 0;
    return h * 60 + m;
  }
  return 0;
}

function parseDateWithLocale(value: unknown): Date | null {
  const s = toStringSafe(value).replace(/\u00A0/g, ' ');
  if (!s) return null;
  const iso = new Date(s); if (!Number.isNaN(iso.getTime())) return iso;

  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (dmy) {
    const d = parseInt(dmy[1]!, 10), m = parseInt(dmy[2]!, 10), y = parseInt(dmy[3]!, 10);
    const hh = dmy[4] ? parseInt(dmy[4]!, 10) : 0; const mm = dmy[5] ? parseInt(dmy[5]!, 10) : 0;
    const year = y < 100 ? 2000 + y : y;
    const isDMY = d > 12;
    const month = (isDMY ? m : d) - 1; const day = isDMY ? d : m;
    const dt = new Date(year, month, day, hh, mm);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const dmyDot = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (dmyDot) {
    const d = parseInt(dmyDot[1]!, 10), m = parseInt(dmyDot[2]!, 10), y = parseInt(dmyDot[3]!, 10);
    const hh = dmyDot[4] ? parseInt(dmyDot[4]!, 10) : 0; const mm = dmyDot[5] ? parseInt(dmyDot[5]!, 10) : 0;
    const year = y < 100 ? 2000 + y : y;
    const dt = new Date(year, m - 1, d, hh, mm);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return null;
}

function formatDurationLong(totalSeconds: number): string {
  let s = Math.round(totalSeconds);
  const days = Math.floor(s / 86400); s -= days * 86400;
  const hours = Math.floor(s / 3600); s -= hours * 3600;
  const minutes = Math.floor(s / 60);
  const parts: string[] = [];
  if (days) parts.push(`${days}day${days !== 1 ? 's' : ''}`);
  if (hours) parts.push(`${hours}hrs`);
  if (minutes || (!days && !hours)) parts.push(`${minutes}m`);
  return parts.join(' ');
}
function formatDurationHMS(totalSeconds: number): string {
  let s = Math.round(totalSeconds);
  const hours = Math.floor(s / 3600); s -= hours * 3600;
  const minutes = Math.floor(s / 60); s -= minutes * 60;
  const seconds = s;
  const parts: string[] = [];
  if (hours) parts.push(`${hours}hrs`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || (!hours && !minutes)) parts.push(`${seconds}s`);
  return parts.join(' ');
}
function formatDateDisplay(date: Date | null | undefined): string {
  if (!date) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatPacePerUnit(
  totalSeconds: number,
  distanceMi: number,
  unitSystem: UnitSystem | null
): string {
  if (!totalSeconds || !distanceMi) return '--';
  const isMetric = unitSystem === 'metric';

  if (isMetric) {
    // distanceMi is canonical miles; convert to km for display
    const distanceKm = distanceMi * 1.60934;
    if (!distanceKm) return '--';
    const sPerKm = Math.round(totalSeconds / distanceKm);
    const min = Math.floor(sPerKm / 60);
    const sec = sPerKm % 60;
    return `${min}:${String(sec).padStart(2, '0')}/km`;
  } else {
    const sPerMi = Math.round(totalSeconds / distanceMi);
    const min = Math.floor(sPerMi / 60);
    const sec = sPerMi % 60;
    return `${min}:${String(sec).padStart(2, '0')}/mi`;
  }
}

function formatSwimPacePer100m(totalSeconds: number, meters: number): string {
  if (!totalSeconds || !meters) return '--';
  const per100 = Math.round(totalSeconds / (meters / 100));
  const min = Math.floor(per100 / 60), sec = per100 % 60;
  return `${min}:${String(sec).padStart(2, '0')}/100m`;
}

/* ================== Activity normalization & units (auto-detect) ================== */

type UnitHint = 'm' | 'km' | 'mi' | 'ft' | null;

function unitHintFromHeaderDistance(h: string): UnitHint {
  const s = toStringSafe(h).toLowerCase();
  if (/\bkm\b/.test(s)) return 'km';
  if (/\bmi\b/.test(s)) return 'mi';
  if (/\bm\b/.test(s))  return 'm';
  return null;
}
function unitHintFromHeaderElev(h: string): UnitHint {
  const s = toStringSafe(h).toLowerCase();
  if (/\bft\b/.test(s)) return 'ft';
  if (/\bm\b/.test(s))  return 'm';
  return null;
}

function canonicalizeActivityType(raw: string): string {
  const s = normalizeKey(raw);
  if (/courseapied|jogging|lauf(?!band)|running|trackrunning|trailrunning|correr|corrida|laufstrecke/.test(s)) return 'Running';
  if (/tapis.*course|laufband|tapisroulant/.test(s)) return 'Running';
  if (/piste.*course|bahn/.test(s)) return 'Running';
  if (/cyclisme|velo|radfahren|fahrrad|biking|cycling|virtualcycling|indoorcycling|spinning|vtt|mountainbike/.test(s)) return 'Cycling';
  if (/natation|schwimmen|swimming|poolswim|openwaterswimming|freibad|hallenbad/.test(s)) return 'Swimming';
  if (/aviron|rameur|rudern|rowing|rowerg|ergometer/.test(s)) return 'Rowing';
  if (/(skierg|ski[\s-]*erg|ergomet)/.test(s)) return 'SkiErg';
  if (/marche|spaziergang|gehen|walking|walk/.test(s)) return 'Walking';
  if (/randonnee|randonn|wanderung|hiking|hike|bergsteigen|alpine/.test(s)) return 'Hiking';
  if (/musculation|renforcement|krafttraining|kraft|strength|weights|haltern|weighttraining|functional|hiit/.test(s)) return 'Strength Training';
  if (/elliptique|crosstrainer|elliptical/.test(s)) return 'Elliptical';
  if (/yoga/.test(s)) return 'Yoga';
  if (/pilates/.test(s)) return 'Pilates';
  return raw || 'Other';
}

/** Distance → mi: header hint wins; else activity heuristics; else UI fallback. */
function normalizeDistanceToMiles(
  raw: unknown,
  activityType: string,
  headerHint: UnitHint,
  uiUnitSystem: UnitSystem
): number {
  const v = parseNumber(raw);
  if (!v) return 0;

  if (headerHint === 'mi') return v;
  if (headerHint === 'km') return v * 0.621371;
  if (headerHint === 'm')  return v / 1609.34;

  const t = canonicalizeActivityType(activityType);

  // meters-based exports usually integers
  if (t === 'Swimming' || t === 'Rowing' || t === 'SkiErg') {
    if (v >= 25) return v / 1609.34; // meters
  }
  // Running ≥100 likely meters (tracks/indoor)
  if (t === 'Running' && v >= 100 && Math.abs(v - Math.round(v)) < 1e-6) {
    return v / 1609.34;
  }
  // Fallback to UI selection (what user exported in)
  return uiUnitSystem === 'metric' ? v * 0.621371 : v;
}

/** Elevation/Ascent → ft: header hint wins; else magnitude; else UI fallback. */
function normalizeFeet(raw: unknown, headerHint: UnitHint, uiUnitSystem: UnitSystem): number {
  const v = parseNumber(raw);
  if (!v) return 0;
  if (headerHint === 'ft') return v;
  if (headerHint === 'm')  return v * 3.28084;

  // If large (500–12000), more likely meters in high-alt data
  if (v >= 500 && v <= 12000) return uiUnitSystem === 'metric' ? v * 3.28084 : v;

  // Else assume the export matches UI selection
  return uiUnitSystem === 'metric' ? v * 3.28084 : v;
}

/* ============================== Metrics ============================== */

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function computeMetrics(
  rows: CsvRow[],
  _locale: 'en',
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

  const runFamily  = ['Running', 'Treadmill Running', 'Track Running', 'Trail Running', 'Running'];
  const bikeFamily = ['Cycling', 'Indoor Cycling', 'Virtual Cycling'];
  const swimFamily = ['Pool Swim', 'Swimming', 'Open Water Swimming'];

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

    if (runFamily.includes(activityType)) {
      runDistanceMi += distanceMi; runSeconds += timeSeconds; runSessions += 1;
      if (!runLongest || distanceMi > runLongest.distanceMi) runLongest = { row, distanceMi };
    }
    if (bikeFamily.includes(activityType)) {
      bikeDistanceMi += distanceMi; bikeSeconds += timeSeconds; bikeSessions += 1;
      if (!bikeLongest || distanceMi > bikeLongest.distanceMi) bikeLongest = { row, distanceMi };
    }
    if (swimFamily.includes(activityType)) {
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

/* =================== Headerless mappers + schemas =================== */
const GARMIN_ACTIVITY_COL_INDEX = {
  ActivityType: 0,
  Date: 1,
  Title: 3,
  Distance: 4,
  Calories: 5,
  Time: 6,
  AvgHR: 7,
  MaxHR: 8,
  TotalAscent: 14,
  MovingTime: 40,
  ElapsedTime: 41,
  MaxElevation: 43,
  Steps: 29,
} as const;

function mapActivityRowsByIndex(rows2D: unknown[][]): CsvRow[] {
  const out: CsvRow[] = [];
  for (let i = 1; i < rows2D.length; i++) {
    const r = rows2D[i] as unknown[];
    if (!r?.length) continue;
    const row: CsvRow = {
      'Activity Type': asCell(r[GARMIN_ACTIVITY_COL_INDEX.ActivityType]),
      'Date':          asCell(r[GARMIN_ACTIVITY_COL_INDEX.Date]),
      'Title':         asCell(r[GARMIN_ACTIVITY_COL_INDEX.Title]),
      'Distance':      asCell(r[GARMIN_ACTIVITY_COL_INDEX.Distance]),
      'Calories':      asCell(r[GARMIN_ACTIVITY_COL_INDEX.Calories]),
      'Time':          asCell(r[GARMIN_ACTIVITY_COL_INDEX.Time]),
      'Avg HR':        asCell(r[GARMIN_ACTIVITY_COL_INDEX.AvgHR]),
      'Max HR':        asCell(r[GARMIN_ACTIVITY_COL_INDEX.MaxHR]),
      'Total Ascent':  asCell(r[GARMIN_ACTIVITY_COL_INDEX.TotalAscent]),
      'Moving Time':   asCell(r[GARMIN_ACTIVITY_COL_INDEX.MovingTime]),
      'Elapsed Time':  asCell(r[GARMIN_ACTIVITY_COL_INDEX.ElapsedTime]),
      'Max Elevation': asCell(r[GARMIN_ACTIVITY_COL_INDEX.MaxElevation]),
      'Steps':         asCell(r[GARMIN_ACTIVITY_COL_INDEX.Steps]),
    };
    if (row['Activity Type'] || row['Distance'] || row['Time'] || row['Elapsed Time'] || row['Calories']) out.push(row);
  }
  return out;
}

/* ----------------------- Sleep (headerless + heuristics) ----------------------- */
type SleepSchema = { name: string; columns: number; idx: { label: number; score: number; duration: number } };
const KNOWN_SLEEP_SCHEMAS: SleepSchema[] = [
  { name: 'sleep-weekly-4', columns: 4, idx: { label: 0, score: 1, duration: 2 } },
  // Fix: this export’s score is at col 1 (not 2); duration at 3
  { name: 'sleep-weekly-6', columns: 6, idx: { label: 0, score: 1, duration: 3 } },
  { name: 'sleep-weekly-7', columns: 7, idx: { label: 0, score: 1, duration: 3 } },
];
function isDurationLike(v: unknown): boolean {
  const s = toStringSafe(v);
  return /^(\d{1,2}):\d{2}$/.test(s) || /h/i.test(s) || /\bmin\b/i.test(s);
}
function isScoreLike(v: unknown): boolean {
  // Strict numeric-cell check (prevents parsing "27-Dec" as 27, or "2024 - Jan 2" as 2)
  const s = toStringSafe(v).replace(/\u00A0/g, ' ').trim();
  if (!/^\d{1,3}$/.test(s)) return false;
  const n = parseInt(s, 10);
  return n >= 1 && n <= 100;
}

function mapSleepRowsByIndex(rows2D: unknown[][]): CsvRow[] {
  if (!rows2D.length) return [];
  const header = rows2D[0] as unknown[];
  const rows = rows2D.slice(1) as unknown[][];

  // Fast-path: if all rows are uniform, we can use known fixed indices.
  const uniform = rows.every(r => Array.isArray(r) && r.length === header.length);
  const known = KNOWN_SLEEP_SCHEMAS.find(s => s.columns === header.length);
  if (uniform && known) {
    return rows.map(r => ({
      'Date':         asCell(r[known.idx.label]),
      'Avg Score':    asCell(r[known.idx.score]),
      'Avg Duration': asCell(r[known.idx.duration]),
    }));
  }

  // Robust-path: some Garmin exports "split" the Date/week label into extra year columns
  // (e.g., weeks spanning Dec→Jan). In that case, the score/duration columns shift per-row.
  return rows
    .map((r) => {
      if (!Array.isArray(r) || r.length === 0) return null;

      // Score = first 1..100 number in the row
      let scoreIdx = -1;
      for (let i = 0; i < r.length; i++) {
        if (isScoreLike(r[i])) { scoreIdx = i; break; }
      }
      if (scoreIdx === -1) return null;

      // Duration = first duration-like cell AFTER the score (avoids Avg Sleep Need if present)
      let durationIdx = -1;
      for (let i = scoreIdx + 1; i < r.length; i++) {
        if (isDurationLike(r[i])) { durationIdx = i; break; }
      }

      // Label = everything before score (drop standalone year columns like "2024")
      const label = r
        .slice(0, scoreIdx)
        .map(toStringSafe)
        .map(s => s.replace(/\u00A0/g, ' ').trim())
        .filter(Boolean)
        .filter(s => !/^\d{4}$/.test(s))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      return {
        'Date':         asCell(label),
        'Avg Score':    asCell(r[scoreIdx]),
        'Avg Duration': asCell(durationIdx !== -1 ? r[durationIdx] : null),
      } as CsvRow;
    })
    .filter((x): x is CsvRow => !!x);
}

 /* ----------------------- Steps (headerless + heuristics) ----------------------- */
type StepsSchema = { name: string; columns: number; idx: { label: number; steps: number; days?: number } };
const KNOWN_STEPS_SCHEMAS: StepsSchema[] = [
  { name: 'steps-weekly-3',  columns: 3, idx: { label: 0, steps: 1, days: 2 } },
  { name: 'steps-weekly-3b', columns: 3, idx: { label: 0, days: 1, steps: 2 } },
  { name: 'steps-weekly-4',  columns: 4, idx: { label: 0, steps: 2, days: 3 } },
];
function isLikelySteps(v: unknown): boolean { const n = parseIntStrict(v); return n >= 1000 && n <= 500000; }

function mapStepsRowsByIndex(rows2D: unknown[][]): CsvRow[] {
  if (!rows2D.length) return [];
  const header = rows2D[0] as unknown[];
  const rows = rows2D.slice(1) as unknown[][];
  const colCount = header.length;

  const known = KNOWN_STEPS_SCHEMAS.find(s => s.columns === colCount);
  if (known) {
    return rows.map((r, i) => ({
      'Label': asCell(r[known.idx.label]) ?? `Period ${i + 1}`,
      'Steps': asCell(r[known.idx.steps]),
      'Days':  known.idx.days != null ? asCell(r[known.idx.days]) : '',
    }));
  }

  const sample = rows.slice(0, Math.min(10, rows.length));

  let stepsCol = -1, stepsHits = -1;
  for (let c = 0; c < colCount; c++) {
    let hits = 0; for (const r of sample) if (isLikelySteps(r[c])) hits++;
    if (hits > stepsHits) { stepsHits = hits; stepsCol = c; }
  }

  let daysCol = -1, sevenHits = -1;
  for (let c = 0; c < colCount; c++) {
    let hits = 0; for (const r of sample) if (parseIntStrict(r[c]) === 7) hits++;
    if (hits > sevenHits) { sevenHits = hits; daysCol = c; }
  }
  if (sevenHits <= 1) daysCol = -1;

  let labelCol = -1;
  for (let c = 0; c < colCount; c++) {
    if (c === stepsCol || c === daysCol) continue;
    const v = sample[0]?.[c];
    if (isTextual(v)) { labelCol = c; break; }
  }
  if (labelCol === -1) labelCol = 0;

  return rows.map((r, i) => ({
    'Label': asCell(r[labelCol]) ?? `Period ${i + 1}`,
    'Steps': asCell(r[stepsCol]),
    'Days':  daysCol !== -1 ? asCell(r[daysCol]) : '',
  }));
}

/* ============================== Sleep & Steps metrics ============================== */

function computeSleepMetrics(rows: CsvRow[]): SleepMetrics {
  // Keep score + duration averages resilient to any row-level parsing oddities.
  // (e.g., year-spanning rows where the "Date" cell is split into extra columns)
  let scoreSum = 0, scoreCount = 0;
  let durationSum = 0, durationCount = 0;

  let bestScoreWeek: SleepMetrics['bestScoreWeek'] = null;
  let worstScoreWeek: SleepMetrics['worstScoreWeek'] = null;
  let longestSleepWeek: SleepMetrics['longestSleepWeek'] = null;

  rows.forEach((row) => {
    const score = parseNumber(row['Avg Score']);
    const label = toStringSafe(row['Date'] ?? row['Label'] ?? '');
    const durationMinutes = parseSleepDurationToMinutes(row['Avg Duration']);

    const hasScore = score > 0 && score <= 100;
    const hasDuration = durationMinutes > 0;

    if (!label || (!hasScore && !hasDuration)) return;

    if (hasScore) {
      scoreSum += score;
      scoreCount += 1;

      if (!bestScoreWeek || score > bestScoreWeek.score) bestScoreWeek = { label, score, durationMinutes };
      if (!worstScoreWeek || score < worstScoreWeek.score) worstScoreWeek = { label, score, durationMinutes };
    }

    if (hasDuration) {
      durationSum += durationMinutes;
      durationCount += 1;

      if (!longestSleepWeek || durationMinutes > longestSleepWeek.durationMinutes) {
        longestSleepWeek = { label, durationMinutes, score };
      }
    }
  });

  return {
    weeks: durationCount || scoreCount,
    avgScore: scoreCount ? scoreSum / scoreCount : 0,
    avgDurationMinutes: durationCount ? durationSum / durationCount : 0,
    bestScoreWeek,
    worstScoreWeek,
    longestSleepWeek,
  };
}

function computeStepsMetrics(rows: CsvRow[]): StepsMetrics {
  let periods = 0, totalSteps = 0, totalDays = 0;
  let bestWeek: StepsMetrics['bestWeek'] | null = null;

  const looksWeekly = true;

  rows.forEach((row, idx) => {
    const steps = parseIntStrict(row['Steps']);
    if (!steps) return;

    const label = toStringSafe(row['Week'] ?? row['Label'] ?? row['Date'] ?? row[''] ?? `Period ${idx + 1}`);
    const daysInPeriod = parseIntStrict(row['Days']) || (looksWeekly ? 7 : 1);

    periods += 1; totalSteps += steps; totalDays += daysInPeriod;

    if (!bestWeek || steps > bestWeek.steps) {
      bestWeek = { label: label || (looksWeekly ? `Week ${periods}` : `Day ${periods}`), steps };
    }
  });

  const days = totalDays || (looksWeekly ? periods * 7 : periods || 1);
  const avgStepsPerDay = totalSteps / days;

  return { weeks: periods, totalSteps, avgStepsPerDay, bestWeek };
}

/* =================================== Promise wrapper =================================== */

type RawRow = unknown[];
type Raw2D = RawRow[];

// Minimal Papa Parse config type (avoids BaseConfig/ParseConfig typing differences across papaparse versions)
type PapaConfig<T> = {
  header?: boolean;
  dynamicTyping?: boolean | Record<string, boolean>;
  skipEmptyLines?: boolean | 'greedy';
  worker?: boolean;
  transformHeader?: (header: string, index: number) => string;
  step?: (results: ParseResult<T>, parser: any) => void;
  complete?: (results: ParseResult<T>) => void;
  error?: (error: any) => void;
  [key: string]: any;
};


const PAPA_ROWS_CONFIG: PapaConfig<RawRow> = {
  header: false,
  skipEmptyLines: true,
};

/** Promise-based wrapper around Papa.parse (local File/Blob only). */
function parseCsvFile<T = RawRow>(
  file: File | Blob,
  config?: PapaConfig<T>
): Promise<ParseResult<T>> {
  return new Promise<ParseResult<T>>((resolve, reject) => {
    // Build a config object that is correctly typed to the row shape `T`.
    // This avoids generic mismatches when callers pass configs typed for CsvRow vs RawRow.
    const cfg = {
      // sensible defaults (caller can override)
      skipEmptyLines: true,
      ...(config ?? {}),
      complete: (results: ParseResult<T>) => resolve(results),
      error: (err: unknown) => reject(err),
    } as PapaConfig<T>;

    Papa.parse<T>(file as any, cfg as any);
  });
}


/* =================================== UI =================================== */

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
  const [unitSystem, setUnitSystem] = useState<UnitSystem | null>(null);

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sleepMetrics, setSleepMetrics] = useState<SleepMetrics | null>(null);
  const [sleepError, setSleepError] = useState<string | null>(null);

  const [stepsMetrics, setStepsMetrics] = useState<StepsMetrics | null>(null);
  const [stepsError, setStepsError] = useState<string | null>(null);

  const pageRef = useRef<HTMLDivElement | null>(null);

  /* -------- Activities (headerless + indices) -------- */
  const handleActivitiesFile = async (file: File) => {
    try {
      if (!unitSystem) throw new Error('Select units before uploading.');

      const results = await parseCsvFile<RawRow>(file, PAPA_ROWS_CONFIG);
      const raw2D = (results.data as Raw2D).filter(r => Array.isArray(r) && r.length > 0);
      if (!raw2D.length) throw new Error('No activity rows found.');

      // Header hints for unit auto-detect
      const header = raw2D[0] as unknown[] as string[];
      const distanceHeader  = header[GARMIN_ACTIVITY_COL_INDEX.Distance]      ?? '';
      const ascentHeader    = header[GARMIN_ACTIVITY_COL_INDEX.TotalAscent]   ?? '';
      const elevationHeader = header[GARMIN_ACTIVITY_COL_INDEX.MaxElevation]  ?? '';
      const unitHints = {
        distance:  unitHintFromHeaderDistance(distanceHeader),
        ascent:    unitHintFromHeaderElev(ascentHeader),
        elevation: unitHintFromHeaderElev(elevationHeader),
      };

      const rows = mapActivityRowsByIndex(raw2D);
      const m = computeMetrics(rows, 'en', unitSystem, unitHints);
      setMetrics(m);
      setError(null);
    } catch (e) {
      console.error(e);
      setMetrics(null);
      setError('Failed reading that Activities CSV.');
    }
  };

  /* -------- Sleep (headerless + heuristics) -------- */
  const handleSleepFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setSleepError(null);
    try {
      const results = await parseCsvFile<RawRow>(file, PAPA_ROWS_CONFIG);
      const raw2D = (results.data as Raw2D).filter(r => r && r.length > 0);
      if (!raw2D.length) throw new Error('No sleep rows found.');
      const rows = mapSleepRowsByIndex(raw2D);
      const m = computeSleepMetrics(rows);
      setSleepMetrics(m);
    } catch (e) {
      console.error(e);
      setSleepMetrics(null);
      setSleepError('Failed to parse Sleep CSV.');
    }
  };

  /* -------- Steps (headerless + heuristics) -------- */
  const handleStepsFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setStepsError(null);
    try {
      const results = await parseCsvFile<RawRow>(file, PAPA_ROWS_CONFIG);
      const raw2D = (results.data as Raw2D).filter(r => r && r.length > 0);
      if (!raw2D.length) throw new Error('No steps rows found.');
      const rows = mapStepsRowsByIndex(raw2D);
      const m = computeStepsMetrics(rows);
      setStepsMetrics(m);
    } catch (e) {
      console.error(e);
      setStepsMetrics(null);
      setStepsError('Failed to parse Steps CSV.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!unitSystem) {
      setError('Select units (Imperial or Metric) before uploading.');
      e.currentTarget.value = '';
      return;
    }
    setError(null);
    await handleActivitiesFile(file);
  };

  const handleDownloadImage = async () => {
    if (!pageRef.current) return;
    const node = pageRef.current;
    try {
      const dataUrl = await htmlToImage.toPng(node, { cacheBust: true, width: node.scrollWidth, height: node.scrollHeight, backgroundColor: '#000000' });
      const link = document.createElement('a');
      link.href = dataUrl; link.download = 'garmin-wrapped.png';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } catch (err) { console.error('Failed to generate image', err); alert('Sorry, something went wrong generating the image.'); }
  };

  /* -------- Render helpers -------- */
  const m = metrics;
  const step = stepsMetrics;

  const isMetric = unitSystem === 'metric';

  const totalStepsStr = step ? step.totalSteps.toLocaleString() : null;
  const avgStepsStr = step?.avgStepsPerDay
    ? `${Math.round(step.avgStepsPerDay).toLocaleString()} / day`
    : null;

  // Total distance
  const distanceVal = m
    ? isMetric
      ? m.totalDistanceMi * 1.60934
      : m.totalDistanceMi
    : null;
  const distanceStr =
    distanceVal != null
      ? `${distanceVal.toFixed(2)} ${isMetric ? 'km' : 'mi'}`
      : '--';

  const earthPercentStr = m ? `${m.earthPercent.toFixed(2)}%` : '--';
  const totalTimeStr = m ? formatDurationLong(m.totalActivitySeconds) : '--';
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
      1
    )} hrs`;

  const ls = m?.longestStreak;
  const streakStr =
    ls && ls.lengthDays > 0
      ? `${ls.lengthDays} day${ls.lengthDays === 1 ? '' : 's'}`
      : '--';
  const streakRange = ls
    ? ls.start === ls.end
      ? `${ls.start}`
      : `${ls.start} → ${ls.end}`
    : '';

  // Elevation / ascent
  const totalAscentVal = m?.totalAscent;
  const maxElevationVal = m?.maxElevation;

  const totalAscentStr =
    totalAscentVal != null
      ? isMetric
        ? `${Math.round(totalAscentVal * 0.3048)} m`
        : `${Math.round(totalAscentVal)} ft`
      : '--';

  const maxElevationStr =
    maxElevationVal != null
      ? isMetric
        ? `${Math.round(maxElevationVal * 0.3048)} m`
        : `${Math.round(maxElevationVal)} ft`
      : '--';

  // Averages per session
  const avgDistanceVal =
    m?.avgDistanceMi != null
      ? isMetric
        ? m.avgDistanceMi * 1.60934
        : m.avgDistanceMi
      : null;

  const avgDistanceStr =
    avgDistanceVal != null
      ? `${avgDistanceVal.toFixed(2)} ${isMetric ? 'km' : 'mi'} / session`
      : '--';

  const avgDurationStr =
    m?.avgDurationSeconds != null
      ? `${formatDurationHMS(m.avgDurationSeconds)} / session`
      : '--';

  // Running summary
  const rdMi = m?.runDistanceMi ?? 0;
  const rs = m?.runSeconds ?? 0;
  const runDistanceVal = rdMi
    ? isMetric
      ? rdMi * 1.60934
      : rdMi
    : 0;

  const runDistanceStr = runDistanceVal
    ? `${runDistanceVal.toFixed(1)} ${isMetric ? 'km' : 'mi'}`
    : '--';

  const runTimeStr = rs ? formatDurationHMS(rs) : '--';
  const runPaceStr =
    rdMi > 0 && rs > 0 ? formatPacePerUnit(rs, rdMi, unitSystem) : '--';

  // Cycling summary
  const bdMi = m?.bikeDistanceMi ?? 0;
  const bs = m?.bikeSeconds ?? 0;
  const bikeDistanceVal = bdMi
    ? isMetric
      ? bdMi * 1.60934
      : bdMi
    : 0;

  const bikeDistanceStr = bikeDistanceVal
    ? `${bikeDistanceVal.toFixed(1)} ${isMetric ? 'km' : 'mi'}`
    : '--';

  const bikeTimeStr = bs ? formatDurationHMS(bs) : '--';

  const bikeSpeedMph = bdMi > 0 && bs > 0 ? bdMi / (bs / 3600) : 0;
  const bikeSpeedStr = bikeSpeedMph
    ? isMetric
      ? `${(bikeSpeedMph * 1.60934).toFixed(1)} km/h`
      : `${bikeSpeedMph.toFixed(1)} mph`
    : '--';

  // Swim already in meters
  const swimDistanceStr =
    m?.swimMeters != null ? `${m.swimMeters.toLocaleString()} m` : '--';
  const swimTimeStr =
    m?.swimSeconds != null ? formatDurationHMS(m.swimSeconds) : '--';
  const swimPaceStr =
    m?.swimSeconds && m?.swimMeters
      ? formatSwimPacePer100m(m.swimSeconds, m.swimMeters)
      : '--';

  // Steps → marathons / 5Ks (kept in miles internally)
  const stepsMiles = step ? (step.totalSteps * FEET_PER_STEP) / 5280 : 0;
  const marathonsFromSteps = stepsMiles
    ? Math.round(stepsMiles / MARATHON_MI)
    : 0;
  const fiveKsFromSteps = stepsMiles ? Math.round(stepsMiles / FIVEK_MI) : 0;

  const unitHint = unitSystem
    ? unitSystem === 'imperial'
      ? 'Units: Imperial (mi/ft)'
      : 'Units: Metric (km/m)'
    : 'Units: —';

  const topTypes: ActivityTypeSummary[] = m?.topActivityTypes ?? [];

  const longestTypeStr = m?.longestActivity ? getLongestTypeLabel(m.longestActivity) : 'Long day out';
  const highestEffortStr = m?.highestCalorie ? getHighestEffortLabel(m.highestCalorie) : 'Big day in the pain cave';


  return (
      <div
        ref={pageRef}
        className="min-h-screen bg-zinc-950 text-white"
      >
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold mb-2">
            Garmin Wrapped
            </h1>
            <p className="text-sm text-zinc-400">
            {m?.startDateDisplay && m?.endDateDisplay
                ? `${m.startDateDisplay} – ${m.endDateDisplay}`
                : 'Upload CSVs to see your year'}
            <span className="text-zinc-500"> · </span>
            <span className="text-zinc-500">{unitHint}</span>
            </p>
        </div>

        <div className="flex flex-col items-stretch sm:items-end gap-2 sm:gap-3">
            {/* First row: units + main upload */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:justify-end">
            {/* Units pill */}
            <div className="inline-flex items-center gap-3 text-xs text-zinc-200 bg-zinc-900/80 border border-zinc-700 rounded-full px-3 py-1">
                <span className="text-zinc-400">Units:</span>
                <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                    type="radio"
                    name="units"
                    value="imperial"
                    checked={unitSystem === 'imperial'}
                    onChange={() => setUnitSystem('imperial')}
                />
                <span>Imperial</span>
                </label>
                <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                    type="radio"
                    name="units"
                    value="metric"
                    checked={unitSystem === 'metric'}
                    onChange={() => setUnitSystem('metric')}
                />
                <span>Metric</span>
                </label>
            </div>

            {/* Main activities upload */}
            <label className="inline-flex items-center gap-2 text-sm text-zinc-200 bg-zinc-900/80 border border-zinc-700 rounded-full px-4 py-2 cursor-pointer hover:bg-zinc-800 hover:border-zinc-500 transition">
                <Upload className="w-4 h-4" />
                <span>Upload Activities CSV</span>
                <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileChange}
                />
            </label>
            </div>

            {/* Second row: optional uploads */}
            <div className="flex flex-wrap gap-2 sm:justify-end">
            <label className="inline-flex items-center gap-2 text-xs text-zinc-300 bg-zinc-900/60 border border-zinc-700 rounded-full px-3 py-1 cursor-pointer hover:bg-zinc-800 hover:border-zinc-500 transition">
                <Upload className="w-3 h-3" />
                <span>Sleep CSV (optional)</span>
                <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleSleepFileChange}
                />
            </label>

            <label className="inline-flex items-center gap-2 text-xs text-zinc-300 bg-zinc-900/60 border border-zinc-700 rounded-full px-3 py-1 cursor-pointer hover:bg-zinc-800 hover:border-zinc-500 transition">
                <Upload className="w-3 h-3" />
                <span>Steps CSV (optional)</span>
                <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleStepsFileChange}
                />
            </label>
            </div>

            {/* Download + errors */}
            <div className="flex flex-col items-start sm:items-end gap-1">
            {metrics && (
                <button
                type="button"
                onClick={handleDownloadImage}
                className="text-xs sm:text-sm text-zinc-100 bg-zinc-800/80 border border-zinc-600 rounded-full px-4 py-2 hover:bg-zinc-700 hover:border-zinc-400 transition"
                >
                Download as image
                </button>
            )}

            {error && (
                <p className="text-xs text-red-400 max-w-xs text-right">{error}</p>
            )}
            {sleepError && (
                <p className="text-xs text-red-400 max-w-xs text-right">
                {sleepError}
                </p>
            )}
            {stepsError && (
                <p className="text-xs text-red-400 max-w-xs text-right">
                {stepsError}
                </p>
            )}
            </div>
        </div>
        </header>

        {/* Distance + Core */}
        {metrics && (
          <div className="space-y-8">
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
                    <div className="text-lg text-zinc-300 mt-2">
                      That&apos;s <span className="font-semibold">{earthPercentStr}</span> of the way around Earth.
                      {step && totalStepsStr && (
                        <div className="text-lg text-zinc-300 mt-1">
                          <span className="font-semibold text-lg sm:text-xl">{totalStepsStr} steps</span>
                          {avgStepsStr && <> <span className="font-semibold text-lg sm:text-xl">{avgStepsStr}</span></>}
                          {(marathonsFromSteps || fiveKsFromSteps) ? (
                            <div className="text-lg text-zinc-400 mt-1">
                              ~{marathonsFromSteps.toLocaleString()} marathons • ~{fiveKsFromSteps.toLocaleString()} 5Ks
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
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
              <StatCard icon={HeartPulse} value={maxHrStr} label="Max heart rate" helper="Highest recorded BPM." />
              <StatCard icon={HeartPulse} value={avgHrStr} label="Average heart rate" helper="Across sessions with HR data." />
              <StatCard icon={Flame} value={caloriesStr} label="Calories burned" helper="Total estimated energy output." />
            </section>

            {/* Averages */}
            <section className="grid gap-5 md:grid-cols-3">
              <StatCard icon={Timer} value={avgDurationStr} label="Avg duration" helper="Per session." />
              <StatCard icon={Activity} value={avgDistanceStr} label="Avg distance" helper="Per activity." />
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
                        <div className="font-semibold text-xs sm:text-sm opacity-90">
                          {(isMetric
                            ? m.runLongest.distanceMi * 1.60934
                            : m.runLongest.distanceMi
                          ).toFixed(1)} {isMetric ? 'km' : 'mi'}
                        </div>
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
                        <div className="font-semibold text-xs sm:text-sm opacity-90">
                          {(isMetric
                            ? m.bikeLongest.distanceMi * 1.60934
                            : m.bikeLongest.distanceMi
                          ).toFixed(1)} {isMetric ? 'km' : 'mi'}
                        </div>
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
                    <p className="text-xs text-zinc-300">Pool & open water (meters)</p>
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
              {m?.longestActivity && (
                <div className="bg-zinc-900/80 border border-zinc-700/70 rounded-3xl p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-9 w-9 rounded-2xl bg-yellow-500/10 flex items-center justify-center border border-yellow-400/50">
                      <Trophy className="w-5 h-5 text-yellow-300" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-yellow-300">Longest activity</p>
                      <p className="text-sm text-zinc-300">{m.longestActivity.date || '--'}</p>
                    </div>
                  </div>
                  <p className="text-lg sm:text-xl font-semibold mb-2">{m.longestActivity.title}</p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div><p className="text-zinc-400 text-xs">Duration</p><p className="text-zinc-100 font-medium">{formatDurationHMS(m.longestActivity.durationSeconds)}</p></div>
                    <div><p className="text-zinc-400 text-xs">Calories</p><p className="text-zinc-100 font-medium">{m.longestActivity.calories != null ? `${m.longestActivity.calories} kcal` : '--'}</p></div>
                    <div><p className="text-zinc-400 text-xs">Type</p><p className="text-zinc-100 font-medium">{longestTypeStr}</p></div>
                  </div>
                </div>
              )}
              {m?.highestCalorie && (
                <div className="bg-zinc-900/80 border border-zinc-700/70 rounded-3xl p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-9 w-9 rounded-2xl bg-orange-500/10 flex items-center justify-center border border-orange-400/50">
                      <Flame className="w-5 h-5 text-orange-300" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-orange-300">Highest calorie burn</p>
                      <p className="text-sm text-zinc-300">{m.highestCalorie.date || '--'}</p>
                    </div>
                  </div>
                  <p className="text-lg sm:text-xl font-semibold mb-2">{m.highestCalorie.title}</p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div><p className="text-zinc-400 text-xs">Duration</p><p className="text-zinc-100 font-medium">{m.highestCalorie.durationSeconds ? formatDurationHMS(m.highestCalorie.durationSeconds) : '--'}</p></div>
                    <div><p className="text-zinc-400 text-xs">Calories</p><p className="text-zinc-100 font-medium">{m.highestCalorie.calories} kcal</p></div>
                    <div><p className="text-zinc-400 text-xs">Effort</p><p className="text-zinc-100 font-medium">{highestEffortStr}</p></div>
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
                {totalAscentVal != null && (
                  <div className="text-md text-zinc-400 mt-2">≈ <span className="font-semibold text-zinc-200">{(totalAscentVal / EVEREST_FT).toFixed(2)}</span> Mount Everests</div>
                )}
              </div>
            </section>

            {/* By activity type */}
            {topTypes.length ? (
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
                        {(isMetric ? t.totalDistanceMi * 1.60934 : t.totalDistanceMi
                        ).toFixed(1)} {isMetric ? 'km' : 'mi'} · {formatDurationHMS(t.totalSeconds)}                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
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
          <p className="text-[0.7rem] sm:text-xs uppercase tracking-[0.2em] text-indigo-200">
            Sleep Wrapped
          </p>
          <p className="text-sm sm:text-base text-zinc-300">
            {sleepMetrics.weeks} weeks of tracked sleep
          </p>
        </div>
      </div>
    </div>

    <div className="grid gap-6 md:grid-cols-3 items-start">
      {/* Big averages */}
      <div className="space-y-4 md:space-y-5">
        <div>
          <p className="text-zinc-400 text-xs uppercase tracking-wide">
            Average sleep score
          </p>
          <p className="text-3xl sm:text-4xl font-semibold">
            {sleepMetrics.avgScore.toFixed(1)}
          </p>
        </div>
        <div>
          <p className="text-zinc-400 text-xs uppercase tracking-wide">
            Average nightly duration
          </p>
          <p className="text-2xl sm:text-3xl font-semibold">
            {(() => {
              const mins = sleepMetrics.avgDurationMinutes;
              const h = Math.floor(mins / 60);
              const mR = Math.round(mins % 60);
              return `${h}h ${mR}m`;
            })()}
          </p>
        </div>
      </div>

      {/* Best / Worst weeks */}
      <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sleepMetrics.bestScoreWeek && (
          <div className="bg-black/40 border border-emerald-500/40 rounded-2xl p-4 flex flex-col gap-1.5">
            <p className="text-[0.7rem] uppercase tracking-[0.18em] text-emerald-300">
              Best week
            </p>
            <p className="text-sm sm:text-base font-semibold text-zinc-100">
              {sleepMetrics.bestScoreWeek.label}
            </p>
            <p className="text-sm text-zinc-300">
              Avg score:{' '}
              <span className="font-semibold">
                {Math.round(sleepMetrics.bestScoreWeek.score)}
              </span>
            </p>
            <p className="text-xs text-zinc-500">
              Avg duration:{' '}
              {(() => {
                const mins = sleepMetrics.bestScoreWeek!.durationMinutes;
                const h = Math.floor(mins / 60);
                const mR = Math.round(mins % 60);
                return `${h}h ${mR}m`;
              })()}
            </p>
          </div>
        )}

        {sleepMetrics.worstScoreWeek && (
          <div className="bg-black/40 border border-red-500/40 rounded-2xl p-4 flex flex-col gap-1.5">
            <p className="text-[0.7rem] uppercase tracking-[0.18em] text-red-300">
              Worst week
            </p>
            <p className="text-sm sm:text-base font-semibold text-zinc-100">
              {sleepMetrics.worstScoreWeek.label}
            </p>
            <p className="text-sm text-zinc-300">
              Avg score:{' '}
              <span className="font-semibold">
                {Math.round(sleepMetrics.worstScoreWeek.score)}
              </span>
            </p>
            <p className="text-xs text-zinc-500">
              Avg duration:{' '}
              {(() => {
                const mins = sleepMetrics.worstScoreWeek!.durationMinutes;
                const h = Math.floor(mins / 60);
                const mR = Math.round(mins % 60);
                return `${h}h ${mR}m`;
              })()}
            </p>
          </div>
        )}
      </div>
    </div>
  </section>
)}

                {/* How to export (Garmin Connect) */}
        <div className="mt-3 text-xs text-zinc-500 leading-relaxed">
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-1">How to export CSVs</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <a
                className="text-zinc-300 underline hover:text-white"
                href="https://connect.garmin.com/modern/activities"
                target="_blank"
                rel="noreferrer"
              >
                Activities
              </a>
              : scroll to the last activity you want → <span className="text-zinc-300">Export CSV</span>.
            </li>
            <li>
              <a
                className="text-zinc-300 underline hover:text-white"
                href="https://connect.garmin.com/modern/report/29/wellness/last_year"
                target="_blank"
                rel="noreferrer"
              >
                Steps
              </a>
              : set to <span className="text-zinc-300">1 Year</span> → <span className="text-zinc-300">Export</span>.
            </li>
            <li>
              <a
                className="text-zinc-300 underline hover:text-white"
                href="https://connect.garmin.com/modern/sleep"
                target="_blank"
                rel="noreferrer"
              >
                Sleep
              </a>
              : set to <span className="text-zinc-300">1 Year</span> → three dots → <span className="text-zinc-300">Export CSV</span>.
            </li>
          </ul>
        </div>

        <footer className="mt-10 text-xs text-zinc-500">
          <p>© 2025 Jordan Lindsay. Not affiliated with Garmin Ltd.</p>
        </footer>
      </main>
    </div>
  );
}
