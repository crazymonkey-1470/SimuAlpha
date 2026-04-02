export default function MetricCard({ label, value, delta, color }) {
  return (
    <div className="bg-bg-card border border-border p-3">
      <div className="text-[9px] font-mono text-text-secondary uppercase tracking-wider mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-base font-mono font-medium" style={{ color: color || '#e8e8f0' }}>
          {value ?? '—'}
        </span>
        {delta != null && (
          <span className="text-[9px] font-mono" style={{ color: delta >= 0 ? '#00ff88' : '#ff4466' }}>
            {delta >= 0 ? '+' : ''}{typeof delta === 'number' ? delta.toFixed(1) : delta}%
          </span>
        )}
      </div>
    </div>
  );
}
