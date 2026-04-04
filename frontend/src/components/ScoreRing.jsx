import { useEffect, useState } from 'react';

export default function ScoreRing({ score = 0, size = 80 }) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(score), 100);
    return () => clearTimeout(timer);
  }, [score]);

  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (animated / 100) * circumference;

  const color = score >= 75
    ? 'var(--signal-green)'
    : score >= 60
    ? 'var(--signal-amber)'
    : 'var(--text-secondary)';

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={4}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column'
      }}>
        <span style={{
          fontFamily: 'IBM Plex Mono',
          fontSize: size > 60 ? '18px' : '13px',
          fontWeight: 500,
          color
        }}>
          {score}
        </span>
        {size > 60 && (
          <span style={{
            fontFamily: 'IBM Plex Mono',
            fontSize: '9px',
            color: 'var(--text-dim)',
            letterSpacing: '0.1em'
          }}>
            /100
          </span>
        )}
      </div>
    </div>
  );
}
