# Dark Terminal Design System

A cyberpunk terminal aesthetic for data-dense web applications.
Built with React 18 + Vite + Tailwind CSS 3 + Framer Motion.

---

## 1. Google Fonts

Add to `index.html` `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;600;700;800&display=swap" rel="stylesheet" />
```

Set body class:

```html
<body class="bg-bg text-text-primary font-mono antialiased">
```

---

## 2. Tailwind Config

`tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
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
```

---

## 3. Global CSS

`src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  scrollbar-width: thin;
  scrollbar-color: #1a1a2e #080810;
}
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: #080810; }
::-webkit-scrollbar-thumb { background: #1a1a2e; border-radius: 2px; }

body { background: #080810; min-height: 100vh; }

.scanline {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 2px;
  background: linear-gradient(90deg, transparent, rgba(0,255,136,0.35), transparent);
  animation: scanline 3s linear forwards;
  pointer-events: none;
}
```

---

## 4. Color Reference

| Token            | Hex                        | Usage                     |
|------------------|----------------------------|---------------------------|
| `bg`             | `#080810`                  | Page background           |
| `bg-card`        | `#0d0d1a`                  | Card surfaces             |
| `bg-card-hover`  | `#121220`                  | Card hover state          |
| `border`         | `#1a1a2e`                  | All borders & dividers    |
| `text-primary`   | `#e8e8f0`                  | Body text                 |
| `text-secondary` | `#5a5a7a`                  | Labels, captions          |
| `text-dim`       | `#2a2a3e`                  | Disabled, subtle hints    |
| `green`          | `#00ff88`                  | Success, active, primary  |
| `green-dim`      | `rgba(0,255,136,0.13)`     | Green tinted backgrounds  |
| `amber`          | `#f5a623`                  | Warning, caution          |
| `amber-dim`      | `rgba(245,166,35,0.13)`    | Amber tinted backgrounds  |
| `red`            | `#ff4466`                  | Danger, negative          |
| `blue`           | `#4488ff`                  | Info, links               |

---

## 5. Typography Rules

| Role             | Font      | Class                        |
|------------------|-----------|------------------------------|
| Page headings    | Syne      | `font-heading font-bold`     |
| Section headers  | Syne      | `font-heading font-semibold text-[10px] tracking-wider uppercase` |
| Body / data      | DM Mono   | `font-mono` (default)        |
| Labels           | DM Mono   | `font-mono text-[9px] text-text-secondary uppercase tracking-wider` |
| Values           | DM Mono   | `font-mono font-medium`      |

Text sizes are intentionally tiny for data density: `text-[9px]`, `text-[10px]`, `text-[11px]`.

---

## 6. Component Templates

### Navigation Bar

```jsx
<nav className="fixed top-0 left-0 right-0 z-40 border-b border-border bg-bg/95 backdrop-blur-sm">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-11">
    <Link to="/" className="font-heading font-bold text-sm text-green">
      YOUR APP NAME
    </Link>
    <div className="flex items-center gap-2">
      {navLinks.map((l) => (
        <Link key={l.path} to={l.path}
          className={`px-2 py-1 text-[10px] font-mono tracking-widest transition-colors ${
            isActive
              ? 'text-green bg-green-dim border border-green/30'
              : 'text-text-secondary hover:text-text-primary'
          }`}>
          {l.label}
        </Link>
      ))}
      {/* Status dot */}
      <div className="flex items-center gap-1.5 ml-2">
        <span className="w-1.5 h-1.5 rounded-full bg-green" />
        <span className="text-[9px] font-mono text-text-secondary">2m ago</span>
      </div>
    </div>
  </div>
</nav>
```

### Card

```jsx
<div className="bg-bg-card border border-border p-4">
  <h4 className="font-heading font-semibold text-[10px] text-green tracking-wider mb-3">
    SECTION TITLE
  </h4>
  {/* content */}
</div>
```

### Stat Box

```jsx
<div className="bg-bg border border-border p-3 text-center">
  <div className="text-[9px] font-mono text-text-secondary uppercase tracking-wider mb-1">
    LABEL
  </div>
  <div className="font-mono font-medium text-lg" style={{ color: '#00ff88' }}>
    VALUE
  </div>
</div>
```

### Badge (3 states)

```jsx
{/* Green — pulsing, high priority */}
<span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono font-medium border bg-green-dim border-green/40 text-green animate-pulse-glow">
  ACTIVE
</span>

{/* Amber — caution */}
<span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono font-medium border bg-amber-dim border-amber/40 text-amber">
  PENDING
</span>

{/* Muted — neutral */}
<span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono font-medium border bg-transparent border-text-secondary/30 text-text-secondary">
  INACTIVE
</span>
```

### Inline Tag (border only)

```jsx
<span className="font-mono text-[9px] px-1.5 py-0.5 border"
  style={{ color: '#00ff88', borderColor: '#00ff8844' }}>
  TAG TEXT
</span>
```

### Score Ring (SVG)

```jsx
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
        transition={{ delay: 0.4 }}>
        {score}
      </motion.span>
    </div>
  );
}
```

### Data Table

```jsx
<div className="overflow-x-auto">
  <table className="w-full text-[11px]">
    <thead>
      <tr className="border-b border-border">
        <th className="px-2 py-2 text-left font-mono text-text-secondary uppercase tracking-wider cursor-pointer whitespace-nowrap hover:text-text-primary">
          COLUMN
        </th>
        {/* Active sort column */}
        <th className="px-2 py-2 text-left font-mono text-green uppercase tracking-wider cursor-pointer whitespace-nowrap">
          SORTED ▼
        </th>
      </tr>
    </thead>
    <tbody>
      {rows.map((r, i) => (
        <motion.tr key={i}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.02, duration: 0.2 }}
          className="border-b border-border/30 hover:bg-bg-card-hover transition-all">
          <td className="px-2 py-2 font-mono">{r.value}</td>
          {/* Green link */}
          <td className="px-2 py-2">
            <Link className="font-mono font-medium text-green hover:underline">{r.name}</Link>
          </td>
          {/* Color-coded value */}
          <td className="px-2 py-2 font-mono" style={{ color: r.val > 0 ? '#00ff88' : '#ff4466' }}>
            {r.val}
          </td>
        </motion.tr>
      ))}
    </tbody>
  </table>
  {rows.length === 0 && (
    <div className="text-center py-12 text-text-secondary font-mono text-xs">
      No data available.
    </div>
  )}
</div>
```

### Left-Border Accent List

```jsx
<div className="space-y-0">
  {items.map((item, i) => (
    <motion.div key={i}
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: i * 0.05 }}
      className="flex items-center justify-between py-2 px-3 border-l-2 border-b border-b-border/20"
      style={{ borderLeftColor: item.color }}>
      <span className="text-[10px] font-mono tracking-wider" style={{ color: item.color }}>
        {item.label}
      </span>
      <span className="font-mono text-sm" style={{ color: item.color }}>
        {item.value}
      </span>
    </motion.div>
  ))}
</div>
```

### Page Layout Shell

```jsx
<div className="min-h-screen bg-bg">
  {/* Nav (fixed) */}
  <nav className="fixed top-0 left-0 right-0 z-40 border-b border-border bg-bg/95 backdrop-blur-sm">
    ...
  </nav>

  {/* Content */}
  <main className="pt-11">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Page title */}
      <h1 className="font-heading font-bold text-lg text-text-primary mb-1">Page Title</h1>
      <p className="font-mono text-[10px] text-text-secondary mb-6">Subtitle or description</p>

      {/* Grid of cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ...
      </div>
    </div>
  </main>

  {/* Footer */}
  <footer className="border-t border-border py-3 mt-12">
    <p className="text-center text-[9px] font-mono text-text-secondary">
      Footer text here.
    </p>
  </footer>
</div>
```

### Scanline (page load effect)

```jsx
{/* Add inside any container with position: relative */}
<div className="scanline" />
```

---

## 7. Animation Cheatsheet

| Effect              | Class / Code                                          | Duration |
|---------------------|-------------------------------------------------------|----------|
| Scanline sweep      | `.scanline` div                                       | 3s, once |
| Pulsing badge       | `animate-pulse-glow`                                  | 2s, loop |
| Row/card entrance   | `initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}` | 0.2s, staggered `delay: i * 0.02` |
| List item slide-in  | `initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}` | staggered `delay: i * 0.05` |
| Score ring fill     | `strokeDashoffset` animation                          | 1s ease-out |
| Number fade-in      | `initial={{ opacity: 0 }} animate={{ opacity: 1 }}`  | 0.4s delay |
| Page transition     | `<AnimatePresence mode="wait">`                       | per route |

---

## 8. Design Rules

1. **Monospace everything** — DM Mono is the default. Syne only for headings.
2. **Tiny text** — `text-[9px]` to `text-[11px]` for data density.
3. **Color = meaning** — green (good), amber (caution), red (bad). Never decorative.
4. **Borders, not shadows** — `border border-border` on all containers. Zero box-shadows.
5. **No rounded corners** — sharp rectangles everywhere (except status dots and scrollbar).
6. **Uppercase labels** — all labels use `uppercase tracking-wider`.
7. **Dim tinted backgrounds** — `rgba(color, 0.13)` for status backgrounds, not solid fills.
8. **Left border accents** — `border-l-2` with a status color on list items and highlighted rows.
9. **Staggered entrance** — every list uses Framer Motion with incremental delay.
10. **Glassmorphism nav only** — `bg-bg/95 backdrop-blur-sm` on the fixed navbar, nowhere else.

---

## 9. Dependencies

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "framer-motion": "^11.5.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.41",
    "tailwindcss": "^3.4.10",
    "vite": "^5.4.2"
  }
}
```

`postcss.config.js`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

---

## 10. Quick Start

```bash
npm create vite@latest my-app -- --template react
cd my-app
npm install framer-motion react-router-dom
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Then:
1. Replace `tailwind.config.js` with Section 2 above
2. Replace `src/index.css` with Section 3 above
3. Add the Google Fonts `<link>` tags to `index.html` (Section 1)
4. Set `<body class="bg-bg text-text-primary font-mono antialiased">`
5. Copy any component templates from Section 6
6. Build something dark and beautiful
