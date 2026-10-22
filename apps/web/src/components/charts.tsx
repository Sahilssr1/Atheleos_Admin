// Inline SVG charts — no external chart library. Same data in, richer
// presentation out: gridlines, gradient area fills, native tooltips.
import { useId } from 'react';

export interface SeriesPoint { date: string; count: number }

const DONUT_COLORS = ['#6c5ce7', '#4f8ff7', '#f5a623', '#2fbf71', '#e5536b', '#962fbf', '#38b6c9', '#8a8fa3'];

export function LineChart({ data, color = '#6c5ce7', height = 160, label }: {
  data: SeriesPoint[]; color?: string; height?: number; label?: string;
}) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (data.length === 0) return <div className="state-box"><div>No data in this range</div></div>;
  const w = 640;
  const h = height;
  const padX = 10;
  const padTop = 12;
  const padBottom = 10;
  const max = Math.max(1, ...data.map((d) => d.count));
  const stepX = data.length > 1 ? (w - padX * 2) / (data.length - 1) : 0;
  const y = (v: number) => padTop + (1 - v / max) * (h - padTop - padBottom);
  const pts = data.map((d, i) => [padX + i * stepX, y(d.count)] as const);
  const line = pts.map((p) => p.join(',')).join(' ');
  const area = `${padX},${h - padBottom} ${line} ${padX + (data.length - 1) * stepX},${h - padBottom}`;
  const gridVals = [0.25, 0.5, 0.75, 1];
  const last = pts[pts.length - 1];
  return (
    <div className="chart-box">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={label ?? 'Line chart'} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`lg-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {gridVals.map((f) => (
          <line key={f} x1={padX} x2={w - padX} y1={y(max * f)} y2={y(max * f)}
            stroke="currentColor" strokeOpacity={0.08} strokeDasharray="3 5" />
        ))}
        <polygon points={area} fill={`url(#lg-${gid})`} />
        <polyline points={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={2.4} fill={color} opacity={0.55}>
            <title>{`${data[i].date}: ${data[i].count.toLocaleString()}`}</title>
          </circle>
        ))}
        {last && <circle cx={last[0]} cy={last[1]} r={4} fill={color} stroke="var(--bg-elev)" strokeWidth={2} />}
      </svg>
      <div className="row between small faint">
        <span>{data[0]?.date}</span>
        <span>peak {max.toLocaleString()}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

export function BarChart({ data, color = '#6c5ce7', height = 160, label }: {
  data: { label: string; count: number }[]; color?: string; height?: number; label?: string;
}) {
  if (data.length === 0) return <div className="state-box"><div>No data available</div></div>;
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="chart-box" role="img" aria-label={label ?? 'Bar chart'}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height, borderBottom: '1px solid var(--border-soft)' }}>
        {data.map((d) => (
          <div key={d.label} title={`${d.label}: ${d.count.toLocaleString()}`}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0, height: '100%', justifyContent: 'flex-end' }}>
            <span className="small" style={{ fontWeight: 650 }}>{d.count.toLocaleString()}</span>
            <div style={{
              width: '72%', maxWidth: 56, height: Math.max(4, (d.count / max) * (height - 46)),
              background: `linear-gradient(180deg, ${color}, ${color}cc)`, borderRadius: '7px 7px 0 0',
              transition: 'height .3s var(--ease)',
            }} />
            <span className="small faint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', paddingBottom: 6 }}>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DonutChart({ data, size = 168, label }: {
  data: { label: string; count: number }[]; size?: number; label?: string;
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (data.length === 0 || total === 0) return <div className="state-box"><div>No data available</div></div>;
  const r = 62;
  const c = 2 * Math.PI * r;
  let acc = 0;
  const segments = data.map((d, i) => {
    const frac = d.count / total;
    const seg = { ...d, frac, offset: acc, color: DONUT_COLORS[i % DONUT_COLORS.length] };
    acc += frac;
    return seg;
  });
  return (
    <div className="donut-wrap" role="img" aria-label={label ?? 'Distribution chart'}>
      <svg width={size} height={size} viewBox="0 0 160 160" style={{ flex: 'none' }}>
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--bg-elev-2)" strokeWidth="17" />
        {segments.map((s) => (
          <circle key={s.label} cx="80" cy="80" r={r} fill="none" stroke={s.color} strokeWidth="17"
            strokeDasharray={`${Math.max(0, s.frac * c - 2.5)} ${c}`}
            strokeDashoffset={-s.offset * c}
            transform="rotate(-90 80 80)" strokeLinecap="butt">
            <title>{`${s.label}: ${s.count.toLocaleString()} (${Math.round(s.frac * 100)}%)`}</title>
          </circle>
        ))}
        <text x="80" y="76" textAnchor="middle" fill="var(--text)" fontSize="21" fontWeight="750">
          {total.toLocaleString()}
        </text>
        <text x="80" y="94" textAnchor="middle" fill="var(--text-faint)" fontSize="10.5">total</text>
      </svg>
      <div className="donut-legend">
        {segments.map((s) => (
          <span key={s.label} className="legend-item">
            <span className="legend-swatch" style={{ background: s.color }} aria-hidden />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
            <span className="legend-count">{s.count.toLocaleString()}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ data, color = '#6c5ce7', width = 96, height = 30, label }: {
  data: SeriesPoint[]; color?: string; width?: number; height?: number; label?: string;
}) {
  if (data.length === 0) return null;
  const max = Math.max(1, ...data.map((d) => d.count));
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const pts = data.map((d, i) => [i * stepX, height - 3 - (d.count / max) * (height - 6)] as const);
  const line = pts.map((p) => p.join(',')).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? 'Trend sparkline'} style={{ display: 'block' }}>
      <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
