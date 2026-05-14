/**
 * dateColor.ts — Shared helper for Date Color Banding.
 *
 * Assigns a deterministic soft pastel color to each date that has plans
 * scheduled on it. Dates with no plans get no color (visual noise reduction).
 *
 * Used by both GanttPage (screen) and PrintGanttPage (PDF) so the color
 * mapping is consistent — a plan with the same date keeps the same color
 * in both views.
 */

export interface DateColor {
  /** Light pastel for backgrounds and badges */
  bg: string;
  /** Medium tone for borders */
  border: string;
  /** Dark tone for text */
  text: string;
  /** Very light tone for timeline column tint (even softer than bg) */
  tint: string;
}

/**
 * Soft pastel palette — 7 colors that rotate.
 * Each color uses Tailwind's 50/200/700 levels for bg/border/text,
 * and a slightly darker tint for stronger emphasis on the date column.
 */
const DATE_PALETTE: DateColor[] = [
  { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF', tint: '#F0F7FF' }, // blue
  { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46', tint: '#F0FDF7' }, // emerald
  { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E', tint: '#FFFCF0' }, // amber
  { bg: '#FAF5FF', border: '#D8B4FE', text: '#6B21A8', tint: '#FBF7FF' }, // purple
  { bg: '#ECFEFF', border: '#A5F3FC', text: '#155E75', tint: '#F0FEFF' }, // cyan
  { bg: '#FFF1F2', border: '#FECDD3', text: '#9F1239', tint: '#FFF5F6' }, // rose
  { bg: '#EEF2FF', border: '#C7D2FE', text: '#3730A3', tint: '#F2F5FF' }, // indigo
];

/**
 * Convert a Date to a stable YYYY-MM-DD key.
 */
export function dateKey(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Build a map of date key → color, assigning colors only to dates that have plans.
 *
 * @param planDateKeys — Set of YYYY-MM-DD strings for dates with at least one plan
 * @returns Map of date key → DateColor (or null if date has no plans)
 */
export function buildDateColorMap(planDateKeys: Set<string>): Map<string, DateColor> {
  const sorted = Array.from(planDateKeys).sort();
  const map = new Map<string, DateColor>();
  sorted.forEach((key, idx) => {
    map.set(key, DATE_PALETTE[idx % DATE_PALETTE.length]);
  });
  return map;
}

/**
 * Helper: extract all dates that have at least one plan.
 */
export function collectPlanDateKeys(plans: Array<{ scheduledDate?: string | null }>): Set<string> {
  const set = new Set<string>();
  for (const p of plans) {
    if (p.scheduledDate) set.add(dateKey(p.scheduledDate));
  }
  return set;
}
