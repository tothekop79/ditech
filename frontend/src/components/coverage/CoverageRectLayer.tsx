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

type CoverageMode = 'rectangle' | 'tilt_projection';
type AnchorMode = 'center' | 'near_edge';

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
 * Default anchor mode (C1.10).
 *   - tilt_projection mode → near_edge
 *   - rectangle mode → center
 * Override allowed for bracket / tilt_bracket mounting types.
 */
function defaultAnchorMode(s: SensorPlacement): AnchorMode {
  const mode = ((s as any).coverageMode as CoverageMode) || defaultCoverageMode(s);
  return mode === 'tilt_projection' ? 'near_edge' : 'center';
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

        // C1.10 — anchor mode now user-controllable for bracket/tilt_bracket
        const anchorMode: AnchorMode =
          ((s as any).anchorMode as AnchorMode) || defaultAnchorMode(s);

        // Per-sensor display flags (C1.8.2) — fall back to global if not set
        const sShowLabels = (s as any).showLabels !== false && showLabels;
        // C1.9.2 — dimensions only shown for the SELECTED sensor by default
        const dimensionsFlagSet = (s as any).showDimensions !== false;
        const sShowDimensions = dimensionsFlagSet && showDimensions && (isSelected || (s as any).showDimensions === true);
        const sShowArrow = (s as any).showDirectionArrow !== false && showDirectionArrow;

        const nearEdgeRatio = s.nearEdgeRatio ?? 0.47;
        const isDashed = s.functionType === 'cctv';

        // ── 4-case Per-mode/anchor geometry (sensor at LOCAL ORIGIN 0,0) ──
        // C1.10:
        //   (rectangle, center)        → symmetric rect around sensor
        //   (rectangle, near_edge)     → rect projects forward from sensor (rect bracket)
        //   (tilt_projection, near_edge) → trapezoid projects forward
        //   (tilt_projection, center)  → trapezoid centered on sensor
        let polygonPoints: number[];
        let centerLineStart: { x: number; y: number };
        let centerLineEnd: { x: number; y: number };
        let widthFarLabelPos: { x: number; y: number };
        let widthNearLabelPos: { x: number; y: number } | null;
        let depthLabelPos: { x: number; y: number };
        let arrowTipY: number;
        let arrowBaseY: number;

        if (coverageMode === 'tilt_projection') {
          // ── TILT PROJECTION ──
          const nearHalf = (wPx * nearEdgeRatio) / 2;
          const farHalf = wPx / 2;

          if (anchorMode === 'near_edge') {
            // Sensor at narrow edge center → (0, 0); coverage forward (+Y)
            polygonPoints = [
              -nearHalf, 0,
               nearHalf, 0,
               farHalf,  dPx,
              -farHalf,  dPx,
            ];
            centerLineStart = { x: 0, y: 0 };
            centerLineEnd   = { x: 0, y: dPx };
            widthFarLabelPos  = { x: 0, y: dPx + 12 };
            widthNearLabelPos = { x: -nearHalf - 40, y: 0 };  // left of narrow edge
            depthLabelPos     = { x: farHalf + 14, y: dPx / 2 };
            arrowTipY = dPx;
            arrowBaseY = dPx - 12;
          } else {
            // anchor = center: shift polygon so its CENTROID is near (0, 0)
            // Trapezoid centroid Y = dPx * (nearHalf + 2*farHalf) / (3 * (nearHalf + farHalf))
            // For visualization, use simpler "vertical midpoint" = dPx / 2
            const dy = -dPx / 2;
            polygonPoints = [
              -nearHalf, 0 + dy,
               nearHalf, 0 + dy,
               farHalf,  dPx + dy,
              -farHalf,  dPx + dy,
            ];
            centerLineStart = { x: 0, y: dy };
            centerLineEnd   = { x: 0, y: dPx + dy };
            widthFarLabelPos  = { x: 0, y: dPx + dy + 12 };
            widthNearLabelPos = { x: -nearHalf - 40, y: dy };
            depthLabelPos     = { x: farHalf + 14, y: dy + dPx / 2 };
            arrowTipY = dPx + dy;
            arrowBaseY = dPx + dy - 12;
          }
        } else {
          // ── TOP VIEW RECTANGLE ──
          const halfW = wPx / 2;

          if (anchorMode === 'near_edge') {
            // Rect projects forward from sensor (camera at back edge)
            polygonPoints = [
              -halfW, 0,
               halfW, 0,
               halfW, dPx,
              -halfW, dPx,
            ];
            centerLineStart = { x: 0, y: 0 };
            centerLineEnd   = { x: 0, y: dPx };
            widthFarLabelPos  = { x: 0, y: dPx + 12 };
            widthNearLabelPos = null;  // no separate "near" for rectangle
            depthLabelPos     = { x: halfW + 14, y: dPx / 2 };
            arrowTipY = dPx;
            arrowBaseY = dPx - 12;
          } else {
            // anchor = center: symmetric rectangle
            const halfD = dPx / 2;
            polygonPoints = [
              -halfW, -halfD,
               halfW, -halfD,
               halfW,  halfD,
              -halfW,  halfD,
            ];
            centerLineStart = { x: 0, y: -halfD };
            centerLineEnd   = { x: 0, y:  halfD };
            widthFarLabelPos  = { x: 0, y: halfD + 12 };
            widthNearLabelPos = null;
            depthLabelPos     = { x: halfW + 14, y: 0 };
            arrowTipY = halfD;
            arrowBaseY = halfD - 12;
          }
        }

        // C1.10 — badge text based on anchor mode (not coverage mode)
        const sensorPositionHint =
          anchorMode === 'near_edge'
            ? 'Sensor at near edge'
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
  const farW = coverageWidth;
  const nearW = isTilt ? coverageWidth * nearEdgeRatio : null;
  const depth = coverageDepth;

  const labelFar = isTilt ? `Far ${farW.toFixed(1)}m` : `${farW.toFixed(1)}m`;
  const labelNear = nearW != null ? `Near ${nearW.toFixed(1)}m` : null;
  const labelDepth = isTilt ? `Depth ${depth.toFixed(1)}m` : `${depth.toFixed(1)}m`;

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
