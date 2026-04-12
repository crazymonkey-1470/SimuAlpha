import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import supabase from '../supabaseClient';

const SIGNAL_COLORS = {
  LOAD_THE_BOAT: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.3)', text: '#10b981' },
  ACCUMULATE: { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.3)', text: '#3b82f6' },
  WATCH: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', text: '#f59e0b' },
  PASS: { bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)', text: '#ef4444' },
};

export default function ThesisDisplay({ ticker }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [greatsExpanded, setGreatsExpanded] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    supabase.from('stock_analysis').select('*').eq('ticker', ticker).single()
      .then(({ data }) => { setAnalysis(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [ticker]);

  async function triggerAnalysis() {
    setAnalyzing(true);
    try {
      await fetch(`/api/analyze/${ticker}`, { method: 'POST' });
      // Poll for result
      const poll = setInterval(async () => {
        const { data } = await supabase.from('stock_analysis').select('*').eq('ticker', ticker).single();
        if (data?.analyzed_at) {
          setAnalysis(data);
          setAnalyzing(false);
          clearInterval(poll);
        }
      }, 5000);
      // Timeout after 3 minutes
      setTimeout(() => { clearInterval(poll); setAnalyzing(false); }, 180000);
    } catch {
      setAnalyzing(false);
    }
  }

  if (loading) {
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '24px' }}>
        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-secondary)' }}>
          Loading AI analysis...
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '24px' }}>
        <h3 style={{ fontFamily: 'Cormorant Garamond', fontSize: '24px', fontWeight: 400, marginBottom: '12px', color: 'var(--text-primary)' }}>
          AI Investment Thesis
        </h3>
        <p style={{ fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          No AI analysis available yet for {ticker}.
        </p>
        <button onClick={triggerAnalysis} disabled={analyzing} style={{
          background: analyzing ? 'var(--bg-secondary)' : 'var(--signal-green-dim)',
          border: `1px solid ${analyzing ? 'var(--border)' : 'var(--signal-green)40'}`,
          borderRadius: '8px', padding: '10px 20px',
          color: analyzing ? 'var(--text-secondary)' : 'var(--signal-green)',
          fontFamily: 'IBM Plex Mono', fontSize: '12px', cursor: analyzing ? 'wait' : 'pointer',
        }}>
          {analyzing ? 'Analyzing...' : 'Run AI Analysis'}
        </button>
      </div>
    );
  }

  const thesis = analysis.thesis_json || {};
  const greats = analysis.greats_comparison || {};
  const signalStyle = SIGNAL_COLORS[thesis.signal] || SIGNAL_COLORS.WATCH;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Thesis Header */}
      <div style={{
        background: signalStyle.bg, border: `1px solid ${signalStyle.border}`,
        borderRadius: '10px', padding: '24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <h3 style={{ fontFamily: 'Cormorant Garamond', fontSize: '24px', fontWeight: 400, color: 'var(--text-primary)', margin: 0 }}>
            AI Investment Thesis
          </h3>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{
              fontFamily: 'IBM Plex Mono', fontSize: '13px', fontWeight: 600,
              color: signalStyle.text, background: signalStyle.bg,
              border: `1px solid ${signalStyle.border}`, borderRadius: '6px', padding: '6px 14px',
            }}>
              {(thesis.signal || 'WATCH').replace(/_/g, ' ')}
            </span>
            {thesis.composite_score != null && (
              <span style={{
                fontFamily: 'IBM Plex Mono', fontSize: '20px', fontWeight: 700, color: signalStyle.text,
              }}>
                {thesis.composite_score}
              </span>
            )}
          </div>
        </div>

        {/* One-liner */}
        {thesis.one_liner && (
          <p style={{
            fontFamily: 'Cormorant Garamond', fontSize: '20px', fontStyle: 'italic',
            color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: '16px',
          }}>
            &ldquo;{thesis.one_liner}&rdquo;
          </p>
        )}

        {/* Reasoning */}
        {thesis.reasoning && (
          <p style={{ fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            {thesis.reasoning}
          </p>
        )}
      </div>

      {/* Bull / Bear / Catalyst */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
        {/* Bull Case */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--signal-green)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
            Bull Case
          </div>
          {(thesis.bull_case || []).map((point, i) => (
            <div key={i} style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-primary)', lineHeight: 1.7, marginBottom: '8px', paddingLeft: '12px', borderLeft: '2px solid var(--signal-green)30' }}>
              {point}
            </div>
          ))}
        </div>

        {/* Bear Case */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
            Bear Case
          </div>
          {(thesis.bear_case || []).map((point, i) => (
            <div key={i} style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-primary)', lineHeight: 1.7, marginBottom: '8px', paddingLeft: '12px', borderLeft: '2px solid rgba(239,68,68,0.3)' }}>
              {point}
            </div>
          ))}
        </div>

        {/* Catalyst + Entry */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px' }}>
          {thesis.catalyst && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--signal-amber)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                Catalyst
              </div>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-primary)', lineHeight: 1.7 }}>
                {thesis.catalyst}
              </div>
            </div>
          )}
          {thesis.entry_strategy && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--signal-green)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                Entry Strategy
              </div>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-primary)', lineHeight: 1.7 }}>
                {thesis.entry_strategy}
              </div>
            </div>
          )}
          {thesis.position_size && (
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '12px', color: signalStyle.text, fontWeight: 600 }}>
              Position: {thesis.position_size}
            </div>
          )}
        </div>
      </div>

      {/* Exit Criteria */}
      {thesis.exit_criteria && (
        <div style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '10px', padding: '16px 20px' }}>
          <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Exit Criteria:
          </span>
          <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-primary)', marginLeft: '12px' }}>
            {thesis.exit_criteria}
          </span>
        </div>
      )}

      {/* What Would the Greats Think? */}
      {greats.investor_views && greats.investor_views.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '24px' }}>
          <button onClick={() => setGreatsExpanded(!greatsExpanded)} style={{
            background: 'transparent', border: 'none', cursor: 'pointer', width: '100%',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 0,
          }}>
            <h3 style={{ fontFamily: 'Cormorant Garamond', fontSize: '22px', fontWeight: 400, color: 'var(--text-primary)', margin: 0 }}>
              What Would the Greats Think?
            </h3>
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '14px', color: 'var(--text-secondary)' }}>
              {greatsExpanded ? '\u25B2' : '\u25BC'}
            </span>
          </button>

          {greatsExpanded && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ marginTop: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                {greats.investor_views.map((view, i) => {
                  const verdictColor = view.verdict === 'BUY' || view.verdict === 'FAVORABLE' ? '#10b981' : view.verdict === 'PASS' || view.verdict === 'AVOID' ? '#ef4444' : '#f59e0b';
                  const verdictDisplay = { BUY: 'Favorable', SELL: 'Unfavorable', PASS: 'Pass', AVOID: 'Avoid', HOLD: 'Hold' };
                  return (
                    <div key={i} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {view.investor}
                        </span>
                        <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 600, color: verdictColor }}>
                          {verdictDisplay[view.verdict] || view.verdict}
                        </span>
                      </div>
                      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        {view.reasoning}
                      </div>
                      {view.conviction != null && (
                        <div style={{ marginTop: '8px', fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)' }}>
                          Conviction: {view.conviction}/10
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {greats.consensus && (
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.7, padding: '12px 0', borderTop: '1px solid var(--border)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Consensus:</strong> {greats.consensus}
                </div>
              )}
              {greats.historical_parallel && (
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Historical Parallel:</strong> {greats.historical_parallel}
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}

      {/* Analysis metadata */}
      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)', display: 'flex', gap: '16px' }}>
        {analysis.analyzed_at && <span>Analyzed: {new Date(analysis.analyzed_at).toLocaleDateString()}</span>}
        {analysis.analysis_elapsed_ms && <span>Runtime: {(analysis.analysis_elapsed_ms / 1000).toFixed(1)}s</span>}
        {analysis.skills_used && <span>Skills: {analysis.skills_used.length}</span>}
        <button onClick={triggerAnalysis} disabled={analyzing} style={{
          background: 'transparent', border: 'none', color: 'var(--signal-green)',
          fontFamily: 'IBM Plex Mono', fontSize: '10px', cursor: analyzing ? 'wait' : 'pointer', padding: 0,
        }}>
          {analyzing ? 'Re-analyzing...' : 'Re-analyze'}
        </button>
      </div>
    </motion.div>
  );
}
