import { useState, useEffect, useRef } from 'react';
import { Group, Line, Circle, Text, Rect } from 'react-konva';
import type { Point } from '../../api/designs';

interface MeasureLayerProps {
  measurePoints: Point[];
  savedMeasures: SavedMeasure[];
  selectedMeasureId: string | null;
  scalePxPerMeter: number;
  onSelectMeasure: (id: string | null) => void;
  onUpdateMeasure: (id: string, updates: Partial<SavedMeasure>) => void;
}

export interface SavedMeasure {
  id: string;
  a: Point;
  b: Point;
  realDistance?: number;
}

export function MeasureLayer({
  measurePoints, savedMeasures, selectedMeasureId,
  scalePxPerMeter, onSelectMeasure, onUpdateMeasure,
}: MeasureLayerProps) {
  return (
    <>
      {savedMeasures.map((m) => (
        <SavedMeasureLine
          key={m.id}
          measure={m}
          scalePxPerMeter={scalePxPerMeter}
          selected={selectedMeasureId === m.id}
          onSelect={() => onSelectMeasure(m.id)}
          onMove={(newA, newB) => onUpdateMeasure(m.id, { a: newA, b: newB })}
        />
      ))}

      {measurePoints.length === 1 && (
        <Circle x={measurePoints[0].x} y={measurePoints[0].y} radius={5} fill="#fcb813" stroke="white" strokeWidth={2} />
      )}
      {measurePoints.length === 2 && (
        <PreviewLine a={measurePoints[0]} b={measurePoints[1]} scalePxPerMeter={scalePxPerMeter} />
      )}
    </>
  );
}

function SavedMeasureLine({
  measure, scalePxPerMeter, selected, onSelect, onMove,
}: {
  measure: SavedMeasure;
  scalePxPerMeter: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (a: Point, b: Point) => void;
}) {
  const { a, b, realDistance } = measure;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distPx = Math.hypot(dx, dy);
  const distM = realDistance ?? distPx / scalePxPerMeter;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const angle = Math.atan2(dy, dx);
  const perpX = -Math.sin(angle) * 14;
  const perpY = Math.cos(angle) * 14;

  const color = selected ? '#fcb813' : '#0f766e';

  // Track drag start
  const dragStartRef = useRef<{ a: Point; b: Point; nodeStart: { x: number; y: number } } | null>(null);

  return (
    <Group
      onClick={(e) => { e.cancelBubble = true; onSelect(); }}
      onTap={(e) => { e.cancelBubble = true; onSelect(); }}
    >
      {/* Invisible thick line for clickable area + drag */}
      <Line
        points={[a.x, a.y, b.x, b.y]}
        stroke="transparent"
        strokeWidth={22}
        draggable={selected}
        onDragStart={(e) => {
          e.cancelBubble = true;
          const node = e.target;
          dragStartRef.current = {
            a: { ...a },
            b: { ...b },
            nodeStart: { x: node.x(), y: node.y() },
          };
        }}
        onDragMove={(e) => {
          e.cancelBubble = true;
          if (!dragStartRef.current) return;
          const node = e.target;
          // Delta is in floor-plan coords because parent (Layer) has no transform
          const dx = node.x() - dragStartRef.current.nodeStart.x;
          const dy = node.y() - dragStartRef.current.nodeStart.y;
          onMove(
            { x: dragStartRef.current.a.x + dx, y: dragStartRef.current.a.y + dy },
            { x: dragStartRef.current.b.x + dx, y: dragStartRef.current.b.y + dy },
          );
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true;
          // Reset node position so next drag starts fresh
          e.target.x(0);
          e.target.y(0);
          dragStartRef.current = null;
        }}
        onMouseEnter={(e) => {
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = selected ? 'move' : 'pointer';
        }}
        onMouseLeave={(e) => {
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = 'default';
        }}
      />

      {/* Visible line */}
      <Line points={[a.x, a.y, b.x, b.y]}
        stroke={color} strokeWidth={selected ? 2.5 : 2}
        dash={[4, 3]} listening={false} />

      {/* Tick marks */}
      <Line points={[a.x - perpX / 2, a.y - perpY / 2, a.x + perpX / 2, a.y + perpY / 2]}
        stroke={color} strokeWidth={2} listening={false} />
      <Line points={[b.x - perpX / 2, b.y - perpY / 2, b.x + perpX / 2, b.y + perpY / 2]}
        stroke={color} strokeWidth={2} listening={false} />

      {/* Label */}
      <Rect x={midX - 30 + perpX} y={midY - 10 + perpY} width={60} height={20}
        fill="rgba(255,255,255,0.95)" stroke={color}
        strokeWidth={selected ? 1 : 0.5} cornerRadius={3} listening={false} />
      <Text x={midX - 30 + perpX} y={midY - 6 + perpY} width={60}
        text={`${distM.toFixed(2)} m`} fontSize={11} fontStyle="600"
        fontFamily="Sarabun" fill={color} align="center" listening={false} />

      {/* Endpoint handles (when selected) */}
      {selected && (
        <>
          <DraggableEndpoint point={a}
            onDrag={(p) => onMove(p, b)} />
          <DraggableEndpoint point={b}
            onDrag={(p) => onMove(a, p)} />
        </>
      )}
    </Group>
  );
}

function DraggableEndpoint({ point, onDrag }:
  { point: Point; onDrag: (p: Point) => void }) {
  return (
    <Group
      x={point.x}
      y={point.y}
      draggable
      onDragStart={(e) => { e.cancelBubble = true; }}
      onDragMove={(e) => {
        e.cancelBubble = true;
        // Group's x/y in parent layer (no transform) = floor-plan coords
        onDrag({ x: e.target.x(), y: e.target.y() });
      }}
      onMouseEnter={(e) => {
        const s = e.target.getStage();
        if (s) s.container().style.cursor = 'grab';
      }}
      onMouseLeave={(e) => {
        const s = e.target.getStage();
        if (s) s.container().style.cursor = 'default';
      }}
    >
      <Circle radius={10} fill="white" stroke="#b45309" strokeWidth={1.4} />
      <Circle radius={4.5} fill="#fcb813" />
    </Group>
  );
}

function PreviewLine({ a, b, scalePxPerMeter }: { a: Point; b: Point; scalePxPerMeter: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distPx = Math.hypot(dx, dy);
  const distM = distPx / scalePxPerMeter;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const angle = Math.atan2(dy, dx);
  const perpX = -Math.sin(angle) * 14;
  const perpY = Math.cos(angle) * 14;

  return (
    <Group listening={false}>
      <Line points={[a.x, a.y, b.x, b.y]} stroke="#fcb813" strokeWidth={2} dash={[4, 3]} />
      <Rect x={midX - 30 + perpX} y={midY - 10 + perpY} width={60} height={20}
        fill="rgba(255,255,255,0.95)" stroke="#fcb813" strokeWidth={0.5} cornerRadius={3} />
      <Text x={midX - 30 + perpX} y={midY - 6 + perpY} width={60}
        text={`${distM.toFixed(2)} m`} fontSize={11} fontStyle="600"
        fontFamily="Sarabun" fill="#fcb813" align="center" />
    </Group>
  );
}

// ════════════════════════════════════════════════
// Dialog
// ════════════════════════════════════════════════
interface DialogProps {
  pixelDistance: number;
  currentScale: number;
  computedDistanceM: number;
  onCancel: () => void;
  onSaveMeasure: (realDistance: number) => void;
  onCalibrateScale: (realDistance: number) => void;
}

export function MeasureDialog({ pixelDistance, currentScale, computedDistanceM, onCancel, onSaveMeasure, onCalibrateScale }: DialogProps) {
  const [realDistance, setRealDistance] = useState<string>(computedDistanceM.toFixed(2));
  const [mode, setMode] = useState<'measure' | 'calibrate'>('measure');

  useEffect(() => {
    setRealDistance(computedDistanceM.toFixed(2));
  }, [computedDistanceM]);

  const realDistanceNum = parseFloat(realDistance);
  const newScale = realDistanceNum > 0 ? pixelDistance / realDistanceNum : currentScale;

  const handleSubmit = () => {
    if (!realDistanceNum || realDistanceNum <= 0) {
      alert('Please enter a positive distance');
      return;
    }
    if (mode === 'calibrate') onCalibrateScale(realDistanceNum);
    else onSaveMeasure(realDistanceNum);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6" onClick={onCancel}>
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-ditech-border flex items-center justify-between">
          <h3 className="font-semibold text-base">📏 Measurement</h3>
          <button onClick={onCancel} className="text-ditech-text-subtle hover:text-ditech-text text-lg">✕</button>
        </div>
        <div className="p-5 space-y-3">
          <div className="text-sm text-ditech-text-muted">
            You measured <span className="font-mono text-ditech-text font-semibold">{pixelDistance.toFixed(0)} px</span>
            {' '} (currently <span className="font-mono text-ditech-text font-semibold">{computedDistanceM.toFixed(2)} m</span> at {currentScale.toFixed(1)} px/m)
          </div>
          <div className="border border-ditech-border-strong rounded p-1 inline-flex bg-slate-50">
            <button onClick={() => setMode('measure')}
              className={`px-3 py-1.5 text-xs rounded ${mode === 'measure' ? 'bg-white shadow font-semibold' : 'text-ditech-text-muted'}`}>
              📏 Save as label
            </button>
            <button onClick={() => setMode('calibrate')}
              className={`px-3 py-1.5 text-xs rounded ${mode === 'calibrate' ? 'bg-white shadow font-semibold' : 'text-ditech-text-muted'}`}>
              🎯 Calibrate scale
            </button>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-ditech-text-muted block mb-1 font-semibold">
              Real-world distance (m)
            </label>
            <input type="number" step="0.1" min="0" value={realDistance}
              onChange={(e) => setRealDistance(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded font-mono"
              placeholder="e.g. 10.5" />
          </div>
          {mode === 'calibrate' && realDistanceNum > 0 && (
            <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900">
              <div className="font-semibold mb-1">⚙️ Will set scale:</div>
              <div className="font-mono">
                {pixelDistance.toFixed(0)} px ÷ {realDistanceNum} m = <span className="font-bold">{newScale.toFixed(2)} px/m</span>
              </div>
            </div>
          )}
          {mode === 'measure' && (
            <div className="text-xs text-ditech-text-muted italic">
              Line stays on canvas. Click to select → drag line to move, drag endpoints to rotate/resize, Del to delete.
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-ditech-border flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={handleSubmit}
            className={`px-3 py-1.5 text-xs text-white rounded ${
              mode === 'calibrate' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-ditech-primary hover:bg-ditech-primary-light'
            }`}>
            {mode === 'calibrate' ? '🎯 Apply Scale' : '📏 Save Label'}
          </button>
        </div>
      </div>
    </div>
  );
}
