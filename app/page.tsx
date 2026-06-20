// File: app/page.tsx — Garmin/Fitness Wrapped dashboard + story mode

'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as htmlToImage from 'html-to-image';
import {
  Activity, Flame, HeartPulse, LineChart, Mountain, Timer,
  CalendarDays, Trophy, Dumbbell, Zap, Upload, Bike, Waves, Route,
} from 'lucide-react';

// ---- Extracted logic modules (see /lib) ----
import type {
  UnitSystem, Metrics, SleepMetrics, StepsMetrics,
  ActivityTypeSummary, RawRow, Raw2D, CsvRow, UnitHint,
} from '../lib/types';
import { parseCsvFile, PAPA_ROWS_CONFIG } from '../lib/parse';
import {
  formatDurationLong, formatDurationHMS, formatDurationMinutesToHuman,
  formatPacePerUnit, formatSwimPacePer100m,
} from '../lib/format';
import { getLongestTypeLabel, getHighestEffortLabel } from '../lib/copy';
import {
  buildActivityIndexMap, unitHintFromHeaderDistance, unitHintFromHeaderElev,
  mapActivityRowsByIndex,
} from '../lib/activity-columns';
import { computeMetrics } from '../lib/metrics';
import {
  mapSleepRowsByIndex, computeSleepMetrics,
  mapStepsRowsByIndex, computeStepsMetrics,
} from '../lib/wellness';
import { MARATHON_MI, FIVEK_MI, EVEREST_FT, FEET_PER_STEP } from '../lib/constants';
import StatCard from '../components/StatCard';
import MonthlyBars from '../components/MonthlyBars';
import StoryMode from '../components/StoryMode';
import type { StoryScene, MotifKey, StoryStat } from '../components/StoryMode';
import { compareYears, partitionByYear, yearsPresent } from '../lib/compare';
import type { YearComparison, MetricDelta } from '../lib/compare';
import { computeTrends } from '../lib/trends';
import type { TrendMetrics } from '../lib/trends';

/* =================================== UI =================================== */

/** Default recap year: the newest year present, unless that's the in-progress
 *  current calendar year (before December), in which case use the latest complete year. */
function pickDefaultFocusYear(years: number[]): number | null {
  if (!years.length) return null;
  const sorted = [...years].sort((a, b) => a - b);
  const latest = sorted[sorted.length - 1]!;
  const now = new Date();
  if (latest === now.getFullYear() && now.getMonth() < 11 && sorted.length >= 2) {
    return sorted[sorted.length - 2]!;
  }
  return latest;
}

/** Subtle year-over-year delta indicator. Improvement is emerald; regression stays muted. */
function DeltaChip({ delta, lowerIsBetter = false }: { delta: MetricDelta; lowerIsBetter?: boolean }) {
  const improved = lowerIsBetter ? delta.abs < 0 : delta.abs > 0;
  const flat = delta.abs === 0;
  const color = flat ? 'text-zinc-500' : improved ? 'text-emerald-400' : 'text-zinc-400';
  const label =
    delta.pct == null ? (flat ? '—' : 'new') : `${delta.pct >= 0 ? '+' : ''}${Math.round(delta.pct)}%`;
  return <span className={`text-xs font-semibold ${color}`}>{label}</span>;
}

export default function Home() {
  const [unitSystem, setUnitSystem] = useState<UnitSystem | null>(null);

  const [activityRows, setActivityRows] = useState<CsvRow[] | null>(null);
  const [activityUnitHints, setActivityUnitHints] =
    useState<{ distance: UnitHint; ascent: UnitHint; elevation: UnitHint } | null>(null);
  const [focusYear, setFocusYear] = useState<number | null>(null);
  const [trendSport, setTrendSport] = useState<'all' | 'run' | 'bike' | 'swim' | 'other'>('all');
  const [storyOpen, setStoryOpen] = useState(false);
  const [showRecapCustomize, setShowRecapCustomize] = useState(false);
  const [recapStatIds, setRecapStatIds] = useState<string[]>([
    'distance', 'time', 'sessions', 'calories', 'maxHr', 'elevation', 'steps', 'sleep',
  ]);
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
      const idx = buildActivityIndexMap(header);
      const distanceHeader  = header[idx.Distance] ?? '';
      const ascentHeader    = header[idx.TotalAscent] ?? '';
      const elevationHeader = header[idx.MaxElevation] ?? '';
      const unitHints = {
        distance:  unitHintFromHeaderDistance(distanceHeader),
        ascent:    unitHintFromHeaderElev(ascentHeader),
        elevation: unitHintFromHeaderElev(elevationHeader),
      };

      const rows = mapActivityRowsByIndex(raw2D);
      const years = yearsPresent(rows);
      if (!years.length) throw new Error('No dated activities found.');

      setActivityRows(rows);
      setActivityUnitHints(unitHints);
      setFocusYear(pickDefaultFocusYear(years));
      setError(null);
    } catch (e) {
      console.error(e);
      setActivityRows(null);
      setActivityUnitHints(null);
      setFocusYear(null);
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
      link.href = dataUrl; link.download = 'fitness-wrapped.png';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } catch (err) { console.error('Failed to generate image', err); alert('Sorry, something went wrong generating the image.'); }
  };

  /* -------- Render helpers -------- */
  const availableYears = useMemo(
    () => (activityRows ? yearsPresent(activityRows) : []),
    [activityRows]
  );

  const m = useMemo<Metrics | null>(() => {
    if (!activityRows || !activityUnitHints || !unitSystem || focusYear == null) return null;
    const rowsForYear = partitionByYear(activityRows).get(focusYear) ?? [];
    return computeMetrics(rowsForYear, unitSystem, activityUnitHints);
  }, [activityRows, activityUnitHints, unitSystem, focusYear]);

  const comparison = useMemo<YearComparison | null>(() => {
    if (!activityRows || !activityUnitHints || !unitSystem || focusYear == null) return null;
    return compareYears(activityRows, unitSystem, activityUnitHints, focusYear);
  }, [activityRows, activityUnitHints, unitSystem, focusYear]);

  const trends = useMemo<TrendMetrics | null>(() => {
    if (!activityRows || !activityUnitHints || !unitSystem || focusYear == null) return null;
    const rowsForYear = partitionByYear(activityRows).get(focusYear) ?? [];
    return computeTrends(rowsForYear, unitSystem, activityUnitHints);
  }, [activityRows, activityUnitHints, unitSystem, focusYear]);

  // Reset the chart's sport filter when switching years.
  useEffect(() => {
    setTrendSport('all');
  }, [focusYear]);
  const step = stepsMetrics;

  const isMetric = unitSystem === 'metric';

  const MONTH_LABELS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const distUnit = isMetric ? 'km' : 'mi';
  const toDist = (mi: number) => (isMetric ? mi * 1.60934 : mi);
  const paceUnit = isMetric ? '/km' : '/mi';
  const fmtPaceFromSecPerMi = (secPerMi: number): string => {
    const s = Math.round(isMetric ? secPerMi / 1.60934 : secPerMi);
    return s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}${paceUnit}` : '--';
  };

  // Year-over-year strip cells (built once per render when a comparison exists).
  const yoyCells = comparison
    ? (() => {
        const { current: cy, prior: py, deltas: d, priorYear } = comparison;
        const dist = (mi: number) => `${Math.round(toDist(mi)).toLocaleString()} ${distUnit}`;
        const hrs = (sec: number) => `${Math.round(sec / 3600).toLocaleString()}h`;
        const paceSecDelta = Math.round(Math.abs(isMetric ? d.runPaceSecPerMi.abs / 1.60934 : d.runPaceSecPerMi.abs));
        const paceColor =
          d.runPaceSecPerMi.abs < 0 ? 'text-emerald-400' : d.runPaceSecPerMi.abs > 0 ? 'text-zinc-400' : 'text-zinc-500';
        return [
          { label: 'Total Distance', value: dist(cy.totalDistanceMi), chip: <DeltaChip delta={d.totalDistanceMi} />, sub: `was ${dist(py.totalDistanceMi)} in ${priorYear}` },
          { label: 'Total Sessions', value: cy.sessions.toLocaleString(), chip: <DeltaChip delta={d.sessions} />, sub: `was ${py.sessions.toLocaleString()} in ${priorYear}` },
          { label: 'Total Time', value: hrs(cy.totalActivitySeconds), chip: <DeltaChip delta={d.totalActivitySeconds} />, sub: `was ${hrs(py.totalActivitySeconds)} in ${priorYear}` },
          {
            label: 'Average Run Pace',
            value: fmtPaceFromSecPerMi(d.runPaceSecPerMi.current),
            chip: (
              <span className={`text-xs font-semibold ${paceColor}`}>
                {d.runPaceSecPerMi.abs === 0 ? '—' : `${d.runPaceSecPerMi.abs < 0 ? '-' : '+'}${paceSecDelta}s`}
              </span>
            ),
            sub: `was ${fmtPaceFromSecPerMi(d.runPaceSecPerMi.prior)} in ${priorYear}`,
          },
        ];
      })()
    : [];

  // "Your year in motion" chart: series + unit depend on the selected sport.
  const trendTotals = trends
    ? {
        run: trends.monthly.reduce((s, p) => s + p.runMi, 0),
        bike: trends.monthly.reduce((s, p) => s + p.bikeMi, 0),
        swim: trends.monthly.reduce((s, p) => s + p.swimMeters, 0),
        other: trends.monthly.reduce((s, p) => s + p.otherMi, 0),
      }
    : null;

  const trendSportOptions: Array<{ key: 'all' | 'run' | 'bike' | 'swim' | 'other'; label: string }> = [
    { key: 'all', label: 'All' },
    ...(trendTotals && trendTotals.run > 0 ? [{ key: 'run' as const, label: 'Run' }] : []),
    ...(trendTotals && trendTotals.bike > 0 ? [{ key: 'bike' as const, label: 'Bike' }] : []),
    ...(trendTotals && trendTotals.swim > 0 ? [{ key: 'swim' as const, label: 'Swim' }] : []),
    ...(trendTotals && trendTotals.other > 0 ? [{ key: 'other' as const, label: 'Other' }] : []),
  ];

  // Fall back to "All" if the selected sport has no data for this year.
  const effectiveTrendSport =
    trendSport !== 'all' && !trendSportOptions.some((o) => o.key === trendSport) ? 'all' : trendSport;

  const trendChart = trends
    ? (() => {
        const mo = trends.monthly;
        switch (effectiveTrendSport) {
          case 'run':   return { values: mo.map((p) => toDist(p.runMi)),      unit: distUnit, title: 'Running distance by month' };
          case 'bike':  return { values: mo.map((p) => toDist(p.bikeMi)),     unit: distUnit, title: 'Cycling distance by month' };
          case 'swim':  return { values: mo.map((p) => p.swimMeters),         unit: 'm',      title: 'Swimming distance by month' };
          case 'other': return { values: mo.map((p) => toDist(p.otherMi)),    unit: distUnit, title: 'Other distance by month' };
          default:      return { values: mo.map((p) => toDist(p.distanceMi)), unit: distUnit, title: 'Distance by month' };
        }
      })()
    : null;

  const totalStepsStr = step ? step.totalSteps.toLocaleString() : null;
  const avgStepsStr = step?.avgStepsPerDay
    ? `${Math.round(step.avgStepsPerDay).toLocaleString()}/day`
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

  // Customizable "receipts" card — catalog of candidate stats; the user picks which appear
  // on the final recap slide (and its shareable image).
  const recapCatalog: { id: string; label: string; value: string | null }[] = m
    ? [
        { id: 'distance', label: 'Distance', value: distanceStr },
        { id: 'time', label: 'Time', value: `${Math.round(m.totalActivitySeconds / 3600).toLocaleString()}h` },
        { id: 'sessions', label: 'Sessions', value: sessionsStr },
        { id: 'calories', label: 'Calories', value: m.totalCalories ? caloriesStr : null },
        { id: 'maxHr', label: 'Max HR', value: m.maxHr ? maxHrStr : null },
        { id: 'avgHr', label: 'Avg HR', value: m.avgHr ? avgHrStr : null },
        { id: 'elevation', label: 'Highest pt', value: m.maxElevation != null ? maxElevationStr : null },
        { id: 'ascent', label: 'Total ascent', value: m.totalAscent != null ? totalAscentStr : null },
        { id: 'steps', label: 'Steps', value: totalStepsStr },
        { id: 'sleep', label: 'Sleep', value: sleepMetrics ? `${sleepMetrics.avgScore.toFixed(0)} avg` : null },
        { id: 'streak', label: 'Best streak', value: m.longestStreak && m.longestStreak.lengthDays > 0 ? `${m.longestStreak.lengthDays} days` : null },
        { id: 'runPace', label: 'Run pace', value: runPaceStr !== '--' ? runPaceStr : null },
        { id: 'activeMonth', label: 'Top month', value: m.mostActiveMonth ? m.mostActiveMonth.name : null },
        { id: 'favorite', label: 'Top sport', value: m.favoriteActivity ? m.favoriteActivity.name : null },
      ]
    : [];

  const recapAvailable = recapCatalog.filter((c) => c.value != null);
  const recapPicked = recapAvailable.filter((c) => recapStatIds.includes(c.id));
  const recapStats: StoryStat[] = (recapPicked.length ? recapPicked : recapAvailable.slice(0, 8))
    .slice(0, 9)
    .map((c) => ({ label: c.label, value: c.value as string }));

  const toggleRecapStat = (id: string) => {
    setRecapStatIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      const pickedAvail = prev.filter((p) => recapAvailable.some((a) => a.id === p));
      if (pickedAvail.length >= 9) return prev; // recap holds at most 9
      return [...prev, id];
    });
  };

  // Story mode scenes — built from the focus-year data; only includes scenes with content.
  const storyScenes: StoryScene[] = m
    ? (() => {
        const yr = focusYear ?? new Date().getFullYear();
        const motifForType = (type: string): MotifKey => {
          const t = type.toLowerCase();
          if (t.includes('cycl') || t.includes('bike')) return 'bike';
          if (t.includes('swim')) return 'swim';
          if (t.includes('row') || t.includes('ski')) return 'rower';
          if (t.includes('strength') || t.includes('weight') || t.includes('hiit')) return 'strength';
          if (t.includes('run')) return 'run';
          if (t.includes('hik') || t.includes('walk')) return 'hike';
          return 'trophy';
        };
        const list: StoryScene[] = [];
        list.push({ key: 'intro', palette: 'violet', motif: 'sparkles', eyebrow: `${yr} · Fitness Wrapped`, headline: 'Your year in motion.', caption: `${m.sessions.toLocaleString()} activities. Let’s rewind.` });
        list.push({ key: 'distance', palette: 'abyss', motif: 'route', eyebrow: 'Distance traveled', headline: distanceStr, caption: `That’s ${earthPercentStr} of the way around Earth.` });
        list.push({ key: 'time', palette: 'ember', motif: 'timer', eyebrow: 'Time moving', headline: totalTimeStr, caption: `across ${sessionsStr} sessions` });
        if (comparison) {
          const dp = comparison.deltas.totalDistanceMi.pct;
          list.push({
            key: 'yoy', palette: 'lime', motif: 'trending',
            eyebrow: `vs ${comparison.priorYear}`,
            headline: dp == null ? 'A fresh start.' : `${dp >= 0 ? '+' : ''}${Math.round(dp)}%`,
            caption: dp == null
              ? 'Your first tracked year.'
              : `You covered ${Math.abs(Math.round(dp))}% ${dp >= 0 ? 'more' : 'less'} distance than ${comparison.priorYear}.`,
          });
        }
        const rp = trends?.runningPace;
        if (rp && rp.firstHalfSecPerMi != null && rp.secondHalfSecPerMi != null && rp.improvedSecPerMi != null && rp.improvedSecPerMi > 0) {
          list.push({ key: 'pace', palette: 'indigo', motif: 'gauge', eyebrow: 'You got faster', headline: `${fmtPaceFromSecPerMi(rp.firstHalfSecPerMi)} → ${fmtPaceFromSecPerMi(rp.secondHalfSecPerMi)}`, caption: 'Average running pace, first half of the year to second.' });
        }
        if (m.longestActivity) {
          list.push({ key: 'longest', palette: 'gold', motif: motifForType(m.longestActivity.type), eyebrow: 'Longest activity', headline: m.longestActivity.title, caption: `${formatDurationHMS(m.longestActivity.durationSeconds)} · ${m.longestActivity.date}`, footnote: longestTypeStr });
        }
        if (m.highestCalorie) {
          list.push({ key: 'calories', palette: 'rose', motif: 'flame', eyebrow: 'Biggest burn', headline: `${m.highestCalorie.calories.toLocaleString()} kcal`, caption: `${m.highestCalorie.title} · ${m.highestCalorie.date}`, footnote: highestEffortStr });
        }
        if (m.maxElevation != null) {
          list.push({ key: 'elevation', palette: 'abyss', motif: 'mountain', eyebrow: 'Highest point', headline: maxElevationStr, caption: m.totalAscent != null ? `${totalAscentStr} climbed — about ${(m.totalAscent / EVEREST_FT).toFixed(2)} Everests.` : undefined });
        }
        if (step) {
          list.push({ key: 'steps', palette: 'lime', motif: 'footprints', eyebrow: 'Steps', headline: step.totalSteps.toLocaleString(), caption: avgStepsStr ? `${avgStepsStr} on average` : undefined });
        }
        if (sleepMetrics) {
          list.push({ key: 'sleep', palette: 'violet', motif: 'moon', eyebrow: 'Sleep', headline: `${sleepMetrics.avgScore.toFixed(0)} avg score`, caption: `${formatDurationMinutesToHuman(sleepMetrics.avgDurationMinutes)} a night · ${sleepMetrics.weeks} weeks tracked` });
        }
        list.push({
          key: 'summary',
          kind: 'summary',
          palette: 'violet',
          motif: 'sparkles',
          eyebrow: `${yr} · the receipts`,
          headline: 'That’s a wrap.',
          stats: recapStats,
          footnote: m.favoriteActivity ? `Most logged: ${m.favoriteActivity.name} · See you out there.` : 'See you out there.',
        });
        return list;
      })()
    : [];

  const canExportAssets = !!m;
  const CONTROL_RECT =
    'inline-flex items-center justify-center gap-2 text-xs sm:text-sm text-zinc-100 bg-zinc-900/80 border border-zinc-700 rounded-xl px-4 h-10 whitespace-nowrap transition';
  const CONTROL_RECT_HOVER = 'hover:bg-zinc-800 hover:border-zinc-500';
  const CONTROL_RECT_DISABLED = 'opacity-50 cursor-not-allowed';


  return (
    <>
      <div
        ref={pageRef}
        className="min-h-screen bg-zinc-950 text-white"
      >
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold mb-2">
            Fitness Wrapped
            </h1>
            <p className="text-sm text-zinc-400">
            {m?.startDateDisplay && m?.endDateDisplay
                ? `${m.startDateDisplay} – ${m.endDateDisplay}`
                : 'Upload CSVs to see your year'}
            <span className="text-zinc-500"> · </span>
            <span className="text-zinc-500">{unitHint}</span>
            </p>
            {availableYears.length >= 2 && focusYear != null && (
              <div className="mt-3 inline-flex items-center gap-1 rounded-xl border border-zinc-700 bg-zinc-900/60 p-1">
                {availableYears.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setFocusYear(y)}
                    className={`px-3 h-8 rounded-lg text-xs font-semibold transition ${
                      y === focusYear ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}
        </div>

        <div className="flex flex-col items-stretch sm:items-end gap-2 sm:gap-3">
          {/* Unified control buttons (rectangular + consistent sizing) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 w-full sm:w-auto">
            {/* Units */}
            <div className={`${CONTROL_RECT} ${CONTROL_RECT_HOVER} justify-between`}>
              <span className="text-zinc-200">Units</span>
              <select
                value={unitSystem ?? ''}
                onChange={(e) => {
                  const v = e.target.value as 'imperial' | 'metric' | '';
                  setUnitSystem(v ? v : null);
                }}
                className="ml-3 bg-zinc-950 text-zinc-100 text-sm outline-none cursor-pointer rounded-md px-2 py-1 border border-zinc-800"
              >
                <option className="bg-zinc-950 text-zinc-100" value="" disabled>
                  Select
                </option>
                <option className="bg-zinc-950 text-zinc-100" value="imperial">Imperial</option>
                <option className="bg-zinc-950 text-zinc-100" value="metric">Metric</option>
              </select>
            </div>

            {/* Upload Activities */}
            <label className={`${CONTROL_RECT} ${CONTROL_RECT_HOVER} cursor-pointer`}>
              <Upload className="w-4 h-4" />
              <span>Upload Activities</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>

            {/* Upload Sleep */}
            <label className={`${CONTROL_RECT} ${CONTROL_RECT_HOVER} cursor-pointer`}>
              <Upload className="w-4 h-4" />
              <span>Sleep CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleSleepFileChange}
              />
            </label>

            {/* Upload Steps */}
            <label className={`${CONTROL_RECT} ${CONTROL_RECT_HOVER} cursor-pointer`}>
              <Upload className="w-4 h-4" />
              <span>Steps CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleStepsFileChange}
              />
            </label>

            {/* Download image */}
            <button
              type="button"
              disabled={!canExportAssets}
              onClick={canExportAssets ? handleDownloadImage : undefined}
              className={`${CONTROL_RECT} ${canExportAssets ? CONTROL_RECT_HOVER : CONTROL_RECT_DISABLED}`}
            >
              Download as image
            </button>

            {/* Story mode */}
            <button
              type="button"
              disabled={!canExportAssets}
              onClick={canExportAssets ? () => setStoryOpen(true) : undefined}
              className={`${CONTROL_RECT} ${canExportAssets ? CONTROL_RECT_HOVER : CONTROL_RECT_DISABLED}`}
            >
              ▶ Play your year
            </button>

            {/* Customize recap card */}
            <button
              type="button"
              disabled={!canExportAssets}
              onClick={canExportAssets ? () => setShowRecapCustomize((v) => !v) : undefined}
              className={`${CONTROL_RECT} ${canExportAssets ? CONTROL_RECT_HOVER : CONTROL_RECT_DISABLED}`}
            >
              Customize recap
            </button>
          </div>

          {showRecapCustomize && canExportAssets && (
            <div className="mt-3 w-full sm:w-[420px] rounded-2xl border border-zinc-700 bg-zinc-900/60 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-white">Customize recap card</div>
                  <div className="text-xs text-zinc-300 mt-1">
                    Pick up to 9 stats for the final “receipts” slide and its shareable image.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRecapCustomize(false)}
                  className="text-xs text-zinc-300 hover:text-white shrink-0"
                >
                  Close
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {recapAvailable.map((c) => {
                  const on = recapStatIds.includes(c.id);
                  const pickedCount = recapAvailable.filter((a) => recapStatIds.includes(a.id)).length;
                  const atMax = !on && pickedCount >= 9;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={atMax}
                      onClick={() => toggleRecapStat(c.id)}
                      className={`inline-flex items-center gap-1 px-3 h-8 rounded-full text-xs border transition ${
                        on ? 'bg-zinc-100 text-zinc-900 border-zinc-100' : 'text-zinc-200 border-zinc-700 hover:border-zinc-500'
                      } ${atMax ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      {c.label}
                      {on && <span aria-hidden>✓</span>}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 text-[11px] text-zinc-400">
                Selected {recapAvailable.filter((a) => recapStatIds.includes(a.id)).length}/9
              </div>
            </div>
          )}


          <div className="mt-1 space-y-1">
            {error && (
              <p className="text-xs text-red-400 max-w-xs text-right">{error}</p>
            )}
            {sleepError && (
              <p className="text-xs text-red-400 max-w-xs text-right">{sleepError}</p>
            )}
            {stepsError && (
              <p className="text-xs text-red-400 max-w-xs text-right">{stepsError}</p>
            )}
          </div>
        </div>
        </header>

        {/* Distance + Core */}
        {m && (
          <div className="space-y-5 sm:space-y-6">
            {/* Year-over-year comparison strip */}
            {comparison && (
              <section className="bg-zinc-900/60 border border-zinc-700/60 rounded-3xl p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-300">
                    {comparison.currentYear} vs {comparison.priorYear}
                  </p>
                  <p className="text-xs text-zinc-500">Year over year</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {yoyCells.map((c) => (
                    <div key={c.label} className="flex flex-col gap-1">
                      <div className="text-xs text-zinc-400 uppercase tracking-wide">{c.label}</div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl sm:text-2xl font-semibold text-zinc-50">{c.value}</span>
                        {c.chip}
                      </div>
                      <div className="text-[11px] text-zinc-500">{c.sub}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Improvement / progress over the year */}
            {trends && trendChart && (
              <section className="bg-zinc-900/80 border border-zinc-700/70 rounded-3xl p-5 sm:p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-400/50 shrink-0">
                      <LineChart className="w-5 h-5 text-emerald-300" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Your year in motion</p>
                      <p className="text-sm text-zinc-300">{trendChart.title} ({trendChart.unit})</p>
                    </div>
                  </div>
                  {trendSportOptions.length > 1 && (
                    <div className="self-start max-w-full overflow-x-auto sm:overflow-visible">
                      <div className="inline-flex items-center gap-1 rounded-xl border border-zinc-700 bg-zinc-900/60 p-1">
                        {trendSportOptions.map((o) => (
                          <button
                            key={o.key}
                            type="button"
                            onClick={() => setTrendSport(o.key)}
                            className={`px-2.5 h-7 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                              o.key === effectiveTrendSport ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-300 hover:bg-zinc-800'
                            }`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <MonthlyBars values={trendChart.values} unitLabel={trendChart.unit} />

                <div className="grid gap-4 sm:grid-cols-3 mt-5 text-sm">
                  <div className="bg-black/40 border border-zinc-700 rounded-2xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wide">Running pace</p>
                    {trends.runningPace.firstHalfSecPerMi != null && trends.runningPace.secondHalfSecPerMi != null ? (
                      <>
                        <p className="text-zinc-100 font-semibold mt-1">
                          {fmtPaceFromSecPerMi(trends.runningPace.firstHalfSecPerMi)} → {fmtPaceFromSecPerMi(trends.runningPace.secondHalfSecPerMi)}
                        </p>
                        <p className="text-xs mt-1 text-zinc-500">
                          {trends.runningPace.improvedSecPerMi != null && trends.runningPace.improvedSecPerMi > 0
                            ? <span className="text-emerald-400">Got faster across the year</span>
                            : 'First half → second half'}
                        </p>
                      </>
                    ) : (
                      <p className="text-zinc-500 mt-1">Not enough runs</p>
                    )}
                  </div>

                  <div className="bg-black/40 border border-zinc-700 rounded-2xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wide">Longest run</p>
                    {trends.longestRun.peakMi > 0 ? (
                      <>
                        <p className="text-zinc-100 font-semibold mt-1">
                          {trends.longestRun.grewBy != null && trends.longestRun.earliestMi != null
                            ? `${toDist(trends.longestRun.earliestMi).toFixed(1)} → ${toDist(trends.longestRun.peakMi).toFixed(1)} ${distUnit}`
                            : `${toDist(trends.longestRun.peakMi).toFixed(1)} ${distUnit}`}
                        </p>
                        <p className="text-xs mt-1 text-zinc-500">
                          {trends.longestRun.peakMonthIdx != null ? `Peaked in ${MONTH_LABELS[trends.longestRun.peakMonthIdx]}` : ''}
                        </p>
                      </>
                    ) : (
                      <p className="text-zinc-500 mt-1">No runs logged</p>
                    )}
                  </div>

                  <div className="bg-black/40 border border-zinc-700 rounded-2xl p-4">
                    <p className="text-zinc-400 text-xs uppercase tracking-wide">Busiest month</p>
                    {trends.busiestMonth ? (
                      <>
                        <p className="text-zinc-100 font-semibold mt-1">{MONTH_LABELS[trends.busiestMonth.monthIdx]}</p>
                        <p className="text-xs mt-1 text-zinc-500">{Math.round(toDist(trends.busiestMonth.distanceMi)).toLocaleString()} {distUnit}</p>
                      </>
                    ) : (
                      <p className="text-zinc-500 mt-1">—</p>
                    )}
                  </div>
                </div>
              </section>
            )}

            <section className="grid gap-4 sm:gap-5 md:grid-cols-3">
              <div className="relative overflow-hidden isolate md:col-span-2 bg-gradient-to-br from-indigo-600/40 via-purple-700/30 to-zinc-900/90 border border-purple-500/40 rounded-3xl p-5 sm:p-6 shadow-[0_0_50px_rgba(0,0,0,0.9)]">
                <Route aria-hidden className="pointer-events-none absolute -z-10 -right-12 -bottom-16 w-[24rem] h-[24rem] text-indigo-300/[0.07]" strokeWidth={1} />
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
                    <div className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight">{distanceStr}</div>
                    <div className="text-lg text-zinc-300 mt-2">
                      That&apos;s <span className="font-semibold">{earthPercentStr}</span> of the way around Earth.
                      {step && totalStepsStr && (
                        <div className="text-lg text-zinc-300 mt-1">
                          <span className="font-semibold text-lg sm:text-xl">{totalStepsStr} steps</span>
                          {avgStepsStr && <> <span className="text-zinc-500">·</span> <span className="font-semibold text-lg sm:text-xl">{avgStepsStr}</span></>}
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
            <section className="grid gap-4 sm:gap-5 md:grid-cols-3">
              <StatCard icon={HeartPulse} value={maxHrStr} label="Max heart rate" helper="Highest recorded BPM." />
              <StatCard icon={HeartPulse} value={avgHrStr} label="Average heart rate" helper="Across sessions with HR data." />
              <StatCard icon={Flame} value={caloriesStr} label="Calories burned" helper="Total estimated energy output." />
            </section>

            {/* Averages */}
            <section className="grid gap-4 sm:gap-5 md:grid-cols-3">
              <StatCard icon={Timer} value={avgDurationStr} label="Avg duration" helper="Per session." />
              <StatCard icon={Activity} value={avgDistanceStr} label="Avg distance" helper="Per activity." />
              <StatCard icon={CalendarDays} value={mostActiveMonthStr || '--'} label="Most active month" helper="Where you stacked the most time." />
            </section>

            {/* Sports */}
            <section className="grid gap-4 sm:gap-5 md:grid-cols-3">
              {/* Running */}
              <div className="bg-gradient-to-br from-red-600/40 via-orange-500/30 to-zinc-900/90 border border-red-400/50 rounded-3xl p-5 sm:p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
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
              <div className="bg-gradient-to-br from-emerald-600/40 via-teal-500/30 to-zinc-900/90 border border-emerald-400/50 rounded-3xl p-5 sm:p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
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
              <div className="bg-gradient-to-br from-blue-500/40 via-cyan-500/30 to-zinc-900/90 border border-cyan-400/50 rounded-3xl p-5 sm:p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
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
            <section className="grid gap-4 sm:gap-5 md:grid-cols-2">
              {m?.longestActivity && (
                <div className="bg-zinc-900/80 border border-zinc-700/70 rounded-3xl p-5 sm:p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
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
                <div className="bg-zinc-900/80 border border-zinc-700/70 rounded-3xl p-5 sm:p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
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
            <section className="grid gap-4 sm:gap-5 md:grid-cols-2">
              <div className="bg-zinc-900/80 border border-zinc-700/70 rounded-3xl p-5 sm:p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-9 w-9 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-400/60">
                    <Zap className="w-5 h-5 text-amber-300" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-amber-300">Consistency streak</p>
                    {streakRange && <p className="text-sm text-zinc-300">{streakRange}</p>}
                  </div>
                </div>
                <div className="text-3xl sm:text-4xl font-black tracking-tight mb-2">{streakStr}</div>
                <p className="text-xs text-zinc-500">Longest run of consecutive days with at least one activity.</p>
              </div>

              <div className="bg-zinc-900/80 border border-zinc-700/70 rounded-3xl p-5 sm:p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
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
              <section className="bg-zinc-900/80 border border-zinc-700/70 rounded-3xl p-5 sm:p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
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
                        {t.totalDistanceMi > 0
                          ? `${(isMetric ? t.totalDistanceMi * 1.60934 : t.totalDistanceMi).toFixed(1)} ${isMetric ? 'km' : 'mi'} · `
                          : ''}
                        {formatDurationHMS(t.totalSeconds)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}

        {/* Sleep */}
{sleepMetrics && (
  <section className="mt-5 sm:mt-6 bg-zinc-900/80 border border-zinc-700/70 rounded-3xl p-5 sm:p-6 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
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
            {formatDurationMinutesToHuman(sleepMetrics.avgDurationMinutes)}
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
              {formatDurationMinutesToHuman(sleepMetrics.bestScoreWeek!.durationMinutes)}
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
              {formatDurationMinutesToHuman(sleepMetrics.worstScoreWeek!.durationMinutes)}
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
    {storyOpen && m && <StoryMode scenes={storyScenes} fileBase={`FitnessWrapped_${focusYear ?? new Date().getFullYear()}`} onClose={() => setStoryOpen(false)} />}
    </>
  );
}