/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ditech: {
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
      },
      fontFamily: {
        sans: ['Sarabun', 'IBM Plex Sans Thai', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'header': '0 2px 8px rgba(10, 48, 82, 0.08)',
        'card': '0 1px 3px rgba(0, 0, 0, 0.05)',
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
