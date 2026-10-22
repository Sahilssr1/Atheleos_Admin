// Charts built on Recharts — smooth curves, minimal axes, clean tooltips.
// Same props as the previous hand-rolled SVG charts, so every page call-site
// is unchanged; only the rendering is modernized.
import { useId } from 'react';
import {
  Area, AreaChart, Bar, BarChart as RBarChart, CartesianGrid, Cell, LabelList,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

export interface SeriesPoint { date: string; count: number }

const DONUT_COLORS = ['#6c5ce7', '#4f8ff7', '#f5a623', '#2fbf71', '#e5536b', '#962fbf', '#38b6c9', '#8a8fa3'];
const AXIS_TICK = { fill: '#8a8fa3', fontSize: 11.5 } as const;

function shortDate(d: string): string {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const raw = label != null && label !== '' ? String(label) : (p.name != null ? String(p.name) : '');
  const title = /^\d{4}-\d{2}-\d{2}/.test(raw) ? shortDate(raw) : raw;
  return (
    <div className="chart-tooltip">
      {title && <div className="chart-tooltip-label">{title}</div>}
      <div className="chart-tooltip-value">{Number(p.value).toLocaleString()}</div>
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function LineChart({ data, color = '#6c5ce7', height = 180, label }: {
  data: SeriesPoint[]; color?: string; height?: number; label?: string;
}) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (data.length === 0) return <div className="state-box"><div>No data in this range</div></div>;
  return (
    <div className="chart-box" role="img" aria-label={label ?? 'Line chart'}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 6, bottom: 0, left: -14 }}>
          <defs>
            <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.26} />
              <stop offset="100%" stopColor={color} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#8a8fa3" strokeOpacity={0.14} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS_TICK} axisLine={false} tickLine={false}
            minTickGap={40} tickMargin={8} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
          <Tooltip content={<ChartTip />} cursor={{ stroke: '#8a8fa3', strokeOpacity: 0.35, strokeDasharray: '4 4' }} />
          <Area type="monotone" dataKey="count" stroke={color} strokeWidth={2.2}
            fill={`url(#area-${gid})`} dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarChart({ data, color = '#6c5ce7', height = 180, label }: {
  data: { label: string; count: number }[]; color?: string; height?: number; label?: string;
}) {
  if (data.length === 0) return <div className="state-box"><div>No data available</div></div>;
  return (
    <div className="chart-box" role="img" aria-label={label ?? 'Bar chart'}>
      <ResponsiveContainer width="100%" height={height}>
        <RBarChart data={data} margin={{ top: 18, right: 6, bottom: 0, left: -14 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="#8a8fa3" strokeOpacity={0.14} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} tickMargin={8}
            interval={0} angle={data.length > 6 ? -18 : 0} textAnchor={data.length > 6 ? 'end' : 'middle'}
            height={data.length > 6 ? 44 : 30} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
          <Tooltip content={<ChartTip />} cursor={{ fill: '#8a8fa3', fillOpacity: 0.08 }} />
          <Bar dataKey="count" fill={color} radius={[7, 7, 0, 0]} maxBarSize={52}>
            <LabelList dataKey="count" position="top" fill="#8a8fa3" fontSize={11.5} fontWeight={650}
              formatter={(v: unknown) => Number(v).toLocaleString()} />
          </Bar>
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({ data, size = 176, label }: {
  data: { label: string; count: number }[]; size?: number; label?: string;
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (data.length === 0 || total === 0) return <div className="state-box"><div>No data available</div></div>;
  return (
    <div className="donut-wrap" role="img" aria-label={label ?? 'Distribution chart'}>
      <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<ChartTip />} />
            <Pie data={data} dataKey="count" nameKey="label" innerRadius="68%" outerRadius="92%"
              paddingAngle={2.5} cornerRadius={5} strokeWidth={0} startAngle={90} endAngle={450}>
              {data.map((d, i) => <Cell key={d.label} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center" aria-hidden>
          <span className="donut-total">{total.toLocaleString()}</span>
          <span className="donut-total-label">total</span>
        </div>
      </div>
      <div className="donut-legend">
        {data.map((d, i) => (
          <span key={d.label} className="legend-item">
            <span className="legend-swatch" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} aria-hidden />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
            <span className="legend-count">{d.count.toLocaleString()}</span>
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
