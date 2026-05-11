import { useState, useEffect } from 'react';
import type { SensorPlacement } from '../../api/designs';

interface Props {
  sensor: SensorPlacement;
  scenarioType: ScenarioType;
  ceilingHeight?: number;
  onChange: (data: any) => void;
  onChangeTilt?: (tilt: number) => void;
}

export type ScenarioType = 'entrance' | 'passerby' | 'engagement';

type Mode = 'basic' | 'advanced';
type View = 'side' | 'top';
type ObstructionKind = 'door_header' | 'logo' | 'signage' | 'beam' | 'bulkhead';

const OBSTRUCTION_KINDS: { value: ObstructionKind; label: string; emoji: string }[] = [
  { value: 'door_header', label: 'Door header', emoji: '🚪' },
  { value: 'logo',        label: 'Logo',        emoji: '🅻' },
  { value: 'signage',     label: 'Signage',     emoji: '🪧' },
  { value: 'beam',        label: 'Beam',        emoji: '➖' },
  { value: 'bulkhead',    label: 'Bulkhead',    emoji: '⬛' },
];

interface ObstructionData {
  cameraDistFromDoor: number;
  cameraTilt: number;
  hasHangingObstr: boolean;
  obstructionKind: ObstructionKind;
  hangingDrop: number;
  targetDistOutsideDoor: number;
  targetHeight: number;
  safetyMargin: number;
  scenarioType: ScenarioType;
  doorWidth?: number;
  countZoneStart?: number;
  countZoneDepth?: number;
  hasFloorObstacle?: boolean;
  floorObstacleLabel?: string;
  floorObstacleDistance?: number;
  floorObstacleHeight?: number;
  walkingDirection?: 'left_to_right' | 'right_to_left' | 'both';
  insideCoverageFromDoor?: number;
  outsideCoverageFromDoor?: number;
  result?: 'PASS' | 'WARN' | 'BLOCKED';
  resultDetail?: string;
  lineHeightAtObstruction?: number;
  clearanceMargin?: number;
  minRequiredDistance?: number;
  suggestedDistance?: number;
  warnings?: string[];
}

export function ObstructionPanel({ sensor, scenarioType, ceilingHeight, onChange, onChangeTilt }: Props) {
  const existing = (sensor.obstructionData as ObstructionData | null) || ({} as ObstructionData);

  const [mode, setMode] = useState<Mode>('basic');
  const [view, setView] = useState<View>('side');

  const [camDistFromDoor, setCamDistFromDoor] = useState<string>(String(existing.cameraDistFromDoor ?? 1.2));
  // Local tilt state - syncs to sensor.tiltAngle via onChangeTilt callback
  const initialTilt = existing.cameraTilt ?? sensor.tiltAngle ?? 0;
  const [tilt, setTilt] = useState<number>(initialTilt);

  const [hasHanging, setHasHanging] = useState<boolean>(existing.hasHangingObstr ?? true);
  const [obstrKind, setObstrKind] = useState<ObstructionKind>(existing.obstructionKind ?? 'door_header');
  const [hangingDrop, setHangingDrop] = useState<string>(String(existing.hangingDrop ?? 0.5));
  const [targetDist, setTargetDist] = useState<string>(String(existing.targetDistOutsideDoor ?? 3.0));
  const [targetHeight, setTargetHeight] = useState<string>(String(existing.targetHeight ?? 1.5));
  const [safetyMargin, setSafetyMargin] = useState<string>(String(existing.safetyMargin ?? 0.2));

  const [doorWidth, setDoorWidth] = useState<string>(String(existing.doorWidth ?? 1.2));
  const [countZoneStart, setCountZoneStart] = useState<string>(String(existing.countZoneStart ?? 0));
  const [countZoneDepth, setCountZoneDepth] = useState<string>(String(existing.countZoneDepth ?? 1.5));
  const [hasFloor, setHasFloor] = useState<boolean>(existing.hasFloorObstacle ?? false);
  const [floorLabel, setFloorLabel] = useState<string>(existing.floorObstacleLabel ?? 'Counter');
  const [floorDist, setFloorDist] = useState<string>(String(existing.floorObstacleDistance ?? 2.0));
  const [floorH, setFloorH] = useState<string>(String(existing.floorObstacleHeight ?? 1.0));
  const [walkDir, setWalkDir] = useState<'left_to_right' | 'right_to_left' | 'both'>(existing.walkingDirection ?? 'both');

  // Sync tilt back to sensor when changed locally
  useEffect(() => {
    if (onChangeTilt && tilt !== (sensor.tiltAngle ?? 0)) {
      onChangeTilt(tilt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tilt]);

  // ── Read from sensor ──
  const Hc = sensor.mountingHeight;
  const Ch = ceilingHeight ?? (Hc + 0.5);
  const totalCoverageRange = sensor.coverageDepth;
  const coverageWidth = sensor.coverageWidth;

  // ── Tilt-driven coverage split at door ──
  const tiltRad = (tilt * Math.PI) / 180;
  const halfRange = totalCoverageRange / 2;
  const centerShift = Hc * Math.tan(tiltRad);
  const nearEdgeFromCam = centerShift - halfRange;
  const farEdgeFromCam = centerShift + halfRange;

  const D  = parseFloat(camDistFromDoor) || 0;
  const dropRaw = parseFloat(hangingDrop) || 0;
  const drop = Math.min(dropRaw, Ch - 0.1);
  const Ho = Math.max(0, Ch - drop);
  const L  = parseFloat(targetDist) || 0;
  const Ht = parseFloat(targetHeight) || 0;
  const M  = parseFloat(safetyMargin) || 0;

  const insideFromDoor = Math.max(0, D - nearEdgeFromCam);
  const outsideFromDoor = Math.max(0, farEdgeFromCam - D);

  const lineH = hasHanging && (D + L) > 0 ? Hc - ((Hc - Ht) * D / (D + L)) : Hc;

  let result: 'PASS' | 'WARN' | 'BLOCKED' = 'PASS';
  let resultDetail = 'No hanging obstruction enabled.';
  const clearance = Ho - lineH;
  const warnings: string[] = [];

  if (dropRaw > Ch) {
    warnings.push(`Drop (${dropRaw}m) > ceiling (${Ch.toFixed(2)}m). Clamped to ${drop.toFixed(2)}m.`);
  }

  if (hasHanging) {
    if (Ho < Ht) {
      result = 'BLOCKED';
      resultDetail = `Obstruction at ${Ho.toFixed(2)}m is below target head (${Ht}m) — physically blocks all sight to target.`;
    } else if (lineH > Ho) {
      result = 'BLOCKED';
      const k = OBSTRUCTION_KINDS.find(x => x.value === obstrKind);
      resultDetail = `Line of sight (${lineH.toFixed(2)}m) blocked by ${k?.emoji} ${k?.label} at ${Ho.toFixed(2)}m`;
    } else if (lineH > Ho - M) {
      result = 'WARN';
      resultDetail = `Within safety margin (clearance ${clearance.toFixed(2)}m < ${M.toFixed(2)}m)`;
    } else {
      result = 'PASS';
      resultDetail = `Line of sight clears obstruction. Clearance ${clearance.toFixed(2)}m`;
    }
  }

  if (mode === 'advanced' && hasFloor) {
    const fD = parseFloat(floorDist) || 0;
    const fH = parseFloat(floorH) || 0;
    const lineAtFloor = Hc - ((Hc - Ht) * fD / Math.max(fD + L, 0.01));
    if (fH >= lineAtFloor) {
      if (result === 'PASS') result = 'BLOCKED';
      resultDetail += ` · ${floorLabel} ${fH.toFixed(1)}m blocks sight at ${fD.toFixed(1)}m`;
    } else if (fH >= lineAtFloor - M) {
      if (result === 'PASS') result = 'WARN';
      resultDetail += ` · ${floorLabel} close to sight line`;
    }
  }

  let Dmin: number | null = null;
  let canCompute = false;
  if (hasHanging && Ho >= Ht + M) {
    if (Hc <= Ho - M) {
      Dmin = 0; canCompute = true;
    } else {
      const A = Hc - (Ho - M);
      const denom = (Ho - M) - Ht;
      if (denom > 0.001 && A > 0) {
        Dmin = (A * L) / denom; canCompute = true;
      }
    }
  }
  const suggestedD = hasHanging && canCompute && Dmin != null ? Math.max(Dmin + 0.1, 0.3) : null;

  useEffect(() => {
    const data: ObstructionData = {
      cameraDistFromDoor: D,
      cameraTilt: tilt,
      hasHangingObstr: hasHanging,
      obstructionKind: obstrKind,
      hangingDrop: drop,
      targetDistOutsideDoor: L,
      targetHeight: Ht,
      safetyMargin: M,
      scenarioType,
      doorWidth: parseFloat(doorWidth) || 0,
      countZoneStart: parseFloat(countZoneStart) || 0,
      countZoneDepth: parseFloat(countZoneDepth) || 0,
      hasFloorObstacle: hasFloor,
      floorObstacleLabel: floorLabel,
      floorObstacleDistance: parseFloat(floorDist) || 0,
      floorObstacleHeight: parseFloat(floorH) || 0,
      walkingDirection: walkDir,
      insideCoverageFromDoor: insideFromDoor,
      outsideCoverageFromDoor: outsideFromDoor,
      result, resultDetail,
      lineHeightAtObstruction: lineH,
      clearanceMargin: clearance,
      minRequiredDistance: Dmin ?? undefined,
      suggestedDistance: suggestedD ?? undefined,
      warnings,
    };
    onChange(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [D, tilt, hasHanging, obstrKind, drop, L, Ht, M,
      doorWidth, countZoneStart, countZoneDepth,
      hasFloor, floorLabel, floorDist, floorH, walkDir, scenarioType,
      Hc, Ch, totalCoverageRange]);

  return (
    <div className="space-y-2.5">
      {/* Mode tabs */}
      <div className="inline-flex bg-slate-100 rounded p-0.5 w-full">
        <button onClick={() => setMode('basic')}
          className={`flex-1 px-2.5 py-1 text-xs rounded ${mode === 'basic' ? 'bg-white shadow font-semibold text-blue-700' : 'text-ditech-text-muted'}`}>
          🔹 Basic
        </button>
        <button onClick={() => setMode('advanced')}
          className={`flex-1 px-2.5 py-1 text-xs rounded ${mode === 'advanced' ? 'bg-white shadow font-semibold text-blue-700' : 'text-ditech-text-muted'}`}>
          ⚙️ Advanced
        </button>
      </div>

      {/* Sensor read-only info */}
      <div className="bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-[11px] space-y-1">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <span className="text-ditech-text-muted">Cam H:</span>{' '}
            <span className="font-mono font-semibold">{Hc.toFixed(2)}m</span>
          </div>
          <div>
            <span className="text-ditech-text-muted">Ceiling:</span>{' '}
            <span className="font-mono font-semibold">{Ch.toFixed(2)}m</span>
          </div>
          <div>
            <span className="text-ditech-text-muted">Range:</span>{' '}
            <span className="font-mono font-semibold">{totalCoverageRange.toFixed(1)}×{coverageWidth.toFixed(1)}m</span>
          </div>
        </div>
        <div className="text-[10px] text-ditech-text-subtle italic">
          ↑ from Mounting section. Tilt is below ↓
        </div>
      </div>

      {/* ─── 3-column horizontal grid for main basic groups ─── */}
      <div className="grid grid-cols-3 gap-2">
        {/* 1. Camera Setup */}
        <CollapsibleGroup title="1. Camera Setup" defaultOpen={true}>
          <Field
            label="Distance from door (m)"
            value={camDistFromDoor}
            onChange={setCamDistFromDoor}
            step="0.1"
            hint="How far camera is INSIDE the door"
          />
          <Field
            label="Inside coverage (m)"
            value={insideFromDoor.toFixed(2)}
            onChange={() => {}}
            readOnly
            hint="From door going into store (auto from tilt)"
          />

          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[10px] text-ditech-text-muted">Tilt (outward)</label>
              <span className="text-[10px] font-mono font-semibold">{tilt}°</span>
            </div>
            <input type="range" min={0} max={60} step={1} value={tilt}
              onChange={(e) => setTilt(parseInt(e.target.value))}
              className="w-full" />
            <div className="flex justify-between text-[8px] text-ditech-text-muted mt-0.5">
              <span>⬇</span><span>↗</span>
            </div>
          </div>
        </CollapsibleGroup>

        {/* 2. Obstruction */}
        <CollapsibleGroup title="2. Obstruction" defaultOpen={true}>
          <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
            <input type="checkbox" checked={hasHanging} onChange={(e) => setHasHanging(e.target.checked)}
              className="w-3 h-3" />
            <span className="font-medium">Enable</span>
          </label>
          {hasHanging && (
            <>
              <div>
                <label className="text-[10px] text-ditech-text-muted block mb-0.5">Type</label>
                <select value={obstrKind} onChange={(e) => setObstrKind(e.target.value as ObstructionKind)}
                  className="w-full px-1 py-1 text-[11px] border border-slate-300 rounded bg-white">
                  {OBSTRUCTION_KINDS.map((k) => <option key={k.value} value={k.value}>{k.emoji} {k.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-ditech-text-muted block mb-0.5">Drop (m)</label>
                <input type="number" step="0.1" min="0" max={Ch.toFixed(2)} value={hangingDrop}
                  onChange={(e) => setHangingDrop(e.target.value)}
                  className={`w-full px-1.5 py-1 text-xs border rounded font-mono ${
                    dropRaw > Ch ? 'border-red-400 bg-red-50' : 'border-slate-300'
                  }`} />
                <div className="text-[9px] text-ditech-text-muted mt-0.5">
                  Clear: <span className="font-semibold">{Ho.toFixed(2)}m</span>
                </div>
              </div>

              {dropRaw > Ch && (
                <div className="bg-red-50 border border-red-300 text-red-800 text-[10px] px-1.5 py-1 rounded">
                  ⚠ Drop exceeds ceiling. Clamped to {drop.toFixed(2)}m.
                </div>
              )}
            </>
          )}
        </CollapsibleGroup>

        {/* 3. Target Area */}
        <CollapsibleGroup title="3. Target Area" defaultOpen={true}>
          <Field label="Target dist (m)" value={targetDist} onChange={setTargetDist} step="0.1"
            hint="How far OUTSIDE door target stands" />
          <Field label="Target H (m)" value={targetHeight} onChange={setTargetHeight} step="0.05"
            hint="Person height" />
          <Field label="Safety margin (m)" value={safetyMargin} onChange={setSafetyMargin} step="0.05" />
        </CollapsibleGroup>
      </div>

      {mode === 'advanced' && (
        <>
          <CollapsibleGroup title="4. Door & Count Zone" defaultOpen={false}>
            <Field label="Door width (m)" value={doorWidth} onChange={setDoorWidth} step="0.1" />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Count zone start (m)" value={countZoneStart} onChange={setCountZoneStart} step="0.1"
                hint="0 = at door, +ve = further outside" />
              <Field label="Count zone depth (m)" value={countZoneDepth} onChange={setCountZoneDepth} step="0.1" />
            </div>
            {scenarioType === 'passerby' && (
              <div>
                <label className="text-[10px] text-ditech-text-muted block mb-0.5">Walking direction</label>
                <select value={walkDir} onChange={(e) => setWalkDir(e.target.value as any)}
                  className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white">
                  <option value="left_to_right">→ Left to right</option>
                  <option value="right_to_left">← Right to left</option>
                  <option value="both">⇄ Both</option>
                </select>
              </div>
            )}
          </CollapsibleGroup>

          <CollapsibleGroup title="5. Floor Obstacle" defaultOpen={false}>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={hasFloor} onChange={(e) => setHasFloor(e.target.checked)}
                className="w-3.5 h-3.5" />
              <span className="font-medium">Floor obstacle (counter, shelf, furniture)</span>
            </label>
            {hasFloor && (
              <>
                <div>
                  <label className="text-[10px] text-ditech-text-muted block mb-0.5">Label</label>
                  <input type="text" value={floorLabel} onChange={(e) => setFloorLabel(e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-slate-300 rounded" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Distance (m)" value={floorDist} onChange={setFloorDist} step="0.1" />
                  <Field label="Height (m)" value={floorH} onChange={setFloorH} step="0.1" />
                </div>
              </>
            )}
          </CollapsibleGroup>
        </>
      )}

      {/* View toggle */}
      <div className="inline-flex bg-slate-100 rounded p-0.5">
        <button onClick={() => setView('side')}
          className={`px-2.5 py-1 text-[11px] rounded ${view === 'side' ? 'bg-white shadow font-semibold' : 'text-ditech-text-muted'}`}>
          📐 Side view
        </button>
        <button onClick={() => setView('top')}
          className={`px-2.5 py-1 text-[11px] rounded ${view === 'top' ? 'bg-white shadow font-semibold' : 'text-ditech-text-muted'}`}>
          🗺 Top view
        </button>
      </div>

      {view === 'side' ? (
        <SideDiagram
          Hc={Hc} Ch={Ch} Ho={Ho} D={D} L={L} Ht={Ht} M={M} tilt={tilt}
          nearEdge={nearEdgeFromCam} farEdge={farEdgeFromCam}
          insideFromDoor={insideFromDoor} outsideFromDoor={outsideFromDoor}
          hasHanging={hasHanging} obstrKind={obstrKind}
          hasFloor={mode === 'advanced' && hasFloor}
          floorDist={parseFloat(floorDist) || 0} floorH={parseFloat(floorH) || 0} floorLabel={floorLabel}
          countStart={mode === 'advanced' ? parseFloat(countZoneStart) || 0 : 0}
          countDepth={mode === 'advanced' ? parseFloat(countZoneDepth) || 0 : 0}
          lineH={lineH} result={result}
        />
      ) : (
        <TopDiagram
          D={D} L={L} tilt={tilt}
          doorW={parseFloat(doorWidth) || 1.2}
          coverageWidth={coverageWidth}
          insideFromDoor={insideFromDoor} outsideFromDoor={outsideFromDoor}
          walkDir={walkDir} scenario={scenarioType}
          countStart={parseFloat(countZoneStart) || 0}
          countDepth={parseFloat(countZoneDepth) || 0}
          result={result}
        />
      )}

      {/* ─── Coverage & Recommendation (3 summary cards side-by-side) ─── */}
      <CollapsibleGroup title="Coverage & Recommendation" defaultOpen={true}>
        <div className="grid grid-cols-3 gap-2">
          {/* Inside coverage */}
          <div className="bg-sky-50 border border-sky-200 rounded px-2 py-2">
            <div className="text-[9px] text-sky-700 uppercase tracking-wider font-semibold">📥 Inside (from door)</div>
            <div className="font-mono font-bold text-sky-900 text-lg leading-tight mt-0.5">
              {insideFromDoor.toFixed(2)} <span className="text-xs font-normal">m</span>
            </div>
            <div className="text-[9px] text-sky-700 mt-0.5">into the store</div>
          </div>

          {/* Outside coverage */}
          <div className="bg-emerald-50 border border-emerald-200 rounded px-2 py-2">
            <div className="text-[9px] text-emerald-700 uppercase tracking-wider font-semibold">📤 Outside (from door)</div>
            <div className="font-mono font-bold text-emerald-900 text-lg leading-tight mt-0.5">
              {outsideFromDoor.toFixed(2)} <span className="text-xs font-normal">m</span>
            </div>
            <div className="text-[9px] text-emerald-700 mt-0.5">in front of door</div>
          </div>

          {/* Suggested distance */}
          <div className={`border-2 rounded px-2 py-2 ${
            !hasHanging ? 'bg-slate-50 border-slate-200' :
            suggestedD == null ? 'bg-slate-50 border-slate-200' :
            D >= suggestedD ? 'bg-emerald-50 border-emerald-300' :
            'bg-amber-50 border-amber-300'
          }`}>
            <div className="text-[9px] uppercase tracking-wider font-semibold text-ditech-text-muted">💡 Suggested distance</div>
            {!hasHanging ? (
              <div className="text-[11px] text-ditech-text-muted mt-1">No obstruction.<br/>Any distance works.</div>
            ) : Ho < Ht + M ? (
              <div className="text-[10px] text-red-700 mt-1">Obstr too low.<br/>Cannot clear sight line.</div>
            ) : Hc <= Ho - M ? (
              <div className="text-[10px] text-emerald-700 mt-1">Cam below obstr.<br/>Any distance ✓</div>
            ) : suggestedD == null ? (
              <div className="text-[10px] text-ditech-text-muted mt-1">Cannot compute.</div>
            ) : (
              <>
                <div className="font-mono font-bold text-lg leading-tight mt-0.5">
                  {suggestedD.toFixed(2)} <span className="text-xs font-normal">m</span>
                </div>
                {D >= suggestedD ? (
                  <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                    ✓ current {D.toFixed(2)}m OK
                  </div>
                ) : (
                  <div className="text-[10px] text-amber-700 font-semibold mt-0.5">
                    ⚠ move inward {(suggestedD - D).toFixed(2)}m
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Coverage helper text */}
        <div className="text-[10px] text-ditech-text-subtle italic">
          {tilt === 0
            ? `Tilt 0° → symmetric coverage centered on camera.`
            : `Tilt ${tilt}° → coverage center shifted ${centerShift.toFixed(2)}m forward (outward).`}
          {' '}Total range {totalCoverageRange.toFixed(1)}m × {coverageWidth.toFixed(1)}m.
        </div>
      </CollapsibleGroup>

      <div className={`px-3 py-2.5 rounded border-2 ${
        result === 'PASS' ? 'bg-emerald-50 border-emerald-400 text-emerald-800' :
        result === 'WARN' ? 'bg-amber-50 border-amber-400 text-amber-800' :
        'bg-red-50 border-red-400 text-red-800'
      }`}>
        <div className="text-base font-bold mb-0.5">
          {result === 'PASS' ? '✓ PASS' : result === 'WARN' ? '⚠ WARNING' : '✗ BLOCKED'}
        </div>
        <div className="text-xs">{resultDetail}</div>

        {hasHanging && (
          <div className="mt-2 pt-2 border-t border-current/20 space-y-0.5 text-xs">
            <div className="flex justify-between font-mono">
              <span>Line height at obstruction:</span>
              <span className="font-semibold">{lineH.toFixed(2)} m</span>
            </div>
            <div className="flex justify-between font-mono">
              <span>Clear height under:</span>
              <span className="font-semibold">{Ho.toFixed(2)} m</span>
            </div>
            <div className="flex justify-between font-mono">
              <span>Clearance margin:</span>
              <span className={`font-semibold ${clearance < M ? 'text-red-700' : ''}`}>
                {clearance >= 0 ? '+' : ''}{clearance.toFixed(2)} m
              </span>
            </div>
            {Dmin != null && (
              <div className="flex justify-between font-mono">
                <span>Min required distance:</span>
                <span className="font-semibold">{Math.max(Dmin, 0).toFixed(2)} m</span>
              </div>
            )}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mt-2 pt-2 border-t border-current/20 text-xs space-y-0.5">
            {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Collapsible group ──
function CollapsibleGroup({ title, icon, defaultOpen = true, children }:
  { title: string; icon?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded bg-white overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-slate-50 transition-colors"
      >
        <span className="text-[10px] uppercase tracking-wider text-ditech-text font-bold whitespace-nowrap">
          {icon && <span className="mr-1">{icon}</span>}
          {title}
        </span>
        <span className={`text-xs text-ditech-text-muted transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && <div className="px-2 pb-2 pt-1 space-y-2">{children}</div>}
    </div>
  );
}

function Field({ label, value, onChange, step = '0.1', hint, readOnly = false }:
  { label: string; value: string; onChange: (v: string) => void; step?: string; hint?: string; readOnly?: boolean }) {
  return (
    <div>
      <label className="text-[10px] text-ditech-text-muted flex items-center gap-1 mb-0.5" title={hint}>
        <span>{label}</span>
        {hint && <span className="text-slate-400 text-[9px]">ⓘ</span>}
      </label>
      <input type="number" step={step} min="0" value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        className={`w-full px-1.5 py-1 text-xs border border-slate-300 rounded font-mono ${readOnly ? 'bg-slate-50 cursor-not-allowed text-ditech-text-muted' : ''}`} />
    </div>
  );
}

// ════════════════════════════════════════════════
// SIDE VIEW (camera left, door right, stick-figure target)
// ════════════════════════════════════════════════
function SideDiagram({
  Hc, Ch, Ho, D, L, Ht, M, tilt,
  nearEdge, farEdge,
  insideFromDoor, outsideFromDoor,
  hasHanging, obstrKind,
  hasFloor, floorDist, floorH, floorLabel,
  countStart, countDepth, lineH, result,
}: any) {
  const SVG_W = 540;
  const SVG_H = 270;
  const FLOOR_Y = 235;
  const CEILING_Y = 22;

  const V_RANGE = Math.max(Ch, Hc + 0.5, 4);
  const VPX = (FLOOR_Y - CEILING_Y) / V_RANGE;

  const rightRange = Math.max(L, outsideFromDoor) + 0.5;
  const leftRange = Math.max(insideFromDoor, D + 1);
  const totalRangeH = leftRange + rightRange;
  const HPX = (SVG_W - 50) / totalRangeH;

  const DOOR_X = 25 + leftRange * HPX;
  const CAM_X = DOOR_X - D * HPX;
  const TARGET_X = DOOR_X + L * HPX;
  const NEAR_EDGE_X = CAM_X + nearEdge * HPX;
  const FAR_EDGE_X = CAM_X + farEdge * HPX;

  const yFromFloor = (h: number) => FLOOR_Y - h * VPX;
  const camY = yFromFloor(Hc);
  const ceilY = yFromFloor(Ch);
  const targetHeadY = yFromFloor(Ht);
  const obstrBottomY = yFromFloor(Ho);
  const lineHeightY = yFromFloor(lineH);

  const resultColor = result === 'PASS' ? '#10b981' : result === 'WARN' ? '#f59e0b' : '#ef4444';

  return (
    <div className="bg-slate-50 border border-slate-200 rounded p-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-ditech-text-muted font-semibold mb-1">
        <span>📐 Side view · Tilt {tilt}° · Camera (left) · Door (right)</span>
        <span style={{ color: resultColor }}>{result}</span>
      </div>
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="fl-sv" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#94a3b8" strokeWidth="0.6" />
          </pattern>
          <pattern id="cl-sv" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#94a3b8" strokeWidth="0.6" />
          </pattern>
          <pattern id="out-sv" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="4" r="0.8" fill="#cbd5e1" />
          </pattern>
        </defs>

        <text x={(25 + DOOR_X) / 2} y={14} fontSize={10} fill="#64748b" textAnchor="middle" fontStyle="italic">
          ← INSIDE STORE
        </text>
        <text x={(DOOR_X + SVG_W - 12) / 2} y={14} fontSize={10} fill="#64748b" textAnchor="middle" fontStyle="italic">
          OUTSIDE / FRONT →
        </text>

        <rect x={DOOR_X} y={CEILING_Y} width={SVG_W - DOOR_X} height={FLOOR_Y - CEILING_Y} fill="url(#out-sv)" opacity={0.3} />

        <line x1={0} y1={ceilY} x2={DOOR_X} y2={ceilY} stroke="#475569" strokeWidth={1.5} />
        <rect x={0} y={0} width={DOOR_X} height={ceilY} fill="url(#cl-sv)" />
        <text x={30} y={ceilY - 4} fontSize={9} fill="#64748b">ceiling {Ch.toFixed(1)}m</text>

        <line x1={0} y1={FLOOR_Y} x2={SVG_W} y2={FLOOR_Y} stroke="#475569" strokeWidth={1.5} />
        <rect x={0} y={FLOOR_Y} width={SVG_W} height={SVG_H - FLOOR_Y} fill="url(#fl-sv)" />

        <line x1={DOOR_X} y1={ceilY} x2={DOOR_X} y2={FLOOR_Y}
          stroke="#dc2626" strokeWidth={1.2} strokeDasharray="4,3" />
        <text x={DOOR_X} y={FLOOR_Y + 14} fontSize={10} fill="#dc2626" textAnchor="middle" fontWeight="700">DOOR</text>

        {hasHanging && (
          <g>
            <rect x={DOOR_X - 14} y={ceilY}
              width={28} height={Math.max(0, obstrBottomY - ceilY)}
              fill={result === 'BLOCKED' ? '#ef4444' : '#a855f7'}
              fillOpacity={0.75}
              stroke={result === 'BLOCKED' ? '#dc2626' : '#7c3aed'}
              strokeWidth={1.5} />
            <text x={DOOR_X} y={Math.max(ceilY + 12, (ceilY + obstrBottomY) / 2 + 4)}
              fontSize={10} fill="white" textAnchor="middle" fontWeight="700">
              {OBSTRUCTION_KINDS.find(k => k.value === obstrKind)?.emoji}
            </text>
            <text x={DOOR_X} y={obstrBottomY + 11}
              fontSize={8} fill={result === 'BLOCKED' ? '#dc2626' : '#7c3aed'}
              textAnchor="middle" fontWeight="600">
              Ho={Ho.toFixed(2)}m
            </text>
          </g>
        )}

        <line x1={CAM_X} y1={ceilY} x2={CAM_X} y2={camY} stroke="#475569" strokeWidth={2} />
        <rect x={CAM_X - 4} y={ceilY - 1} width={8} height={3} fill="#475569" />

        <circle cx={CAM_X} cy={camY} r={7} fill="#1f3447" stroke="white" strokeWidth={1.5} />
        <text x={CAM_X} y={camY + 4} fontSize={11} fill="white" textAnchor="middle" fontWeight="700">📷</text>
        <text x={CAM_X} y={camY - 11} fontSize={9} fill="#1f3447" textAnchor="middle" fontWeight="600">
          Hc={Hc.toFixed(2)}m{tilt > 0 ? ` · ${tilt}°` : ''}
        </text>

        {NEAR_EDGE_X < DOOR_X && (
          <g>
            <polygon
              points={`${CAM_X},${camY} ${Math.max(NEAR_EDGE_X, 25)},${FLOOR_Y} ${Math.min(DOOR_X, FAR_EDGE_X)},${FLOOR_Y}`}
              fill="#0ea5e9" fillOpacity={0.2} />
            <line x1={CAM_X} y1={camY} x2={Math.max(NEAR_EDGE_X, 25)} y2={FLOOR_Y}
              stroke="#0284c7" strokeWidth={1.2} strokeDasharray="3,2" />
            <text x={(Math.max(NEAR_EDGE_X, 25) + CAM_X) / 2} y={FLOOR_Y - 6}
              fontSize={8.5} fill="#0284c7" textAnchor="middle" fontWeight="600">
              📥 inside {insideFromDoor.toFixed(1)}m
            </text>
          </g>
        )}

        {FAR_EDGE_X > DOOR_X && (
          <g>
            <polygon
              points={`${CAM_X},${camY} ${DOOR_X},${FLOOR_Y} ${Math.min(FAR_EDGE_X, SVG_W - 12)},${FLOOR_Y}`}
              fill="#10b981" fillOpacity={0.2} />
            <line x1={CAM_X} y1={camY} x2={Math.min(FAR_EDGE_X, SVG_W - 12)} y2={FLOOR_Y}
              stroke="#059669" strokeWidth={1.2} strokeDasharray="3,2" />
            <text x={(DOOR_X + Math.min(FAR_EDGE_X, SVG_W - 12)) / 2} y={FLOOR_Y - 6}
              fontSize={8.5} fill="#059669" textAnchor="middle" fontWeight="600">
              📤 outside {outsideFromDoor.toFixed(1)}m
            </text>
          </g>
        )}

        <line x1={CAM_X} y1={camY} x2={TARGET_X} y2={targetHeadY}
          stroke={result === 'BLOCKED' ? '#ef4444' : '#0284c7'}
          strokeWidth={2}
          strokeDasharray={result === 'BLOCKED' ? '6,3' : ''} />

        {hasHanging && Ho >= 0 && (
          <g>
            <line x1={DOOR_X - 18} y1={lineHeightY} x2={DOOR_X + 18} y2={lineHeightY}
              stroke={result === 'BLOCKED' ? '#ef4444' : '#10b981'}
              strokeWidth={2.5} strokeLinecap="round" />
            <text x={DOOR_X + 22} y={lineHeightY + 3}
              fontSize={9} fill={result === 'BLOCKED' ? '#dc2626' : '#059669'}
              fontWeight="600">
              line={lineH.toFixed(2)}m
            </text>
          </g>
        )}

        <g>
          <line x1={TARGET_X} y1={targetHeadY} x2={TARGET_X} y2={FLOOR_Y}
            stroke="#1f3447" strokeWidth={3} strokeLinecap="round" />
          <circle cx={TARGET_X} cy={targetHeadY - 5} r={5} fill="#1f3447" />
          <line x1={TARGET_X - 5} y1={targetHeadY + 8} x2={TARGET_X + 5} y2={targetHeadY + 8}
            stroke="#1f3447" strokeWidth={2} strokeLinecap="round" />
          <line x1={TARGET_X} y1={(targetHeadY + FLOOR_Y) / 2 + 5} x2={TARGET_X - 4} y2={FLOOR_Y}
            stroke="#1f3447" strokeWidth={2} strokeLinecap="round" />
          <line x1={TARGET_X} y1={(targetHeadY + FLOOR_Y) / 2 + 5} x2={TARGET_X + 4} y2={FLOOR_Y}
            stroke="#1f3447" strokeWidth={2} strokeLinecap="round" />
          <text x={TARGET_X + 11} y={targetHeadY - 3}
            fontSize={9} fill="#1f3447" fontWeight="600">
            Ht={Ht.toFixed(2)}m
          </text>
        </g>

        <line x1={CAM_X} y1={FLOOR_Y + 28} x2={DOOR_X} y2={FLOOR_Y + 28} stroke="#1f3447" strokeWidth={1.5} />
        <line x1={CAM_X} y1={FLOOR_Y + 24} x2={CAM_X} y2={FLOOR_Y + 32} stroke="#1f3447" strokeWidth={1.2} />
        <line x1={DOOR_X} y1={FLOOR_Y + 24} x2={DOOR_X} y2={FLOOR_Y + 32} stroke="#1f3447" strokeWidth={1.2} />
        <text x={(CAM_X + DOOR_X) / 2} y={FLOOR_Y + 26} fontSize={9} fill="#1f3447" textAnchor="middle" fontWeight="600">
          D={D.toFixed(2)}m
        </text>

        <line x1={DOOR_X} y1={FLOOR_Y + 28} x2={TARGET_X} y2={FLOOR_Y + 28} stroke="#059669" strokeWidth={1.5} />
        <line x1={TARGET_X} y1={FLOOR_Y + 24} x2={TARGET_X} y2={FLOOR_Y + 32} stroke="#059669" strokeWidth={1.2} />
        <text x={(DOOR_X + TARGET_X) / 2} y={FLOOR_Y + 26} fontSize={9} fill="#059669" textAnchor="middle" fontWeight="600">
          L={L.toFixed(2)}m
        </text>

        {countDepth > 0 && (
          <rect x={DOOR_X + countStart * HPX} y={FLOOR_Y - 5}
            width={countDepth * HPX} height={5}
            fill="#10b981" fillOpacity={0.5} stroke="#059669" strokeWidth={0.8} strokeDasharray="3,1.5" />
        )}

        {hasFloor && floorDist > 0 && (
          <g>
            <rect x={CAM_X - floorDist * HPX - 9} y={yFromFloor(floorH)}
              width={18} height={floorH * VPX}
              fill={result === 'BLOCKED' ? '#ef4444' : '#fbbf24'}
              fillOpacity={0.65}
              stroke={result === 'BLOCKED' ? '#dc2626' : '#d97706'}
              strokeWidth={1} />
            <text x={CAM_X - floorDist * HPX} y={yFromFloor(floorH) - 3}
              fontSize={8.5} fill={result === 'BLOCKED' ? '#dc2626' : '#d97706'}
              textAnchor="middle" fontWeight="700">{floorLabel}</text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ════════════════════════════════════════════════
// TOP VIEW
// Camera mounted parallel to door — coverage is RECTANGLE
//   - Length (along camera-to-door axis) = inside+outside coverage
//   - Width (parallel to door / perpendicular to length) = sensor.coverageWidth
// Door is VERTICAL wall on right, camera on left perpendicular to door
// ════════════════════════════════════════════════
function TopDiagram({
  D, L, tilt, doorW, coverageWidth,
  insideFromDoor, outsideFromDoor,
  walkDir, scenario, countStart, countDepth, result,
}: any) {
  const SVG_W = 540;
  const SVG_H = 280;
  const CENTER_Y = 140;

  const rightRange = Math.max(L, outsideFromDoor) + 0.5;
  const leftRange = Math.max(insideFromDoor, D + 1);
  const totalRangeH = leftRange + rightRange;
  const HPX = (SVG_W - 40) / totalRangeH;

  const DOOR_X = 20 + leftRange * HPX;
  const CAM_X = DOOR_X - D * HPX;
  const TARGET_X = DOOR_X + L * HPX;

  const INSIDE_LEFT_X = DOOR_X - insideFromDoor * HPX;
  const OUTSIDE_RIGHT_X = DOOR_X + outsideFromDoor * HPX;

  // Coverage WIDTH (parallel to door = vertical axis in top view)
  // Determine pixel scale for width — use same HPX so units consistent
  const coverageWidthPx = coverageWidth * HPX;
  const COV_TOP_Y = CENTER_Y - coverageWidthPx / 2;
  const COV_BOT_Y = CENTER_Y + coverageWidthPx / 2;

  const doorWPx = doorW * HPX;
  const DOOR_TOP_Y = CENTER_Y - doorWPx / 2;
  const DOOR_BOT_Y = CENTER_Y + doorWPx / 2;

  const resultColor = result === 'PASS' ? '#10b981' : result === 'WARN' ? '#f59e0b' : '#ef4444';

  return (
    <div className="bg-slate-50 border border-slate-200 rounded p-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-ditech-text-muted font-semibold mb-1">
        <span>🗺 Top view · Camera mounted parallel to door · Coverage rect</span>
        <span style={{ color: resultColor }}>{result}</span>
      </div>
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="out-tv" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="4" r="0.8" fill="#cbd5e1" />
          </pattern>
          <marker id="arr-tv" markerWidth={8} markerHeight={8} refX={6} refY={4} orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#7c3aed" />
          </marker>
        </defs>

        {/* Outside background */}
        <rect x={DOOR_X} y={0} width={SVG_W - DOOR_X} height={SVG_H} fill="url(#out-tv)" opacity={0.4} />

        <text x={(20 + DOOR_X) / 2} y={14} fontSize={11} fill="#64748b" textAnchor="middle" fontStyle="italic" fontWeight="600">
          ◄ INSIDE STORE
        </text>
        <text x={(DOOR_X + SVG_W - 12) / 2} y={14} fontSize={11} fill="#64748b" textAnchor="middle" fontStyle="italic" fontWeight="600">
          OUTSIDE ►
        </text>

        {/* Wall (vertical, outside store) */}
        <line x1={DOOR_X} y1={30} x2={DOOR_X} y2={DOOR_TOP_Y} stroke="#475569" strokeWidth={3} />
        <line x1={DOOR_X} y1={DOOR_BOT_Y} x2={DOOR_X} y2={SVG_H - 36} stroke="#475569" strokeWidth={3} />

        {/* Door opening (gap in wall) */}
        <line x1={DOOR_X} y1={DOOR_TOP_Y} x2={DOOR_X} y2={DOOR_BOT_Y}
          stroke="#dc2626" strokeWidth={2} strokeDasharray="4,2" />
        <text x={DOOR_X} y={DOOR_TOP_Y - 4} fontSize={10} fill="#dc2626" textAnchor="middle" fontWeight="700">
          DOOR {doorW.toFixed(1)}m
        </text>

        {/* INSIDE coverage rectangle (parallel to door) */}
        {insideFromDoor > 0 && (
          <g>
            <rect
              x={INSIDE_LEFT_X}
              y={COV_TOP_Y}
              width={insideFromDoor * HPX}
              height={coverageWidthPx}
              fill="#0ea5e9" fillOpacity={0.2}
              stroke="#0284c7" strokeWidth={1.2} strokeDasharray="4,2"
            />
            <text x={(INSIDE_LEFT_X + DOOR_X) / 2} y={COV_TOP_Y - 4}
              fontSize={9} fill="#0284c7" textAnchor="middle" fontWeight="600">
              📥 inside {insideFromDoor.toFixed(2)}m × {coverageWidth.toFixed(1)}m
            </text>
          </g>
        )}

        {/* OUTSIDE coverage rectangle (parallel to door, through opening) */}
        {outsideFromDoor > 0 && (
          <g>
            <rect
              x={DOOR_X}
              y={COV_TOP_Y}
              width={outsideFromDoor * HPX}
              height={coverageWidthPx}
              fill="#10b981" fillOpacity={0.2}
              stroke="#059669" strokeWidth={1.2} strokeDasharray="4,2"
            />
            <text x={(DOOR_X + OUTSIDE_RIGHT_X) / 2} y={COV_BOT_Y + 13}
              fontSize={9} fill="#059669" textAnchor="middle" fontWeight="600">
              📤 outside {outsideFromDoor.toFixed(2)}m × {coverageWidth.toFixed(1)}m
            </text>
          </g>
        )}

        {/* Coverage width indicator (left side) */}
        {(insideFromDoor > 0 || outsideFromDoor > 0) && (
          <g>
            <line x1={INSIDE_LEFT_X - 8} y1={COV_TOP_Y} x2={INSIDE_LEFT_X - 8} y2={COV_BOT_Y}
              stroke="#0284c7" strokeWidth={1} />
            <line x1={INSIDE_LEFT_X - 11} y1={COV_TOP_Y} x2={INSIDE_LEFT_X - 5} y2={COV_TOP_Y}
              stroke="#0284c7" strokeWidth={1} />
            <line x1={INSIDE_LEFT_X - 11} y1={COV_BOT_Y} x2={INSIDE_LEFT_X - 5} y2={COV_BOT_Y}
              stroke="#0284c7" strokeWidth={1} />
            <text x={INSIDE_LEFT_X - 13} y={CENTER_Y + 3}
              fontSize={9} fill="#0284c7" textAnchor="end" fontWeight="600"
              transform={`rotate(-90, ${INSIDE_LEFT_X - 13}, ${CENTER_Y + 3})`}>
              W={coverageWidth.toFixed(1)}m
            </text>
          </g>
        )}

        {/* Camera */}
        <circle cx={CAM_X} cy={CENTER_Y} r={9} fill="#1f3447" stroke="white" strokeWidth={2} />
        <text x={CAM_X} y={CENTER_Y + 4} fontSize={12} fill="white" textAnchor="middle" fontWeight="700">📷</text>
        {tilt > 0 && (
          <text x={CAM_X} y={CENTER_Y - 14} fontSize={9} fill="#1f3447" textAnchor="middle" fontWeight="600">
            tilt {tilt}°↗
          </text>
        )}

        {/* D ruler */}
        <line x1={CAM_X} y1={COV_BOT_Y + 24} x2={DOOR_X} y2={COV_BOT_Y + 24}
          stroke="#1f3447" strokeWidth={1.2} />
        <line x1={CAM_X} y1={COV_BOT_Y + 20} x2={CAM_X} y2={COV_BOT_Y + 28} stroke="#1f3447" strokeWidth={1} />
        <line x1={DOOR_X} y1={COV_BOT_Y + 20} x2={DOOR_X} y2={COV_BOT_Y + 28} stroke="#1f3447" strokeWidth={1} />
        <text x={(CAM_X + DOOR_X) / 2} y={COV_BOT_Y + 22} fontSize={10} fill="#1f3447" textAnchor="middle" fontWeight="600">
          D={D.toFixed(2)}m
        </text>

        {/* Target */}
        <g>
          <circle cx={TARGET_X} cy={CENTER_Y} r={7} fill="#1f3447" stroke="white" strokeWidth={1.5} />
          <text x={TARGET_X} y={CENTER_Y + 3} fontSize={11} fill="white" textAnchor="middle" fontWeight="700">👤</text>
        </g>

        {/* L ruler */}
        <line x1={DOOR_X} y1={COV_BOT_Y + 24} x2={TARGET_X} y2={COV_BOT_Y + 24}
          stroke="#059669" strokeWidth={1.2} />
        <line x1={TARGET_X} y1={COV_BOT_Y + 20} x2={TARGET_X} y2={COV_BOT_Y + 28} stroke="#059669" strokeWidth={1} />
        <text x={(DOOR_X + TARGET_X) / 2} y={COV_BOT_Y + 22} fontSize={10} fill="#059669" textAnchor="middle" fontWeight="600">
          L={L.toFixed(2)}m
        </text>

        {/* Sight line */}
        <line x1={CAM_X} y1={CENTER_Y} x2={TARGET_X} y2={CENTER_Y}
          stroke={result === 'BLOCKED' ? '#ef4444' : '#0284c7'}
          strokeWidth={2}
          strokeDasharray={result === 'BLOCKED' ? '6,3' : ''} />

        {/* Count zone (parallel to door axis, full coverage width) */}
        {countDepth > 0 && (
          <rect
            x={DOOR_X + countStart * HPX}
            y={COV_TOP_Y}
            width={countDepth * HPX}
            height={coverageWidthPx}
            fill="#10b981" fillOpacity={0.45} stroke="#059669" strokeWidth={1.2} strokeDasharray="3,1.5"
          />
        )}

        {/* Walking arrows */}
        {scenario === 'passerby' && (
          <g>
            {walkDir !== 'right_to_left' && (
              <line x1={DOOR_X + 0.3 * HPX} y1={COV_TOP_Y - 14}
                x2={DOOR_X + 3 * HPX} y2={COV_TOP_Y - 14}
                stroke="#7c3aed" strokeWidth={2.5} markerEnd="url(#arr-tv)" />
            )}
            {walkDir !== 'left_to_right' && (
              <line x1={DOOR_X + 3 * HPX} y1={COV_BOT_Y + 4}
                x2={DOOR_X + 0.3 * HPX} y2={COV_BOT_Y + 4}
                stroke="#7c3aed" strokeWidth={2.5} markerEnd="url(#arr-tv)" />
            )}
          </g>
        )}
      </svg>
    </div>
  );
}
