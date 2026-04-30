import { useState, useRef, useEffect, useMemo } from 'react';

export type DateRange = { from: Date; to: Date; label: string };

export type PresetKey =
  | 'today' | 'yesterday'
  | 'this_week' | 'last_week'
  | 'this_month' | 'last_month'
  | 'last_7d' | 'last_30d' | 'last_90d'
  | 'this_quarter' | 'this_year' | 'ytd' | 'all'
  | 'custom';

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay   = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
const addDays    = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };

const startOfWeek = (d: Date) => {
  const x = startOfDay(d);
  const dow = x.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  x.setDate(x.getDate() - diff);
  return x;
};
const endOfWeek = (d: Date) => endOfDay(addDays(startOfWeek(d), 6));

const startOfMonth = (d: Date) => startOfDay(new Date(d.getFullYear(), d.getMonth(), 1));
const endOfMonth   = (d: Date) => endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));

const startOfQuarter = (d: Date) => {
  const q = Math.floor(d.getMonth() / 3);
  return startOfDay(new Date(d.getFullYear(), q * 3, 1));
};
const endOfQuarter = (d: Date) => {
  const q = Math.floor(d.getMonth() / 3);
  return endOfDay(new Date(d.getFullYear(), q * 3 + 3, 0));
};

const startOfYear = (d: Date) => startOfDay(new Date(d.getFullYear(), 0, 1));
const endOfYear   = (d: Date) => endOfDay(new Date(d.getFullYear(), 11, 31));

export function getPresetRange(key: PresetKey, custom?: { from: Date; to: Date }): DateRange {
  const now = new Date();
  switch (key) {
    case 'today':       return { from: startOfDay(now), to: endOfDay(now), label: 'Today' };
    case 'yesterday':   { const y = addDays(now, -1); return { from: startOfDay(y), to: endOfDay(y), label: 'Yesterday' }; }
    case 'this_week':   return { from: startOfWeek(now), to: endOfWeek(now), label: 'This week' };
    case 'last_week':   { const lw = addDays(now, -7); return { from: startOfWeek(lw), to: endOfWeek(lw), label: 'Last week' }; }
    case 'this_month':  return { from: startOfMonth(now), to: endOfMonth(now), label: 'This month' };
    case 'last_month':  { const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); return { from: startOfMonth(lm), to: endOfMonth(lm), label: 'Last month' }; }
    case 'last_7d':     return { from: startOfDay(addDays(now, -6)), to: endOfDay(now), label: 'Last 7 days' };
    case 'last_30d':    return { from: startOfDay(addDays(now, -29)), to: endOfDay(now), label: 'Last 30 days' };
    case 'last_90d':    return { from: startOfDay(addDays(now, -89)), to: endOfDay(now), label: 'Last 90 days' };
    case 'this_quarter':return { from: startOfQuarter(now), to: endOfQuarter(now), label: 'This quarter' };
    case 'this_year':   return { from: startOfYear(now), to: endOfYear(now), label: 'This year' };
    case 'ytd':         return { from: startOfYear(now), to: endOfDay(now), label: 'Year-to-date' };
    case 'all':         return { from: new Date(2020, 0, 1), to: new Date(2100, 11, 31), label: 'All time' };
    case 'custom': {
      const from = custom?.from ?? startOfMonth(now);
      const to = custom?.to ?? endOfMonth(now);
      return { from: startOfDay(from), to: endOfDay(to), label: `${from.toLocaleDateString('en-GB')} – ${to.toLocaleDateString('en-GB')}` };
    }
  }
}

const PRESET_GROUPS: { label: string; items: { key: PresetKey; label: string }[] }[] = [
  { label: 'Quick', items: [
    { key: 'today',     label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'last_7d',   label: 'Last 7 days' },
    { key: 'last_30d',  label: 'Last 30 days' },
    { key: 'last_90d',  label: 'Last 90 days' },
  ]},
  { label: 'Calendar', items: [
    { key: 'this_week',  label: 'This week' },
    { key: 'last_week',  label: 'Last week' },
    { key: 'this_month', label: 'This month' },
    { key: 'last_month', label: 'Last month' },
    { key: 'this_quarter', label: 'This quarter' },
    { key: 'this_year',  label: 'This year' },
    { key: 'ytd',        label: 'Year-to-date' },
  ]},
  { label: 'All', items: [
    { key: 'all', label: 'All time' },
  ]},
];

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
  allowedPresets?: PresetKey[];
  className?: string;
  allowCustom?: boolean;
}

export function DateRangeFilter({ value, onChange, allowedPresets, allowCustom = true, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<PresetKey | null>(null);
  const [customFrom, setCustomFrom] = useState<string>(value.from.toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState<string>(value.to.toISOString().slice(0, 10));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    setCustomFrom(value.from.toISOString().slice(0, 10));
    setCustomTo(value.to.toISOString().slice(0, 10));
  }, [value.from, value.to]);

  const groups = useMemo(() => {
    if (!allowedPresets) return PRESET_GROUPS;
    return PRESET_GROUPS.map(g => ({ ...g, items: g.items.filter(i => allowedPresets.includes(i.key)) }))
      .filter(g => g.items.length > 0);
  }, [allowedPresets]);

  const selectPreset = (key: PresetKey) => {
    setActiveKey(key);
    onChange(getPresetRange(key));
    setOpen(false);
  };

  const applyCustom = () => {
    const from = new Date(customFrom);
    const to = new Date(customTo);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) return;
    if (from > to) return;
    setActiveKey('custom');
    onChange(getPresetRange('custom', { from, to }));
    setOpen(false);
  };

  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="px-3 py-1.5 ditech-input bg-white text-left text-sm flex items-center gap-2 min-w-[220px]"
        type="button"
      >
        <span className="text-gray-500">📅</span>
        <span className="flex-1 truncate font-medium">{value.label}</span>
        <span className="text-xs text-gray-400 hidden sm:inline whitespace-nowrap">{fmt(value.from)} – {fmt(value.to)}</span>
        <span className="text-xs text-gray-400">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border border-ditech-border z-50 w-[440px] max-w-[calc(100vw-32px)]">
          <div className="grid grid-cols-2 gap-0">
            <div className="border-r border-ditech-border p-2 space-y-3 max-h-[400px] overflow-y-auto">
              {groups.map((g) => (
                <div key={g.label}>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold px-2 py-1">{g.label}</div>
                  {g.items.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => selectPreset(p.key)}
                      className={`block w-full text-left px-2 py-1.5 text-sm rounded hover:bg-ditech-surface-alt ${
                        activeKey === p.key ? 'bg-blue-50 text-ditech-secondary font-medium' : ''
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div className="p-3 space-y-3">
              {allowCustom ? (
                <>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Custom range</div>
                  <label className="block">
                    <span className="text-xs text-gray-600 mb-1 block">From</span>
                    <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                      className="w-full ditech-input" />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-600 mb-1 block">To</span>
                    <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                      className="w-full ditech-input" />
                  </label>
                  <button onClick={applyCustom} className="w-full ditech-btn-primary text-sm">
                    Apply custom
                  </button>
                </>
              ) : (
                <div className="text-xs text-gray-400 text-center py-4">Custom not allowed</div>
              )}

              <div className="pt-2 mt-2 border-t border-ditech-border">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Currently</div>
                <div className="text-xs text-gray-700">{fmt(value.from)} → {fmt(value.to)}</div>
                <div className="text-[10px] text-gray-400 mt-1">
                  {Math.ceil((value.to.getTime() - value.from.getTime()) / (1000 * 60 * 60 * 24)) + 1} days
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
