/**
 * SectorStrength — Shows how this stock compares to its sector peers.
 * Includes sector average score, rank, and contextual insight.
 */
export default function SectorStrength({ sector, totalScore, sectorAvgScore, sectorRank }) {
  if (!sector || sectorAvgScore == null) {
    return (
      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)' }}>
        Sector data unavailable
      </div>
    );
  }

  const rankColor = {
    'TOP 10%': 'var(--signal-green)',
    'TOP 25%': 'var(--signal-green)',
    'AVERAGE': 'var(--signal-amber)',
    'BELOW AVERAGE': 'var(--red, #ef4444)',
  }[sectorRank] || 'var(--text-secondary)';

  // Bar: position of this stock relative to sector
  const barPct = totalScore != null ? Math.min(totalScore, 100) : 0;
  const avgPct = Math.min(sectorAvgScore, 100);

  // Contextual insight
  let insight = '';
  if (sectorAvgScore < 40 && totalScore > sectorAvgScore) {
    insight = 'Sector also beaten down \u2014 broader opportunity';
  } else if (sectorAvgScore > 50 && totalScore < sectorAvgScore - 15) {
    insight = 'Stock uniquely weak vs sector \u2014 investigate why';
  } else if (totalScore > sectorAvgScore + 15) {
    insight = 'Stock outperforming sector \u2014 relative strength';
  }

  return (
    <div style={{
      padding: '12px 16px', borderRadius: '8px',
      background: 'var(--bg-secondary)', border: '1px solid var(--border)'
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '10px'
      }}>
        <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)' }}>
          {sector}
        </span>
        <span style={{
          fontFamily: 'IBM Plex Mono', fontSize: '10px', fontWeight: 600,
          color: rankColor, letterSpacing: '0.05em'
        }}>
          {sectorRank}
        </span>
      </div>

      {/* Visual bar */}
      <div style={{
        position: 'relative', height: '8px', borderRadius: '4px',
        background: 'var(--bg-card)', marginBottom: '8px'
      }}>
        {/* Stock score bar */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${barPct}%`, borderRadius: '4px',
          background: rankColor, opacity: 0.7
        }} />
        {/* Sector average marker */}
        <div style={{
          position: 'absolute', left: `${avgPct}%`, top: '-2px', bottom: '-2px',
          width: '2px', background: 'var(--text-secondary)', borderRadius: '1px'
        }} />
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontFamily: 'IBM Plex Mono', fontSize: '10px'
      }}>
        <span style={{ color: 'var(--text-dim)' }}>
          Sector avg: {sectorAvgScore.toFixed(0)}
        </span>
        <span style={{ color: 'var(--text-dim)' }}>
          This stock: {totalScore}
        </span>
      </div>

      {insight && (
        <div style={{
          marginTop: '8px', fontFamily: 'IBM Plex Mono', fontSize: '10px',
          color: 'var(--signal-amber)', fontStyle: 'italic'
        }}>
          {insight}
        </div>
      )}
    </div>
  );
}
