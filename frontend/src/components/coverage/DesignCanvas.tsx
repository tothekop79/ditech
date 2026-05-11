import { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { Stage, Layer, Line, Circle, Text } from 'react-konva';
import Konva from 'konva';
import type { Point } from '../../api/designs';
import { FloorPlanLayer } from './FloorPlanLayer';
import { CoverageRectLayer } from './CoverageRectLayer';
import { SensorMarkerLayer } from './SensorMarkerLayer';
import { ZoneLayer } from './ZoneLayer';
import { MeasureLayer } from './MeasureTool';
import { SensorTransformLayer } from './SensorTransformLayer';
import type { useDesignEditor } from '../../hooks/useDesignEditor';

interface DesignCanvasProps {
  editor: ReturnType<typeof useDesignEditor>;
  defaultCameraModelId?: string;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 6;
const ZOOM_STEP = 1.1;
const FIT_PADDING = 8;

export function DesignCanvas({ editor, defaultCameraModelId }: DesignCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [viewportScale, setViewportScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  const { design, tool, pendingPoints, handleCanvasClick, finishPolygon, cancelPending,
    setSelectedSensorId, coverageMode, sensorDisplay, showLabels,
    selectedSensorId, measurePoints, savedMeasures, updateSensor,
    selectedMeasureId, setSelectedMeasureId, updateMeasure, deleteSelected,
    setSelectedZoneId } = editor;

  const fpWidth = design?.floorPlanWidth ?? 1000;
  const fpHeight = design?.floorPlanHeight ?? 700;

  // ── Measure wrapper element directly ──
  useLayoutEffect(() => {
    if (!wrapRef.current) return;

    const measure = () => {
      if (!wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setContainerSize({ w: Math.floor(r.width), h: Math.floor(r.height) });
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrapRef.current);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // ── Auto-fit ──
  const fitToScreen = useCallback(() => {
    if (!fpWidth || !fpHeight || !containerSize.w || !containerSize.h) return;
    const sx = (containerSize.w - FIT_PADDING * 2) / fpWidth;
    const sy = (containerSize.h - FIT_PADDING * 2) / fpHeight;
    const fit = Math.min(sx, sy);
    setViewportScale(fit);
    setPosition({
      x: (containerSize.w - fpWidth * fit) / 2,
      y: (containerSize.h - fpHeight * fit) / 2,
    });
  }, [fpWidth, fpHeight, containerSize.w, containerSize.h]);

  // Refit whenever floor plan or container changes
  useEffect(() => {
    if (containerSize.w <= 0 || containerSize.h <= 0) return;
    const t = setTimeout(fitToScreen, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fpWidth, fpHeight, containerSize.w, containerSize.h, design?.floorPlanUrl]);

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = viewportScale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const mousePointTo = {
      x: (pointer.x - position.x) / oldScale,
      y: (pointer.y - position.y) / oldScale,
    };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = direction > 0
      ? Math.min(oldScale * ZOOM_STEP, MAX_ZOOM)
      : Math.max(oldScale / ZOOM_STEP, MIN_ZOOM);
    setViewportScale(newScale);
    setPosition({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }, [viewportScale, position]);

  const handleStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    if (e.target !== stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const p: Point = {
      x: (pointer.x - position.x) / viewportScale,
      y: (pointer.y - position.y) / viewportScale,
    };
    if (tool === 'select') {
      setSelectedSensorId(null);
      setSelectedMeasureId(null);
      setSelectedZoneId(null);
    } else {
      handleCanvasClick(p, defaultCameraModelId);
    }
  }, [tool, viewportScale, position, handleCanvasClick, defaultCameraModelId,
      setSelectedSensorId, setSelectedMeasureId, setSelectedZoneId]);

  const handleStageDblClick = useCallback(() => {
    if (tool === 'add-engagement' || tool === 'add-heatmap-zone' || tool === 'add-obstruction' || tool === 'add-walking') {
      finishPolygon();
    }
  }, [tool, finishPolygon]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if (e.key === 'Escape') cancelPending();
      if (e.key === 'Enter') finishPolygon();
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();

      // Arrow keys: nudge selected sensor or measure
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowUp')    { if (editor.nudgeSelected(0, -step)) e.preventDefault(); }
      if (e.key === 'ArrowDown')  { if (editor.nudgeSelected(0, step))  e.preventDefault(); }
      if (e.key === 'ArrowLeft')  { if (editor.nudgeSelected(-step, 0)) e.preventDefault(); }
      if (e.key === 'ArrowRight') { if (editor.nudgeSelected(step, 0))  e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelPending, finishPolygon, deleteSelected, editor]);

  const zoomIn = useCallback(() => setViewportScale(s => Math.min(s * ZOOM_STEP, MAX_ZOOM)), []);
  const zoomOut = useCallback(() => setViewportScale(s => Math.max(s / ZOOM_STEP, MIN_ZOOM)), []);
  const zoomReset = useCallback(() => {
    setViewportScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  let cursor = 'default';
  if (tool === 'measure') cursor = 'crosshair';
  else if (tool !== 'select') cursor = 'crosshair';

  if (!design) {
    return <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-500 text-sm">Loading design…</div>;
  }

  return (
    <div ref={wrapRef} className="absolute inset-0 bg-slate-100 overflow-hidden" style={{ cursor }}>
      {containerSize.w > 0 && containerSize.h > 0 && (
        <Stage
          ref={stageRef}
          width={containerSize.w}
          height={containerSize.h}
          scaleX={viewportScale}
          scaleY={viewportScale}
          x={position.x}
          y={position.y}
          draggable={tool === 'select'}
          onWheel={handleWheel}
          onClick={handleStageClick}
          onTap={handleStageClick}
          onDblClick={handleStageDblClick}
          onDragEnd={(e) => {
            if (e.target === stageRef.current) {
              setPosition({ x: e.target.x(), y: e.target.y() });
            }
          }}
        >
          <Layer listening={false}>
            <FloorPlanLayer url={design.floorPlanUrl} width={fpWidth} height={fpHeight} />
          </Layer>

          {coverageMode === 'rectangle' && (
            <Layer listening={false}>
              <CoverageRectLayer
                sensors={design.sensors ?? []}
                scalePxPerMeter={design.scalePxPerMeter}
                showLabels={showLabels}
                showDimensions={showLabels}
                showDirectionArrow={true}
                selectedSensorId={selectedSensorId}
              />
            </Layer>
          )}

          <Layer>
            <ZoneLayer
              zones={design.zones ?? []}
              scalePxPerMeter={design.scalePxPerMeter}
              selectedZoneId={editor.selectedZoneId}
              onSelect={editor.setSelectedZoneId}
            />
          </Layer>

          <Layer>
            <SensorMarkerLayer
              sensors={design.sensors ?? []}
              displayMode={sensorDisplay}
              selectedSensorId={selectedSensorId}
              showLabels={showLabels}
              onSelect={(id) => {
                setSelectedSensorId(id);
                setSelectedMeasureId(null);
                setSelectedZoneId(null);
                editor.setTool('select');
              }}
              onDragEnd={(sensorId, x, y) => {
                editor.updateSensor.mutate({ sensorId, dto: { x, y } });
              }}
            />
          </Layer>

          {tool === 'select' && selectedSensorId && (
            <Layer>
              <SensorTransformLayer
                sensors={design.sensors ?? []}
                selectedSensorId={selectedSensorId}
                scalePxPerMeter={design.scalePxPerMeter}
                onRotate={(sensorId, rotation) => {
                  updateSensor.mutate({ sensorId, dto: { rotation } });
                }}
                onResize={(sensorId, coverageWidth, coverageDepth) => {
                  updateSensor.mutate({ sensorId, dto: { coverageWidth, coverageDepth, coverageOverride: true } });
                }}
              />
            </Layer>
          )}

          <Layer>
            <MeasureLayer
              measurePoints={measurePoints}
              savedMeasures={savedMeasures}
              selectedMeasureId={selectedMeasureId}
              scalePxPerMeter={design.scalePxPerMeter}
              onSelectMeasure={(id) => {
                setSelectedMeasureId(id);
                setSelectedSensorId(null);
                setSelectedZoneId(null);
                editor.setTool('select');
              }}
              onUpdateMeasure={updateMeasure}
            />
          </Layer>

          {pendingPoints.length > 0 && (
            <Layer listening={false}>
              <Line points={pendingPoints.flatMap(p => [p.x, p.y])} stroke="#fcb813" strokeWidth={2} dash={[6, 4]} />
              {pendingPoints.map((p, i) => (
                <Circle key={i} x={p.x} y={p.y} radius={4} fill="#fcb813" />
              ))}
              <Text
                x={pendingPoints[pendingPoints.length - 1].x + 10}
                y={pendingPoints[pendingPoints.length - 1].y - 18}
                text={tool === 'add-entrance-line'
                  ? `${2 - pendingPoints.length} more click(s)`
                  : 'Double-click to finish · Esc cancels'}
                fontSize={11}
                fill="#7c2d12"
                fontFamily="Sarabun"
              />
            </Layer>
          )}
        </Stage>
      )}

      {/* Floating zoom controls */}
      <div className="absolute right-3 bottom-3 bg-white rounded shadow-md border border-ditech-border-strong flex flex-col z-10">
        <button onClick={zoomIn} className="px-2 py-1 hover:bg-slate-50 border-b border-slate-200 text-sm" title="Zoom in">＋</button>
        <div className="px-2 py-0.5 text-[10px] text-center text-ditech-text-muted font-mono border-b border-slate-200">{Math.round(viewportScale * 100)}%</div>
        <button onClick={zoomOut} className="px-2 py-1 hover:bg-slate-50 border-b border-slate-200 text-sm" title="Zoom out">−</button>
        <button onClick={fitToScreen} className="px-2 py-1 hover:bg-slate-50 border-b border-slate-200 text-xs" title="Fit to screen">⛶</button>
        <button onClick={zoomReset} className="px-2 py-1 hover:bg-slate-50 text-xs" title="Reset 100%">↻</button>
      </div>

      {tool !== 'select' && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 bg-amber-50 border border-amber-300 rounded px-3 py-1.5 text-xs text-amber-900 shadow-sm z-10">
          {tool === 'add-sensor' && '📷 Click on canvas to place a sensor'}
          {tool === 'add-entrance-line' && '📐 Click 2 points to draw entrance line'}
          {tool === 'add-engagement' && '🟥 Click points to outline engagement area · double-click to finish'}
          {tool === 'add-heatmap-zone' && '🟪 Click points for heatmap zone · double-click to finish'}
          {tool === 'add-obstruction' && '🚧 Click points around obstruction · double-click to finish'}
          {tool === 'add-walking' && '🚶 Click points for walking area · double-click to finish'}
          {tool === 'measure' && (measurePoints.length === 0
            ? '📏 Click first point to measure'
            : '📏 Click second point to finish measurement')}
          <span className="ml-2 text-amber-700">· Esc to cancel</span>
        </div>
      )}

      {tool === 'select' && selectedSensorId && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 bg-blue-50 border border-blue-300 rounded px-3 py-1.5 text-xs text-blue-900 shadow-sm z-10">
          ⭐ <strong>Rotate</strong> via yellow dot · <strong>Resize</strong> via handles · <kbd className="px-1 bg-blue-100 border border-blue-300 rounded text-[10px]">←↑↓→</kbd> nudge (Shift = 10px) · <strong>Del</strong> remove
        </div>
      )}

      {tool === 'select' && selectedMeasureId && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 bg-amber-50 border border-amber-300 rounded px-3 py-1.5 text-xs text-amber-900 shadow-sm z-10">
          📏 Drag to <strong>move</strong> · Drag endpoints to <strong>rotate/resize</strong> · <kbd className="px-1 bg-amber-100 border border-amber-300 rounded text-[10px]">←↑↓→</kbd> nudge · <strong>Del</strong> remove
        </div>
      )}
    </div>
  );
}
