/**
 * Coverage Math — Phase C1.4 (updated for tilt bracket trapezoid)
 *
 * IMPORTANT: This is a drop-in replacement for src/utils/coverageMath.ts.
 * Changes vs C1.2:
 *  - Added support for `shape: 'rectangle' | 'trapezoid'`
 *  - Trapezoid for tilt bracket: near edge narrower (1m default), far edge full coverage width
 *  - sensorRectCorners → sensorShapeCorners (returns 4 corners for both rect+trapezoid)
 *  - Same back/front anchor logic preserved
 */

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Polygon = Point[];

export type SensorShapeInput = {
  x: number;
  y: number;
  rotation: number;          // yaw degrees, 0 = up
  coverageWidth: number;      // meters (far edge for trapezoid)
  coverageDepth: number;      // meters
  anchorMode?: 'center' | 'back_edge' | 'front_edge';
  shape?: 'rectangle' | 'trapezoid';
  scalePxPerMeter: number;
  // For trapezoid only — proportion of far-edge width at near edge (0..1)
  // Default 0.15 means near is 15% of far (visualizes perspective)
  nearEdgeRatio?: number;
};

/**
 * Compute the 4 corners of a sensor's coverage shape in floor-plan pixels.
 * Order: front-left, front-right, back-right, back-left (clockwise).
 *
 * Rectangle: 4 corners equidistant from center axis.
 * Trapezoid: front (camera-side) edge narrower, back edge wider — perspective view.
 */
export function sensorShapeCorners(input: SensorShapeInput): Point[] {
  const {
    x, y, rotation, coverageWidth, coverageDepth,
    anchorMode = 'center', shape = 'rectangle',
    scalePxPerMeter, nearEdgeRatio = 0.15,
  } = input;

  const wPx = coverageWidth * scalePxPerMeter;
  const dPx = coverageDepth * scalePxPerMeter;

  // Determine front/back y in local coords (sensor at origin, "up" is forward = -y)
  let frontY: number, backY: number;
  switch (anchorMode) {
    case 'center':
      frontY = -dPx / 2;
      backY = dPx / 2;
      break;
    case 'back_edge':
      frontY = -dPx;
      backY = 0;
      break;
    case 'front_edge':
      frontY = 0;
      backY = dPx;
      break;
  }

  let localCorners: Point[];
  if (shape === 'trapezoid') {
    // Camera at narrow (near) end → front=narrow, back=wide
    const nearHalf = (wPx * nearEdgeRatio) / 2;
    const farHalf = wPx / 2;
    localCorners = [
      { x: -nearHalf, y: frontY },  // front-left (near)
      { x:  nearHalf, y: frontY },  // front-right (near)
      { x:  farHalf,  y: backY },   // back-right (far)
      { x: -farHalf,  y: backY },   // back-left (far)
    ];
  } else {
    localCorners = [
      { x: -wPx / 2, y: frontY },
      { x:  wPx / 2, y: frontY },
      { x:  wPx / 2, y: backY  },
      { x: -wPx / 2, y: backY  },
    ];
  }

  // Rotate by yaw
  const theta = (rotation * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  return localCorners.map((p) => ({
    x: x + p.x * cos - p.y * sin,
    y: y + p.x * sin + p.y * cos,
  }));
}

/**
 * Map mounting type → default shape and anchor.
 * Used both server-side and client-side for consistency.
 */
export function defaultShapeForMounting(mountingType: string): {
  shape: 'rectangle' | 'trapezoid';
  anchorMode: 'center' | 'back_edge' | 'front_edge';
} {
  switch (mountingType) {
    case 'embedded':
    case 'surface':
      return { shape: 'rectangle', anchorMode: 'center' };
    case 'bracket':
      return { shape: 'rectangle', anchorMode: 'back_edge' };
    case 'tilt_bracket':
      return { shape: 'trapezoid', anchorMode: 'back_edge' };
    default:
      return { shape: 'rectangle', anchorMode: 'center' };
  }
}

// ── Backward-compat alias for existing imports ──
export const sensorRectCorners = sensorShapeCorners;
export type SensorRectInput = SensorShapeInput;

// ════════════════════════════════════════════════
// Geometry helpers (unchanged from C1.2)
// ════════════════════════════════════════════════
export function polygonBBox(poly: Polygon): Rect {
  if (!poly.length) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = poly[0].x, minY = poly[0].y, maxX = poly[0].x, maxY = poly[0].y;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function polygonArea(poly: Polygon): number {
  if (poly.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i].x * poly[j].y;
    area -= poly[j].x * poly[i].y;
  }
  return Math.abs(area) / 2;
}

export function clipPolygon(subject: Polygon, clip: Polygon): Polygon {
  if (subject.length < 3 || clip.length < 3) return [];
  let output: Polygon = [...subject];

  for (let i = 0; i < clip.length; i++) {
    if (!output.length) break;
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const input: Polygon = output;
    output = [];

    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j - 1 + input.length) % input.length];

      const curIn = isInside(cur, a, b);
      const prevIn = isInside(prev, a, b);

      if (curIn) {
        if (!prevIn) {
          const ip = lineIntersect(prev, cur, a, b);
          if (ip) output.push(ip);
        }
        output.push(cur);
      } else if (prevIn) {
        const ip = lineIntersect(prev, cur, a, b);
        if (ip) output.push(ip);
      }
    }
  }
  return output;
}

function isInside(p: Point, a: Point, b: Point): boolean {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= 0;
}

function lineIntersect(p1: Point, p2: Point, a: Point, b: Point): Point | null {
  const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
  const x3 = a.x,  y3 = a.y,  x4 = b.x,  y4 = b.y;
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

export function polygonCoverageByRects(
  zone: Polygon,
  sensorRects: Polygon[],
  options: { sampleStep?: number } = {},
): number {
  const zoneArea = polygonArea(zone);
  if (zoneArea === 0) return 0;
  if (!sensorRects.length) return 0;
  if (sensorRects.length <= 4) {
    return exactCoverage(zone, sensorRects) / zoneArea;
  }
  return sampledCoverage(zone, sensorRects, options.sampleStep ?? 4);
}

function exactCoverage(zone: Polygon, rects: Polygon[]): number {
  const n = rects.length;
  let total = 0;
  for (let mask = 1; mask < (1 << n); mask++) {
    let intersection: Polygon = [...zone];
    let bits = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        intersection = clipPolygon(intersection, rects[i]);
        bits++;
        if (!intersection.length) break;
      }
    }
    const sign = bits % 2 === 1 ? 1 : -1;
    total += sign * polygonArea(intersection);
  }
  return total;
}

function sampledCoverage(zone: Polygon, rects: Polygon[], step: number): number {
  const bbox = polygonBBox(zone);
  let total = 0;
  let covered = 0;
  for (let y = bbox.y; y <= bbox.y + bbox.h; y += step) {
    for (let x = bbox.x; x <= bbox.x + bbox.w; x += step) {
      if (!pointInPolygon({ x, y }, zone)) continue;
      total++;
      for (const rect of rects) {
        if (pointInPolygon({ x, y }, rect)) {
          covered++;
          break;
        }
      }
    }
  }
  return total === 0 ? 0 : covered / total;
}

export function pointInPolygon(p: Point, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function lineCoverageByRects(
  linePoints: [Point, Point],
  sensorRects: Polygon[],
  step: number = 2,
): number {
  const [a, b] = linePoints;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return 0;
  if (!sensorRects.length) return 0;
  const samples = Math.max(50, Math.ceil(len / step));
  let covered = 0;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = { x: a.x + t * dx, y: a.y + t * dy };
    for (const rect of sensorRects) {
      if (pointInPolygon(p, rect)) {
        covered++;
        break;
      }
    }
  }
  return covered / (samples + 1);
}

// ════════════════════════════════════════════════
// Design stats
// ════════════════════════════════════════════════
export type DesignStats = {
  entrancePercent: number | null;
  engagementPercent: number | null;
  heatmapPercent: number | null;
  overallStatus: 'PASS' | 'WARNING' | 'FAIL';
  recommendations: string[];
};

export type DesignSensor = {
  functionType: string;
  rect: Polygon;
};

export type DesignZone = {
  zoneType: string;
  linePoints?: [Point, Point];
  polygon?: Polygon;
};

export function computeDesignStats(
  sensors: DesignSensor[],
  zones: DesignZone[],
  walkingArea?: Polygon,
): DesignStats {
  const recs: string[] = [];

  const entranceLines = zones.filter((z) => z.zoneType === 'entrance_line' && z.linePoints);
  const entranceRects = sensors
    .filter((s) => s.functionType === 'entrance' || s.functionType === 'passerby')
    .map((s) => s.rect);

  let entrancePercent: number | null = null;
  if (entranceLines.length > 0) {
    let totalCovered = 0;
    for (const line of entranceLines) {
      totalCovered += lineCoverageByRects(line.linePoints!, entranceRects);
    }
    entrancePercent = entranceLines.length > 0 ? totalCovered / entranceLines.length : 0;
    if (entrancePercent < 1) {
      recs.push(`Entrance line coverage ${(entrancePercent * 100).toFixed(0)}%. Add or reposition entrance sensors.`);
    } else {
      recs.push('✓ Entrance fully covered');
    }
  }

  const engagementZones = zones.filter((z) => z.zoneType === 'engagement_area' && z.polygon);
  const engagementRects = sensors
    .filter((s) => s.functionType === 'engagement')
    .map((s) => s.rect);

  let engagementPercent: number | null = null;
  if (engagementZones.length > 0) {
    let totalArea = 0;
    let totalCovered = 0;
    for (const zone of engagementZones) {
      const area = polygonArea(zone.polygon!);
      totalArea += area;
      totalCovered += area * polygonCoverageByRects(zone.polygon!, engagementRects);
    }
    engagementPercent = totalArea > 0 ? totalCovered / totalArea : 0;
    if (engagementPercent < 0.9) {
      recs.push(`Engagement coverage ${(engagementPercent * 100).toFixed(0)}%. Add engagement sensors.`);
    } else {
      recs.push('✓ Engagement zones OK');
    }
  }

  const heatmapRects = sensors
    .filter((s) => s.functionType === 'heatmap')
    .map((s) => s.rect);

  let heatmapPercent: number | null = null;
  if (walkingArea && heatmapRects.length > 0) {
    heatmapPercent = polygonCoverageByRects(walkingArea, heatmapRects, { sampleStep: 6 });
    if (heatmapPercent < 0.95) {
      recs.push(`Heatmap coverage ${(heatmapPercent * 100).toFixed(0)}%. Add ${Math.ceil((1 - heatmapPercent) * heatmapRects.length / 2)} more heatmap sensor(s).`);
    } else {
      recs.push('✓ Heatmap coverage OK');
    }
  }

  let status: 'PASS' | 'WARNING' | 'FAIL' = 'PASS';
  const checks = [entrancePercent, engagementPercent, heatmapPercent].filter((x) => x !== null) as number[];
  if (checks.some((p) => p < 0.7)) status = 'FAIL';
  else if (checks.some((p) => p < 0.9)) status = 'WARNING';

  return {
    entrancePercent,
    engagementPercent,
    heatmapPercent,
    overallStatus: status,
    recommendations: recs,
  };
}
