/**
 * Camera Coverage Tables — Phase C1
 *
 * Source: Vionvision G5/G6 spec PDFs
 * - G6: Vionvision_G6-250610-2.pdf (12 rows: 2.6m → 4.6m)
 * - G5: Vionvision_G5_Smart_Retail_Sensor0907.pdf (9 rows: 2.5m → 4.6m)
 *
 * Each row maps mounting height → coverage rectangle (width × depth in meters).
 * Coverage is the floor footprint when camera is mounted at given ceiling height.
 */

export type CoverageRow = {
  height: number;  // mounting height (m)
  width: number;   // coverage width (m)
  depth: number;   // coverage depth (m)
};

export type CoverageResult = {
  width: number;
  depth: number;
};

/**
 * Vionvision G6 — Premium AI sensor (white/black variants)
 * Embedded mount, 2.6m–4.6m ceiling
 */
export const VIONVISION_G6_TABLE: CoverageRow[] = [
  { height: 2.6, width: 8.0,  depth: 1.3 },
  { height: 2.8, width: 9.0,  depth: 1.7 },
  { height: 3.0, width: 10.0, depth: 2.1 },
  { height: 3.2, width: 11.0, depth: 2.5 },
  { height: 3.3, width: 12.0, depth: 2.9 },
  { height: 3.4, width: 12.0, depth: 3.3 },
  { height: 3.6, width: 12.0, depth: 3.7 },
  { height: 3.8, width: 12.0, depth: 4.1 },
  { height: 4.0, width: 12.0, depth: 4.5 },
  { height: 4.2, width: 12.0, depth: 4.9 },
  { height: 4.4, width: 12.0, depth: 5.3 },
  { height: 4.6, width: 12.0, depth: 5.7 },
];

/**
 * Vionvision G5 — Standard AI sensor
 * Embedded mount, 2.5m–4.6m ceiling
 */
export const VIONVISION_G5_TABLE: CoverageRow[] = [
  { height: 2.5, width: 3.9, depth: 1.0 },
  { height: 2.8, width: 5.0, depth: 1.8 },
  { height: 3.0, width: 6.2, depth: 2.1 },
  { height: 3.2, width: 6.6, depth: 2.7 },
  { height: 3.4, width: 7.2, depth: 2.8 },
  { height: 3.6, width: 7.7, depth: 3.0 },
  { height: 3.8, width: 7.7, depth: 3.7 },
  { height: 4.0, width: 7.7, depth: 4.0 },
  { height: 4.6, width: 7.7, depth: 5.0 },
];

/**
 * Hikvision CCTV — Generic placeholder
 * Wider FOV, lower precision (not for counting, just monitoring).
 * NOTE: Actual model spec TBD — this is a baseline.
 */
export const HIKVISION_CCTV_TABLE: CoverageRow[] = [
  { height: 2.5, width: 6.0,  depth: 4.0 },
  { height: 3.0, width: 9.0,  depth: 6.0 },
  { height: 3.5, width: 12.0, depth: 8.0 },
  { height: 4.0, width: 14.0, depth: 9.5 },
  { height: 4.5, width: 16.0, depth: 11.0 },
  { height: 5.0, width: 18.0, depth: 12.5 },
  { height: 6.0, width: 22.0, depth: 15.0 },
];

/**
 * Linearly interpolates coverage for any height between table rows.
 * Clamps to first/last row if outside range.
 */
export function interpolateCoverage(
  height: number,
  table: CoverageRow[],
): CoverageResult {
  if (!table.length) return { width: 0, depth: 0 };

  // Clamp below
  if (height <= table[0].height) {
    return { width: table[0].width, depth: table[0].depth };
  }

  // Clamp above
  const last = table[table.length - 1];
  if (height >= last.height) {
    return { width: last.width, depth: last.depth };
  }

  // Find bracketing rows
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i];
    const b = table[i + 1];
    if (height >= a.height && height <= b.height) {
      const ratio = (height - a.height) / (b.height - a.height);
      return {
        width: round2(a.width + ratio * (b.width - a.width)),
        depth: round2(a.depth + ratio * (b.depth - a.depth)),
      };
    }
  }

  // Fallback (should not reach)
  return { width: table[0].width, depth: table[0].depth };
}

/**
 * Look up coverage table by camera model name.
 * Returns null if model not recognized.
 */
export function getCoverageTableByModel(brand: string, modelName: string): CoverageRow[] | null {
  const key = `${brand}::${modelName}`.toLowerCase();
  if (key.includes('vionvision') && key.includes('g6')) return VIONVISION_G6_TABLE;
  if (key.includes('vionvision') && key.includes('g5')) return VIONVISION_G5_TABLE;
  if (key.includes('hikvision')) return HIKVISION_CCTV_TABLE;
  return null;
}

/**
 * Obstruction line-of-sight check for entrance sensors.
 *
 * Geometry (side view):
 *  - Camera mounted at height Hc, distance D inward from door
 *  - Obstruction (logo/header/beam) hangs from ceiling, drop = `obstrDrop` from ceiling
 *  - Target person at distance L outside door, head height Ht
 *  - Required: line of sight from camera to target head must pass BELOW obstruction bottom
 *
 * Formula:
 *  - Obstruction bottom height = Hc - obstrDrop  (since Hc ≈ ceiling height)
 *  - Line of sight at door (x = D from camera): Hc - (Hc - Ht) * (D / (D + L))
 *  - PASS if line at door + margin ≤ obstruction bottom
 */
export type ObstructionInput = {
  ceilingHeight: number;     // m (default = camHeight)
  camHeight: number;          // Hc, m
  obstrDrop: number;          // m, drop from ceiling
  camIn: number;              // D, m, camera inward from door
  targetOut: number;          // L, m, target outside door
  targetHeight: number;       // Ht, m, person head height (default 1.5)
  margin: number;             // m, safety margin (default 0.1)
};

export type ObstructionResult = {
  pass: boolean;
  lineHeightAtDoor: number;   // height of line-of-sight at door plane (m)
  obstrBottom: number;         // bottom of obstruction (m)
  reason: string;              // human-readable explanation
};

export function checkObstruction(input: ObstructionInput): ObstructionResult {
  const { ceilingHeight, camHeight, obstrDrop, camIn, targetOut, targetHeight, margin } = input;

  // Obstruction bottom (from floor)
  const obstrBottom = round2(ceilingHeight - obstrDrop);

  // Line of sight at door plane (D from camera, L from door = D + L total span)
  // y(at door) = Hc - (Hc - Ht) * (D / (D + L))
  const totalSpan = camIn + targetOut;
  const lineHeightAtDoor = totalSpan > 0
    ? round2(camHeight - (camHeight - targetHeight) * (camIn / totalSpan))
    : camHeight;

  const limit = round2(obstrBottom - margin);
  const pass = lineHeightAtDoor <= limit;

  return {
    pass,
    lineHeightAtDoor,
    obstrBottom,
    reason: pass
      ? `Line of sight ${lineHeightAtDoor}m ≤ ${limit}m (obstruction bottom ${obstrBottom}m − margin ${margin}m)`
      : `Line of sight ${lineHeightAtDoor}m exceeds limit ${limit}m. Move camera further inward or reduce obstruction drop.`,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
