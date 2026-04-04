import { useScreenerResults } from '../hooks/useScreener';
import ScreenerTable from '../components/ScreenerTable';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

export default function Screener() {
  const { data, loading } = useScreenerResults();

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
        <ScreenerTable data={data} />
      )}
    </div>
  );
}
