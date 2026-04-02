import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import supabase from '../supabaseClient';
import SignalBadge from '../components/SignalBadge';

const TYPE_EMOJI = { LOAD_THE_BOAT: '🟢', SIGNAL_UPGRADE: '🟡', CROSSED_200WMA: '📉', CROSSED_200MMA: '📉', WAVE_BUY_ZONE: '🌊' };
const TYPES = ['ALL', 'LOAD_THE_BOAT', 'SIGNAL_UPGRADE', 'CROSSED_200WMA', 'CROSSED_200MMA', 'WAVE_BUY_ZONE'];

export default function Signals() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    supabase.from('signal_alerts').select('*').order('fired_at', { ascending: false }).limit(200)
      .then(({ data }) => { setAlerts(data || []); setLoading(false); });
  }, []);

  // Refresh every 5 minutes
  useEffect(() => {
    const iv = setInterval(() => {
      supabase.from('signal_alerts').select('*').order('fired_at', { ascending: false }).limit(200)
        .then(({ data }) => { if (data) setAlerts(data); });
    }, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  const filtered = filter === 'ALL' ? alerts : alerts.filter((a) => a.alert_type === filter);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

      <h1 className="font-heading font-bold text-lg mb-5"><span className="text-green">SIGNAL</span> HISTORY</h1>

      <div className="flex gap-1.5 mb-4 flex-wrap">
        {TYPES.map((t) => (
          <button key={t} onClick={() => setFilter(t)}
            className={`px-2.5 py-1 text-[9px] font-mono tracking-wider transition-colors ${
              filter === t ? 'text-green bg-green-dim border border-green/30' : 'text-text-secondary border border-border hover:text-text-primary'}`}>
            {t === 'ALL' ? 'ALL' : `${TYPE_EMOJI[t] || ''} ${t.replace(/_/g, ' ')}`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-text-secondary font-mono text-xs">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-border bg-bg-card">
          <div className="font-mono text-text-secondary text-sm mb-2">No alerts yet</div>
          <div className="font-mono text-text-secondary text-[11px]">
            Pipeline will fire alerts when signals change or prices cross key levels.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a, i) => (
            <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className="bg-bg-card border border-border p-4 hover:bg-bg-card-hover transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{TYPE_EMOJI[a.alert_type] || '📊'}</span>
                  <div>
                    <Link to={`/ticker/${a.ticker}`} className="font-mono font-medium text-green hover:underline text-sm">{a.ticker}</Link>
                    {a.company_name && <span className="text-[10px] text-text-secondary ml-2">{a.company_name}</span>}
                    <div className="text-[9px] text-text-secondary font-mono">{a.alert_type?.replace(/_/g, ' ')}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-text-primary">{a.score}/100</span>
                  <span className="font-mono text-xs">${a.current_price != null ? Number(a.current_price).toFixed(2) : '—'}</span>
                  {a.new_signal && <SignalBadge signal={a.new_signal} compact />}
                  <span className="text-[9px] font-mono text-text-dim">{new Date(a.fired_at).toLocaleDateString()}</span>
                </div>
              </div>
              {a.entry_note && <p className="text-[10px] font-mono text-text-secondary mt-2">{a.entry_note}</p>}
              {a.previous_signal && a.new_signal && a.previous_signal !== a.new_signal && (
                <p className="text-[10px] font-mono text-amber mt-1">Signal: {a.previous_signal} → {a.new_signal}</p>
              )}
              {a.new_signal === 'WAVE BUY ZONE' && (
                <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 border border-green/30 bg-green-dim">
                  <span className="text-[9px]">🌊</span>
                  <span className="text-[9px] font-mono text-green tracking-wider">ELLIOTT WAVE BUY ZONE</span>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
