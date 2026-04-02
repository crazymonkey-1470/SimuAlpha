export default function MetricCard({ label, value, suffix = '', color }) {
  return (
    <div className="bg-bg-card border border-border p-4">
      <div className="text-xs text-text-secondary font-mono uppercase tracking-wider mb-1">
        {label}
      </div>
      <div
        className="text-xl font-mono font-medium"
        style={{ color: color || '#ffffff' }}
      >
        {value != null ? `${value}${suffix}` : '—'}
      </div>
    </div>
  );
}
