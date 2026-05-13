import { useState, useCallback } from 'react';
import { Group, Circle, Line } from 'react-konva';
import Konva from 'konva';
import type { SensorPlacement } from '../../api/designs';

interface Props {
  sensors: SensorPlacement[];
  selectedSensorId: string | null;
  scalePxPerMeter: number;
  onRotate: (sensorId: string, rotation: number) => void;
  onResize: (sensorId: string, coverageWidth: number, coverageDepth: number) => void;
}

function shapeForMounting(mountingType: string): { policy: 'center' | 'dynamic_tilt' } {
  switch (mountingType) {
    case 'bracket':
    case 'tilt_bracket': return { policy: 'dynamic_tilt' };
    default:             return { policy: 'center' };
  }
}

/**
 * Shows rotation handle (top) + width handle (right edge) + depth handle (back edge)
 * only for the selected sensor.
 */
export function SensorTransformLayer({ sensors, selectedSensorId, scalePxPerMeter, onRotate, onResize }: Props) {
  if (!selectedSensorId) return null;
  const s = sensors.find((x) => x.id === selectedSensorId);
  if (!s) return null;

  const wPx = s.coverageWidth * scalePxPerMeter;
  const dPx = s.coverageDepth * scalePxPerMeter;
  // C1.10b - handle positions derive from policy + tiltAngle.
  // Polygon is in local cover coords (near at y=0, far at y=depth)
  // shifted by -anchorY so the sensor sits at origin per policy.
  // Handles must therefore sit at (0 - anchorY) and (dPx - anchorY).
  const { policy } = shapeForMounting(s.mountingType);
  const tiltFactor = Math.max(0, Math.min(1, (s.tiltAngle || 0) / 45));
  const anchorY = policy === 'dynamic_tilt'
    ? (dPx / 2) * (1 - tiltFactor)
    : dPx / 2;
  const frontY = 0   - anchorY;
  const backY  = dPx - anchorY;

  const rotateRadius = 38;  // distance of rotation handle from sensor
  const handleColor = '#fcb813';
  const handleStroke = '#b45309';

  return (
    <Group x={s.x} y={s.y} rotation={s.rotation}>
      {/* Rotation guide line */}
      <Line
        points={[0, 0, 0, frontY - rotateRadius]}
        stroke={handleColor}
        strokeWidth={1.5}
        dash={[3, 3]}
      />

      {/* Rotation handle (above sensor at front) */}
      <RotationHandle
        x={0}
        y={frontY - rotateRadius}
        sensor={s}
        onRotate={onRotate}
      />

      {/* Width handles (left + right at mid-depth) */}
      <ResizeHandle
        x={wPx / 2}
        y={(frontY + backY) / 2}
        dim="width"
        sensor={s}
        scalePxPerMeter={scalePxPerMeter}
        onResize={onResize}
        color={handleColor}
        stroke={handleStroke}
      />
      <ResizeHandle
        x={-wPx / 2}
        y={(frontY + backY) / 2}
        dim="width"
        sensor={s}
        scalePxPerMeter={scalePxPerMeter}
        onResize={onResize}
        flip
        color={handleColor}
        stroke={handleStroke}
      />

      {/* Depth handles (back + front) */}
      <ResizeHandle
        x={0}
        y={backY}
        dim="depth"
        sensor={s}
        scalePxPerMeter={scalePxPerMeter}
        onResize={onResize}
        color={handleColor}
        stroke={handleStroke}
      />
      <ResizeHandle
        x={0}
        y={frontY}
        dim="depth"
        sensor={s}
        scalePxPerMeter={scalePxPerMeter}
        onResize={onResize}
        flip
        color={handleColor}
        stroke={handleStroke}
      />
    </Group>
  );
}

// ── Rotation handle ──
function RotationHandle({ x, y, sensor, onRotate }: {
  x: number; y: number; sensor: SensorPlacement; onRotate: (id: string, rot: number) => void
}) {
  return (
    <Group
      x={x}
      y={y}
      draggable
      onDragStart={(e) => { e.cancelBubble = true; }}
      onDragMove={(e) => {
        e.cancelBubble = true;
        // Compute angle from sensor center to handle position
        // Handle is in local coords relative to sensor (which is rotated)
        // We need: pointer screen position, convert to sensor-relative angle in floor-plan coords
        const stage = e.target.getStage();
        if (!stage) return;
        const ptr = stage.getPointerPosition();
        if (!ptr) return;

        // Get sensor world position
        const layer = e.target.getLayer();
        if (!layer) return;
        const stageScale = stage.scaleX();
        const sx = (ptr.x - stage.x()) / stageScale;
        const sy = (ptr.y - stage.y()) / stageScale;

        const dx = sx - sensor.x;
        const dy = sy - sensor.y;
        // 0 deg = pointing up (-y), positive = clockwise
        let rotDeg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        if (rotDeg < 0) rotDeg += 360;
        rotDeg = rotDeg % 360;

        // Shift = snap to 15°
        const isShift = (window.event as any)?.shiftKey;
        if (isShift) rotDeg = Math.round(rotDeg / 15) * 15;

        onRotate(sensor.id, Math.round(rotDeg));
      }}
      onMouseEnter={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'grab';
      }}
      onMouseLeave={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'default';
      }}
    >
      <Circle radius={9} fill="#fcb813" stroke="#b45309" strokeWidth={1.5} />
      <Circle radius={3} fill="#b45309" />
    </Group>
  );
}

// ── Resize handle (small square) ──
interface ResizeHandleProps {
  x: number;
  y: number;
  dim: 'width' | 'depth';
  sensor: SensorPlacement;
  scalePxPerMeter: number;
  onResize: (id: string, w: number, d: number) => void;
  flip?: boolean;
  color: string;
  stroke: string;
}

function ResizeHandle({ x, y, dim, sensor, scalePxPerMeter, onResize, flip, color, stroke }: ResizeHandleProps) {
  const handleSize = 7;
  return (
    <Group
      x={x}
      y={y}
      draggable
      onDragStart={(e) => { e.cancelBubble = true; }}
      onDragMove={(e) => {
        e.cancelBubble = true;
        const localX = e.target.x();
        const localY = e.target.y();

        let newW = sensor.coverageWidth;
        let newD = sensor.coverageDepth;

        if (dim === 'width') {
          // localX is distance from sensor center along sensor's local-x axis
          newW = (Math.abs(localX) * 2) / scalePxPerMeter;
        } else {
          // depth direction
          newD = (Math.abs(localY) * 2) / scalePxPerMeter;
          // for dynamic_tilt anchor with flip=true, behaviour same since we use absolute distance
        }

        newW = Math.max(0.5, Math.min(50, newW));
        newD = Math.max(0.5, Math.min(30, newD));

        onResize(sensor.id, parseFloat(newW.toFixed(2)), parseFloat(newD.toFixed(2)));
      }}
      onDragEnd={(e) => {
        // Snap handle back to its bound position (server already updated state)
        e.target.x(x);
        e.target.y(y);
      }}
      onMouseEnter={(e) => {
        const s = e.target.getStage();
        if (s) s.container().style.cursor = dim === 'width' ? 'ew-resize' : 'ns-resize';
      }}
      onMouseLeave={(e) => {
        const s = e.target.getStage();
        if (s) s.container().style.cursor = 'default';
      }}
    >
      <Circle radius={handleSize} fill="white" stroke={stroke} strokeWidth={1.2} />
      <Circle radius={3} fill={color} />
    </Group>
  );
}
