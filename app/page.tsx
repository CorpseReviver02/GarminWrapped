// app/page.tsx
'use client';

import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import * as htmlToImage from 'html-to-image';
import {
  Activity, Flame, HeartPulse, LineChart, Mountain, Timer,
  CalendarDays, Trophy, Dumbbell, Zap, Upload, Bike, Waves,
} from 'lucide-react';

/* ----------------------------- Types ----------------------------- */

type CsvPrimitive = string | number | boolean | null | undefined;
type CsvRow = Record<string, CsvPrimitive>;

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
  totalAscent?: number;       // feet
  maxElevation?: number;      // feet
  avgDistanceMi?: number;
  avgDurationSeconds?: number;
  activityTypesCount: number;
  topActivityTypes?: ActivityTypeSummary[];
  startDateDisplay?: string;
  endDateDisplay?: string;
  grindDay?: { name: string; totalHours: number; activities: number };

  // By-sport breakdown
  runDistanceMi?: number; runSeconds?: number; runSessions?: number;
  bikeDistanceMi?: number; bikeSeconds?: number; bikeSessions?: number;
  swimMeters?: number; swimSeconds?: number; swimSessions?: number;

  // Per-sport longest-by-distance
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

type LocaleHint = 'en' | 'fr' | 'de' | 'es' | 'nl';
type UnitSystem = 'imperial' | 'metric';

/* ------------------------ Header remap ------------------------ */

function toStringSafe(v: unknown): string { return String(v ?? '').trim(); }
function normalizeKey(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const CANONICAL_KEYS = [
  'Activity Type','Distance','Time','Moving Time','Elapsed Time','Calories',
  'Max HR','Avg HR','Total Ascent','Max Elevation','Date','Title',
  'Avg Score','Avg Duration','Week','Label','Start','Steps','Total Steps','Total steps','Weekly Steps','Actual','Days',
] as const;
type Canonical = typeof CANONICAL_KEYS[number];

const SEED_ALIASES: Record<Canonical, string[]> = {
  'Activity Type': [
    // FR
    'type d’activité','type d activite','typedactivite',
    // DE
    'aktivitätsart','aktivitaetsart','sportart',
    // ES
    'tipo de actividad','tipo actividad',
    // NL
    'activiteitstype','type activiteit',
  ],
  Distance: [
    'distance',           // EN / FR
    'distanz','strecke',  // DE
    'distancia',          // ES
    'afstand',            // NL
  ],
  Time: [
    'temps','durée','duree',
    'zeit','dauer',
    'tiempo','duración','duracion',
    'tijd','duur',
  ],
  'Moving Time': [
    'temps de déplacement','temps de deplacement',
    'bewegungszeit',
    'tiempo en movimiento','tiempo de movimiento',
    'beweegtijd','tijd in beweging',
  ],
  'Elapsed Time': [
    'temps écoulé','temps ecoule',
    'verstrichene zeit','gesamtzeit',
    'tiempo transcurrido','tiempo total','tiempo empleado',
    'verstreken tijd','totale tijd',
  ],
  Calories: [
    'calories',
    'kalorien','kcal',
    'calorias','calorías',
    'calorien','calorieen','calorieën','kcal',
  ],
  'Max HR': [
    'fc max','frequence cardiaque max','frequence cardiaque maximale','fréquence cardiaque maximale',
    'max hf','maximale herzfrequenz','höchste herzfrequenz','hoechste herzfrequenz','max. puls',
    'fc máxima','fc maxima','frecuencia cardiaca máxima','frecuencia cardiaca maxima',
    'maximale hartslag','max hartslag',
  ],
  'Avg HR': [
    'fc moy','frequence cardiaque moy','frequence cardiaque moyenne','fréquence cardiaque moyenne',
    'durchschnittliche herzfrequenz','avg hf','durchschn. hf',
    'fc media','fc promedio','frecuencia cardiaca media','frecuencia cardiaca promedio',
    'gemiddelde hartslag','gem. hartslag',
  ],
  'Total Ascent': [
    'ascension totale','dénivelé positif','denivele positif',
    'aufstieg gesamt','hoehenmeter','höhenmeter','gesamtaufstieg','gesamtanstieg',
    'ascenso total','desnivel positivo total',
    'totale stijging','totaal stijgen','hoogtemeters',
  ],
  'Max Elevation': [
    'altitude max','altitude maximale','hauteur max',
    'maximale hoehe','max hoehe','maximale höhe','max höhe',
    'altitud maxima','altitud máxima',
    'maximale hoogte','hoogste punt',
  ],
  Date: ['date','datum','fecha'],
  Title: ['titre','titel','titulo','título','naam'],
  'Avg Score': [
    'score moy','note moy',
    'durchschn. punktzahl','durchschnittliche punktzahl',
    'puntuacion media','puntuación media','puntuacion promedio','puntuación promedio',
    'gemiddelde score',
  ],
  'Avg Duration': [
    'durée moy','duree moy',
    'durchschn. dauer',
    'duración media','duracion media',
    'gemiddelde duur',
  ],
  Week: ['semaine','woche','semana','week'],
  Label: ['libellé','libelle','bezeichnung','etiqueta','label'],
  Start: ['début','debut','anfang','start','inicio','comienzo','begin','starttijd'],
  Steps: ['pas','schritte','pasos','stappen'],
  'Total Steps': [
    'nombre total de pas','gesamt schritte','schritte gesamt',
    'pasos totales','total de pasos',
    'totaal aantal stappen','totale stappen',
  ],
  'Total steps': ['total steps'], // keep for weird English variants
  'Weekly Steps': [
    'pas hebdomadaires',
    'wöchentliche schritte','woechentliche schritte',
    'pasos semanales',
    'wekelijkse stappen',
  ],
  Actual: ['réel','real','ist','efectivo','realizado'],
  Days: ['jours','tage','días','dias','dagen'],
};


function buildHeaderMap(rows: CsvRow[]): {
  map: Record<string, Canonical>;
  locale: LocaleHint;
  filteredRows: CsvRow[];
} {
  if (!rows.length) return { map: {}, locale: 'en', filteredRows: rows };

  const headers = Object.keys(rows[0] ?? {});
  const reverse: Record<string, Canonical> = {};
  const aliasBag = Object.fromEntries(
    (CANONICAL_KEYS as readonly string[]).map(k => [
      k as Canonical,
      new Set<string>(SEED_ALIASES[k as Canonical] ?? []),
    ])
  ) as Record<Canonical, Set<string>>;

  const hasLegend = headers.includes('English header');
  const filteredRows: CsvRow[] = [];

  if (hasLegend) {
    const r0 = rows[0] ?? {};
    const r1 = rows[1] ?? {};
    const r0IsLegend = /header/i.test(String(r0['English header'] ?? ''));
    if (r0IsLegend) {
      for (const h of headers) {
        const canonical = h as Canonical;
        const v0 = toStringSafe(r0[h] ?? '');
        const v1 = toStringSafe(r1[h] ?? '');
        if (aliasBag[canonical]) {
          if (v0) aliasBag[canonical]!.add(v0);
          if (v1) aliasBag[canonical]!.add(v1);
        }
      }
    }
    for (const row of rows) {
      const marker = toStringSafe(row['English header']);
      if (/header/i.test(marker)) continue;
      filteredRows.push(row);
    }
  } else {
    filteredRows.push(...rows);
  }

  for (const canonical of CANONICAL_KEYS) {
    const aliases = [canonical, ...(aliasBag[canonical] ? Array.from(aliasBag[canonical]!) : [])];
    for (const a of aliases) {
      const key = normalizeKey(a);
      if (!reverse[key] || a === canonical) reverse[key] = canonical;
    }
  }

  // Locale hint
  let locale: LocaleHint = 'en';
  const learned = Object.keys(reverse).join(' ');

  if (/[éèêàç]|activite|deplacement|denivele/.test(learned)) locale = 'fr';
  if (/aktiv|bewegungszeit|hoehe|schritte/.test(learned)) locale = 'de';
  if (/frecuencia|cardiac|distancia|pasos|semana/.test(learned)) locale = 'es';
  if (/afstand|hartslag|stappen|week/.test(learned)) locale = 'nl';

  return { map: reverse, locale, filteredRows };
}

function remapRowsToCanonical(rows: CsvRow[], map: Record<string, Canonical>): CsvRow[] {
  const out: CsvRow[] = [];
  for (const row of rows) {
    const remapped: CsvRow = {};
    for (const [k, v] of Object.entries(row)) {
      const hit = map[normalizeKey(k)];
      if (hit) {
        if (remapped[hit] == null || remapped[hit] === '') remapped[hit] = v;
      } else {
        remapped[k] = v;
      }
    }
    out.push(remapped);
  }
  return out;
}

/* ------------------------ Parsing + units ------------------------ */

const EARTH_CIRCUMFERENCE_MI = 24901;
//const MARATHON_MI = 26.2188;
//const FIVEK_MI = 3.10686;
const EVEREST_FT = 29032;

/** Locale-robust numeric parser */
function parseNumber(value: unknown): number {
  if (value == null) return 0;
  let s = String(value).trim();

  // remove spaces incl NBSP/thin
  s = s.replace(/[\u00A0\u2007\u202F\s]/g, '');

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  const onlyDigits = s.replace(/[^\d]/g, '');
  if (!onlyDigits) return 0;

  const usThousands = /^\d{1,3}(,\d{3})+$/;
  const euThousands = /^\d{1,3}(\.\d{3})+$/;

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      s = s.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(/,/, '.');
    } else {
      s = s.replace(/,(?=\d{3}(?:\D|$))/g, '');
    }
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

function parseTimeToSeconds(value: unknown): number {
  const s = toStringSafe(value);
  if (!s) return 0;
  const parts = s.split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return 0;
  if (parts.length === 3) { const [h, m, sec] = parts as [number, number, number]; return h * 3600 + m * 60 + sec; }
  if (parts.length === 2) { const [m, sec] = parts as [number, number]; return m * 60 + sec; }
  return 0;
}

function parseDateWithLocale(value: unknown, locale: LocaleHint): Date | null {
  const s = toStringSafe(value).replace(/\u00A0/g, ' ');
  if (!s) return null;
  const iso = new Date(s); if (!Number.isNaN(iso.getTime())) return iso;

  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (dmy) {
    const d = parseInt(dmy[1]!, 10), m = parseInt(dmy[2]!, 10), y = parseInt(dmy[3]!, 10);
    const hh = dmy[4] ? parseInt(dmy[4]!, 10) : 0; const mm = dmy[5] ? parseInt(dmy[5]!, 10) : 0;
    const year = y < 100 ? 2000 + y : y;
    const isDMY = locale !== 'en' || d > 12;
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
function formatDateDisplay(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
  const units = meters / 100; if (!units) return '--';
  const s = Math.round(totalSeconds / units);
  const min = Math.floor(s / 60); const sec = s % 60;
  return `${min}:${sec.toString().padStart(2, '0')}/100m`;
}

/* ---------------------------- Activity type normalization ---------------------------- */

function canonicalizeActivityType(raw: string): string {
  const s = normalizeKey(raw);

  // Running family
  if (/courseapied|jogging|lauf(?!band)|running|trackrunning|trailrunning|correr|corrida|laufstrecke/.test(s)) return 'Running';
  if (/tapis.*course|laufband|tapisroulant/.test(s)) return 'Running';
  if (/piste.*course|bahn/.test(s)) return 'Running';

  // Cycling family
  if (/cyclisme|velo|radfahren|fahrrad|biking|cycling|virtualcycling|indoorcycling|spinning|vtt|mountainbike/.test(s)) return 'Cycling';

  // Swimming family
  if (/natation|schwimmen|swimming|poolswim|openwaterswimming|freibad|hallenbad/.test(s)) return 'Swimming';

  // Rowing (meters-based like Swimming)
  if (/aviron|rameur|rudern|rowing|rowerg|ergometer/.test(s)) return 'Rowing';

  // SkiErg (meters-based)
  if (/(skierg|ski[\s-]*erg|ergomet)/.test(s)) return 'SkiErg';

  // Walking
  if (/marche|spaziergang|gehen|walking|walk/.test(s)) return 'Walking';

  // Hiking
  if (/randonnee|randonn|wanderung|hiking|hike|bergsteigen|alpine/.test(s)) return 'Hiking';

  // Strength / weights / gym
  if (/musculation|renforcement|krafttraining|kraft|strength|weights|haltern|weighttraining|functional|hiit/.test(s)) return 'Strength Training';

  if (/elliptique|crosstrainer|elliptical/.test(s)) return 'Elliptical';
  if (/yoga/.test(s)) return 'Yoga';
  if (/pilates/.test(s)) return 'Pilates';

  return raw || 'Other';
}

/* --------------------------- Distance & elevation units --------------------------- */

function distanceMilesFromRow(row: CsvRow, unitSystem: UnitSystem): number {
  const raw = parseNumber(row['Distance']);
  const type = String(row['Activity Type'] || '');
  if (!raw) return 0;

  // Activities whose Distance is recorded in METERS
  const metersBased = new Set<string>([
    'Swimming', 'Pool Swim', 'Open Water Swimming',
    'Rowing',
    'SkiErg',
  ]);

  const canon = canonicalizeActivityType(type);
  if (metersBased.has(canon)) return raw / 1609.34; // meters → miles

  // Otherwise: miles (imperial) or km (metric)
  if (unitSystem === 'metric') return raw * 0.621371; // km → mi
  return raw;
}

function ascentFeet(rawAscent: unknown, unitSystem: UnitSystem): number {
  const v = parseNumber(rawAscent); if (!v) return 0;
  return unitSystem === 'metric' ? v * 3.28084 : v; // m → ft
}
function elevationFeet(rawElev: unknown, unitSystem: UnitSystem): number {
  const v = parseNumber(rawElev); if (!v) return 0;
  return unitSystem === 'metric' ? v * 3.28084 : v; // m → ft
}

/* --------------------------------- Metrics ---------------------------------- */

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function computeMetrics(rows: CsvRow[], locale: LocaleHint, unitSystem: UnitSystem): Metrics {
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
  let swimMeters = 0, swimSeconds = 0, swimSessions = 0;

  let longestActivityDetail: { row: CsvRow; durationSeconds: number; date: Date | null } | null = null;
  let highestCalorieDetail: { row: CsvRow; calories: number; date: Date | null; durationSeconds: number } | null = null;

  let runLongest: { row: CsvRow; distanceMi: number } | null = null;
  let bikeLongest: { row: CsvRow; distanceMi: number } | null = null;
  let swimLongest: { row: CsvRow; distanceM: number } | null = null;

  const runFamily = ['Running', 'Treadmill Running', 'Track Running', 'Trail Running', 'Running'];
  const bikeFamily = ['Cycling', 'Indoor Cycling', 'Virtual Cycling'];
  const swimFamily = ['Pool Swim', 'Swimming', 'Open Water Swimming'];

  const weekdayAgg: { seconds: number; count: number }[] = Array.from({ length: 7 }, () => ({ seconds: 0, count: 0 }));

  for (const rowRaw of rows) {
    const row: CsvRow = { ...rowRaw };

    // Normalize type
    const typed = canonicalizeActivityType(String(row['Activity Type'] || ''));
    row['Activity Type'] = typed;

    const activityType = String(row['Activity Type'] || '');
    const hasAnyData = activityType || row['Distance'] || row['Time'] || row['Elapsed Time'] || row['Calories'];
    if (!hasAnyData) continue;

    sessions += 1;

    const distanceMi = distanceMilesFromRow(row, unitSystem);
    totalDistanceMi += distanceMi;

    const timeSeconds = parseTimeToSeconds(row['Time'] ?? row['Moving Time'] ?? row['Elapsed Time']);
    totalActivitySeconds += timeSeconds;

    const calories = parseNumber(row['Calories']);
    totalCalories += calories;

    const maxHrRow = parseNumber(row['Max HR']); if (maxHrRow > maxHr) maxHr = maxHrRow;
    const avgHrRow = parseNumber(row['Avg HR']); if (avgHrRow > 0) { avgHrSum += avgHrRow; avgHrCount += 1; }

    totalAscentFt += ascentFeet(row['Total Ascent'], unitSystem);
    const elevFt = elevationFeet(row['Max Elevation'], unitSystem); if (elevFt > maxElevationFt) maxElevationFt = elevFt;

    if (activityType) {
      activityCounts[activityType] = (activityCounts[activityType] ?? 0) + 1;
      typeDistance[activityType] = (typeDistance[activityType] ?? 0) + distanceMi;
      typeSeconds[activityType] = (typeSeconds[activityType] ?? 0) + timeSeconds;
    }

    const date = parseDateWithLocale(row['Date'], locale);
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

  // Favorite
  let favoriteActivity: Metrics['favoriteActivity'] | undefined;
  {
    const names = Object.keys(activityCounts);
    if (names.length) {
      names.sort((a, b) => (activityCounts[b] ?? 0) - (activityCounts[a] ?? 0));
      const name = names[0]!;
      favoriteActivity = { name, count: activityCounts[name] ?? 0 };
    }
  }

  // Most active month
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

  // Longest streak
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
        if (Math.round(diffDays) === 1) {
          curLen += 1;
        } else {
          if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; bestEnd = daysSorted[i - 1]!; }
          curLen = 1; curStart = daysSorted[i]!;
        }
      }
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; bestEnd = daysSorted[daysSorted.length - 1]!; }
      longestStreak = { lengthDays: bestLen, start: formatDateDisplay(toDate(bestStart)), end: formatDateDisplay(toDate(bestEnd)) };
    }
  }

  // Grind day
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

  const runLongestOut = runLongest && runLongest.distanceMi > 0
    ? { title: toStringSafe(runLongest.row['Title']) || 'Longest run', distanceMi: runLongest.distanceMi }
    : undefined;
  const bikeLongestOut = bikeLongest && bikeLongest.distanceMi > 0
    ? { title: toStringSafe(bikeLongest.row['Title']) || 'Longest ride', distanceMi: bikeLongest.distanceMi }
    : undefined;
  const swimLongestOut = swimLongest && swimLongest.distanceM > 0
    ? { title: toStringSafe(swimLongest.row['Title']) || 'Longest swim', distanceM: swimLongest.distanceM }
    : undefined;

  return {
    totalDistanceMi, earthPercent, totalActivitySeconds, sessions,
    maxHr: maxHr || undefined, avgHr: avgHr || undefined, totalCalories: totalCalories || undefined,
    favoriteActivity, mostActiveMonth, longestStreak,
    longestActivity: longestActivitySummary, highestCalorie: highestCalorieSummary,
    totalAscent: totalAscentFt || undefined, maxElevation: maxElevationFt || undefined,
    avgDistanceMi, avgDurationSeconds,
    activityTypesCount, topActivityTypes,
    startDateDisplay: formatDateDisplay(earliestDate),
    endDateDisplay: formatDateDisplay(latestDate),
    grindDay,

    runDistanceMi: runDistanceMi || undefined, runSeconds: runSeconds || undefined, runSessions: runSessions || undefined,
    bikeDistanceMi: bikeDistanceMi || undefined, bikeSeconds: bikeSeconds || undefined, bikeSessions: bikeSessions || undefined,
    swimMeters: swimMeters || undefined, swimSeconds: swimSeconds || undefined, swimSessions: swimSessions || undefined,

    runLongest: runLongestOut, bikeLongest: bikeLongestOut, swimLongest: swimLongestOut,
  };
}

/* -------------------------- Sleep / Steps -------------------------- */

function parseSleepDurationToMinutes(value: unknown): number {
  const s = toStringSafe(value); if (!s) return 0;
  const match = s.match(/(?:(\d+)h)?\s*(?:(\d+)min)?/i); if (!match) return 0;
  const hours = match[1] ? parseInt(match[1], 10) : 0; const mins = match[2] ? parseInt(match[2], 10) : 0;
  return hours * 60 + mins;
}
function computeSleepMetrics(rows: CsvRow[]): SleepMetrics {
  let totalScore = 0, totalDurationMinutes = 0, count = 0;
  let bestScoreWeek: SleepMetrics['bestScoreWeek'] = null;
  let worstScoreWeek: SleepMetrics['worstScoreWeek'] = null;
  let longestSleepWeek: SleepMetrics['longestSleepWeek'] = null;

  rows.forEach((row) => {
    const score = parseNumber(row['Avg Score']);
    const label = toStringSafe(row['Date']);
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
function computeStepsMetrics(rows: CsvRow[]): StepsMetrics {
  let periods = 0, totalSteps = 0, totalDays = 0;
  let bestWeek: StepsMetrics['bestWeek'] | null = null;

  const rowCount = rows.length || 0;
  let looksWeekly = rowCount > 0 && rowCount <= 60;

  for (const row of rows) {
    const weekCol = row['Week'];
    const labelCol = row['Label'];
    const dateCol = row['Date'];
    const blankCol = row[''];
    const dateStr = toStringSafe(dateCol);
    const blankStr = toStringSafe(blankCol);

    if (
      (weekCol && String(weekCol).trim() !== '') ||
      (typeof labelCol === 'string' && /week/i.test(labelCol)) ||
      (dateStr && dateStr.includes(' - ')) ||
      (blankStr && blankStr.includes(' - ')) ||
      (blankStr && /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(blankStr))
    ) { looksWeekly = true; break; }
  }

  rows.forEach((row) => {
    const steps = parseNumber(
      row['Steps'] ?? row['Total Steps'] ?? row['Total steps'] ?? row['Weekly Steps'] ?? row['Actual']
    );
    if (!steps) return;

    const label = String(row['Week'] ?? row['Label'] ?? row['Start'] ?? row['Date'] ?? row[''] ?? '');
    const daysInPeriod = parseNumber(row['Days']) || (looksWeekly ? 7 : 1);

    periods += 1; totalSteps += steps; totalDays += daysInPeriod;

    if (!bestWeek || steps > bestWeek.steps) {
      bestWeek = { label: label || (looksWeekly ? `Week ${periods}` : `Day ${periods}`), steps };
    }
  });

  const days = totalDays || (looksWeekly ? periods * 7 : periods || 1);
  const avgStepsPerDay = totalSteps / days;

  return { weeks: periods, totalSteps, avgStepsPerDay, bestWeek };
}

/* ---------------------------------- UI ---------------------------------- */

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

  const [unitSystem, setUnitSystem] = useState<UnitSystem | null>(null); // must choose
  const pageRef = useRef<HTMLDivElement | null>(null);

  function preProcessRows(data: CsvRow[]) {
    const { map, locale, filteredRows } = buildHeaderMap(data);
    const canonicalRows = remapRowsToCanonical(filteredRows, map);
    return { canonicalRows, locale };
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!unitSystem) {
      setError('Please select units (Imperial or Metric) before uploading.');
      e.currentTarget.value = '';
      return;
    }

    setError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const raw = (results.data as CsvRow[]).filter((row) => row && Object.keys(row).length > 0);
          if (!raw.length) {
            setError('Could not find any activity rows in that CSV.');
            setMetrics(null);
            return;
          }
          const { canonicalRows, locale } = preProcessRows(raw);
          const m = computeMetrics(canonicalRows, locale, unitSystem);
          setMetrics(m);
        } catch (err: unknown) {
          console.error(err);
          setError('Sorry, something went wrong reading that CSV.');
          setMetrics(null);
        }
      },
      error: (err: unknown) => {
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
          const raw = (results.data as CsvRow[]).filter((row) => row && Object.keys(row).length > 0);
          if (!raw.length) {
            setSleepError('Could not find any sleep rows in that CSV.');
            setSleepMetrics(null);
            return;
          }
          const { canonicalRows } = preProcessRows(raw);
          const m = computeSleepMetrics(canonicalRows);
          setSleepMetrics(m);
        } catch (err: unknown) {
          console.error(err);
          setSleepError('Sorry, something went wrong reading that CSV.');
          setSleepMetrics(null);
        }
      },
      error: (err: unknown) => {
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
          const data = (results.data as CsvRow[]).filter((row) => row && Object.keys(row).length > 0);
          if (!data.length) {
            setStepsError('Could not find any step rows in that CSV.');
            setStepsMetrics(null);
            return;
          }
          const { canonicalRows } = preProcessRows(data);
          const m = computeStepsMetrics(canonicalRows);
          setStepsMetrics(m);
        } catch (err: unknown) {
          console.error(err);
          setStepsError((err as { message?: string })?.message || 'Sorry, something went wrong reading the steps CSV.');
          setStepsMetrics(null);
        }
      },
      error: (err: unknown) => {
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

  const step = stepsMetrics;
  const totalStepsStr = step ? step.totalSteps.toLocaleString() : null;
  const avgStepsStr =
    step && step.avgStepsPerDay
      ? `${Math.round(step.avgStepsPerDay).toLocaleString()} / day`
      : null;

  const distanceStr = m ? `${m.totalDistanceMi.toFixed(2)} mi` : '--';
  const earthPercentStr = m ? `${m.earthPercent.toFixed(2)}%` : '--';
  const totalTimeStr = m ? formatDurationLong(m.totalActivitySeconds) : '--';
  const maxHrStr = m?.maxHr ? `${Math.round(m.maxHr)} bpm` : '--';
  const avgHrStr = m?.avgHr ? `${Math.round(m.avgHr)} bpm` : '--';
  const caloriesStr = m?.totalCalories ? `${m.totalCalories.toLocaleString()} kcal` : '--';
  const sessionsStr = m ? `${m.sessions}` : '--';

  const favActivityStr = m?.favoriteActivity && `${m.favoriteActivity.name} · ${m.favoriteActivity.count} sessions`;
  const mostActiveMonthStr = m?.mostActiveMonth && `${m.mostActiveMonth.name} · ${m.mostActiveMonth.totalHours.toFixed(1)} hrs`;

  const streakStr = m?.longestStreak && m.longestStreak.lengthDays > 0
    ? `${m.longestStreak.lengthDays} day${m.longestStreak.lengthDays === 1 ? '' : 's'}`
    : '--';
  const streakRange = m?.longestStreak
    ? (m.longestStreak.start === m.longestStreak.end
        ? `${m.longestStreak.start}`
        : `${m.longestStreak.start} → ${m.longestStreak.end}`)
    : '';

  const totalAscentStr = m?.totalAscent != null ? `${Math.round(m.totalAscent)} ft` : '--';
  const maxElevationStr = m?.maxElevation != null ? `${Math.round(m.maxElevation)} ft` : '--';

  const avgDistanceStr = m?.avgDistanceMi != null ? `${m.avgDistanceMi.toFixed(2)} mi / session` : '--';
  const avgDurationStr = m?.avgDurationSeconds != null ? `${formatDurationHMS(m.avgDurationSeconds)} / session` : '--';

  const longestActivity = m?.longestActivity;
  const highestCal = m?.highestCalorie;
  const topTypes = m?.topActivityTypes || [];

  const dateRange = m?.startDateDisplay && m?.endDateDisplay
    ? `${m.startDateDisplay} – ${m.endDateDisplay}`
    : 'Upload a CSV to see your year';

  // Sport-specific
  const runDistanceStr = m?.runDistanceMi != null ? `${m.runDistanceMi.toFixed(1)} mi` : '--';
  const runTimeStr = m?.runSeconds != null ? formatDurationHMS(m.runSeconds) : '--';
  const runPaceStr = m?.runSeconds && m.runDistanceMi ? formatPacePerMile(m.runSeconds, m.runDistanceMi) : '--';

  const bikeDistanceStr = m?.bikeDistanceMi != null ? `${m.bikeDistanceMi.toFixed(1)} mi` : '--';
  const bikeTimeStr = m?.bikeSeconds != null ? formatDurationHMS(m.bikeSeconds) : '--';
  const bikeSpeedStr = m?.bikeDistanceMi && m?.bikeSeconds ? `${(m.bikeDistanceMi / (m.bikeSeconds / 3600)).toFixed(1)} mph` : '--';

  const swimDistanceStr = m?.swimMeters != null ? `${m.swimMeters.toLocaleString()} m` : '--';
  const swimTimeStr = m?.swimSeconds != null ? formatDurationHMS(m.swimSeconds) : '--';
  const swimPaceStr = m?.swimSeconds && m?.swimMeters ? formatSwimPacePer100m(m.swimSeconds, m.swimMeters) : '--';

  const unitHint = unitSystem ? (unitSystem === 'imperial' ? 'Units: Imperial (mi/ft)' : 'Units: Metric (km/m → mi/ft)') : 'Units: —';

  return (
    <div ref={pageRef} className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold mb-2">Garmin Wrapped</h1>
            <p className="text-sm text-zinc-400">
              {dateRange} <span className="text-zinc-500">·</span> <span className="text-zinc-500">{unitHint}</span>
            </p>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-2">
            <div className="inline-flex items-center gap-2 text-xs text-zinc-200 bg-zinc-900/80 border border-zinc-700 rounded-full px-3 py-1">
              <span className="text-zinc-400">Units:</span>
              <select
                className="bg-zinc-900 text-zinc-100 border-none outline-none rounded-md px-1 py-0.5 appearance-none"
                style={{ colorScheme: 'dark' }}
                value={unitSystem ?? ''}
                onChange={(e) => setUnitSystem((e.target.value as UnitSystem) || null)}
                aria-label="Units"
                title="Units"
              >
                <option value="" disabled>Select</option>
                <option value="imperial">Imperial (mi, ft)</option>
                <option value="metric">Metric (km, m)</option>
              </select>
            </div>

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
                Select units, then export your activities from Garmin Connect (&quot;All Activities&quot;) as CSV and drop it here.
              </p>
            )}
            {error && <p className="text-xs text-red-400 max-w-xs text-right">{error}</p>}
            {sleepError && <p className="text-xs text-red-400 max-w-xs text-right">{sleepError}</p>}
            {stepsError && <p className="text-xs text-red-400 max-w-xs text-right">{stepsError}</p>}
          </div>
        </header>

        {/* Content */}
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
                      {step && totalStepsStr && (
                        <div className="text-lg text-zinc-300 mt-1">
                          <span className="font-semibold text-lg sm:text-xl">{totalStepsStr} steps</span>
                          {avgStepsStr && <> <span className="font-semibold text-lg sm:text-xl">{avgStepsStr}</span></>}
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

              {/* Swimming (meters section left as-is) */}
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
                    <div><p className="text-zinc-400 text-xs">Duration</p><p className="text-zinc-100 font-medium">{formatDurationHMS(longestActivity.durationSeconds)}</p></div>
                    <div><p className="text-zinc-400 text-xs">Calories</p><p className="text-zinc-100 font-medium">{longestActivity.calories != null ? `${longestActivity.calories} kcal` : '--'}</p></div>
                    <div><p className="text-zinc-400 text-xs">Type</p><p className="text-zinc-100 font-medium">Long day out</p></div>
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
                    <div><p className="text-zinc-400 text-xs">Duration</p><p className="text-zinc-100 font-medium">{highestCal.durationSeconds ? formatDurationHMS(highestCal.durationSeconds) : '--'}</p></div>
                    <div><p className="text-zinc-400 text-xs">Calories</p><p className="text-zinc-100 font-medium">{highestCal.calories} kcal</p></div>
                    <div><p className="text-zinc-400 text-xs">Effort</p><p className="text-zinc-100 font-medium">Big day in the pain cave</p></div>
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
                {m?.totalAscent && (
                  <div className="text-md text-zinc-400 mt-2">≈ <span className="font-semibold text-zinc-200">{(m.totalAscent / EVEREST_FT).toFixed(2)}</span> Mount Everests</div>
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
                <p className="text-2xl font-semibold">{sleepMetrics.avgScore.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-zinc-400 text-xs">Average nightly duration</p>
                <p className="text-2xl font-semibold">{(() => { const mins = sleepMetrics.avgDurationMinutes; const h = Math.floor(mins / 60); const mR = Math.round(mins % 60); return `${h}h ${mR}m`; })()}</p>
              </div>
              {sleepMetrics.bestScoreWeek && (
                <div>
                  <p className="text-zinc-400 text-xs">Best week</p>
                  <p className="text-sm text-zinc-100 font-semibold">{sleepMetrics.bestScoreWeek.label}</p>
                </div>
              )}
            </div>
          </section>
        )}

        <footer className="mt-10 text-xs text-zinc-500">
          <p>© 2025 Jordan Lindsay. Not affiliated with Garmin Ltd.</p>
        </footer>
      </main>
    </div>
  );
}
