/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0f',
        'bg-card': '#12121a',
        'bg-hover': '#1a1a25',
        accent: '#00ff88',
        amber: '#f5a623',
        'text-primary': '#ffffff',
        'text-secondary': '#8a8a9a',
        border: '#2a2a3a',
      },
      fontFamily: {
        mono: ['"DM Mono"', 'monospace'],
        heading: ['"Syne"', 'sans-serif'],
      },
      keyframes: {
        scanline: {
          '0%': { top: '0%' },
          '100%': { top: '100%' },
        },
        pulse: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.6 },
        },
      },
      animation: {
        scanline: 'scanline 3s linear infinite',
        pulse: 'pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
