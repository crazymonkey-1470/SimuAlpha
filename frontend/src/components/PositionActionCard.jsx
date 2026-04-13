import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import supabase from '../supabaseClient';

const RATING_COLORS = {
  STRONG_BUY: '#10b981',
  BUY: '#10b981',
  NEUTRAL: '#f59e0b',
  REDUCE: '#ef4444',
  SELL: '#ef4444',
};

export default function PositionActionCard({ ticker }) {
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) return;
    supabase
      .from('stock_analysis')
      .select('position_card, rating, lynch_classification, peg_ratio, margin_of_safety, kill_thesis_flags, gate_result, tranche_recommendation')
      .eq('ticker', ticker)
      .single()
      .then(({ data }) => {
        setCard(data?.position_card || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [ticker]);

  if (loading || !card) return null;

  const ratingColor = RATING_COLORS[card.rating] || 'var(--text-secondary)';

  const Section = ({ title, children }) => (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '16px' }}>
      <div style={{
        fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)',
        textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '12px',
      }}>
        {title}
      </div>
      {children}
    </div>
  );

  const Row = ({ label, value, color }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
      <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 500, color: color || 'var(--text-primary)' }}>{value}</span>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${ratingColor}30`,
        borderTop: `3px solid ${ratingColor}`,
        borderRadius: '10px',
        padding: '24px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div>
          <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '22px', fontWeight: 400, color: 'var(--text-primary)' }}>
            Position Action Card
          </div>
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
            {ticker}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '20px', fontWeight: 700, color: ratingColor }}>
            {card.rating || 'N/A'}
          </div>
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)' }}>
            {card.signal}
          </div>
        </div>
      </div>

      {/* Price + Target */}
      <div style={{ display: 'flex', gap: '24px', marginTop: '12px' }}>
        <div>
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)' }}>PRICE</div>
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '16px', color: 'var(--text-primary)' }}>
            ${card.currentPrice?.toFixed(2) || '\u2014'}
          </div>
        </div>
        {card.compositePriceTarget && (
          <div>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)' }}>TARGET</div>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '16px', color: card.compositeUpside > 0 ? '#10b981' : '#ef4444' }}>
              ${card.compositePriceTarget.toFixed(2)} ({card.compositeUpside > 0 ? '+' : ''}{card.compositeUpside?.toFixed(1)}%)
            </div>
          </div>
        )}
      </div>

      {/* Screens */}
      <Section title="Screens">
        <Row label="Lynch Screen" value={`${card.screens?.lynch?.score ?? '?'}/7 ${card.screens?.lynch?.pass ? 'PASS' : 'FAIL'}`} color={card.screens?.lynch?.pass ? '#10b981' : '#ef4444'} />
        <Row label="Buffett Screen" value={`${card.screens?.buffett?.score ?? '?'}/9 ${card.screens?.buffett?.pass ? 'PASS' : ''}`} color={card.screens?.buffett?.pass ? '#10b981' : 'var(--text-secondary)'} />
        <Row label="Dual Screen" value={card.screens?.dualScreenPass ? 'YES' : 'NO'} color={card.screens?.dualScreenPass ? '#10b981' : 'var(--text-secondary)'} />
        <Row label="Health Flags" value={card.screens?.healthRedFlags ?? '\u2014'} color={card.screens?.healthRedFlags >= 3 ? '#ef4444' : 'var(--text-primary)'} />
      </Section>

      {/* Wave Position */}
      {card.wavePosition?.currentWave && (
        <Section title="Wave Position">
          <Row label="Current" value={card.wavePosition.currentWave} />
          {card.wavePosition.entryZone && <Row label="Entry Zone" value={card.wavePosition.entryZone} color="#10b981" />}
          {card.wavePosition.wave3Target && <Row label="Wave 3 Target" value={card.wavePosition.wave3Target} color="#f59e0b" />}
          {card.wavePosition.wave5Target && <Row label="Wave 5 Target" value={card.wavePosition.wave5Target} color="#10b981" />}
          {card.wavePosition.invalidation && <Row label="Invalidation" value={card.wavePosition.invalidation} color="#ef4444" />}
        </Section>
      )}

      {/* Classification */}
      <Section title="Classification">
        {card.classification?.lynchCategory && <Row label="Lynch Category" value={card.classification.lynchCategory} />}
        {card.classification?.pegRatio != null && (
          <Row label="PEG Ratio" value={`${card.classification.pegRatio} (${card.classification.pegLabel || ''})`} color={card.classification.pegLabel === 'ATTRACTIVE' ? '#10b981' : card.classification.pegLabel === 'EXPENSIVE' ? '#ef4444' : 'var(--text-primary)'} />
        )}
        {card.classification?.marginOfSafety != null && (
          <Row label="Margin of Safety" value={`${card.classification.marginOfSafety.toFixed(1)}%`} color={card.classification.marginOfSafety > 15 ? '#10b981' : card.classification.marginOfSafety > 10 ? '#f59e0b' : '#ef4444'} />
        )}
        <Row label="Moat" value={card.classification?.moatScore || 'N/A'} />
        <Row
          label="Kill Flags"
          value={card.classification?.killThesisFlags?.length > 0 ? card.classification.killThesisFlags.join(', ') : 'CLEAR'}
          color={card.classification?.killThesisForceDowngrade ? '#ef4444' : '#10b981'}
        />
      </Section>

      {/* Position Size */}
      {card.positionSize && (
        <Section title="Position Size">
          <Row label="Tranche" value={`${card.positionSize.trancheNumber || '?'} of 5 (${card.positionSize.tranchePct || '?'}%)`} />
          <Row label="Cumulative" value={`${card.positionSize.cumulativePct || '?'}%`} />
          <Row label="Type" value={card.positionSize.type || card.action || '\u2014'} />
        </Section>
      )}

      {/* Risk Filters */}
      <Section title="Risk Filters">
        <Row label="All Pass" value={card.riskFilters?.allPass ? 'YES' : card.riskFilters?.allPass === false ? 'NO' : '\u2014'} color={card.riskFilters?.allPass ? '#10b981' : card.riskFilters?.allPass === false ? '#ef4444' : 'var(--text-dim)'} />
        {card.riskFilters?.overrideReason && <Row label="Override" value={card.riskFilters.overrideReason} color="#f59e0b" />}
      </Section>

      {/* Gate Result */}
      {card.gateResult && (
        <Section title="Fundamental Gate">
          <Row label="Status" value={card.gateResult.passes ? 'PASS' : 'DISQUALIFIED'} color={card.gateResult.passes ? '#10b981' : '#ef4444'} />
          {card.gateResult.failures?.length > 0 && (
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: '#ef4444', marginTop: '4px' }}>
              {card.gateResult.failures.join(', ')}
            </div>
          )}
        </Section>
      )}
    </motion.div>
  );
}
