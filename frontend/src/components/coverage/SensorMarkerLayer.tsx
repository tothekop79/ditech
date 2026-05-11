import { useRef } from 'react';
import { Group, Circle, Text, Rect, Line } from 'react-konva';
import type { SensorPlacement } from '../../api/designs';
import { FUNCTION_COLORS } from '../../utils/coverageColors';

interface Props {
  sensors: SensorPlacement[];
  displayMode: 'symbol' | 'image';
  selectedSensorId: string | null;
  showLabels: boolean;
  onSelect: (id: string) => void;
  onDragEnd: (sensorId: string, x: number, y: number) => void;
}

export function SensorMarkerLayer({
  sensors, displayMode, selectedSensorId, showLabels, onSelect, onDragEnd
}: Props) {
  return (
    <>
      {sensors.map((sensor) => (
        <SensorMarker
          key={sensor.id}
          sensor={sensor}
          displayMode={displayMode}
          showLabels={showLabels}
          selected={selectedSensorId === sensor.id}
          dimmed={selectedSensorId != null && selectedSensorId !== sensor.id}
          onSelect={() => onSelect(sensor.id)}
          onDragEnd={(x, y) => onDragEnd(sensor.id, x, y)}
        />
      ))}
    </>
  );
}

function SensorMarker({ sensor, displayMode, showLabels, selected, dimmed, onSelect, onDragEnd }: {
  sensor: SensorPlacement;
  displayMode: 'symbol' | 'image';
  showLabels: boolean;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
}) {
  const colors = FUNCTION_COLORS[sensor.functionType] ?? FUNCTION_COLORS.entrance;
  const effectiveColor = sensor.color || colors.dot;
  const hoverRef = useRef(false);

  // Hit area bigger than visible symbol for easier selection
  const HIT_RADIUS = 22;
  const SYMBOL_RADIUS = 9;

  // Label positioned ABOVE the sensor (counter-rotated so it stays readable)
  // Build a compact 2-line label:
  //   line 1: sensor name
  //   line 2: model · function · (Tilt N° if applicable)
  const tiltText = sensor.mountingType === 'tilt_bracket' && sensor.tiltAngle
    ? `· Tilt ${sensor.tiltAngle}°`
    : '';
  const subtitle = [
    sensor.cameraModel?.displayName?.split(/[·,]|\s\(/)[0]?.trim() || '',
    functionLabel(sensor.functionType),
    tiltText,
  ].filter(Boolean).join(' · ');

  const labelW = Math.max(80, Math.min(160, subtitle.length * 4.8 + 12));
  const labelH = 26;

  return (
    <Group
      x={sensor.x}
      y={sensor.y}
      // Note: do NOT rotate the marker group, only the coverage polygon rotates.
      // This way the marker icon + label stay upright regardless of yaw.
      opacity={dimmed ? 0.5 : 1.0}
      draggable
      onClick={(e) => { e.cancelBubble = true; onSelect(); }}
      onTap={(e) => { e.cancelBubble = true; onSelect(); }}
      onDragStart={(e) => {
        e.cancelBubble = true;
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'grabbing';
      }}
      onDragMove={(e) => { e.cancelBubble = true; }}
      onDragEnd={(e) => {
        e.cancelBubble = true;
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'grab';
        onDragEnd(e.target.x(), e.target.y());
      }}
      onMouseEnter={(e) => {
        hoverRef.current = true;
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'grab';
      }}
      onMouseLeave={(e) => {
        hoverRef.current = false;
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'default';
      }}
    >
      {/* Invisible hit area */}
      <Circle radius={HIT_RADIUS} fill="transparent" />

      {/* Selection ring */}
      {selected && (
        <Circle
          radius={SYMBOL_RADIUS + 5}
          fill="transparent"
          stroke="#fcb813"
          strokeWidth={2}
          dash={[3, 2]}
        />
      )}

      {/* Sensor marker — circular badge with function letter */}
      <Circle
        radius={SYMBOL_RADIUS}
        fill={effectiveColor}
        stroke="white"
        strokeWidth={2}
        shadowBlur={selected ? 8 : 3}
        shadowColor={selected ? effectiveColor : 'rgba(0,0,0,0.3)'}
        shadowOpacity={selected ? 0.6 : 0.4}
      />

      {/* Function letter inside marker */}
      <Text
        text={functionLetter(sensor.functionType)}
        fontSize={11}
        fontStyle="800"
        fontFamily="Sarabun"
        fill="white"
        x={-7}
        y={-6}
        width={14}
        height={12}
        align="center"
        verticalAlign="middle"
        listening={false}
      />

      {/* Compact label above marker (only in symbol mode, when showLabels true) */}
      {/* C1.9.1 — label pushed up 48-56px to avoid overlap with Near edge label */}
      {displayMode === 'symbol' && showLabels && (
        <Group y={-SYMBOL_RADIUS - labelH - 18} listening={false}>
          {/* Thin connector line from marker to label */}
          <Line
            points={[0, labelH, 0, labelH + 12]}
            stroke="#94a3b8"
            strokeWidth={0.8}
            dash={[2, 2]}
            listening={false}
          />
          {/* Shadow rect underneath for slight elevation */}
          <Rect
            x={-labelW / 2 + 1}
            y={2}
            width={labelW}
            height={labelH}
            fill="rgba(0,0,0,0.18)"
            cornerRadius={3}
          />
          {/* White label */}
          <Rect
            x={-labelW / 2}
            y={0}
            width={labelW}
            height={labelH}
            fill="white"
            opacity={0.97}
            stroke={selected ? '#fcb813' : effectiveColor}
            strokeWidth={selected ? 1.2 : 0.5}
            cornerRadius={3}
          />
          {/* Sensor name (line 1) */}
          <Text
            x={-labelW / 2}
            y={2}
            width={labelW}
            text={sensor.sensorName}
            fontSize={10}
            fontStyle="700"
            fontFamily="Sarabun"
            fill="#1f2937"
            align="center"
            ellipsis
            wrap="none"
          />
          {/* Subtitle (line 2) */}
          {subtitle && (
            <Text
              x={-labelW / 2}
              y={13}
              width={labelW}
              text={subtitle}
              fontSize={8}
              fontFamily="Sarabun"
              fill="#64748b"
              align="center"
              ellipsis
              wrap="none"
            />
          )}
        </Group>
      )}
    </Group>
  );
}

function functionLetter(fn: string): string {
  switch (fn) {
    case 'entrance': return 'E';
    case 'engagement': return 'G';
    case 'heatmap': return 'H';
    case 'cctv': return 'C';
    case 'passerby': return 'P';
    default: return '?';
  }
}

function functionLabel(fn: string): string {
  switch (fn) {
    case 'entrance': return 'Entrance';
    case 'engagement': return 'Engagement';
    case 'heatmap': return 'Heatmap';
    case 'cctv': return 'CCTV';
    case 'passerby': return 'Passer-by';
    default: return fn;
  }
}
