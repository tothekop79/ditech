import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cameraModelsApi } from '../../api/cameraModels';
import type { useDesignEditor } from '../../hooks/useDesignEditor';
import { FUNCTION_COLORS } from '../../utils/coverageColors';
import { ObstructionPanel, type ScenarioType } from './ObstructionPanel';

interface Props {
  editor: ReturnType<typeof useDesignEditor>;
}

const COLOR_SWATCHES = [
  { name: 'Default', hex: '' },
  { name: 'Blue',    hex: '#0ea5e9' },
  { name: 'Red',     hex: '#ef4444' },
  { name: 'Green',   hex: '#10b981' },
  { name: 'Amber',   hex: '#f59e0b' },
  { name: 'Purple',  hex: '#a855f7' },
  { name: 'Pink',    hex: '#ec4899' },
  { name: 'Slate',   hex: '#64748b' },
];

const MOUNTING_OPTIONS = [
  { value: 'embedded',     label: '⊙ Embedded (ฝัง)' },
  { value: 'surface',      label: '◯ Surface (ติดผิว)' },
  { value: 'bracket',      label: '⊢ Bracket (ฝั่งฝา)' },
  { value: 'tilt_bracket', label: '△ Tilt Bracket (เอียง)' },
];

const SCENARIOS: { value: ScenarioType; label: string; icon: string }[] = [
  { value: 'entrance',   label: 'Entrance',   icon: '📐' },
  { value: 'passerby',   label: 'Passer-by',  icon: '🚶' },
  { value: 'engagement', label: 'Engagement', icon: '🟥' },
];

// ── Coverage mode default (C1.8) ──
function defaultCoverageMode(s: any): 'rectangle' | 'tilt_projection' {
  return s.mountingType === 'tilt_bracket' ? 'tilt_projection' : 'rectangle';
}

// ── Derived anchor policy (C1.10b) ──
// Pure function of mountingType + coverageMode. No user override.
//   bracket/tilt_bracket + tilt_projection → 'dynamic_tilt'
//   everything else                        → 'center'
function derivedAnchorMode(s: any): 'center' | 'dynamic_tilt' {
  const mode = s.coverageMode ?? defaultCoverageMode(s);
  const isBracket = s.mountingType === 'bracket' || s.mountingType === 'tilt_bracket';
  return (isBracket && mode === 'tilt_projection') ? 'dynamic_tilt' : 'center';
}

export function SensorSettingsPanel({ editor }: Props) {
  const { selectedSensor, updateSensorDebounced, updateSensorImmediate, deleteSensor } = editor;

  // C1.10d#3 — Advanced mode toggle (per-browser, not per-design)
  // localStorage key: 'ditech-designer-advanced-mode' = 'true' | 'false'
  const [advancedMode, setAdvancedMode] = useState<boolean>(() => {
    return localStorage.getItem('ditech-designer-advanced-mode') === 'true';
  });
  const toggleAdvancedMode = () => {
    const next = !advancedMode;
    setAdvancedMode(next);
    localStorage.setItem('ditech-designer-advanced-mode', String(next));
  };

  const camerasQuery = useQuery({
    queryKey: ['camera-models'],
    queryFn: () => cameraModelsApi.list({ isActive: true }),
  });

  const existingObst = (selectedSensor?.obstructionData as any) || {};
  const defaultScenario: ScenarioType =
    selectedSensor?.functionType === 'passerby' ? 'passerby' :
    selectedSensor?.functionType === 'engagement' ? 'engagement' : 'entrance';
  const [scenario, setScenario] = useState<ScenarioType>(existingObst.scenarioType ?? defaultScenario);

  useEffect(() => {
    const obs = (selectedSensor?.obstructionData as any) || {};
    const d: ScenarioType =
      selectedSensor?.functionType === 'passerby' ? 'passerby' :
      selectedSensor?.functionType === 'engagement' ? 'engagement' : 'entrance';
    setScenario(obs.scenarioType ?? d);
  }, [selectedSensor?.id]);

  if (!selectedSensor) {
    return (
      <aside className="w-[420px] border-l border-ditech-border bg-white flex flex-col h-full overflow-hidden">
        <div className="px-3 py-2 border-b border-ditech-border">
          <h3 className="text-sm font-semibold text-ditech-text-muted">No sensor selected</h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-4 text-center text-xs text-ditech-text-subtle">
          Click a sensor on the canvas or in the list to edit its settings.
        </div>
      </aside>
    );
  }

  const s = selectedSensor;
  const fnColors = FUNCTION_COLORS[s.functionType] ?? FUNCTION_COLORS.entrance;
  const isTilt = s.mountingType === 'tilt_bracket';
  const isVionvision = (s.cameraModel?.displayName ?? '').toLowerCase().includes('vion') ||
                       (s.cameraModel?.displayName ?? '').toLowerCase().includes('g6');
  const showObstruction = s.functionType === 'entrance' || s.functionType === 'passerby' ||
                          s.functionType === 'engagement' || (isVionvision && isTilt);

  return (
    <aside className="w-[420px] border-l border-ditech-border bg-white flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-ditech-border flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${fnColors.bgChip}`}>
            {fnColors.icon} {fnColors.enLabel}
          </span>
          <span className="text-sm font-semibold truncate">{s.sensorName}</span>
        </div>
        <button onClick={() => { if (confirm(`Delete ${s.sensorName}?`)) deleteSensor.mutate(s.id); }}
          className="text-xs text-red-600 hover:text-red-700 px-1.5 py-0.5" title="Delete sensor">🗑</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ───────── Camera (merged Identity + Coverage) ───────── */}
        <Section title="Camera Details" icon="📷" defaultOpen={true}>
          <EditableName value={s.sensorName} onSave={(name) => updateSensorImmediate(s.id, { sensorName: name })} />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-ditech-text-muted block mb-0.5">Model</label>
              <select
                value={s.cameraModelId ?? ''}
                onChange={(e) => updateSensorImmediate(s.id, { cameraModelId: e.target.value })}
                className="w-full px-1.5 py-1 text-xs border border-slate-300 rounded bg-white"
                disabled={camerasQuery.isLoading}
              >
                {camerasQuery.isLoading && <option>Loading…</option>}
                {camerasQuery.data?.map((m) => (
                  <option key={m.id} value={m.id}>{m.displayName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-ditech-text-muted block mb-0.5">Function</label>
              <select
                value={s.functionType}
                onChange={(e) => updateSensorImmediate(s.id, { functionType: e.target.value as any })}
                className="w-full px-1.5 py-1 text-xs border border-slate-300 rounded bg-white"
              >
                <option value="entrance">📐 Entrance</option>
                <option value="engagement">🟥 Engagement</option>
                <option value="heatmap">🟪 Heatmap</option>
                <option value="cctv">📹 CCTV</option>
                <option value="passerby">🚶 Passer-by</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[10px] uppercase tracking-wider text-ditech-text-muted">Coverage size (m)</label>
              {/* C1.10d#2 — Always-visible reset. Clears manual override (if any) AND
                  forces backend to recompute from current model + height + tilt + mode. */}
              <button
                onClick={() => updateSensorImmediate(s.id, { coverageOverride: false, recomputeCoverage: true })}
                className="text-[10px] text-blue-600 hover:underline"
                title="Recalculate coverage from selected camera model, mounting height, tilt angle, and coverage mode"
              >
                ↺ Reset to Model Defaults
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <RealtimeNumber
                  value={s.coverageWidth}
                  min={1} max={30} step={0.1}
                  onChange={(v) => updateSensorDebounced(s.id, { coverageWidth: v, coverageOverride: true }, 250)}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-ditech-text-subtle pointer-events-none">W</span>
              </div>
              <div className="relative">
                <RealtimeNumber
                  value={s.coverageDepth}
                  min={1} max={30} step={0.1}
                  onChange={(v) => updateSensorDebounced(s.id, { coverageDepth: v, coverageOverride: true }, 250)}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-ditech-text-subtle pointer-events-none">D</span>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Appearance" icon="🎨" defaultOpen={false}>
          <Row label="Color preset">
            <div className="flex flex-wrap gap-1.5">
              {COLOR_SWATCHES.map((sw) => (
                <button
                  key={sw.name}
                  onClick={() => updateSensorImmediate(s.id, { color: sw.hex || null })}
                  title={sw.name}
                  className={`relative w-7 h-7 rounded border-2 ${
                    (s.color ?? '') === sw.hex
                      ? 'border-blue-500 ring-2 ring-blue-200'
                      : 'border-slate-300 hover:border-slate-400'
                  }`}
                  style={{ background: sw.hex || fnColors.dot }}
                >
                  {!sw.hex && (
                    <span className="absolute inset-0 flex items-center justify-center text-white text-[10px] font-bold">D</span>
                  )}
                </button>
              ))}
            </div>
          </Row>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-ditech-text-muted">Custom:</span>
            <input
              type="color"
              value={s.color || fnColors.dot}
              onChange={(e) => updateSensorDebounced(s.id, { color: e.target.value }, 250)}
              className="w-12 h-7 border border-slate-300 rounded cursor-pointer"
            />
            <button onClick={() => updateSensorImmediate(s.id, { color: null })}
              className="text-[10px] text-ditech-text-muted hover:text-blue-600">↺ Reset</button>
          </div>
        </Section>

        <Section title="Mounting & Orientation" icon="📌" defaultOpen={true}>
          {showObstruction && (
            <Row label="Scenario type">
              <div className="grid grid-cols-3 gap-1">
                {SCENARIOS.map((sc) => (
                  <button key={sc.value}
                    onClick={() => setScenario(sc.value)}
                    className={`px-1 py-1 text-[10px] rounded border transition ${
                      scenario === sc.value
                        ? 'bg-blue-50 border-blue-400 text-blue-700 font-semibold'
                        : 'bg-white border-slate-300 text-ditech-text-muted hover:border-slate-400'
                    }`}>
                    {sc.icon} {sc.label}
                  </button>
                ))}
              </div>
            </Row>
          )}

          {/* Row 1: Mounting type | Mounting height */}
          <div className="grid grid-cols-2 gap-2">
            <Row label="Mounting type">
              <select
                value={s.mountingType}
                onChange={(e) => {
                  const newMount = e.target.value as any;
                  // C1.10 — auto-update coverageMode + anchorMode when mounting changes
                  const newCovMode = newMount === 'tilt_bracket' ? 'tilt_projection' : 'rectangle';
                  const isBracket = newMount === 'bracket' || newMount === 'tilt_bracket';
                  const newAnchor = (isBracket && newCovMode === 'tilt_projection') ? 'dynamic_tilt' : 'center';
                  updateSensorImmediate(s.id, {
                    mountingType: newMount,
                    coverageMode: newCovMode,
                    anchorMode: newAnchor,
                  } as any);
                }}
                className="w-full px-1.5 py-1 text-xs border border-slate-300 rounded bg-white"
              >
                {MOUNTING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Row>

            <Row label="Mounting height (m)">
              <RealtimeNumber
                value={s.mountingHeight}
                min={1.5} max={6.0} step={0.1}
                onChange={(v) => updateSensorDebounced(s.id, { mountingHeight: v }, 250)}
              />
            </Row>
          </div>

          {isTilt && (
            <div className="text-[10px] text-amber-700 italic">
              💡 Trapezoid: near edge shorter than far edge
            </div>
          )}

          {/* Row 1.5: Coverage Mode + Sensor Position (C1.10) */}
          <div className="grid grid-cols-2 gap-2">
            <Row label="Coverage mode">
              <select
                value={(s as any).coverageMode ?? defaultCoverageMode(s)}
                onChange={(e) => {
                  const newMode = e.target.value as any;
                  // C1.10 — auto-update anchor to default for new mode
                  const isBracket = s.mountingType === 'bracket' || s.mountingType === 'tilt_bracket';
                  const newAnchor = (isBracket && newMode === 'tilt_projection') ? 'dynamic_tilt' : 'center';
                  updateSensorImmediate(s.id, {
                    coverageMode: newMode,
                    anchorMode: newAnchor,
                  } as any);
                }}
                className="w-full px-1.5 py-1 text-xs border border-slate-300 rounded bg-white"
              >
                <option value="rectangle">▭ Top View Rectangle</option>
                <option value="tilt_projection">△ Tilt Projection</option>
              </select>
            </Row>

            <Row label="Sensor position">
              {/* C1.10b — read-only badge derived from mounting + coverage mode */}
              {(() => {
                const policy = derivedAnchorMode(s);
                const isDynamic = policy === 'dynamic_tilt';
                return (
                  <div className={`w-full px-1.5 py-1 text-[11px] rounded border flex items-center gap-1.5 ${
                    isDynamic
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-sky-50 border-sky-200 text-sky-800'
                  }`}>
                    <span>{isDynamic ? '📐' : '⊙'}</span>
                    <span className="font-medium">
                      {isDynamic ? 'Dynamic by tilt' : 'Center of coverage'}
                    </span>
                  </div>
                );
              })()}
            </Row>
          </div>

          {/* Helper text per policy (C1.10b) */}
          <div className="text-[10px] text-slate-600 italic px-1 -mt-1">
            {derivedAnchorMode(s) === 'dynamic_tilt'
              ? '📐 Sensor position shifts from center toward the near edge as tilt angle increases.'
              : '⊙ Sensor placed at the center of the coverage area.'}
          </div>

          {/* C1.10d#3 — Advanced ratio override (per-browser toggle, tilt_projection only) */}
          <div className="border-t border-slate-200 pt-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] uppercase tracking-wider text-ditech-text-muted">
                Coverage detail
              </label>
              <div className="flex gap-0 text-[10px] border border-slate-300 rounded overflow-hidden">
                <button
                  onClick={() => { if (advancedMode) toggleAdvancedMode(); }}
                  className={`px-2 py-0.5 ${!advancedMode ? 'bg-blue-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  Basic
                </button>
                <button
                  onClick={() => { if (!advancedMode) toggleAdvancedMode(); }}
                  className={`px-2 py-0.5 border-l border-slate-300 ${advancedMode ? 'bg-blue-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  Advanced
                </button>
              </div>
            </div>

            {advancedMode && ((s as any).coverageMode ?? defaultCoverageMode(s)) !== 'tilt_projection' && (
              <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 italic">
                ⚠️ Manual ratio override is available only in <strong>Tilt Projection</strong> mode.
                Switch coverage mode above to use it.
              </div>
            )}

            {advancedMode && ((s as any).coverageMode ?? defaultCoverageMode(s)) === 'tilt_projection' && (
              <div className="space-y-1.5">
                {/* Override toggle */}
                <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                  <input
                    type="checkbox"
                    checked={(s as any).ratioOverride === true}
                    onChange={(e) => updateSensorImmediate(s.id, { ratioOverride: e.target.checked } as any)}
                    className="w-3 h-3"
                  />
                  <span className="font-medium">Override ratios manually</span>
                </label>

                {/* Status badge */}
                <div className={`text-[10px] px-1.5 py-0.5 rounded inline-block ${
                  (s as any).ratioOverride === true
                    ? 'bg-orange-100 text-orange-800 border border-orange-300'
                    : 'bg-sky-100 text-sky-800 border border-sky-300'
                }`}>
                  {(s as any).ratioOverride === true
                    ? '🔧 Manual override active'
                    : '↻ Auto from tilt angle'}
                </div>

                {/* Ratio inputs — only shown when override is ON */}
                {(s as any).ratioOverride === true && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Row label="Far width ×">
                      <RealtimeNumber
                        value={(s as any).farWidthRatio ?? 1.0}
                        min={0.1} max={3.0} step={0.05}
                        onChange={(v) => updateSensorDebounced(s.id, { farWidthRatio: v } as any, 250)}
                      />
                    </Row>
                    <Row label="Depth ×">
                      <RealtimeNumber
                        value={(s as any).depthRatio ?? 1.0}
                        min={0.1} max={3.5} step={0.05}
                        onChange={(v) => updateSensorDebounced(s.id, { depthRatio: v } as any, 250)}
                      />
                    </Row>
                  </div>
                )}

                {/* Hint when override is on but values are still default */}
                {(s as any).ratioOverride === true
                  && ((s as any).farWidthRatio == null || (s as any).depthRatio == null) && (
                  <div className="text-[10px] text-slate-600 italic">
                    💡 Ratios default to 1.0 (no effect). Adjust above to override the tilt lookup.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Display toggles */}
          <div className="flex items-center gap-3 text-[10px]">
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox"
                checked={(s as any).showLabels ?? true}
                onChange={(e) => updateSensorImmediate(s.id, { showLabels: e.target.checked })}
                className="w-3 h-3" />
              <span>Show labels</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox"
                checked={(s as any).showDimensions ?? true}
                onChange={(e) => updateSensorImmediate(s.id, { showDimensions: e.target.checked })}
                className="w-3 h-3" />
              <span>Show dimensions</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox"
                checked={(s as any).showDirectionArrow ?? true}
                onChange={(e) => updateSensorImmediate(s.id, { showDirectionArrow: e.target.checked })}
                className="w-3 h-3" />
              <span>Direction arrow</span>
            </label>
          </div>

          {/* Row 2: Yaw | Tilt */}
          <div className="grid grid-cols-2 gap-2">
            <Row label="Yaw / Rotation (°)">
              <div className="flex items-center gap-1">
                <input
                  type="range" min={0} max={360} step={1}
                  value={s.rotation}
                  onChange={(e) => updateSensorDebounced(s.id, { rotation: parseFloat(e.target.value) }, 100)}
                  className="flex-1 min-w-0"
                />
                <RealtimeNumber
                  value={s.rotation}
                  min={0} max={360} step={1}
                  onChange={(v) => updateSensorDebounced(s.id, { rotation: v }, 200)}
                  className="w-12"
                />
              </div>
            </Row>

            <Row label="Tilt angle (°)">
              <div className="flex items-center gap-1">
                <input
                  type="range" min={0} max={45} step={1}
                  value={s.tiltAngle ?? 0}
                  onChange={(e) => updateSensorDebounced(s.id, { tiltAngle: parseFloat(e.target.value) }, 150)}
                  className="flex-1 min-w-0"
                />
                <RealtimeNumber
                  value={s.tiltAngle ?? 0}
                  min={0} max={45} step={1}
                  onChange={(v) => updateSensorDebounced(s.id, { tiltAngle: v }, 200)}
                  className="w-12"
                />
              </div>
            </Row>
          </div>

          {/* C1.10.1 — Hint about how tilt is used in current mode */}
          {((s as any).coverageMode ?? defaultCoverageMode(s)) === 'rectangle' && (s.tiltAngle ?? 0) > 0 && (
            <div className="text-[10px] text-slate-500 italic px-1 -mt-1">
              ℹ️ Tilt angle is recorded but doesn't change Top View Rectangle shape.
              Switch to Tilt Projection to see the effect.
            </div>
          )}

          {/* C1.9 — Live coverage preview for tilt projection */}
          {((s as any).coverageMode ?? defaultCoverageMode(s)) === 'tilt_projection' && (
            <div className="mt-1 p-2 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-900 space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Estimated tilted coverage:</span>
                <span className="font-mono">{(s.tiltAngle ?? 0).toFixed(0)}°</span>
              </div>
              <div className="flex justify-between font-mono">
                <span>Near: {(s.coverageWidth * (s.nearEdgeRatio ?? 1)).toFixed(1)}m</span>
                <span>Far: {s.coverageWidth.toFixed(1)}m</span>
                <span>Depth: {s.coverageDepth.toFixed(1)}m</span>
              </div>
              <div className="text-[9px] text-amber-700 italic mt-0.5">
                Based on G5/G6 spec + tilt projection ratio. Verify onsite.
              </div>
            </div>
          )}

          {/* Row 3: Trapezoid ratio | Position X/Y */}
          <div className="grid grid-cols-2 gap-2">
            <Row label="Trapezoid near/far ratio">
              {isTilt ? (
                <>
                  <div className="flex items-center gap-1">
                    <input
                      type="range" min={0.1} max={1.0} step={0.01}
                      value={s.nearEdgeRatio ?? 0.47}
                      onChange={(e) => updateSensorDebounced(s.id, { nearEdgeRatio: parseFloat(e.target.value) }, 100)}
                      className="flex-1 min-w-0"
                    />
                    <span className="text-[11px] font-mono text-ditech-text-muted w-9 text-right">
                      {((s.nearEdgeRatio ?? 0.47) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-[10px] text-ditech-text-subtle mt-0.5">
                    Default 47% (Vionvision G6: 4.5/9.5m)
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-ditech-text-subtle italic px-1 py-1">
                  Only for Tilt Bracket
                </div>
              )}
            </Row>

            <Row label="Position (X, Y)">
              <div className="flex items-center gap-1">
                <RealtimeNumber
                  value={s.x}
                  min={0} max={10000} step={1}
                  onChange={(v) => updateSensorDebounced(s.id, { x: v }, 200)}
                  className="flex-1 min-w-0"
                />
                <span className="text-[10px] text-ditech-text-muted">,</span>
                <RealtimeNumber
                  value={s.y}
                  min={0} max={10000} step={1}
                  onChange={(v) => updateSensorDebounced(s.id, { y: v }, 200)}
                  className="flex-1 min-w-0"
                />
              </div>
              <div className="text-[10px] text-ditech-text-subtle mt-0.5">
                Drag canvas or <kbd className="px-1 bg-slate-100 border border-slate-300 rounded">←↑↓→</kbd>
              </div>
            </Row>
          </div>
        </Section>

        {showObstruction && (
          <Section title="Obstruction Check" icon="🚧" defaultOpen={true}>
            <ObstructionPanel
              sensor={s}
              scenarioType={scenario}
              ceilingHeight={(editor.design as any)?.ceilingHeight ?? s.mountingHeight + 0.5}
              onChange={(data) => updateSensorDebounced(s.id, { obstructionData: data }, 300)}
              onChangeTilt={(t) => updateSensorDebounced(s.id, { tiltAngle: t }, 100)}
            />
          </Section>
        )}
      </div>
    </aside>
  );
}

function Section({ title, icon, defaultOpen, children }:
  { title: string; icon: string; defaultOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-100">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 transition-colors"
      >
        <span className="text-xs uppercase tracking-wider text-ditech-text font-bold flex items-center gap-1.5">
          <span>{icon}</span>
          <span>{title}</span>
        </span>
        <span className={`text-xs text-ditech-text-muted transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && <div className="px-3 pb-3 pt-1 space-y-2.5">{children}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-ditech-text-muted block mb-0.5">{label}</label>
      {children}
    </div>
  );
}

function EditableName({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(value);

  useEffect(() => { setInput(value); }, [value]);

  const commit = () => {
    const v = input.trim();
    if (v && v !== value) onSave(v);
    else setInput(value);
    setEditing(false);
  };

  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-ditech-text-muted block mb-0.5">Name</label>
      {editing ? (
        <input
          autoFocus value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setInput(value); setEditing(false); }
          }}
          className="w-full px-2 py-1 text-sm border border-blue-300 rounded outline-none font-semibold"
        />
      ) : (
        <button onClick={() => setEditing(true)}
          className="w-full text-left px-2 py-1 text-sm font-semibold hover:bg-slate-50 rounded border border-transparent hover:border-slate-200">
          {value} <span className="text-[10px] text-ditech-text-muted font-normal ml-1">✏️</span>
        </button>
      )}
    </div>
  );
}

function RealtimeNumber({ value, min, max, step, onChange, className = '' }:
  { value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void; className?: string }) {
  const [input, setInput] = useState(String(value));
  const lastValueRef = useRef(value);

  useEffect(() => {
    if (value !== lastValueRef.current) {
      setInput(String(value));
      lastValueRef.current = value;
    }
  }, [value]);

  const handleChange = (raw: string) => {
    setInput(raw);
    const n = parseFloat(raw);
    if (!isNaN(n)) {
      lastValueRef.current = n;
      onChange(n);
    }
  };

  return (
    <input
      type="number" value={input} min={min} max={max} step={step}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={() => { if (isNaN(parseFloat(input))) setInput(String(value)); }}
      className={`px-2 py-1 text-xs border border-slate-300 rounded font-mono ${className || 'w-full'}`}
    />
  );
}
