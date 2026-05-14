import { Group, Rect, Line, Text } from 'react-konva';
import type { SensorPlacement } from '../../api/designs';
import { FUNCTION_COLORS } from '../../utils/coverageColors';

interface Props {
  sensors: SensorPlacement[];
  scalePxPerMeter: number;
  showLabels: boolean;
  showDimensions: boolean;
  showDirectionArrow: boolean;
  selectedSensorId?: string | null;
}

type CoverageMode = 'rectangle' | 'tilt_projection' | 'cone';
type AnchorMode = 'center' | 'dynamic_tilt';

/**
 * Default coverage mode based on mounting type.
 * Per ChatGPT correction:
 *   - tilt_bracket → tilt_projection (sensor at narrow edge)
 *   - everything else → rectangle (sensor at center)
 */
function defaultCoverageMode(s: SensorPlacement): CoverageMode {
  return s.mountingType === 'tilt_bracket' ? 'tilt_projection' : 'rectangle';
}

/**
 * Derived anchor policy (C1.10b).
 *
 *   bracket/tilt_bracket + tilt_projection → 'dynamic_tilt'
 *   everything else                        → 'center'
 *
 * No user override — anchorMode in DB is recomputed from these inputs.
 */
function derivedAnchorMode(s: SensorPlacement): AnchorMode {
  const mode = ((s as any).coverageMode as CoverageMode) || defaultCoverageMode(s);
  const isBracket = s.mountingType === 'bracket' || s.mountingType === 'tilt_bracket';
  return (isBracket && mode === 'tilt_projection') ? 'dynamic_tilt' : 'center';
}

/**
 * sensorAnchorY = (depth / 2) * (1 - tiltFactor)
 *
 * Local coverage coords: near edge at y=0, far edge at y=depth.
 *   tilt 0°  → anchorY = depth/2  (sensor at center)
 *   tilt 45° → anchorY = 0        (sensor at near edge)
 *
 * Center policy ignores tilt and always returns depth/2.
 */
function computeSensorAnchorY(
  depthPx: number,
  tiltAngle: number,
  policy: AnchorMode,
): number {
  if (policy !== 'dynamic_tilt') return depthPx / 2;
  const tiltFactor = Math.max(0, Math.min(1, (tiltAngle || 0) / 45));
  return (depthPx / 2) * (1 - tiltFactor);
}

export function CoverageRectLayer({
  sensors,
  scalePxPerMeter,
  showLabels,
  showDimensions,
  showDirectionArrow,
  selectedSensorId,
}: Props) {
  return (
    <>
      {sensors.map((s) => {
        const baseColors = FUNCTION_COLORS[s.functionType] ?? FUNCTION_COLORS.entrance;
        const strokeColor = s.color || baseColors.stroke;
        const fillColor = s.color ? hexToRgba(s.color, 0.18) : baseColors.fill;

        const wPx = s.coverageWidth * scalePxPerMeter;
        const dPx = s.coverageDepth * scalePxPerMeter;
        const isSelected = selectedSensorId === s.id;
        const isDimmed = selectedSensorId != null && !isSelected;

        const coverageMode: CoverageMode =
          ((s as any).coverageMode as CoverageMode) || defaultCoverageMode(s);

        // C1.10b — anchorMode is derived, not user-controlled
        const anchorMode: AnchorMode = derivedAnchorMode(s);

        // Per-sensor display flags (C1.8.2) — fall back to global if not set
        const sShowLabels = (s as any).showLabels !== false && showLabels;
        // C1.9.2 — dimensions only shown for the SELECTED sensor by default
        const dimensionsFlagSet = (s as any).showDimensions !== false;
        const sShowDimensions = dimensionsFlagSet && showDimensions && (isSelected || (s as any).showDimensions === true);
        const sShowArrow = (s as any).showDirectionArrow !== false && showDirectionArrow;

        const nearEdgeRatio = s.nearEdgeRatio ?? 0.47;
        // C1.10e — Cone uses solid outline (shape is distinct enough);
        // dashed remains for legacy rectangle-mode CCTV.
        const isDashed = s.functionType === 'cctv' && coverageMode !== 'cone';

        // ── C1.10b: Unified geometry ──
        // Build polygon in "local cover" coords where near edge is at y=0
        // and far edge is at y=depth. Then shift down by -anchorY so that
        // the SENSOR (at origin 0,0) sits where the policy says it should:
        //   center        → anchorY = depth/2 (sensor at midpoint)
        //   dynamic_tilt  → anchorY = (depth/2)(1 - tiltFactor)
        //                   tilt 0°  → anchorY = depth/2  (center)
        //                   tilt 45° → anchorY = 0        (near edge)
        const isTilt = coverageMode === 'tilt_projection';
        const isCone = coverageMode === 'cone';
        const halfW    = wPx / 2;
        const nearHalf = isTilt ? (wPx * nearEdgeRatio) / 2 : halfW;
        const farHalf  = halfW;

        // C1.10e — Cone mode: sensor IS the apex, no anchor offset needed.
        // Other modes use derived anchor policy (center / dynamic_tilt).
        const anchorY = isCone
          ? 0
          : computeSensorAnchorY(dPx, (s as any).tiltAngle ?? 0, anchorMode);

        // C1.10e — Cone is a triangle (apex + 2 base corners). Other modes
        // are 4-point trapezoid/rectangle (near edge + far edge).
        const polygonPoints: number[] = isCone
          ? [
              0,         0   - anchorY,   // apex (camera position)
              +farHalf,  dPx - anchorY,   // far-right
              -farHalf,  dPx - anchorY,   // far-left
            ]
          : [
              -nearHalf, 0       - anchorY,
               nearHalf, 0       - anchorY,
               farHalf,  dPx     - anchorY,
              -farHalf,  dPx     - anchorY,
            ];

        // Center line from near-mid (or apex for cone) to far-mid
        const centerLineStart = { x: 0, y: 0   - anchorY };
        const centerLineEnd   = { x: 0, y: dPx - anchorY };

        // Labels relative to the new positions
        const widthFarLabelPos  = { x: 0, y: dPx - anchorY + 12 };
        // No "near" label for cone (apex has zero width)
        const widthNearLabelPos = (isTilt && !isCone)
          ? { x: -nearHalf - 40, y: 0 - anchorY }
          : null;
        const depthLabelPos     = { x: farHalf + 14, y: dPx / 2 - anchorY };

        // Direction arrow at the far edge
        const arrowTipY  = dPx - anchorY;
        const arrowBaseY = arrowTipY - 12;

        // C1.10b — badge text based on derived policy
        const sensorPositionHint =
          anchorMode === 'dynamic_tilt'
            ? 'Dynamic by tilt'
            : 'Sensor at center';

        return (
          <Group key={s.id} x={s.x} y={s.y} rotation={s.rotation} listening={false}
            opacity={isDimmed ? 0.4 : 1.0}>
            {/* Coverage polygon */}
            <Line
              points={polygonPoints}
              closed
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={isSelected ? 2.5 : 1.5}
              dash={isDashed ? [6, 4] : undefined}
            />

            {/* Subtle dashed center line */}
            {sShowArrow && (
              <Line
                points={[centerLineStart.x, centerLineStart.y, centerLineEnd.x, centerLineEnd.y]}
                stroke={strokeColor}
                strokeWidth={1}
                dash={[4, 3]}
                opacity={0.45}
              />
            )}

            {/* Direction arrow at far edge */}
            {sShowArrow && (
              <DirectionArrow tipY={arrowTipY} baseY={arrowBaseY} stroke={strokeColor} />
            )}

            {/* Dimension labels */}
            {sShowDimensions && (
              <DimensionLabels
                mode={coverageMode}
                coverageWidth={s.coverageWidth}
                coverageDepth={s.coverageDepth}
                nearEdgeRatio={nearEdgeRatio}
                widthFarLabelPos={widthFarLabelPos}
                widthNearLabelPos={widthNearLabelPos}
                depthLabelPos={depthLabelPos}
                stroke={strokeColor}
              />
            )}

            {/* Anchor hint label (small, near origin) */}
            {sShowLabels && isSelected && (
              <AnchorHintBadge text={sensorPositionHint} stroke={strokeColor} />
            )}
          </Group>
        );
      })}
    </>
  );
}

// ── Dimension labels ──
function DimensionLabels({
  mode,
  coverageWidth, coverageDepth, nearEdgeRatio,
  widthFarLabelPos, widthNearLabelPos, depthLabelPos,
  stroke,
}: {
  mode: CoverageMode;
  coverageWidth: number;
  coverageDepth: number;
  nearEdgeRatio: number;
  widthFarLabelPos: { x: number; y: number };
  widthNearLabelPos: { x: number; y: number } | null;
  depthLabelPos: { x: number; y: number };
  stroke: string;
}) {
  const isTilt = mode === 'tilt_projection';
  const isCone = mode === 'cone';
  const farW = coverageWidth;
  // C1.10e — Cone has no near edge (apex has zero width)
  const nearW = (isTilt && !isCone) ? coverageWidth * nearEdgeRatio : null;
  const depth = coverageDepth;

  const labelFar = isTilt
    ? `Far ${farW.toFixed(1)}m`
    : isCone
      ? `Base ${farW.toFixed(1)}m`
      : `${farW.toFixed(1)}m`;
  const labelNear = nearW != null ? `Near ${nearW.toFixed(1)}m` : null;
  const labelDepth = (isTilt || isCone)
    ? `Depth ${depth.toFixed(1)}m`
    : `${depth.toFixed(1)}m`;

  return (
    <>
      <LabelChip
        x={widthFarLabelPos.x}
        y={widthFarLabelPos.y}
        width={labelFar.length * 6 + 12}
        text={labelFar}
        fill={stroke}
      />
      {labelNear != null && widthNearLabelPos != null && (
        <LabelChip
          x={widthNearLabelPos.x}
          y={widthNearLabelPos.y}
          width={labelNear.length * 6 + 12}
          text={labelNear}
          fill={stroke}
        />
      )}
      <LabelChip
        x={depthLabelPos.x}
        y={depthLabelPos.y}
        width={labelDepth.length * 6 + 10}
        text={labelDepth}
        fill={stroke}
      />
    </>
  );
}

function AnchorHintBadge({ text, stroke }: { text: string; stroke: string }) {
  const w = text.length * 6 + 14;
  return (
    <Group x={0} y={28}>
      <Rect
        x={-w / 2}
        y={-7}
        width={w}
        height={14}
        fill={stroke}
        opacity={0.85}
        cornerRadius={7}
      />
      <Text
        x={-w / 2}
        y={-5}
        width={w}
        text={text}
        fontSize={9}
        fontStyle="600"
        fontFamily="Sarabun"
        fill="white"
        align="center"
      />
    </Group>
  );
}

function LabelChip({ x, y, width, text, fill }:
  { x: number; y: number; width: number; text: string; fill: string }) {
  const height = 14;
  return (
    <Group x={x} y={y}>
      <Rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        fill="white"
        opacity={0.95}
        stroke={fill}
        strokeWidth={0.5}
        cornerRadius={2}
        shadowBlur={2}
        shadowColor="rgba(0,0,0,0.15)"
      />
      <Text
        x={-width / 2}
        y={-height / 2 + 2}
        width={width}
        text={text}
        fontSize={9}
        fontStyle="600"
        fontFamily="Sarabun"
        fill={fill}
        align="center"
      />
    </Group>
  );
}

function DirectionArrow({ tipY, baseY, stroke }: { tipY: number; baseY: number; stroke: string }) {
  return (
    <Line
      points={[-6, baseY, 0, tipY, 6, baseY]}
      closed
      fill={stroke}
      stroke={stroke}
      strokeWidth={1}
      listening={false}
    />
  );
}

function hexToRgba(hex: string, alpha: number): string {
  if (!hex.startsWith('#')) return hex;
  const h = hex.slice(1);
  const len = h.length === 3 ? 1 : 2;
  const r = parseInt(h.slice(0, len).repeat(len === 1 ? 2 : 1), 16);
  const g = parseInt(h.slice(len, 2 * len).repeat(len === 1 ? 2 : 1), 16);
  const b = parseInt(h.slice(2 * len, 3 * len).repeat(len === 1 ? 2 : 1), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
