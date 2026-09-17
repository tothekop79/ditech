/**
 * DITECH Retail Intelligence — design tokens (single source of truth for raw colors).
 *
 * Tailwind classes cover the DOM; this file exists for the places that need a hex
 * string instead of a class: react-konva, recharts, canvas/SVG fills, and
 * FunctionColorSet. Values here MUST stay in sync with `frontend/tailwind.config.js`
 * (`theme.extend.colors`).
 *
 * Phase 1: source of truth only — wiring into canvas/charts happens later.
 */

export const ditech = {
  navy: '#213153',
  navyLight: '#2C4170',
  gold: '#FFD200',
  goldDeep: '#C9A24D',
  goldSoft: '#FFF6C2',
} as const;

export const surface = {
  page: '#F6F7F9',
  card: '#FFFFFF',
  border: '#E5E7EB',
} as const;

export const ink = {
  primary: '#213153',
  secondary: '#6B7280',
  muted: '#9CA3AF',
} as const;

export const status = {
  positive: '#16A34A',
  negative: '#DC2626',
  warning: '#D97706',
} as const;

/** Heatmap / intensity ramp, light → dark (index 0 = scale.1). */
export const scale = [
  '#DDF3E8',
  '#A9E1C4',
  '#5CC79A',
  '#22A36F',
  '#0F6B47',
] as const;

/** Font stack matching `theme.extend.fontFamily.sans`. */
export const fontSans = '"IBM Plex Sans Thai", "Sarabun", system-ui, sans-serif';

export const tokens = { ditech, surface, ink, status, scale, fontSans } as const;

export type ScaleStep = 1 | 2 | 3 | 4 | 5;

/** `scaleStep(3)` → '#5CC79A'. 1-based to mirror the Tailwind `scale-1..5` names. */
export function scaleStep(step: ScaleStep): string {
  return scale[step - 1];
}

export default tokens;
