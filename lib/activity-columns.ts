// lib/activity-columns.ts — Locale-aware header matching + activity canonicalization.
//
// NOTE: This is the regional-handling layer. When real German/French/other exports
// surface issues, this is the file to harden (e.g. value-validated column scoring,
// per-column decimal detection). It is intentionally isolated so that work won't
// disturb metrics/formatting/UI.

import type { CsvRow, UnitHint } from './types';
import { toStringSafe, asCell } from './parse';

export function normalizeKey(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/* ===================== Activity header matching (robust) ===================== */

function findHeaderIndex(header: string[], candidates: string[]): number | null {
  const normHeader = header.map(h => normalizeKey(h));
  const normCandidates = candidates.map(c => normalizeKey(c));

  // Exact match first
  for (const cand of normCandidates) {
    const idx = normHeader.indexOf(cand);
    if (idx >= 0) return idx;
  }

  // Substring match (handles units like "Max Elevation (ft)" or localized punctuation)
  for (const cand of normCandidates) {
    for (let i = 0; i < normHeader.length; i++) {
      const h = normHeader[i] || '';
      if (!h) continue;
      if (h.includes(cand) || cand.includes(h)) return i;
    }
  }

  return null;
}

/* Default (headerless / fallback) column indices for a standard Garmin Activities CSV. */
export const GARMIN_ACTIVITY_COL_INDEX = {
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

export type ActivityIdxMap = typeof GARMIN_ACTIVITY_COL_INDEX;

const ACTIVITY_HEADER_ALIASES: Record<keyof ActivityIdxMap, string[]> = {
  ActivityType: ['Activity Type','Type d’activité','Type d activite','Aktivitätsart','Aktivitaetsart','Tipo de actividad','Soort activiteit'],
  Date: ['Date','Datum','Fecha'],
  Title: ['Title','Titre','Titel','Título','Titulo'],
  Distance: ['Distance','Distanz','Distancia','Afstand'],
  Calories: ['Calories','Kalorien','Calorías','Calorias','Calorieën'],
  Time: ['Time','Temps','Zeit','Tiempo','Tijd','Durée','Duree','Dauer'],
  AvgHR: ['Avg HR','Average HR','Fréquence cardiaque moyenne','Frequence cardiaque moyenne','Durchschnittliche HF','Durchschn HF','Media FC','Gemiddelde HF'],
  MaxHR: ['Max HR','Maximum HR','Fréquence cardiaque maximale','Frequence cardiaque maximale','Maximale HF','Máx FC','Max FC','Maximale HF'],
  TotalAscent: ['Total Ascent','Ascent','Total climb','Dénivelé positif','Denivele positif','Gesamter Aufstieg','Ascenso total','Totale stijging'],
  MovingTime: ['Moving Time','Temps de déplacement','Temps de deplacement','Bewegungszeit','Tiempo en movimiento','Beweegtijd'],
  ElapsedTime: ['Elapsed Time','Temps écoulé','Temps ecoule','Verstrichene Zeit','Tiempo transcurrido','Verstreken tijd'],
  MaxElevation: ['Max Elevation','Maximum Elevation','Altitude max','Altitude maximale','Maximale Höhe','Maximale Hoehe','Altura máxima','Altura maxima','Maximale hoogte'],
  Steps: ['Steps','Pas','Schritte','Pasos','Stappen'],
};

export function buildActivityIndexMap(headerRow: string[]): ActivityIdxMap {
  const idx: ActivityIdxMap = { ...GARMIN_ACTIVITY_COL_INDEX };

  for (const key of Object.keys(ACTIVITY_HEADER_ALIASES) as (keyof ActivityIdxMap)[]) {
    const found = findHeaderIndex(headerRow, ACTIVITY_HEADER_ALIASES[key]);
    if (found != null) (idx as Record<string, number>)[key] = found;
  }

  return idx;
}

/* ================== Unit hints (auto-detect from header annotations) ================== */

export function unitHintFromHeaderDistance(h: string): UnitHint {
  const s = toStringSafe(h).toLowerCase();
  if (/\bkm\b/.test(s)) return 'km';
  if (/\bmi\b/.test(s)) return 'mi';
  if (/\bm\b/.test(s))  return 'm';
  return null;
}

export function unitHintFromHeaderElev(h: string): UnitHint {
  const s = toStringSafe(h).toLowerCase();
  if (/\bft\b/.test(s)) return 'ft';
  if (/\bm\b/.test(s))  return 'm';
  return null;
}

/* ================== Activity type canonicalization ================== */

export function canonicalizeActivityType(raw: string): string {
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

/* ================== Row mapping ================== */

export function mapActivityRowsByIndex(rows2D: unknown[][]): CsvRow[] {
  if (!rows2D.length) return [];
  const headerRow = (rows2D[0] as unknown[]).map(h => toStringSafe(h));
  const idx = buildActivityIndexMap(headerRow);

  const out: CsvRow[] = [];
  for (let i = 1; i < rows2D.length; i++) {
    const r = rows2D[i] as unknown[];
    if (!r?.length) continue;

    const row: CsvRow = {
      'Activity Type': asCell(r[idx.ActivityType]),
      'Date':          asCell(r[idx.Date]),
      'Title':         asCell(r[idx.Title]),
      'Distance':      asCell(r[idx.Distance]),
      'Calories':      asCell(r[idx.Calories]),
      'Time':          asCell(r[idx.Time]),
      'Avg HR':        asCell(r[idx.AvgHR]),
      'Max HR':        asCell(r[idx.MaxHR]),
      'Total Ascent':  asCell(r[idx.TotalAscent]),
      'Moving Time':   asCell(r[idx.MovingTime]),
      'Elapsed Time':  asCell(r[idx.ElapsedTime]),
      'Max Elevation': asCell(r[idx.MaxElevation]),
      'Steps':         asCell(r[idx.Steps]),
    };

    if (row['Activity Type'] || row['Distance'] || row['Time'] || row['Elapsed Time'] || row['Calories']) out.push(row);
  }
  return out;
}
