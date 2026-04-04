export default function EmptyState({ message, sub }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '80px 24px',
      textAlign: 'center'
    }}>
      <div style={{
        fontFamily: 'Cormorant Garamond',
        fontSize: '24px',
        color: 'var(--text-secondary)',
        marginBottom: '12px'
      }}>
        {message || 'No data yet'}
      </div>
      <div style={{
        fontFamily: 'IBM Plex Mono',
        fontSize: '12px',
        color: 'var(--text-dim)',
        maxWidth: '400px'
      }}>
        {sub || 'The pipeline is running. Check back in a few minutes.'}
      </div>
    </div>
  );
}
