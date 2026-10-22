export type RangeKey = 'today' | '7d' | '30d' | '90d' | 'custom';

export interface RangeValue { range: RangeKey; from?: string; to?: string }

export function RangeFilter({ value, onChange }: { value: RangeValue; onChange: (v: RangeValue) => void }) {
  const presets: { key: RangeKey; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: '7d', label: 'Last 7 days' },
    { key: '30d', label: 'Last 30 days' },
    { key: '90d', label: 'Last 90 days' },
    { key: 'custom', label: 'Custom' },
  ];
  return (
    <div className="row wrap" role="group" aria-label="Date range">
      {presets.map((p) => (
        <button key={p.key} className={`btn sm${value.range === p.key ? ' primary' : ''}`}
          onClick={() => onChange({ ...value, range: p.key })} aria-pressed={value.range === p.key}>
          {p.label}
        </button>
      ))}
      {value.range === 'custom' && (
        <>
          <input type="date" className="input" style={{ width: 160 }} aria-label="From date"
            value={value.from ?? ''} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <input type="date" className="input" style={{ width: 160 }} aria-label="To date"
            value={value.to ?? ''} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </>
      )}
    </div>
  );
}

export function rangeQuery(v: RangeValue): Record<string, string> {
  const q: Record<string, string> = { range: v.range };
  if (v.range === 'custom') { if (v.from) q.from = v.from; if (v.to) q.to = v.to; }
  return q;
}
