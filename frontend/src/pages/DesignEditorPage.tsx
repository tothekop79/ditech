import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useDesignEditor } from '../hooks/useDesignEditor';
import { cameraModelsApi } from '../api/cameraModels';
import { designsApi } from '../api/designs';
import { DesignCanvas } from '../components/coverage/DesignCanvas';
import { SensorListPanel } from '../components/coverage/SensorListPanel';
import { SensorSettingsPanel } from '../components/coverage/SensorSettingsPanel';
import { CoverageSummaryBar } from '../components/coverage/CoverageSummaryBar';
import { CameraModelsModal } from '../components/coverage/CameraModelsModal';
import { MeasureDialog } from '../components/coverage/MeasureTool';
import type { Tool } from '../hooks/useDesignEditor';

export function DesignEditorPage() {
  const { id, planId, eventId } = useParams<{ id?: string; planId?: string; eventId?: string }>();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [resolvedDesignId, setResolvedDesignId] = useState<string | undefined>(id);
  const [showCameraModels, setShowCameraModels] = useState(false);

  useEffect(() => {
    if (id) { setResolvedDesignId(id); return; }
    if (planId) {
      designsApi.getOrCreateForPlan(planId, `Plan ${planId.substring(0, 8)}`)
        .then((d) => { setResolvedDesignId(d.id); navigate(`/designs/${d.id}`, { replace: true }); });
    } else if (eventId) {
      designsApi.getOrCreateForEvent(eventId, `Event ${eventId.substring(0, 8)}`)
        .then((d) => { setResolvedDesignId(d.id); navigate(`/designs/${d.id}`, { replace: true }); });
    }
  }, [id, planId, eventId, navigate]);

  const editor = useDesignEditor({ designId: resolvedDesignId ?? '' });
  const cameraModelsQuery = useQuery({
    queryKey: ['camera-models'],
    queryFn: () => cameraModelsApi.list({ isActive: true }),
  });

  const defaultModelId = cameraModelsQuery.data?.find((m) => m.displayName.includes('G6'))?.id
    ?? cameraModelsQuery.data?.[0]?.id;

  if (!resolvedDesignId) {
    return <div className="p-12 text-center text-sm text-ditech-text-muted">Loading design…</div>;
  }
  if (editor.isLoading) {
    return <div className="p-12 text-center text-sm text-ditech-text-muted">Loading design…</div>;
  }
  if (!editor.design) {
    return <div className="p-12 text-center text-sm text-red-600">Design not found</div>;
  }

  const d = editor.design;
  const isToolActive = (t: Tool) => editor.tool === t;
  const { leftPanelOpen, setLeftPanelOpen, rightPanelOpen, setRightPanelOpen } = editor;

  const pendingMeasurePixelDistance = editor.pendingMeasureDialog
    ? Math.hypot(
        editor.pendingMeasureDialog.b.x - editor.pendingMeasureDialog.a.x,
        editor.pendingMeasureDialog.b.y - editor.pendingMeasureDialog.a.y,
      )
    : 0;
  const pendingMeasureComputedM = pendingMeasurePixelDistance / d.scalePxPerMeter;

  return (
    <div className="fixed inset-x-0 bottom-0 top-[52px] flex flex-col bg-white">
      <div className="bg-white border-b border-ditech-border px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 text-sm">
          <Link to="/plans" className="text-blue-600 hover:underline">← Plans</Link>
          <span className="text-slate-300">/</span>
          <h1 className="font-semibold">Coverage Simulator</h1>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium">
            {d.designNumber ?? 'Design 01'}
          </span>
          <span className="text-ditech-text-muted text-xs">·</span>
          <span className="text-ditech-text-muted text-xs font-mono">{d.siteName}</span>
          {d.plan && <><span className="text-ditech-text-muted text-xs">·</span><span className="text-ditech-text-muted text-xs">Plan: {d.plan.storeName}</span></>}
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <button onClick={() => setShowCameraModels(true)} className="px-2.5 py-1 bg-white border border-ditech-border-strong rounded hover:bg-slate-50">
            📦 Camera Models
          </button>
          <span className="text-slate-300">|</span>
          <button className="px-2.5 py-1 bg-white border border-ditech-border-strong rounded hover:bg-slate-50" disabled>
            📄 Export PDF
          </button>
          <button className="px-2.5 py-1 bg-white border border-ditech-border-strong rounded hover:bg-slate-50" disabled>
            🖼 Export PNG
          </button>
          <button onClick={() => navigate(-1)} className="px-3 py-1 bg-ditech-primary text-white rounded hover:bg-ditech-primary-light">
            ✓ Done
          </button>
        </div>
      </div>

      <div className="bg-slate-50 border-b border-ditech-border px-4 py-1.5 flex items-center justify-between flex-shrink-0 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => fileRef.current?.click()} className="px-2 py-1 bg-white border border-ditech-border-strong rounded hover:bg-slate-50">
            📁 {d.floorPlanUrl ? 'Replace' : 'Upload'} Floor Plan
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) editor.uploadFloorPlan.mutate(f);
              e.target.value = '';
            }} />
          <span className="text-ditech-text-muted">
            Scale <span className="font-mono">1px = {(1 / d.scalePxPerMeter).toFixed(3)}m</span>
            <span className="text-ditech-text-subtle ml-1">({d.scalePxPerMeter.toFixed(1)} px/m)</span>
          </span>
          <span className="text-slate-300">|</span>
          <ToolGroup>
            <ToolBtn active={isToolActive('select')} onClick={() => editor.setTool('select')}>👆 Select</ToolBtn>
            <ToolBtn active={isToolActive('add-sensor')} onClick={() => editor.setTool('add-sensor')}>➕ Sensor</ToolBtn>
            <ToolBtn active={isToolActive('add-entrance-line')} onClick={() => editor.setTool('add-entrance-line')}>📐 Entrance</ToolBtn>
            <ToolBtn active={isToolActive('add-engagement')} onClick={() => editor.setTool('add-engagement')}>🟥 Engage</ToolBtn>
            <ToolBtn active={isToolActive('add-heatmap-zone')} onClick={() => editor.setTool('add-heatmap-zone')}>🟪 Heat</ToolBtn>
            <ToolBtn active={isToolActive('add-obstruction')} onClick={() => editor.setTool('add-obstruction')}>🚧 Obstr</ToolBtn>
          </ToolGroup>
          <span className="text-slate-300">|</span>
          <ToolGroup>
            <ToolBtn active={isToolActive('measure')} onClick={() => editor.setTool('measure')}>📏 Measure</ToolBtn>
          </ToolGroup>
          {editor.savedMeasures.length > 0 && (
            <button onClick={editor.clearAllMeasures}
              className="px-1.5 py-1 text-[11px] text-ditech-text-muted hover:text-red-600"
              title={`Clear ${editor.savedMeasures.length} saved measure(s)`}>
              🗑 Clear ({editor.savedMeasures.length})
            </button>
          )}
          {editor.tool === 'add-sensor' && (
            <select value={editor.pendingSensorFunction}
              onChange={(e) => editor.setPendingSensorFunction(e.target.value as any)}
              className="px-2 py-1 text-xs border border-slate-300 rounded bg-white">
              <option value="entrance">📷 Entrance</option>
              <option value="engagement">🟥 Engagement</option>
              <option value="heatmap">🟪 Heatmap</option>
              <option value="cctv">📹 CCTV</option>
              <option value="passerby">🚶 Passer-by</option>
            </select>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] uppercase tracking-wider text-ditech-text-muted font-semibold">Display</span>
          <ToolGroup>
            <ToolBtn active={editor.sensorDisplay === 'symbol'} onClick={() => editor.setSensorDisplay('symbol')}>⚫ Symbol</ToolBtn>
            <ToolBtn active={editor.sensorDisplay === 'image'} onClick={() => editor.setSensorDisplay('image')}>📷 Image</ToolBtn>
          </ToolGroup>
          <span className="text-slate-300">|</span>
          <span className="text-[11px] uppercase tracking-wider text-ditech-text-muted font-semibold">Coverage</span>
          <ToolGroup>
            <ToolBtn active={editor.coverageMode === 'rectangle'} onClick={() => editor.setCoverageMode('rectangle')}>Rect</ToolBtn>
            <ToolBtn active={editor.coverageMode === 'hide'} onClick={() => editor.setCoverageMode('hide')}>Hide</ToolBtn>
          </ToolGroup>
          <label className="inline-flex items-center gap-1">
            <input type="checkbox" checked={editor.showLabels}
              onChange={(e) => editor.setShowLabels(e.target.checked)}
              className="w-3 h-3" />
            Labels
          </label>
        </div>
      </div>

      {/* 3-column main */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {leftPanelOpen ? (
          <div className="relative flex-shrink-0">
            <SensorListPanel editor={editor} onAddSensor={() => editor.setTool('add-sensor')} />
            <button onClick={() => setLeftPanelOpen(false)}
              className="absolute top-3 -right-3 w-6 h-6 bg-white border border-ditech-border-strong rounded-full shadow-sm hover:bg-slate-50 flex items-center justify-center z-10 text-xs"
              title="Collapse left panel">‹</button>
          </div>
        ) : (
          <button onClick={() => setLeftPanelOpen(true)}
            className="absolute top-3 left-3 z-10 px-2 py-1.5 bg-white border border-ditech-border-strong rounded shadow-sm hover:bg-slate-50 text-xs flex items-center gap-1"
            title="Show sensor list">
            <span>›</span>
            <span>📷 Sensors ({d.sensors?.length ?? 0})</span>
          </button>
        )}

        <main className="flex-1 relative bg-slate-100 min-w-0 min-h-0">
          <DesignCanvas editor={editor} defaultCameraModelId={defaultModelId} />
        </main>

        {rightPanelOpen ? (
          <div className="relative flex-shrink-0">
            <button onClick={() => setRightPanelOpen(false)}
              className="absolute top-3 -left-3 w-6 h-6 bg-white border border-ditech-border-strong rounded-full shadow-sm hover:bg-slate-50 flex items-center justify-center z-10 text-xs"
              title="Collapse right panel">›</button>
            <SensorSettingsPanel editor={editor} />
          </div>
        ) : (
          <button onClick={() => setRightPanelOpen(true)}
            className="absolute top-3 right-3 z-10 px-2 py-1.5 bg-white border border-ditech-border-strong rounded shadow-sm hover:bg-slate-50 text-xs flex items-center gap-1"
            title="Show settings">
            <span>⚙️ {editor.selectedSensor ? 'Sensor Settings' : 'Settings'}</span>
            <span>‹</span>
          </button>
        )}
      </div>

      <CoverageSummaryBar editor={editor} />

      <CameraModelsModal open={showCameraModels} onClose={() => setShowCameraModels(false)} />

      {editor.pendingMeasureDialog && (
        <MeasureDialog
          pixelDistance={pendingMeasurePixelDistance}
          currentScale={d.scalePxPerMeter}
          computedDistanceM={pendingMeasureComputedM}
          onCancel={editor.cancelMeasure}
          onSaveMeasure={editor.onSaveMeasureLabel}
          onCalibrateScale={editor.onCalibrateScale}
        />
      )}
    </div>
  );
}

function ToolGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex bg-white border border-ditech-border-strong rounded">
      {children}
    </div>
  );
}

function ToolBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-2 py-1 text-xs first:rounded-l last:rounded-r border-r border-slate-200 last:border-r-0 ${
        active ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-slate-50'
      }`}>
      {children}
    </button>
  );
}
