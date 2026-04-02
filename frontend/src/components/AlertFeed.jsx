import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import SignalBadge from './SignalBadge';

const TYPE_EMOJI = {
  LOAD_THE_BOAT: '🟢',
  SIGNAL_UPGRADE: '🟡',
  CROSSED_200WMA: '📉',
  CROSSED_200MMA: '📉',
};

function fmtAgo(ts) {
  if (!ts) return '';
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function AlertFeed({ alerts = [], limit = 10 }) {
  const display = alerts.slice(0, limit);

  if (display.length === 0) {
    return (
      <div className="text-center py-6 text-text-secondary font-mono text-[11px]">
        No alerts yet. Pipeline will fire alerts on signal changes.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {display.map((a, i) => (
        <motion.div
          key={a.id || i}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.03 }}
          className="flex items-center gap-3 px-3 py-2 bg-bg-card border border-border/50 hover:bg-bg-card-hover transition-colors text-[11px] font-mono"
        >
          <span className="text-text-dim w-8 shrink-0">{fmtAgo(a.fired_at)}</span>
          <span className="text-sm">{TYPE_EMOJI[a.alert_type] || '📊'}</span>
          <Link to={`/ticker/${a.ticker}`} className="text-green hover:underline font-medium">
            {a.ticker}
          </Link>
          <span className="text-text-secondary hidden sm:inline truncate">{a.alert_type?.replace(/_/g, ' ')}</span>
          <span className="text-text-primary ml-auto">{a.score}</span>
          {a.new_signal && <SignalBadge signal={a.new_signal} compact />}
        </motion.div>
      ))}
    </div>
  );
}
