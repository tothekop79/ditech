import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { eventsApi, type Event, type EventDay, type EventGate, type EventZone, type EventActivity, type GateType } from '../../api/events';
import { useToast } from '../Toast';

const DAY_COLORS = ['#1F77B4', '#FF7F0E', '#2CA02C', '#D62728', '#9467BD', '#17BECF', '#E377C2'];

export function EventConfigEditor({ event }: { event: Event }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <DaysEditor event={event} />
      <GatesEditor event={event} />
      <ZonesEditor event={event} />
      <ActivitiesEditor event={event} />
      <ParametersEditor event={event} />
    </div>
  );
}

// ─── shared edit/save scaffold ─────────────────────────
interface SectionProps {
  title: string;
  count: number;
  children: any;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onSave: () => void;
  saving: boolean;
  onCancel?: () => void;
  hint?: string;
}
function Section({ title, count, children, editing, setEditing, onSave, saving, onCancel, hint }: SectionProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{title} ({count})</h4>
        {!editing ? (
          <button onClick={() => setEditing(true)}
            className="text-xs text-gray-400 hover:text-blue-600">✏️ Edit</button>
        ) : (
          <div className="flex gap-1.5">
            <button onClick={() => { onCancel?.(); setEditing(false); }}
              className="text-xs px-2 py-0.5 text-gray-500 hover:text-gray-700">Cancel</button>
            <button onClick={onSave} disabled={saving}
              className="text-xs px-2.5 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
      {hint && <p className="text-[10px] text-gray-400 mb-2 italic">{hint}</p>}
      {children}
    </div>
  );
}

// ─── 1. Days ─────────────────────────────────────────
function DaysEditor({ event }: { event: Event }) {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState(event.days || []);

  useEffect(() => { if (!editing) setItems(event.days || []); }, [event.days, editing]);

  const save = useMutation({
    mutationFn: () => eventsApi.setDays(event.id, items.map((d) => ({
      dayNumber: d.dayNumber,
      date: typeof d.date === 'string' ? d.date.slice(0, 10) : d.date,
      label: d.label,
      color: d.color,
    }))),
    onSuccess: () => {
      showToast('Days saved');
      qc.invalidateQueries({ queryKey: ['event', event.id] });
      setEditing(false);
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to save'),
  });

  return (
    <Section title="📅 Days" count={items.length} editing={editing}
      setEditing={setEditing} onSave={() => save.mutate()} saving={save.isPending}>
      {editing ? (
        <div className="space-y-1.5">
          {items.map((d, i) => (
            <div key={d.id || i} className="flex items-center gap-1.5 bg-gray-50 rounded p-1.5">
              <span className="text-[10px] text-gray-500 w-12">Day {d.dayNumber}</span>
              <input type="date" value={typeof d.date === 'string' ? d.date.slice(0, 10) : ''}
                onChange={(e) => {
                  const next = [...items]; next[i] = { ...d, date: e.target.value } as any;
                  setItems(next);
                }}
                className="px-1.5 py-1 text-xs border border-gray-200 rounded font-mono" />
              <input value={d.label}
                onChange={(e) => {
                  const next = [...items]; next[i] = { ...d, label: e.target.value } as any;
                  setItems(next);
                }}
                className="flex-1 px-1.5 py-1 text-xs border border-gray-200 rounded" />
              <input type="color" value={d.color}
                onChange={(e) => {
                  const next = [...items]; next[i] = { ...d, color: e.target.value } as any;
                  setItems(next);
                }}
                className="w-7 h-7 border border-gray-200 rounded cursor-pointer" />
              <button onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                className="text-xs text-gray-400 hover:text-red-600 px-1">✕</button>
            </div>
          ))}
          <button onClick={() => {
            const nextNum = (items[items.length - 1]?.dayNumber || 0) + 1;
            const lastDate = items[items.length - 1]?.date;
            const nextDate = lastDate
              ? new Date(new Date(lastDate as string).getTime() + 86400000).toISOString().slice(0, 10)
              : new Date().toISOString().slice(0, 10);
            setItems([...items, {
              id: '', eventId: event.id, dayNumber: nextNum, date: nextDate,
              label: `Day ${nextNum}`, color: DAY_COLORS[(nextNum - 1) % DAY_COLORS.length],
            } as EventDay]);
          }}
            className="w-full text-xs px-2 py-1 border border-dashed border-gray-300 rounded text-gray-600 hover:bg-gray-50">
            + Add day
          </button>
        </div>
      ) : (
        items.length === 0 ? <Empty /> : (
          <ul className="text-sm space-y-1">
            {items.map((d) => (
              <li key={d.id} className="flex items-center gap-2 py-1 px-2 bg-gray-50 rounded">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: d.color }} />
                <span className="font-mono text-xs text-gray-500 w-20">{(d.date as string).slice(0, 10)}</span>
                <span className="font-medium">{d.label}</span>
              </li>
            ))}
          </ul>
        )
      )}
    </Section>
  );
}

// ─── 2. Gates ────────────────────────────────────────
function GatesEditor({ event }: { event: Event }) {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<EventGate[]>(event.gates || []);

  useEffect(() => { if (!editing) setItems(event.gates || []); }, [event.gates, editing]);

  const save = useMutation({
    mutationFn: () => eventsApi.setGates(event.id, items.map((g) => ({
      name: g.name, gateType: g.gateType, sortOrder: g.sortOrder,
    }))),
    onSuccess: () => {
      showToast('Gates saved');
      qc.invalidateQueries({ queryKey: ['event', event.id] });
      setEditing(false);
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to save'),
  });

  return (
    <Section title="🚪 Gates" count={items.length} editing={editing}
      setEditing={setEditing} onSave={() => save.mutate()} saving={save.isPending}
      hint="ชื่อต้องตรงกับ Location ใน Rawdata">
      {editing ? (
        <div className="space-y-1.5">
          {items.map((g, i) => (
            <div key={g.id || i} className="flex items-center gap-1.5 bg-gray-50 rounded p-1.5">
              <select value={g.gateType}
                onChange={(e) => {
                  const next = [...items]; next[i] = { ...g, gateType: e.target.value as GateType };
                  setItems(next);
                }}
                className="px-1.5 py-1 text-xs border border-gray-200 rounded bg-white">
                <option value="ENTRANCE">Entrance</option>
                <option value="PASSERBY">Passerby</option>
              </select>
              <input value={g.name}
                onChange={(e) => {
                  const next = [...items]; next[i] = { ...g, name: e.target.value };
                  setItems(next);
                }}
                placeholder="Gate name (e.g. Entrance 1)"
                className="flex-1 px-1.5 py-1 text-xs border border-gray-200 rounded" />
              <button onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                className="text-xs text-gray-400 hover:text-red-600 px-1">✕</button>
            </div>
          ))}
          <button onClick={() => setItems([...items, {
            id: '', eventId: event.id, name: '', gateType: 'ENTRANCE', sortOrder: items.length,
          }])}
            className="w-full text-xs px-2 py-1 border border-dashed border-gray-300 rounded text-gray-600 hover:bg-gray-50">
            + Add gate
          </button>
        </div>
      ) : (
        items.length === 0 ? <Empty /> : (
          <ul className="text-sm space-y-1">
            {items.map((g) => (
              <li key={g.id} className="flex items-center gap-2 py-1 px-2 bg-gray-50 rounded">
                <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded ${
                  g.gateType === 'ENTRANCE' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                }`}>{g.gateType}</span>
                <span>{g.name}</span>
              </li>
            ))}
          </ul>
        )
      )}
    </Section>
  );
}

// ─── 3. Zones ────────────────────────────────────────
function ZonesEditor({ event }: { event: Event }) {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<EventZone[]>(event.zones || []);

  useEffect(() => { if (!editing) setItems(event.zones || []); }, [event.zones, editing]);

  const save = useMutation({
    mutationFn: () => eventsApi.setZones(event.id, items.map((z) => ({
      name: z.name, abbrev: z.abbrev || undefined,
      description: z.description || undefined,
      dwellBenchmarkSec: z.dwellBenchmarkSec ?? undefined,
      dwellBenchmarkMode: z.dwellBenchmarkMode || undefined,
      sortOrder: z.sortOrder,
    }))),
    onSuccess: () => {
      showToast('Zones saved');
      qc.invalidateQueries({ queryKey: ['event', event.id] });
      setEditing(false);
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to save'),
  });

  return (
    <Section title="📍 Zones" count={items.length} editing={editing}
      setEditing={setEditing} onSave={() => save.mutate()} saving={save.isPending}
      hint="ใช้ใน profile STANDARD และ FULL">
      {editing ? (
        <div className="space-y-1.5">
          {items.map((z, i) => (
            <div key={z.id || i} className="flex items-center gap-1.5 bg-gray-50 rounded p-1.5">
              <input value={z.name}
                onChange={(e) => {
                  const next = [...items]; next[i] = { ...z, name: e.target.value };
                  setItems(next);
                }}
                placeholder="Zone name"
                className="flex-1 px-1.5 py-1 text-xs border border-gray-200 rounded" />
              <input value={z.abbrev || ''}
                onChange={(e) => {
                  const next = [...items]; next[i] = { ...z, abbrev: e.target.value };
                  setItems(next);
                }}
                placeholder="Abbrev"
                className="w-20 px-1.5 py-1 text-xs border border-gray-200 rounded font-mono" />
              <input value={z.description || ''}
                onChange={(e) => {
                  const next = [...items]; next[i] = { ...z, description: e.target.value };
                  setItems(next);
                }}
                placeholder="Description"
                className="flex-1 px-1.5 py-1 text-xs border border-gray-200 rounded" />
              <input type="number" min={0} step={0.5}
                value={z.dwellBenchmarkSec != null ? z.dwellBenchmarkSec / 60 : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  const next = [...items];
                  next[i] = { ...z, dwellBenchmarkSec: v === '' ? null : Math.round(parseFloat(v) * 60) };
                  setItems(next);
                }}
                placeholder="min"
                title="Dwell benchmark (minutes)"
                className="w-16 px-1.5 py-1 text-xs border border-gray-200 rounded" />
              <select value={z.dwellBenchmarkMode || 'higher_better'}
                onChange={(e) => {
                  const next = [...items]; next[i] = { ...z, dwellBenchmarkMode: e.target.value };
                  setItems(next);
                }}
                title="Benchmark direction"
                className="w-20 px-1 py-1 text-xs border border-gray-200 rounded">
                <option value="higher_better">≥ good</option>
                <option value="lower_better">≤ good</option>
              </select>
              <button onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                className="text-xs text-gray-400 hover:text-red-600 px-1">✕</button>
            </div>
          ))}
          <button onClick={() => setItems([...items, {
            id: '', eventId: event.id, name: '', abbrev: '',
            description: '', dwellBenchmarkSec: null, dwellBenchmarkMode: 'higher_better', sortOrder: items.length,
          }])}
            className="w-full text-xs px-2 py-1 border border-dashed border-gray-300 rounded text-gray-600 hover:bg-gray-50">
            + Add zone
          </button>
        </div>
      ) : (
        items.length === 0 ? <Empty /> : (
          <ul className="text-sm space-y-1">
            {items.map((z) => (
              <li key={z.id} className="flex items-center gap-2 py-1 px-2 bg-gray-50 rounded">
                <span>{z.name}</span>
                {z.abbrev && <span className="text-[10px] text-gray-500 font-mono">[{z.abbrev}]</span>}
                {z.description && <span className="text-[10px] text-gray-400">{z.description}</span>}
                {z.dwellBenchmarkSec != null && (
                  <span className="ml-auto text-[10px] text-blue-600 font-mono">
                    🎯 {z.dwellBenchmarkMode === 'lower_better' ? '≤' : '≥'} {(z.dwellBenchmarkSec / 60).toFixed(0)} min
                  </span>
                )}
              </li>
            ))}
          </ul>
        )
      )}
    </Section>
  );
}

// ─── 4. Activities ─────────────────────────────────────
function ActivitiesEditor({ event }: { event: Event }) {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<EventActivity[]>(event.activities || []);

  useEffect(() => { if (!editing) setItems(event.activities || []); }, [event.activities, editing]);

  const save = useMutation({
    mutationFn: () => eventsApi.setActivities(event.id, items.map((a) => ({
      date: typeof a.date === 'string' ? a.date.slice(0, 10) : a.date,
      startTime: a.startTime,
      endTime: a.endTime,
      name: a.name,
      zone: a.zone || undefined,
      description: a.description || undefined,
    }))),
    onSuccess: () => {
      showToast('Activities saved');
      qc.invalidateQueries({ queryKey: ['event', event.id] });
      setEditing(false);
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to save'),
  });

  const days = event.days || [];
  const zones = event.zones || [];

  return (
    <Section title="🎯 Activities" count={items.length} editing={editing}
      setEditing={setEditing} onSave={() => save.mutate()} saving={save.isPending}
      hint="ใช้ใน profile FULL เท่านั้น">
      {editing ? (
        <div className="space-y-1.5">
          {items.map((a, i) => (
            <div key={a.id || i} className="grid grid-cols-12 gap-1 bg-gray-50 rounded p-1.5">
              <select value={typeof a.date === 'string' ? a.date.slice(0, 10) : ''}
                onChange={(e) => {
                  const next = [...items]; next[i] = { ...a, date: e.target.value } as any;
                  setItems(next);
                }}
                className="col-span-3 px-1 py-1 text-[10px] border border-gray-200 rounded bg-white">
                {days.map((d) => <option key={d.id} value={(d.date as string).slice(0, 10)}>{(d.date as string).slice(0, 10)}</option>)}
              </select>
              <input type="time" value={a.startTime}
                onChange={(e) => {
                  const next = [...items]; next[i] = { ...a, startTime: e.target.value };
                  setItems(next);
                }}
                className="col-span-2 px-1 py-1 text-[10px] border border-gray-200 rounded" />
              <input type="time" value={a.endTime}
                onChange={(e) => {
                  const next = [...items]; next[i] = { ...a, endTime: e.target.value };
                  setItems(next);
                }}
                className="col-span-2 px-1 py-1 text-[10px] border border-gray-200 rounded" />
              <input value={a.name}
                onChange={(e) => {
                  const next = [...items]; next[i] = { ...a, name: e.target.value };
                  setItems(next);
                }}
                placeholder="Name"
                className="col-span-3 px-1 py-1 text-[10px] border border-gray-200 rounded" />
              <select value={a.zone || ''}
                onChange={(e) => {
                  const next = [...items]; next[i] = { ...a, zone: e.target.value };
                  setItems(next);
                }}
                className="col-span-1 px-1 py-1 text-[10px] border border-gray-200 rounded bg-white">
                <option value="">—</option>
                {zones.map((z) => <option key={z.id} value={z.name}>{z.name}</option>)}
              </select>
              <button onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                className="col-span-1 text-[10px] text-gray-400 hover:text-red-600">✕</button>
            </div>
          ))}
          <button onClick={() => setItems([...items, {
            id: '', eventId: event.id,
            date: (days[0]?.date as string) || new Date().toISOString().slice(0, 10),
            startTime: '10:00', endTime: '11:00', name: '', zone: '', description: '',
          } as any])}
            className="w-full text-xs px-2 py-1 border border-dashed border-gray-300 rounded text-gray-600 hover:bg-gray-50">
            + Add activity
          </button>
        </div>
      ) : (
        items.length === 0 ? <Empty /> : (
          <ul className="text-sm space-y-1">
            {items.map((a) => (
              <li key={a.id} className="flex items-center gap-2 py-1 px-2 bg-gray-50 rounded">
                <span className="font-mono text-[10px] text-gray-500">{(a.date as string).slice(0, 10)} {a.startTime}–{a.endTime}</span>
                <span>{a.name}</span>
                {a.zone && <span className="text-[10px] text-gray-400">@{a.zone}</span>}
              </li>
            ))}
          </ul>
        )
      )}
    </Section>
  );
}

// ─── 5. Parameters ──────────────────────────────────────
function ParametersEditor({ event }: { event: Event }) {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    displayHoursStart: event.displayHoursStart,
    displayHoursEnd: event.displayHoursEnd,
    dwellMinSec: event.dwellMinSec,
    dwellMaxSec: event.dwellMaxSec,
    engagementThresholdSec: event.engagementThresholdSec,
    excludeStaff: event.excludeStaff ?? true,
    showDwellBenchmark: event.showDwellBenchmark ?? false,
    profile: event.profile,
    venueType: event.venueType,
    showPasserby: event.showPasserby,
    confidential: event.confidential,
  });
  useEffect(() => {
    if (!editing) setForm({
      displayHoursStart: event.displayHoursStart,
      displayHoursEnd: event.displayHoursEnd,
      dwellMinSec: event.dwellMinSec,
      dwellMaxSec: event.dwellMaxSec,
      engagementThresholdSec: event.engagementThresholdSec,
      excludeStaff: event.excludeStaff ?? true,
    showDwellBenchmark: event.showDwellBenchmark ?? false,
      profile: event.profile,
      venueType: event.venueType,
      showPasserby: event.showPasserby,
      confidential: event.confidential,
    });
  }, [event, editing]);

  const save = useMutation({
    mutationFn: () => eventsApi.update(event.id, form as any),
    onSuccess: () => {
      showToast('Parameters saved');
      qc.invalidateQueries({ queryKey: ['event', event.id] });
      setEditing(false);
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to save'),
  });

  return (
    <>
    <Section title="⚙️ Analytics Parameters" count={6} editing={editing}
      setEditing={setEditing} onSave={() => save.mutate()} saving={save.isPending}>
      {editing ? (
        <div className="space-y-2 text-xs">
          <Pair label="Display hours">
            <input type="number" min={0} max={23} value={form.displayHoursStart}
              onChange={(e) => setForm({ ...form, displayHoursStart: parseInt(e.target.value) || 0 })}
              className="w-14 px-1.5 py-1 border border-gray-200 rounded" />
            –
            <input type="number" min={0} max={24} value={form.displayHoursEnd}
              onChange={(e) => setForm({ ...form, displayHoursEnd: parseInt(e.target.value) || 24 })}
              className="w-14 px-1.5 py-1 border border-gray-200 rounded" />
            <span className="text-gray-400">hour</span>
          </Pair>
          <Pair label="Dwell time">
            <input type="number" min={0} value={form.dwellMinSec}
              onChange={(e) => setForm({ ...form, dwellMinSec: parseInt(e.target.value) || 0 })}
              className="w-16 px-1.5 py-1 border border-gray-200 rounded" />
            –
            <input type="number" min={0} value={form.dwellMaxSec}
              onChange={(e) => setForm({ ...form, dwellMaxSec: parseInt(e.target.value) || 3600 })}
              className="w-20 px-1.5 py-1 border border-gray-200 rounded" />
            <span className="text-gray-400">sec</span>
          </Pair>
          <Pair label="Engagement threshold">
            <input type="number" min={0} value={form.engagementThresholdSec}
              onChange={(e) => setForm({ ...form, engagementThresholdSec: parseInt(e.target.value) || 60 })}
              className="w-20 px-1.5 py-1 border border-gray-200 rounded" />
            <span className="text-gray-400">sec</span>
          </Pair>
          <Pair label="Profile">
            <select value={form.profile}
              onChange={(e) => setForm({ ...form, profile: e.target.value as any })}
              className="px-1.5 py-1 border border-gray-200 rounded bg-white">
              <option value="SIMPLE">Simple</option>
              <option value="STANDARD">Standard</option>
              <option value="FULL">Full</option>
            </select>
          </Pair>
          <Pair label="Venue type">
            <input value={form.venueType}
              onChange={(e) => setForm({ ...form, venueType: e.target.value })}
              className="px-1.5 py-1 border border-gray-200 rounded w-32" />
          </Pair>
          <div className="flex gap-3 pt-1">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={form.showPasserby}
                onChange={(e) => setForm({ ...form, showPasserby: e.target.checked })} />
              <span>Show passerby</span>
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={form.confidential}
                onChange={(e) => setForm({ ...form, confidential: e.target.checked })} />
              <span>Confidential</span>
            </label>
          </div>
        </div>
      ) : (
        <ul className="text-sm space-y-1">
          <Row k="Display hours" v={`${String(form.displayHoursStart).padStart(2,'0')}:00 – ${String(form.displayHoursEnd).padStart(2,'0')}:00`} />
          <Row k="Dwell range" v={`${form.dwellMinSec}s – ${form.dwellMaxSec}s`} />
          <Row k="Engagement threshold" v={`${form.engagementThresholdSec}s`} />
          <Row k="Profile" v={form.profile} />
          <Row k="Venue type" v={form.venueType} />
          <Row k="Passerby data" v={form.showPasserby ? 'Shown' : 'Hidden'} />
        </ul>
      )}
    </Section>
    <Section title="🚫 Visitor Type Filter" count={1} editing={editing}
      setEditing={setEditing} onSave={() => save.mutate()} saving={save.isPending}>
      {editing ? (
        <div className="space-y-3 text-xs">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox"
              checked={!!form.excludeStaff}
              onChange={(e) => setForm({ ...form, excludeStaff: e.target.checked })} />
            <span className="font-medium text-sm">Exclude staff from unique visitor counts</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox"
              checked={!!form.showDwellBenchmark}
              onChange={(e) => setForm({ ...form, showDwellBenchmark: e.target.checked })} />
            <span className="font-medium text-sm">Show Dwell Time Benchmark by Zone table</span>
          </label>
          <div className="ml-6 space-y-2 text-gray-600">
            <p>ตัดพนักงาน (<code className="text-[10px] bg-gray-100 px-1 rounded">CustomerType = 'Staff'</code>) ออกจาก:</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span className="text-green-700">✓ Unique Visitors</span>
              <span className="text-green-700">✓ Zone Unique</span>
              <span className="text-green-700">✓ Dwell Time</span>
              <span className="text-green-700">✓ Demographics</span>
              <span className="text-green-700">✓ Engagement Rate</span>
            </div>
            <p className="mt-1">คงเดิม (รวมทั้งหมด):</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-gray-500">
              <span>Total Visitors</span>
              <span>· Passersby</span>
              <span>· Peak Hour</span>
            </div>
            <p className="text-gray-400 italic mt-2 text-[10px]">
              ⓘ ระบบ AI ระบุพนักงานจาก column <code className="text-[10px] bg-gray-100 px-1 rounded">CustomerType</code> ใน rawdata
            </p>
          </div>
        </div>
      ) : (
        <div className="text-xs">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-3 h-3 rounded-sm ${form.excludeStaff ? 'bg-green-500' : 'bg-gray-300'}`}></span>
            <span className="font-medium">
              {form.excludeStaff ? 'Staff excluded from unique counts' : 'Staff included in unique counts'}
            </span>
          </div>
          <p className="text-gray-400 mt-1 ml-5 text-[10px]">
            {form.excludeStaff
              ? 'Unique Visitors, Zone Unique, Dwell, Demographics, Engagement exclude staff'
              : 'All metrics count staff and customers equally'}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`inline-block w-3 h-3 rounded-sm ${form.showDwellBenchmark ? 'bg-green-500' : 'bg-gray-300'}`}></span>
            <span className="font-medium">
              {form.showDwellBenchmark ? 'Dwell benchmark table shown in dashboard' : 'Dwell benchmark table hidden'}
            </span>
          </div>
        </div>
      )}
    </Section>
    </>
  );
}

const Pair = ({ label, children }: any) => (
  <div className="flex items-center gap-2">
    <span className="text-gray-500 w-32">{label}:</span>
    <div className="flex items-center gap-1">{children}</div>
  </div>
);

const Row = ({ k, v }: any) => (
  <li className="flex items-center justify-between py-1 px-2 bg-gray-50 rounded">
    <span className="text-gray-500 text-[11px]">{k}</span>
    <span className="text-gray-900 font-mono text-xs">{v}</span>
  </li>
);

const Empty = () => <div className="text-xs text-gray-400 italic py-2">— None —</div>;
