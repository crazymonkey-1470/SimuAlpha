import { useState, useEffect } from 'react';
import { useScreenerResults } from '../hooks/useScreener';
import ScreenerTable from '../components/ScreenerTable';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import supabase from '../supabaseClient';

export default function Screener() {
  const { data, loading } = useScreenerResults();
  const [waveData, setWaveData] = useState({});
  const [backtestData, setBacktestData] = useState({});

  useEffect(() => {
    async function fetchSupplemental() {
      const [waveRes, btRes] = await Promise.all([
        supabase.from('wave_counts').select('ticker, wave_structure, current_wave, tli_signal, confidence_label'),
        supabase.from('backtest_summary').select('ticker, total_signals, win_rate_pct, avg_return_pct')
      ]);
      if (waveRes.data) {
        const map = {};
        for (const w of waveRes.data) {
          if (!map[w.ticker]) map[w.ticker] = w;
        }
        setWaveData(map);
      }
      if (btRes.data) {
        const map = {};
        for (const b of btRes.data) {
          map[b.ticker] = b;
        }
        setBacktestData(map);
      }
    }
    fetchSupplemental();
  }, []);

  return (
    <div style={{ paddingTop: '40px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{
          fontFamily: 'Cormorant Garamond', fontSize: '48px',
          fontWeight: 300, color: 'var(--text-primary)', marginBottom: '8px'
        }}>
          Screener
        </h1>
        <p style={{
          fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-secondary)'
        }}>
          All stocks scored by TLI methodology. Click any row for deep analysis.
        </p>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : data.length === 0 ? (
        <EmptyState
          message="No results yet"
          sub="The pipeline is running its first scan. Results will appear here shortly."
        />
      ) : (
        <ScreenerTable data={data} waveData={waveData} backtestData={backtestData} />
      )}
    </div>
  );
}
