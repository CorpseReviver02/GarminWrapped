// lib/types.ts — Shared domain types (no runtime code)

import type React from 'react';

export type CsvPrimitive = string | number | boolean | null | undefined;
export type CsvRow = Record<string, CsvPrimitive>;
export type UnitSystem = 'imperial' | 'metric';

export type UnitHint = 'm' | 'km' | 'mi' | 'ft' | null;

export type RawRow = unknown[];
export type Raw2D = RawRow[];

export type ActivityTypeSummary = {
  name: string;
  count: number;
  totalDistanceMi: number;
  totalSeconds: number;
};

export type Metrics = {
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
  longestActivity?: { title: string; date: string; durationSeconds: number; calories?: number; type: string };
  highestCalorie?: { title: string; date: string; calories: number; durationSeconds?: number; type: string };
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

export type SleepMetrics = {
  weeks: number;
  avgScore: number;
  avgDurationMinutes: number;
  bestScoreWeek: { label: string; score: number; durationMinutes: number } | null;
  worstScoreWeek: { label: string; score: number; durationMinutes: number } | null;
  longestSleepWeek: { label: string; durationMinutes: number; score: number } | null;
};

export type StepsMetrics = {
  weeks: number;
  totalSteps: number;
  avgStepsPerDay: number;
  bestWeek: { label: string; steps: number } | null;
  worstWeek: { label: string; steps: number } | null;
};

export type StatCardProps = {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  value: string;
  label: string;
  helper?: string;
};
