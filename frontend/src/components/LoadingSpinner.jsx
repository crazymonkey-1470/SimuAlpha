export default function LoadingSpinner() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '80px'
    }}>
      <div style={{
        width: '32px',
        height: '32px',
        border: '2px solid var(--border)',
        borderTop: '2px solid var(--signal-green)',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
