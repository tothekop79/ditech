import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { eventsApi, type EventProfile, type GateType, type EventCreateInput, PROFILE_DESC } from '../api/events';
import { useToast } from '../components/Toast';

const DAY_COLORS = ['#1F77B4', '#FF7F0E', '#2CA02C', '#D62728', '#9467BD', '#17BECF', '#E377C2'];

export function NewEventWizard() {
  const navigate = useNavigate();
  const showToast = useToast((s) => s.show);

  const [step, setStep] = useState(1);

  // ─── Step 1: Basic info ───
  const [basic, setBasic] = useState({
    name: '',
    organizer: '',
    venue: '',
    venueType: 'Booth',
    startDate: '',
    endDate: '',
    profile: 'FULL' as EventProfile,
    description: '',
    confidential: true,
    showPasserby: true,
  });

  // ─── Step 2: Days ───
  const [days, setDays] = useState<Array<{ dayNumber: number; date: string; label: string; color: string }>>([]);
  const generateDays = (start: string, end: string) => {
    if (!start || !end) return [];
    const s = new Date(start);
    const e = new Date(end);
    const out: typeof days = [];
    let n = 1;
    for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
      out.push({
        dayNumber: n,
        date: cur.toISOString().slice(0, 10),
        label: `Day ${n}`,
        color: DAY_COLORS[(n - 1) % DAY_COLORS.length],
      });
      n++;
    }
    return out;
  };

  // ─── Step 3: Gates + Zones ───
  const [gates, setGates] = useState<Array<{ name: string; gateType: GateType }>>([
    { name: 'Front Gate', gateType: 'ENTRANCE' },
  ]);
  const [zones, setZones] = useState<Array<{ name: string; abbrev: string }>>([]);

  // ─── Step 4: Activities ───
  const [activities, setActivities] = useState<Array<{ date: string; startTime: string; endTime: string; name: string; zone?: string }>>([]);

  const create = useMutation({
    mutationFn: (data: EventCreateInput) => eventsApi.create(data),
    onSuccess: (event) => {
      showToast('Event created');
      navigate(`/events/${event.id}`);
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to create'),
  });

  const handleNext = () => {
    if (step === 1) {
      if (!basic.name || !basic.startDate || !basic.endDate) {
        showToast('Please fill name and date range');
        return;
      }
      if (new Date(basic.endDate) < new Date(basic.startDate)) {
        showToast('End date must be on or after start date');
        return;
      }
      setDays(generateDays(basic.startDate, basic.endDate));
    }
    setStep(step + 1);
  };

  const handleSubmit = () => {
    create.mutate({
      ...basic,
      days,
      gates,
      zones,
      activities,
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">📊 Create new event</h2>
        <button onClick={() => navigate('/events')} className="text-sm text-gray-500 hover:text-gray-700">
          ← Cancel
        </button>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {['Basic', 'Days', 'Gates & Zones', 'Activities'].map((label, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          return (
            <div key={n} className="flex-1 flex items-center gap-2">
              <div className={`w-7 h-7 flex items-center justify-center text-xs rounded-full ${
                active ? 'bg-blue-600 text-white' : done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {done ? '✓' : n}
              </div>
              <span className={`text-xs ${active ? 'font-semibold' : 'text-gray-500'}`}>{label}</span>
              {n < 4 && <div className="flex-1 h-px bg-gray-200" />}
            </div>
          );
        })}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-3">
            <h3 className="font-semibold mb-2">Basic information</h3>
            <Field label="Event name *">
              <input value={basic.name} onChange={(e) => setBasic({ ...basic, name: e.target.value })}
                placeholder="e.g. Bangkok Design Week 2026"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Organizer">
                <input value={basic.organizer} onChange={(e) => setBasic({ ...basic, organizer: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
              </Field>
              <Field label="Venue">
                <input value={basic.venue} onChange={(e) => setBasic({ ...basic, venue: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date *">
                <input type="date" value={basic.startDate}
                  onChange={(e) => setBasic({ ...basic, startDate: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
              </Field>
              <Field label="End date *">
                <input type="date" value={basic.endDate}
                  onChange={(e) => setBasic({ ...basic, endDate: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
              </Field>
            </div>

            <Field label="Profile">
              <div className="space-y-2">
                {(['SIMPLE', 'STANDARD', 'FULL'] as EventProfile[]).map((p) => (
                  <label key={p} className={`flex items-start gap-2 p-2 border rounded cursor-pointer ${
                    basic.profile === p ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}>
                    <input type="radio" checked={basic.profile === p}
                      onChange={() => setBasic({ ...basic, profile: p })}
                      className="mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">{p}</div>
                      <div className="text-xs text-gray-500">{PROFILE_DESC[p]}</div>
                    </div>
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Description">
              <textarea value={basic.description}
                onChange={(e) => setBasic({ ...basic, description: e.target.value })}
                rows={2}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded resize-none" />
            </Field>

            <div className="flex gap-4 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={basic.confidential}
                  onChange={(e) => setBasic({ ...basic, confidential: e.target.checked })} />
                Mark as confidential
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={basic.showPasserby}
                  onChange={(e) => setBasic({ ...basic, showPasserby: e.target.checked })} />
                Show passerby data
              </label>
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div>
            <h3 className="font-semibold mb-2">Days breakdown</h3>
            <p className="text-xs text-gray-500 mb-3">
              {days.length} day{days.length !== 1 ? 's' : ''} generated from your date range. You can rename labels and adjust colors.
            </p>
            <div className="space-y-1.5">
              {days.map((d, i) => (
                <div key={d.date} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                  <span className="text-xs text-gray-500 w-12">Day {d.dayNumber}</span>
                  <span className="text-xs text-gray-600 font-mono w-24">{d.date}</span>
                  <input value={d.label}
                    onChange={(e) => {
                      const next = [...days];
                      next[i] = { ...next[i], label: e.target.value };
                      setDays(next);
                    }}
                    className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded" />
                  <input type="color" value={d.color}
                    onChange={(e) => {
                      const next = [...days];
                      next[i] = { ...next[i], color: e.target.value };
                      setDays(next);
                    }}
                    className="w-8 h-7 border border-gray-200 rounded cursor-pointer" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-semibold">Gates & Zones</h3>

            <ListEditor
              title="Gates"
              hint="ทางเข้าออก หรือจุด passerby (camera ที่นับคนเดินผ่าน)"
              items={gates}
              addLabel="+ Add gate"
              onAdd={() => setGates([...gates, { name: '', gateType: 'ENTRANCE' }])}
              onRemove={(i) => setGates(gates.filter((_, idx) => idx !== i))}
              renderItem={(g, i) => (
                <>
                  <input value={g.name}
                    onChange={(e) => {
                      const next = [...gates];
                      next[i] = { ...next[i], name: e.target.value };
                      setGates(next);
                    }}
                    placeholder="Gate name"
                    className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded" />
                  <select value={g.gateType}
                    onChange={(e) => {
                      const next = [...gates];
                      next[i] = { ...next[i], gateType: e.target.value as GateType };
                      setGates(next);
                    }}
                    className="px-2 py-1 text-sm border border-gray-200 rounded bg-white">
                    <option value="ENTRANCE">Entrance</option>
                    <option value="PASSERBY">Passerby</option>
                  </select>
                </>
              )}
            />

            <ListEditor
              title="Zones"
              hint={basic.profile === 'SIMPLE' ? 'ไม่จำเป็นใน profile SIMPLE' : 'พื้นที่ภายใน venue (เช่น Main Stage, Booth Area)'}
              items={zones}
              addLabel="+ Add zone"
              onAdd={() => setZones([...zones, { name: '', abbrev: '' }])}
              onRemove={(i) => setZones(zones.filter((_, idx) => idx !== i))}
              renderItem={(z, i) => (
                <>
                  <input value={z.name}
                    onChange={(e) => {
                      const next = [...zones];
                      next[i] = { ...next[i], name: e.target.value };
                      setZones(next);
                    }}
                    placeholder="Zone name"
                    className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded" />
                  <input value={z.abbrev}
                    onChange={(e) => {
                      const next = [...zones];
                      next[i] = { ...next[i], abbrev: e.target.value };
                      setZones(next);
                    }}
                    placeholder="Abbrev (for charts)"
                    className="w-32 px-2 py-1 text-sm border border-gray-200 rounded" />
                </>
              )}
            />
          </div>
        )}

        {/* Step 4 */}
        {step === 4 && (
          <div>
            <h3 className="font-semibold mb-1">Activities</h3>
            <p className="text-xs text-gray-500 mb-3">
              {basic.profile === 'FULL'
                ? 'เพิ่มกิจกรรมตามตารางในแต่ละวัน — จะถูกแสดงในรายงานพร้อมกราฟ'
                : 'ไม่จำเป็นใน profile ' + basic.profile + ' (engine จะข้าม section นี้)'}
            </p>

            <ListEditor
              title=""
              items={activities}
              addLabel="+ Add activity"
              onAdd={() => setActivities([
                ...activities,
                { date: days[0]?.date || '', startTime: '10:00', endTime: '11:00', name: '', zone: '' },
              ])}
              onRemove={(i) => setActivities(activities.filter((_, idx) => idx !== i))}
              renderItem={(a, i) => (
                <div className="flex-1 grid grid-cols-12 gap-1.5">
                  <select value={a.date}
                    onChange={(e) => {
                      const next = [...activities];
                      next[i] = { ...next[i], date: e.target.value };
                      setActivities(next);
                    }}
                    className="col-span-3 px-1.5 py-1 text-xs border border-gray-200 rounded bg-white">
                    {days.map((d) => <option key={d.date} value={d.date}>{d.date} ({d.label})</option>)}
                  </select>
                  <input type="time" value={a.startTime}
                    onChange={(e) => {
                      const next = [...activities];
                      next[i] = { ...next[i], startTime: e.target.value };
                      setActivities(next);
                    }}
                    className="col-span-2 px-1.5 py-1 text-xs border border-gray-200 rounded" />
                  <input type="time" value={a.endTime}
                    onChange={(e) => {
                      const next = [...activities];
                      next[i] = { ...next[i], endTime: e.target.value };
                      setActivities(next);
                    }}
                    className="col-span-2 px-1.5 py-1 text-xs border border-gray-200 rounded" />
                  <input value={a.name}
                    onChange={(e) => {
                      const next = [...activities];
                      next[i] = { ...next[i], name: e.target.value };
                      setActivities(next);
                    }}
                    placeholder="Activity name"
                    className="col-span-3 px-1.5 py-1 text-xs border border-gray-200 rounded" />
                  <select value={a.zone || ''}
                    onChange={(e) => {
                      const next = [...activities];
                      next[i] = { ...next[i], zone: e.target.value };
                      setActivities(next);
                    }}
                    className="col-span-2 px-1.5 py-1 text-xs border border-gray-200 rounded bg-white">
                    <option value="">(no zone)</option>
                    {zones.map((z) => <option key={z.name} value={z.name}>{z.name}</option>)}
                  </select>
                </div>
              )}
            />
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between items-center mt-5 pt-4 border-t">
          <button onClick={() => step > 1 ? setStep(step - 1) : navigate('/events')}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">
            {step === 1 ? '← Cancel' : '← Back'}
          </button>
          <div className="text-xs text-gray-500">Step {step} of 4</div>
          {step < 4 ? (
            <button onClick={handleNext}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
              Next →
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={create.isPending}
              className="px-4 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
              {create.isPending ? 'Creating…' : '✓ Create event'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: any }) => (
  <div>
    <label className="text-[11px] uppercase tracking-wide text-gray-500 block mb-1">{label}</label>
    {children}
  </div>
);

interface ListEditorProps<T> {
  title: string;
  hint?: string;
  items: T[];
  addLabel: string;
  onAdd: () => void;
  onRemove: (i: number) => void;
  renderItem: (item: T, index: number) => any;
}
function ListEditor<T>({ title, hint, items, addLabel, onAdd, onRemove, renderItem }: ListEditorProps<T>) {
  return (
    <div>
      {title && <h4 className="text-sm font-medium text-gray-700">{title}</h4>}
      {hint && <p className="text-[11px] text-gray-500 mb-2">{hint}</p>}
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {renderItem(it, i)}
            <button onClick={() => onRemove(i)}
              className="text-[10px] px-1.5 py-1 text-gray-400 hover:text-red-600">✕</button>
          </div>
        ))}
        {items.length === 0 && <div className="text-xs text-gray-400 italic py-2">No items</div>}
      </div>
      <button onClick={onAdd}
        className="mt-2 text-xs px-2 py-1 border border-dashed border-gray-300 rounded text-gray-600 hover:bg-gray-50">
        {addLabel}
      </button>
    </div>
  );
}
