// lib/format.ts — Pure display formatters (durations, pace, dates).

import type { UnitSystem } from './types';

export function formatDurationLong(totalSeconds: number): string {
  let s = Math.round(totalSeconds);
  const days = Math.floor(s / 86400); s -= days * 86400;
  const hours = Math.floor(s / 3600); s -= hours * 3600;
  const minutes = Math.floor(s / 60);
  const parts: string[] = [];
  if (days) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours) parts.push(`${hours}hrs`);
  if (minutes || (!days && !hours)) parts.push(`${minutes}m`);
  return parts.join(' ');
}

export function formatDurationHMS(totalSeconds: number): string {
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

/** Human-ish duration for Instagram slides + Sleep cards (e.g., 7h 31m).
 *  Rounds the total first so a 59.6-minute remainder can never render as "60m". */
export function formatDurationMinutesToHuman(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Human-ish duration from seconds for Instagram slides (e.g., 1h 05m). */
export function formatSecondsHuman(totalSeconds: number): string {
  const mins = Math.max(0, Math.round((totalSeconds || 0) / 60));
  return formatDurationMinutesToHuman(mins);
}

export function formatDateDisplay(date: Date | null | undefined): string {
  if (!date) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatPacePerUnit(
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

export function formatSwimPacePer100m(totalSeconds: number, meters: number): string {
  if (!totalSeconds || !meters) return '--';
  const per100 = Math.round(totalSeconds / (meters / 100));
  const min = Math.floor(per100 / 60), sec = per100 % 60;
  return `${min}:${String(sec).padStart(2, '0')}/100m`;
}
