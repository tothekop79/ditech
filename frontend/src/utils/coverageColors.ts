import type { SensorFunction } from '../api/designs';

// ════════════════════════════════════════════════
// Function color palette
// matches mockup v4 — used everywhere (canvas, sidebars, KPIs, recommendations)
// ════════════════════════════════════════════════
export type FunctionColorSet = {
  // For Konva fills
  fill: string;          // semi-transparent rgba
  stroke: string;        // solid hex
  dot: string;           // sensor marker color
  // For Tailwind class strings (badges, chips)
  bgChip: string;        // 'bg-blue-50 text-blue-700 border-blue-200'
  hexLabel: string;      // hex for labels
  emoji: string;
  thLabel: string;       // Thai label
  enLabel: string;       // English label
};

export const FUNCTION_COLORS: Record<SensorFunction, FunctionColorSet> = {
  entrance: {
    fill: 'rgba(59,130,246,0.2)',
    stroke: '#3b82f6',
    dot: '#3b82f6',
    bgChip: 'bg-blue-50 text-blue-700 border-blue-200',
    hexLabel: '#1e40af',
    emoji: '📷',
    thLabel: 'ทางเข้า-ออก',
    enLabel: 'Entrance',
  },
  engagement: {
    fill: 'rgba(239,68,68,0.18)',
    stroke: '#ef4444',
    dot: '#ef4444',
    bgChip: 'bg-red-50 text-red-700 border-red-200',
    hexLabel: '#991b1b',
    emoji: '🟥',
    thLabel: 'พื้นที่สินค้า',
    enLabel: 'Engagement',
  },
  heatmap: {
    fill: 'rgba(168,85,247,0.18)',
    stroke: '#a855f7',
    dot: '#a855f7',
    bgChip: 'bg-purple-50 text-purple-700 border-purple-200',
    hexLabel: '#6b21a8',
    emoji: '🟪',
    thLabel: 'พื้นที่เดิน',
    enLabel: 'Heatmap',
  },
  cctv: {
    fill: 'rgba(16,185,129,0.16)',
    stroke: '#10b981',
    dot: '#10b981',
    bgChip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    hexLabel: '#047857',
    emoji: '📹',
    thLabel: 'CCTV',
    enLabel: 'CCTV',
  },
  passerby: {
    fill: 'rgba(14,165,233,0.18)',
    stroke: '#0ea5e9',
    dot: '#0ea5e9',
    bgChip: 'bg-sky-50 text-sky-700 border-sky-200',
    hexLabel: '#075985',
    emoji: '🚶',
    thLabel: 'ผู้สัญจร',
    enLabel: 'Passer-by',
  },
  zone: {
    fill: 'rgba(168,85,247,0.18)',
    stroke: '#a855f7',
    dot: '#a855f7',
    bgChip: 'bg-purple-50 text-purple-700 border-purple-200',
    hexLabel: '#6b21a8',
    emoji: '🎯',
    thLabel: 'โซน',
    enLabel: 'Zone',
  },
};

// ════════════════════════════════════════════════
// Status / mounting / function display helpers
// ════════════════════════════════════════════════
export const MOUNTING_LABELS: Record<string, { th: string; en: string }> = {
  embedded: { th: 'ฝังฝ้า', en: 'Embedded' },
  surface: { th: 'ติดลอยใต้ฝ้า', en: 'Surface' },
  bracket: { th: 'ใช้ขา', en: 'Bracket' },
  tilt_bracket: { th: 'ใช้ขา + เอียง', en: 'Tilt Bracket' },
};

export const STATUS_COLORS: Record<string, string> = {
  PASS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  WARNING: 'bg-amber-50 text-amber-700 border-amber-200',
  FAIL: 'bg-red-50 text-red-700 border-red-200',
};

export const STATUS_DOT: Record<string, string> = {
  PASS: 'bg-emerald-500',
  WARNING: 'bg-amber-500',
  FAIL: 'bg-red-500',
};

// Order to display function groups in left sidebar
export const FUNCTION_DISPLAY_ORDER: SensorFunction[] = [
  'entrance', 'engagement', 'heatmap', 'cctv', 'passerby', 'zone',
];
