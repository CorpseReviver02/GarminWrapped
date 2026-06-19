// lib/normalize.ts — Convert raw activity values into canonical units (miles, feet).

import type { UnitHint, UnitSystem } from './types';
import { parseNumber } from './parse';
import { canonicalizeActivityType } from './activity-columns';

/** Distance → mi: header hint wins; else activity heuristics; else UI fallback. */
export function normalizeDistanceToMiles(
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
export function normalizeFeet(raw: unknown, headerHint: UnitHint, uiUnitSystem: UnitSystem): number {
  const v = parseNumber(raw);
  if (!v) return 0;
  if (headerHint === 'ft') return v;
  if (headerHint === 'm')  return v * 3.28084;

  // If large (500–12000), more likely meters in high-alt data
  if (v >= 500 && v <= 12000) return uiUnitSystem === 'metric' ? v * 3.28084 : v;

  // Else assume the export matches UI selection
  return uiUnitSystem === 'metric' ? v * 3.28084 : v;
}
