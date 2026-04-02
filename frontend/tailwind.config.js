/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#080810',
        'bg-card': '#0d0d1a',
        'bg-card-hover': '#121220',
        border: '#1a1a2e',
        'border-accent': '#00ff88',
        'text-primary': '#e8e8f0',
        'text-secondary': '#5a5a7a',
        'text-dim': '#2a2a3e',
        green: '#00ff88',
        'green-dim': 'rgba(0,255,136,0.13)',
        amber: '#f5a623',
        'amber-dim': 'rgba(245,166,35,0.13)',
        red: '#ff4466',
        blue: '#4488ff',
      },
      fontFamily: {
        heading: ['"Syne"', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
      keyframes: {
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.5 },
        },
      },
      animation: {
        scanline: 'scanline 3s linear',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
