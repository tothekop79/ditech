/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ditech: {
          // --- DITECH Retail Intelligence tokens (2026 restyle) ---
          navy: '#213153',         // logo navy — top bar, headings, KPI numbers
          'navy-light': '#2C4170', // hover / secondary dark
          gold: '#FFD200',         // logo gold — active indicator, badge, focus ring ONLY
          'gold-deep': '#C9A24D',  // gold on white: highlight row, chart series, note border
          'gold-soft': '#FFF6C2',  // highlight background

          // --- Legacy palette (still referenced by pre-restyle screens) ---
          // Header / primary
          primary: '#0a3052',      // dark navy (header bg)
          'primary-dark': '#072139',
          'primary-light': '#1a4d7d',
          secondary: '#005a87',    // mid blue (active states)

          // Accents
          accent: '#fcb813',       // yellow TM badge
          'accent-dark': '#e0a200',

          // Status
          success: '#10b981',      // LIVE pill green
          warn: '#f59e0b',
          danger: '#ef4444',
          info: '#3b82f6',

          // Surfaces
          bg: '#f1f5f9',           // page bg slate-100
          surface: '#ffffff',      // card bg
          'surface-alt': '#f8fafc', // alt card bg
          border: '#e2e8f0',
          'border-strong': '#cbd5e1',

          // Text
          text: '#1e293b',
          'text-muted': '#64748b',
          'text-subtle': '#94a3b8',
        },

        surface: {
          page: '#F6F7F9',   // page background
          card: '#FFFFFF',   // card background
          border: '#E5E7EB', // card border / table rules
        },

        ink: {
          primary: '#213153',   // body text
          secondary: '#6B7280', // small labels, subtitles
          muted: '#9CA3AF',     // hints, footnotes
        },

        // heatmap / intensity, 5 steps
        scale: {
          1: '#DDF3E8',
          2: '#A9E1C4',
          3: '#5CC79A',
          4: '#22A36F',
          5: '#0F6B47',
        },

        positive: '#16A34A', // delta up, MET
        negative: '#DC2626', // delta down, error
        warning: '#D97706',  // in-progress, pending
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Thai"', 'Sarabun', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'header': '0 2px 8px rgba(10, 48, 82, 0.08)',
        'card': '0 1px 3px rgba(0, 0, 0, 0.05)',
        // flat card shadow for the restyled surfaces
        'ditech-card': '0 1px 2px rgba(16, 24, 40, 0.04)',
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
