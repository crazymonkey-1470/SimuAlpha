/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0f',
        'bg-card': '#111118',
        'bg-card-hover': '#16161f',
        border: '#1e1e2e',
        'text-primary': '#f0f0f5',
        'text-secondary': '#6b6b8a',
        green: '#00ff88',
        amber: '#f5a623',
        red: '#ff4466',
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
        pulse: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.5 },
        },
      },
      animation: {
        scanline: 'scanline 3s linear',
        'pulse-slow': 'pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
