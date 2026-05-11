import { useState } from 'react';
import type { useDesignEditor } from '../../hooks/useDesignEditor';
import { FUNCTION_COLORS } from '../../utils/coverageColors';

interface Props {
  editor: ReturnType<typeof useDesignEditor>;
  onAddSensor: () => void;
}

export function SensorListPanel({ editor, onAddSensor }: Props) {
  const { sensorsByFunction, selectedSensorId, setSelectedSensorId, deleteSensor, design,
    updateSensorImmediate, setSelectedMeasureId, setSelectedZoneId, setTool } = editor;

  const orderedFunctions: Array<keyof typeof FUNCTION_COLORS> = ['entrance', 'engagement', 'heatmap', 'cctv', 'passerby'];

  return (
    <aside className="w-[260px] border-r border-ditech-border bg-white flex flex-col overflow-hidden h-full">
      <div className="px-3 py-2 border-b border-ditech-border flex items-center justify-between">
        <h3 className="text-sm font-semibold">Sensors <span className="text-ditech-text-muted font-normal">({design?.sensors?.length ?? 0})</span></h3>
        <button onClick={onAddSensor}
          className="px-2 py-1 text-xs bg-ditech-primary text-white rounded hover:bg-ditech-primary-light">
          + Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
        {(design?.sensors?.length ?? 0) === 0 ? (
          <div className="text-center text-xs text-ditech-text-subtle italic py-6">
            No sensors yet.<br />Click <strong>+ Add</strong> to place one.
          </div>
        ) : (
          orderedFunctions.map((fn) => {
            const sensors = sensorsByFunction[fn] ?? [];
            if (sensors.length === 0) return null;
            const colors = FUNCTION_COLORS[fn];
            return (
              <div key={fn}>
                <div className={`text-[10px] uppercase tracking-wider font-semibold px-1 py-1 ${colors.text}`}>
                  {colors.icon} {colors.enLabel} ({sensors.length})
                </div>
                <div className="space-y-0.5">
                  {sensors.map((s) => (
                    <SensorRow
                      key={s.id}
                      sensor={s}
                      selected={selectedSensorId === s.id}
                      onSelect={() => {
                        setSelectedSensorId(s.id);
                        setSelectedMeasureId(null);
                        setSelectedZoneId(null);
                        setTool('select');
                      }}
                      onRename={(newName) => {
                        if (newName && newName.trim() !== s.sensorName) {
                          updateSensorImmediate(s.id, { sensorName: newName.trim() });
                        }
                      }}
                      onDelete={() => {
                        if (confirm(`Delete ${s.sensorName}?`)) deleteSensor.mutate(s.id);
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Function legend */}
      <div className="px-3 py-2 border-t border-ditech-border bg-slate-50">
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
          {orderedFunctions.map((fn) => {
            const c = FUNCTION_COLORS[fn];
            return (
              <div key={fn} className="inline-flex items-center gap-1 truncate">
                <span className="w-3 h-3 inline-block rounded-sm border" style={{ background: c.tint, borderColor: c.dot }} />
                <span className="text-ditech-text-muted truncate">{c.enLabel}</span>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function SensorRow({ sensor, selected, onSelect, onRename, onDelete }: {
  sensor: any;
  selected: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(sensor.sensorName);
  const colors = FUNCTION_COLORS[sensor.functionType as keyof typeof FUNCTION_COLORS];
  const effectiveColor = sensor.color || colors.dot;

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== sensor.sensorName) onRename(trimmed);
    else setValue(sensor.sensorName);
    setEditing(false);
  };

  return (
    <div
      onClick={() => !editing && onSelect()}
      className={`group flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer text-xs ${
        selected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'
      }`}
    >
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: effectiveColor }} />

      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setValue(sensor.sensorName); setEditing(false); }
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 px-1 py-0.5 text-xs border border-blue-300 rounded outline-none"
        />
      ) : (
        <span
          className="flex-1 min-w-0 truncate"
          onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
          title="Double-click to rename"
        >
          {sensor.sensorName}
        </span>
      )}

      <span className="text-[9px] text-ditech-text-subtle flex-shrink-0">
        {sensor.cameraModel?.displayName?.split(' ').pop()?.replace(/[()]/g, '') ?? ''}
      </span>

      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {!editing && (
          <button onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="text-[10px] text-ditech-text-muted hover:text-blue-600 px-0.5" title="Rename">✏️</button>
        )}
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-[10px] text-ditech-text-muted hover:text-red-600 px-0.5" title="Delete">✕</button>
      </div>
    </div>
  );
}
