import { Line, Group, Text, Rect } from 'react-konva';
import type { CoverageZone } from '../../api/designs';

interface Props {
  zones: CoverageZone[];
  scalePxPerMeter: number;
  selectedZoneId?: string | null;
  onSelect?: (id: string) => void;
}

const ZONE_STYLES: Record<string, { stroke: string; fill: string; dash?: number[]; label: string }> = {
  entrance_line: { stroke: '#3b82f6', fill: 'transparent', dash: [8, 4], label: '📐' },
  engagement_area: { stroke: '#ef4444', fill: 'rgba(239,68,68,0.08)', label: '🟥' },
  heatmap_area: { stroke: '#a855f7', fill: 'rgba(168,85,247,0.08)', label: '🟪' },
  walking_area: { stroke: '#94a3b8', fill: 'rgba(148,163,184,0.05)', dash: [4, 4], label: '🚶' },
  obstruction: { stroke: '#f59e0b', fill: 'rgba(245,158,11,0.15)', dash: [4, 2], label: '🚧' },
};

export function ZoneLayer({ zones, scalePxPerMeter, selectedZoneId, onSelect }: Props) {
  return (
    <>
      {zones.map((z) => {
        const style = ZONE_STYLES[z.zoneType] ?? ZONE_STYLES.engagement_area;
        const isSelected = selectedZoneId === z.id;
        const strokeWidth = isSelected ? 3.5 : (z.zoneType === 'entrance_line' ? 3 : 1.5);

        // Entrance line
        if (z.zoneType === 'entrance_line' && z.linePoints) {
          const [a, b] = z.linePoints;
          const lineLengthPx = Math.hypot(b.x - a.x, b.y - a.y);
          const lineLengthM = lineLengthPx / scalePxPerMeter;
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;

          return (
            <Group key={z.id} onClick={() => onSelect?.(z.id)} onTap={() => onSelect?.(z.id)}>
              <Line
                points={[a.x, a.y, b.x, b.y]}
                stroke={style.stroke}
                strokeWidth={strokeWidth}
                dash={style.dash}
              />
              {/* Endpoints */}
              <Line points={[a.x - 4, a.y, a.x + 4, a.y]} stroke={style.stroke} strokeWidth={2} />
              <Line points={[a.x, a.y - 4, a.x, a.y + 4]} stroke={style.stroke} strokeWidth={2} />
              <Line points={[b.x - 4, b.y, b.x + 4, b.y]} stroke={style.stroke} strokeWidth={2} />
              <Line points={[b.x, b.y - 4, b.x, b.y + 4]} stroke={style.stroke} strokeWidth={2} />
              {/* Label */}
              <Rect
                x={midX - 30}
                y={midY - 18}
                width={60}
                height={14}
                fill="rgba(255,255,255,0.9)"
                cornerRadius={2}
              />
              <Text
                x={midX - 30}
                y={midY - 16}
                width={60}
                text={`${lineLengthM.toFixed(1)}m`}
                fontSize={10}
                fontStyle="600"
                fontFamily="Sarabun"
                fill="#1e40af"
                align="center"
              />
            </Group>
          );
        }

        // Polygon zones
        if (z.polygon && z.polygon.length >= 3) {
          const points = z.polygon.flatMap((p) => [p.x, p.y]);
          // Centroid for label
          const cx = z.polygon.reduce((s, p) => s + p.x, 0) / z.polygon.length;
          const cy = z.polygon.reduce((s, p) => s + p.y, 0) / z.polygon.length;

          return (
            <Group key={z.id} onClick={() => onSelect?.(z.id)} onTap={() => onSelect?.(z.id)}>
              <Line
                points={points}
                stroke={style.stroke}
                strokeWidth={strokeWidth}
                fill={style.fill}
                closed
                dash={style.dash}
              />
              {/* Label */}
              <Text
                x={cx - 50}
                y={cy - 7}
                width={100}
                text={`${style.label} ${z.name ?? z.zoneType}`}
                fontSize={11}
                fontStyle="600"
                fontFamily="Sarabun"
                fill={style.stroke}
                align="center"
              />
            </Group>
          );
        }

        return null;
      })}
    </>
  );
}
