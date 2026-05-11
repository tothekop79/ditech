import { useState } from 'react';
import type { useDesignEditor } from '../../hooks/useDesignEditor';
import { STATUS_COLORS, FUNCTION_COLORS, MOUNTING_LABELS } from '../../utils/coverageColors';

interface Props {
  editor: ReturnType<typeof useDesignEditor>;
}

type BottomTab = 'kpi' | 'devices';

export function CoverageSummaryBar({ editor }: Props) {
  const { design, recalcDesign, setSelectedSensorId } = editor;
  const [activeTab, setActiveTab] = useState<BottomTab>('kpi');
  const sensors = design?.sensors ?? [];

  const fmt = (p: number | null | undefined) =>
    p === null || p === undefined ? '—' : `${Math.round(p * 100)}%`;

  const status = (p: number | null | undefined) => {
    if (p === null || p === undefined) return null;
    if (p >= 0.9) return { label: '✓ PASS', cls: 'text-emerald-700' };
    if (p >= 0.7) return { label: '⚠ WARN', cls: 'text-amber-700' };
    return { label: '✗ FAIL', cls: 'text-red-700' };
  };

  return (
    <div className="border-t border-ditech-border bg-white flex-shrink-0 flex flex-col" style={{ maxHeight: '40vh' }}>
      {/* Tab bar */}
      <div className="border-b border-slate-200 px-4 flex items-center justify-between bg-slate-50">
        <div className="flex">
          <Tab
            active={activeTab === 'kpi'}
            onClick={() => setActiveTab('kpi')}
            icon="📊"
            label="KPI Summary"
            badge={design?.overallStatus ?? null}
            badgeColor={design?.overallStatus ? STATUS_COLORS[design.overallStatus] : undefined}
          />
          <Tab
            active={activeTab === 'devices'}
            onClick={() => setActiveTab('devices')}
            icon="📋"
            label="Device List"
            badge={String(sensors.length)}
            badgeColor="bg-slate-100 text-slate-700 border-slate-300"
          />
        </div>

        <div className="flex items-center gap-1.5 py-1.5">
          <button
            onClick={() => recalcDesign.mutate()}
            disabled={recalcDesign.isPending}
            className="px-2.5 py-1 bg-white border border-ditech-border-strong rounded hover:bg-slate-50 inline-flex items-center gap-1.5 text-xs disabled:opacity-50"
            title="Recalculate coverage stats"
          >
            <span>{recalcDesign.isPending ? '⟳' : '↻'}</span>
            <span>Recalc</span>
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'kpi' && (
          <KpiTab
            entrance={design?.entranceCoveragePercent}
            engagement={design?.engagementCoveragePercent}
            heatmap={design?.heatmapCoveragePercent}
            overall={design?.overallStatus ?? null}
            recommendations={design?.recommendations ?? []}
            fmt={fmt}
            status={status}
          />
        )}

        {activeTab === 'devices' && (
          <DevicesTab
            sensors={sensors}
            selectedSensorId={editor.selectedSensorId}
            onSelect={setSelectedSensorId}
          />
        )}
      </div>
    </div>
  );
}

// ── Tab button ──
function Tab({ active, onClick, icon, label, badge, badgeColor }: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  badge: string | null;
  badgeColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm border-b-2 transition-colors flex items-center gap-2 ${
        active
          ? 'border-blue-500 text-blue-700 font-semibold bg-white'
          : 'border-transparent text-ditech-text-muted hover:text-ditech-text hover:bg-white/50'
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
      {badge !== null && badge !== undefined && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
          badgeColor || (active ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-300')
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ── KPI Tab ──
function KpiTab({
  entrance, engagement, heatmap, overall, recommendations, fmt, status,
}: any) {
  return (
    <div className="p-4 overflow-y-auto h-full">
      {/* KPI grid */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <KpiCard label="Entrance Coverage" value={fmt(entrance)} status={status(entrance)} color="blue" icon="📐" />
        <KpiCard label="Engagement Zones" value={fmt(engagement)} status={status(engagement)} color="red" icon="🟥" />
        <KpiCard label="Heatmap Area" value={fmt(heatmap)} status={status(heatmap)} color="purple" icon="🟪" />
        <KpiCard
          label="Overall Design"
          value={overall ?? '—'}
          status={null}
          color={overall === 'PASS' ? 'emerald' : overall === 'WARNING' ? 'amber' : overall === 'FAIL' ? 'red' : 'slate'}
          icon={overall === 'PASS' ? '✅' : overall === 'WARNING' ? '⚠️' : overall === 'FAIL' ? '❌' : '⏳'}
        />
      </div>

      {/* Recommendations section */}
      <div>
        <div className="text-[11px] uppercase tracking-wider text-ditech-text-muted font-semibold mb-2">
          💡 Recommendations
        </div>
        {recommendations.length === 0 ? (
          <div className="text-xs text-ditech-text-subtle italic px-3 py-2 bg-slate-50 rounded">
            Add sensors and zones to see coverage recommendations.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {recommendations.map((rec: string, i: number) => {
              const isWarn = rec.startsWith('⚠');
              const isFail = rec.startsWith('✗') || rec.startsWith('❌');
              const cls = isFail
                ? 'bg-red-50 border-red-200 text-red-700'
                : isWarn
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700';
              return (
                <span key={i} className={`text-xs inline-flex items-center gap-1 px-2.5 py-1 border rounded ${cls}`}>
                  {rec}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, status, color, icon }:
  { label: string; value: string; status: { label: string; cls: string } | null; color: string; icon: string }) {
  const cls = {
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    red: 'bg-red-50 border-red-200 text-red-900',
    purple: 'bg-purple-50 border-purple-200 text-purple-900',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
  }[color] ?? 'bg-slate-50 border-slate-200 text-slate-700';

  return (
    <div className={`px-3 py-2.5 rounded-lg border ${cls}`}>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[11px] uppercase tracking-wider font-semibold opacity-80">
          {icon} {label}
        </span>
        {status && (
          <span className={`text-[10px] font-bold ${status.cls}`}>{status.label}</span>
        )}
      </div>
      <div className="text-2xl font-bold font-mono">{value}</div>
    </div>
  );
}

// ── Devices Tab ──
function DevicesTab({ sensors, selectedSensorId, onSelect }:
  { sensors: any[]; selectedSensorId: string | null; onSelect: (id: string) => void }) {
  if (sensors.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-ditech-text-muted italic">
        No sensors placed yet. Use the <span className="font-semibold text-ditech-text">➕ Sensor</span> tool to add one.
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full">
      <table className="w-full text-xs">
        <thead className="bg-white sticky top-0 border-b border-ditech-border z-10">
          <tr>
            <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider text-ditech-text-muted font-semibold">#</th>
            <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider text-ditech-text-muted font-semibold">Sensor</th>
            <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider text-ditech-text-muted font-semibold">Function</th>
            <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider text-ditech-text-muted font-semibold">Model</th>
            <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider text-ditech-text-muted font-semibold">Mounting</th>
            <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider text-ditech-text-muted font-semibold">Height</th>
            <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider text-ditech-text-muted font-semibold">Yaw</th>
            <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider text-ditech-text-muted font-semibold">Coverage W×D</th>
            <th className="px-3 py-2 text-center text-[11px] uppercase tracking-wider text-ditech-text-muted font-semibold">Obstr</th>
            <th className="px-3 py-2 text-center text-[11px] uppercase tracking-wider text-ditech-text-muted font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {sensors.map((s: any, idx: number) => {
            const colors = FUNCTION_COLORS[s.functionType];
            const effectiveColor = s.color || colors.dot;
            const isSelected = selectedSensorId === s.id;
            return (
              <tr
                key={s.id}
                onClick={() => onSelect(s.id)}
                className={`border-b border-slate-100 cursor-pointer ${
                  isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-slate-50'
                }`}
              >
                <td className="px-3 py-1.5 text-ditech-text-muted">{idx + 1}</td>
                <td className="px-3 py-1.5 font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: effectiveColor }} />
                    {s.sensorName}
                    {isSelected && <span className="text-blue-700 text-[10px]">⭐</span>}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors.bgChip}`}>
                    {colors.enLabel}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-ditech-text-muted">{s.cameraModel?.displayName ?? '—'}</td>
                <td className="px-3 py-1.5 text-ditech-text-muted">
                  {MOUNTING_LABELS[s.mountingType]?.en ?? s.mountingType}
                  {s.mountingType === 'tilt_bracket' && <span className="text-amber-600 ml-1">△</span>}
                  {s.mountingType === 'bracket' && <span className="text-blue-600 ml-1">→</span>}
                </td>
                <td className="px-3 py-1.5 text-right font-mono">{s.mountingHeight.toFixed(1)} m</td>
                <td className="px-3 py-1.5 text-right font-mono">{s.rotation.toFixed(0)}°</td>
                <td className="px-3 py-1.5 text-right font-mono">
                  {s.coverageWidth.toFixed(1)} × {s.coverageDepth.toFixed(1)} m
                </td>
                <td className="px-3 py-1.5 text-center">
                  {s.obstructionPass === null
                    ? <span className="text-[11px] text-slate-400">—</span>
                    : s.obstructionPass
                      ? <span className="text-[11px] text-emerald-600 font-bold">✓</span>
                      : <span className="text-[11px] text-red-600 font-bold">✗</span>
                  }
                </td>
                <td className="px-3 py-1.5 text-center">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                    s.status === 'PASS' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    s.status === 'WARNING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {s.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
