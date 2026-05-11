/**
 * Tilt Projection Ratio Table for G5/G6 people-counting sensors.
 *
 * When a camera is mounted with a tilt bracket, the coverage area
 * is no longer a rectangle but a trapezoid:
 *   - near edge (close to camera) is narrower
 *   - far edge (away from camera) is wider
 *   - overall depth is longer than at 0° tilt
 *
 * These ratios are applied to the base (rectangle) coverage obtained
 * from the camera's coverage table at the current mounting height.
 *
 * Source: practical field observations for G5/G6 deployments.
 * NOT derived from optical FOV — those numbers are for CCTV mode.
 *
 *   baseWidth, baseDepth = interpolateCoverage(cameraModel, mountingHeight)
 *   ratio = interpolateTiltRatio(tiltAngle)
 *
 *   nearWidth = baseWidth * ratio.nearWidthRatio
 *   farWidth  = baseWidth * ratio.farWidthRatio
 *   depth     = baseDepth * ratio.depthRatio
 */

export interface TiltRatio {
  nearWidthRatio: number;
  farWidthRatio: number;
  depthRatio: number;
}

export interface TiltRatioRow extends TiltRatio {
  tiltAngle: number;
}

/**
 * Lookup table. tiltAngle ascending. Linear interpolation between rows.
 *
 * Reference example: G6 @ 3.5m, base coverage ≈ 12.0m × 3.5m
 *   Tilt 0°  → 12.0 × 12.0 × 3.5  (rectangle)
 *   Tilt 15° →  9.6 × 12.6 × 4.2
 *   Tilt 30° →  6.6 × 13.2 × 5.4
 *   Tilt 45° →  4.8 × 14.4 × 6.7
 */
export const TILT_RATIO_TABLE: TiltRatioRow[] = [
  { tiltAngle:  0, nearWidthRatio: 1.00, farWidthRatio: 1.00, depthRatio: 1.00 },
  { tiltAngle: 15, nearWidthRatio: 0.80, farWidthRatio: 1.05, depthRatio: 1.20 },
  { tiltAngle: 30, nearWidthRatio: 0.55, farWidthRatio: 1.10, depthRatio: 1.55 },
  { tiltAngle: 45, nearWidthRatio: 0.40, farWidthRatio: 1.20, depthRatio: 1.90 },
];

export const TILT_MIN = 0;
export const TILT_MAX = 45;

/**
 * Linear interpolation of tilt ratios at any angle in [TILT_MIN, TILT_MAX].
 * Below TILT_MIN: clamps to first row (1.0, 1.0, 1.0).
 * Above TILT_MAX: clamps to last row.
 */
export function interpolateTiltRatio(tiltAngle: number): TiltRatio {
  const t = Math.max(TILT_MIN, Math.min(TILT_MAX, tiltAngle));
  const table = TILT_RATIO_TABLE;

  // Find the two rows that bracket t
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i];
    const b = table[i + 1];
    if (t >= a.tiltAngle && t <= b.tiltAngle) {
      if (b.tiltAngle === a.tiltAngle) {
        return {
          nearWidthRatio: a.nearWidthRatio,
          farWidthRatio: a.farWidthRatio,
          depthRatio: a.depthRatio,
        };
      }
      const f = (t - a.tiltAngle) / (b.tiltAngle - a.tiltAngle);
      return {
        nearWidthRatio: a.nearWidthRatio + (b.nearWidthRatio - a.nearWidthRatio) * f,
        farWidthRatio:  a.farWidthRatio  + (b.farWidthRatio  - a.farWidthRatio)  * f,
        depthRatio:     a.depthRatio     + (b.depthRatio     - a.depthRatio)     * f,
      };
    }
  }

  // Should be unreachable due to clamp, but fall back to last row
  const last = table[table.length - 1];
  return {
    nearWidthRatio: last.nearWidthRatio,
    farWidthRatio: last.farWidthRatio,
    depthRatio: last.depthRatio,
  };
}

/**
 * Fallback formula if the table is unavailable (not used in practice,
 * but kept as a safe approximation).
 */
export function fallbackTiltRatio(tiltAngle: number): TiltRatio {
  const t = Math.max(0, Math.min(45, tiltAngle));
  const f = t / 45;
  return {
    nearWidthRatio: 1.0 - f * 0.60,
    farWidthRatio:  1.0 + f * 0.20,
    depthRatio:     1.0 + f * 0.90,
  };
}

/**
 * Apply tilt projection ratios to a base (rectangle) coverage.
 * Returns the trapezoid dimensions.
 *
 * For COVERAGE_MODE = 'rectangle' the caller should NOT use this —
 * just keep base width/depth and nearEdgeRatio = 1.0.
 */
export function applyTiltProjection(
  baseWidth: number,
  baseDepth: number,
  tiltAngle: number,
): { nearWidth: number; farWidth: number; depth: number; nearEdgeRatio: number } {
  const ratio = interpolateTiltRatio(tiltAngle);
  const nearWidth = baseWidth * ratio.nearWidthRatio;
  const farWidth  = baseWidth * ratio.farWidthRatio;
  const depth     = baseDepth * ratio.depthRatio;
  return {
    nearWidth,
    farWidth,
    depth,
    nearEdgeRatio: farWidth > 0 ? nearWidth / farWidth : 1.0,
  };
}
