// components/StatCard.tsx — Small presentational stat tile used across the dashboard.

import type { StatCardProps } from '../lib/types';

export default function StatCard({ icon: Icon, value, label, helper }: StatCardProps) {
  return (
    <div className="bg-zinc-900/80 border border-zinc-700/70 rounded-3xl p-4 sm:p-5 flex flex-col gap-1.5 shadow-[0_0_40px_rgba(0,0,0,0.7)] hover:-translate-y-0.5 hover:border-zinc-500 transition">
      <div className="flex items-center gap-2 text-xs text-zinc-400 uppercase tracking-wide">
        <Icon className="w-4 h-4 text-zinc-300" />
        <span>{label}</span>
      </div>
      <div className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-50">{value || '--'}</div>
      {helper && <div className="text-xs text-zinc-500">{helper}</div>}
    </div>
  );
}
