import { useQuery } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { masterApi } from '../api/master';
import { teamsApi } from '../api/teams';

export type FilterValues = {
  search?: string;
  customerId?: string;
  departmentId?: string;
  storeRegion?: string;
  province?: string;
  teamId?: string;
  planStatus?: string;     // CSV: "DRAFT,IN_PROGRESS"
  readiness?: string;      // CSV: "READY,NOT_READY"
};

export type FilterFieldKey =
  | 'search' | 'customer' | 'department'
  | 'region' | 'province' | 'team'
  | 'status' | 'readiness';

interface Props {
  values: FilterValues;
  onChange: (next: FilterValues) => void;
  fields?: FilterFieldKey[];
  provinceOptions?: string[];
  collapsible?: boolean;
  defaultOpen?: boolean;
}

const STATUSES = ['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const READINESS = ['PENDING', 'NOT_READY', 'READY', 'ON_HOLD'];

const INPUT_BASE = "px-2 py-1 text-xs border rounded outline-none focus:border-blue-500";

export function FilterBar({
  values, onChange, fields,
  provinceOptions = [],
  collapsible = true, defaultOpen = true,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const allFields: FilterFieldKey[] = fields ||
    ['search', 'customer', 'department', 'region', 'province', 'team', 'status', 'readiness'];

  const { data: customers } = useQuery({
    queryKey: ['customers'], queryFn: masterApi.customers,
    enabled: allFields.includes('customer'),
  });
  const { data: departments } = useQuery({
    queryKey: ['departments'], queryFn: masterApi.departments,
    enabled: allFields.includes('department'),
  });
  const { data: teams } = useQuery({
    queryKey: ['teams'], queryFn: teamsApi.list,
    enabled: allFields.includes('team'),
  });

  const set = (k: keyof FilterValues, v: string) => {
    onChange({ ...values, [k]: v || undefined });
  };

  // Multi-value helpers (CSV)
  const csvHas = (csv: string | undefined, val: string) => {
    if (!csv) return false;
    return csv.split(',').includes(val);
  };
  const csvToggle = (csv: string | undefined, val: string): string | undefined => {
    const arr = csv ? csv.split(',').filter(Boolean) : [];
    const next = arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
    return next.length === 0 ? undefined : next.join(',');
  };

  const activeCount = Object.values(values).filter((v) => !!v).length;

  const clearAll = () => onChange({});

  const renderField = (key: FilterFieldKey) => {
    switch (key) {
      case 'search':
        return (
          <input key={key} placeholder="🔍 Store name..."
            value={values.search || ''}
            onChange={(e) => set('search', e.target.value)}
            className={`${INPUT_BASE} border-gray-300 w-48`} />
        );
      case 'customer':
        return (
          <select key={key} value={values.customerId || ''} onChange={(e) => set('customerId', e.target.value)}
            className={`${INPUT_BASE} ${values.customerId ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}`}>
            <option value="">All customers</option>
            {customers?.map((c: any) => <option key={c.id} value={c.id}>{c.customerCode}</option>)}
          </select>
        );
      case 'department':
        return (
          <select key={key} value={values.departmentId || ''} onChange={(e) => set('departmentId', e.target.value)}
            className={`${INPUT_BASE} ${values.departmentId ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}`}>
            <option value="">All departments</option>
            {departments?.map((d: any) => <option key={d.id} value={d.id}>{d.departmentName}</option>)}
          </select>
        );
      case 'region':
        return (
          <select key={key} value={values.storeRegion || ''} onChange={(e) => set('storeRegion', e.target.value)}
            className={`${INPUT_BASE} ${values.storeRegion ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}`}>
            <option value="">All regions</option>
            <option value="BANGKOK">BANGKOK</option>
            <option value="UPC">UPC</option>
          </select>
        );
      case 'province':
        return (
          <select key={key} value={values.province || ''} onChange={(e) => set('province', e.target.value)}
            className={`${INPUT_BASE} ${values.province ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}`}>
            <option value="">All provinces</option>
            {provinceOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        );
      case 'team':
        return (
          <select key={key} value={values.teamId || ''} onChange={(e) => set('teamId', e.target.value)}
            className={`${INPUT_BASE} ${values.teamId ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}`}>
            <option value="">All teams</option>
            <option value="null">— Unassigned —</option>
            {teams?.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        );
      case 'status':
        return (
          <MultiSelect key={key} label="statuses" allLabel="All statuses"
            options={STATUSES} value={values.planStatus}
            onToggle={(v) => onChange({ ...values, planStatus: csvToggle(values.planStatus, v) })}
            onClear={() => onChange({ ...values, planStatus: undefined })}
            csvHas={csvHas} />
        );
      case 'readiness':
        return (
          <MultiSelect key={key} label="readiness" allLabel="All readiness"
            options={READINESS} value={values.readiness}
            onToggle={(v) => onChange({ ...values, readiness: csvToggle(values.readiness, v) })}
            onClear={() => onChange({ ...values, readiness: undefined })}
            csvHas={csvHas} />
        );
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded">
      {collapsible ? (
        <div className="px-2 py-1.5 flex items-center gap-2 flex-wrap">
          <button onClick={() => setOpen(!open)}
            className="text-xs text-gray-600 flex items-center gap-1 hover:text-gray-900 px-1.5 py-0.5 rounded hover:bg-gray-100">
            <span className="text-[10px]">{open ? '▾' : '▸'}</span>
            <span>Filters</span>
            {activeCount > 0 && (
              <span className="px-1 bg-blue-500 text-white rounded text-[10px] font-medium leading-tight">
                {activeCount}
              </span>
            )}
          </button>

          {open && (
            <>
              {allFields.map(renderField)}
              {activeCount > 0 && (
                <button onClick={clearAll}
                  className="text-xs text-blue-600 hover:underline px-1.5">
                  Clear
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="p-2 flex items-center gap-2 flex-wrap">
          {allFields.map(renderField)}
          {activeCount > 0 && (
            <button onClick={clearAll} className="text-xs text-blue-600 hover:underline px-1.5">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MultiSelect dropdown with checkboxes ───
function MultiSelect({ label, allLabel, options, value, onToggle, onClear, csvHas }: {
  label: string;
  allLabel: string;
  options: string[];
  value?: string;
  onToggle: (v: string) => void;
  onClear: () => void;
  csvHas: (csv: string | undefined, v: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  const count = value ? value.split(',').filter(Boolean).length : 0;
  const buttonLabel = count === 0 ? allLabel : `${count} ${label}`;

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={`px-2 py-1 text-xs border rounded outline-none focus:border-blue-500 flex items-center gap-1 ${
          count > 0 ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700'
        }`}>
        <span>{buttonLabel}</span>
        <span className="text-[8px]">▾</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 left-0 bg-white border border-gray-200 rounded shadow-lg min-w-[160px] py-1">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 text-xs cursor-pointer">
              <input type="checkbox"
                checked={csvHas(value, opt)}
                onChange={() => onToggle(opt)}
                onClick={(e) => e.stopPropagation()} />
              <span>{opt}</span>
            </label>
          ))}
          {count > 0 && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <button onClick={onClear}
                className="w-full text-left px-2 py-1 text-xs text-blue-600 hover:bg-gray-50">
                Clear {label}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
