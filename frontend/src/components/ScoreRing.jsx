import { motion } from 'framer-motion';

function getColor(score) {
  if (score >= 75) return '#00ff88';
  if (score >= 60) return '#f5a623';
  return '#e8e8f0';
}

export default function ScoreRing({ score = 0, size = 80, strokeWidth = 5 }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const progress = (score / 100) * circ;
  const color = getColor(score);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1a1a2e" strokeWidth={strokeWidth} />
        <motion.circle
          cx={size/2} cy={size/2} r={r} fill="none" stroke={color}
          strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - progress }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <motion.span
        className="absolute font-mono font-medium"
        style={{ color, fontSize: size * 0.28 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        {score}
      </motion.span>
    </div>
  );
}
