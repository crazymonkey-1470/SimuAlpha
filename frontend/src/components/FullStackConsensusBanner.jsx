import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useFullStackConsensus } from '../hooks/useSAIN';

export default function FullStackConsensusBanner() {
  const navigate = useNavigate();
  const { data: stocks, loading } = useFullStackConsensus();

  if (loading || stocks.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        style={{
          background: 'linear-gradient(135deg, rgba(201,168,76,0.12) 0%, rgba(240,165,0,0.10) 50%, rgba(201,168,76,0.08) 100%)',
          border: '1px solid rgba(201,168,76,0.3)',
          borderRadius: '12px',
          padding: '20px 24px',
          marginBottom: '24px',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px'
        }}>
          <span style={{ fontSize: '20px' }}>&#127942;</span>
          <span style={{
            fontFamily: 'IBM Plex Mono', fontSize: '13px', fontWeight: 500,
            color: 'var(--gold)', letterSpacing: '0.08em', textTransform: 'uppercase'
          }}>
            Full Stack Consensus
          </span>
          <span style={{
            fontFamily: 'IBM Plex Mono', fontSize: '11px',
            color: 'var(--text-secondary)'
          }}>
            &mdash; {stocks.length} stock{stocks.length !== 1 ? 's' : ''} with ALL 4 layers aligned
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {stocks.map(stock => (
            <motion.div
              key={stock.ticker}
              onClick={() => navigate(`/ticker/${stock.ticker}`)}
              style={{
                background: 'rgba(201,168,76,0.06)',
                border: '1px solid rgba(201,168,76,0.15)',
                borderRadius: '8px',
                padding: '14px 18px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              whileHover={{
                background: 'rgba(201,168,76,0.12)',
                borderColor: 'rgba(201,168,76,0.3)',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', gap: '16px',
                flexWrap: 'wrap'
              }}>
                <span style={{
                  fontFamily: 'IBM Plex Mono', fontSize: '16px', fontWeight: 600,
                  color: 'var(--gold)', minWidth: '60px'
                }}>
                  {stock.ticker}
                </span>

                <span style={{
                  fontFamily: 'IBM Plex Mono', fontSize: '13px', fontWeight: 500,
                  color: stock.total_sain_score > 0 ? 'var(--signal-green)' : 'var(--red)'
                }}>
                  SAIN {stock.total_sain_score > 0 ? '+' : ''}{stock.total_sain_score}
                </span>

                <span style={{ width: '1px', height: '16px', background: 'var(--border-light)' }} />

                <div style={{
                  display: 'flex', gap: '12px', flexWrap: 'wrap',
                  fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)'
                }}>
                  <span>&#127963;&#65039; Super Investors: +{stock.super_investor_score}</span>
                  <span>&#127963; Politicians: +{stock.politician_score}
                    {stock.politician_trades?.some?.(t => t.committee_sector_match)
                      ? ' (committee match)' : ''}
                  </span>
                  <span>&#129302; AI Models: +{stock.ai_model_score}</span>
                  <span>&#128202; TLI: +{stock.tli_score}</span>
                </div>
              </div>

              <div style={{
                fontFamily: 'IBM Plex Mono', fontSize: '11px',
                color: 'var(--text-secondary)', marginTop: '6px'
              }}>
                Consensus: <span style={{
                  color: stock.consensus_direction?.includes('BUY') ? 'var(--signal-green)' : 'var(--red)',
                  fontWeight: 500
                }}>{stock.consensus_direction?.includes('BUY') ? 'Highest Conviction Zone'
                  : stock.consensus_direction?.includes('SELL') ? 'Consider Reducing' : stock.consensus_direction}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
