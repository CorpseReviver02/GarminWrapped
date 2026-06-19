// lib/copy.ts — Deterministic "fun copy" picker so labels stay stable per user/run.

import type { Metrics } from './types';

export function hashToUint32(s: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function pickStable(seed: string, options: string[]): string {
  if (!options.length) return '';
  const idx = hashToUint32(seed) % options.length;
  return options[idx]!;
}

export type LongestActivityOut = NonNullable<Metrics['longestActivity']>;
export type HighestCalorieOut = NonNullable<Metrics['highestCalorie']>;

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

export function getLongestTypeLabel(l: LongestActivityOut): string {
  const hours = (l.durationSeconds || 0) / 3600;
  const pool = hours >= 4 ? LONGEST_TYPE_EPIC : LONGEST_TYPE_SHORT;
  const seed = `longest|${l.title}|${l.date}|${Math.round((l.durationSeconds || 0) / 60)}`;
  return pickStable(seed, pool);
}

export function getHighestEffortLabel(h: HighestCalorieOut): string {
  const cal = h.calories || 0;
  const pool = cal >= 1200 ? EFFORT_HEAVY : EFFORT_LIGHT;
  const seed = `calories|${h.title}|${h.date}|${cal}`;
  return pickStable(seed, pool);
}
