// components/MonthlyBars.tsx — Lightweight inline-SVG monthly bar chart (no chart dependency).
// Screenshots cleanly via html-to-image and matches the dashboard's dark aesthetic.

type MonthlyBarsProps = {
  values: number[];          // 12 monthly values (Jan..Dec)
  accent?: string;           // bar color for the peak month
  unitLabel?: string;        // e.g. 'mi' / 'km' (shown on the peak bar)
  highlightIdx?: number | null; // month index to emphasize (defaults to the max)
};

const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export default function MonthlyBars({
  values,
  accent = '#34d399',
  unitLabel,
  highlightIdx,
}: MonthlyBarsProps) {
  const data = values.length === 12 ? values : Array.from({ length: 12 }, (_, i) => values[i] ?? 0);
  const max = Math.max(1, ...data);
  const peakIdx = highlightIdx ?? data.reduce((best, v, i) => (v > (data[best] ?? 0) ? i : best), 0);

  const W = 360, H = 150;
  const valueBand = 16;   // space above bars for per-month value labels
  const labelBand = 18;   // space below for month initials
  const chartTop = valueBand;
  const chartH = H - labelBand - chartTop;
  const slot = W / 12;
  const barW = slot * 0.56;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Distance by month">
      {data.map((v, i) => {
        const h = max > 0 ? (v / max) * chartH : 0;
        const x = i * slot + (slot - barW) / 2;
        const y = chartTop + (chartH - h);
        const isPeak = i === peakIdx && v > 0;
        const cx = i * slot + slot / 2;
        return (
          <g key={i}>
            {v > 0 && (
              <text
                x={cx}
                y={Math.max(y - 3, valueBand - 4)}
                textAnchor="middle"
                fontSize="8.5"
                fontWeight={isPeak ? 700 : 400}
                fill={isPeak ? accent : 'rgba(255,255,255,0.55)'}
              >
                {Math.round(v).toLocaleString()}{isPeak && unitLabel ? ` ${unitLabel}` : ''}
              </text>
            )}
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(h, v > 0 ? 2 : 0)}
              rx={3}
              fill={isPeak ? accent : 'rgba(255,255,255,0.16)'}
            />
            <text x={cx} y={H - 5} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.45)">
              {MONTH_INITIALS[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
