// Inline SVG charts — no external chart library.
export interface SeriesPoint { date: string; count: number }

export function LineChart({ data, color = '#d62976', height = 160, label }: {
  data: SeriesPoint[]; color?: string; height?: number; label?: string;
}) {
  if (data.length === 0) return <div className="state-box"><div>No data in this range</div></div>;
  const w = 640;
  const h = height;
  const pad = 8;
  const max = Math.max(1, ...data.map((d) => d.count));
  const stepX = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const pts = data.map((d, i) => [pad + i * stepX, h - pad - (d.count / max) * (h - pad * 2)] as const);
  const line = pts.map((p) => p.join(',')).join(' ');
  const area = `${pad},${h - pad} ${line} ${pad + (data.length - 1) * stepX},${h - pad}`;
  return (
    <div className="chart-box">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={label ?? 'Line chart'} preserveAspectRatio="none">
        <polygon points={area} fill={color} opacity={0.14} />
        <polyline points={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={2.6} fill={color} />)}
      </svg>
      <div className="row between small faint">
        <span>{data[0]?.date}</span>
        <span>peak {max}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

export function BarChart({ data, color = '#962fbf', height = 160, label }: {
  data: { label: string; count: number }[]; color?: string; height?: number; label?: string;
}) {
  if (data.length === 0) return <div className="state-box"><div>No data available</div></div>;
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="chart-box" role="img" aria-label={label ?? 'Bar chart'}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height }}>
        {data.map((d) => (
          <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span className="small" style={{ fontWeight: 600 }}>{d.count.toLocaleString()}</span>
            <div style={{ width: '70%', maxWidth: 54, height: Math.max(3, (d.count / max) * (height - 44)), background: color, borderRadius: '6px 6px 0 0' }} />
            <span className="small faint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
