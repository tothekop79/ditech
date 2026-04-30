import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from './Toast';

export type FieldDef = {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'url' | 'email' | 'tel' | 'select';
  required?: boolean;
  hint?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  uppercase?: boolean;
};

export type ColumnDef<T = any> = {
  key: string;
  label: string;
  width?: string;
  render?: (value: any, row: T) => React.ReactNode;
  sortable?: boolean;
};

interface Props<T = any> {
  title: string;
  icon?: string;
  description?: string;
  apiNs: {
    list: (params?: any) => Promise<T[]>;
    create: (data: any) => Promise<T>;
    update: (id: string, data: any) => Promise<T>;
    delete: (id: string) => Promise<any>;
  };
  queryKey: string;
  columns: ColumnDef<T>[];
  formFields: FieldDef[];
  /** Extract id from row (default: row.id) */
  getId?: (row: T) => string;
  /** Show "X plans" warning before delete — read from `_count.installationPlans` by default */
  getPlanCount?: (row: T) => number;
}

export function MasterDataPage<T extends { id: string }>(props: Props<T>) {
  const { title, icon, description, apiNs, queryKey, columns, formFields } = props;
  const getId = props.getId || ((r: any) => r.id);
  const getPlanCount = props.getPlanCount || ((r: any) => r._count?.installationPlans || 0);

  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [sortKey, setSortKey] = useState<string>(columns[0]?.key || 'id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const { data: rows, isLoading } = useQuery({
    queryKey: [queryKey, showInactive],
    queryFn: () => apiNs.list({ includeInactive: showInactive }),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiNs.create(data),
    onSuccess: () => {
      showToast(`${title.replace(/s$/, '')} created`);
      qc.invalidateQueries({ queryKey: [queryKey] });
      setShowCreate(false);
    },
    onError: (e: any) => showToast(e.response?.data?.message || 'Create failed'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiNs.update(id, data),
    onSuccess: () => {
      showToast(`${title.replace(/s$/, '')} updated`);
      qc.invalidateQueries({ queryKey: [queryKey] });
      setEditing(null);
    },
    onError: (e: any) => showToast(e.response?.data?.message || 'Update failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiNs.delete(id),
    onSuccess: (res: any) => {
      showToast(res?.softDeleted ? res.message : `Deleted`);
      qc.invalidateQueries({ queryKey: [queryKey] });
    },
    onError: (e: any) => showToast(e.response?.data?.message || 'Delete failed'),
  });

  const filtered = useMemo(() => {
    let list = rows || [];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((row: any) =>
        columns.some((c) => {
          const val = c.key.split('.').reduce((acc: any, k) => acc?.[k], row);
          return String(val ?? '').toLowerCase().includes(q);
        })
      );
    }
    list = [...list].sort((a: any, b: any) => {
      const av = sortKey.split('.').reduce((acc: any, k) => acc?.[k], a);
      const bv = sortKey.split('.').reduce((acc: any, k) => acc?.[k], b);
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [rows, search, columns, sortKey, sortDir]);

  const onDelete = (row: T) => {
    const planCount = getPlanCount(row);
    const id = getId(row);
    const msg = planCount > 0
      ? `This has ${planCount} plan(s) referenced. It will be marked inactive (soft delete). Continue?`
      : `Permanently delete this entry?`;
    if (confirm(msg)) deleteMut.mutate(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-medium flex items-center gap-2">
            {icon && <span>{icon}</span>}
            {title}
            {rows && <span className="text-sm text-gray-500 font-normal">({rows.length})</span>}
          </h2>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..." className="ditech-input text-sm w-56" />
          <label className="text-xs text-gray-600 flex items-center gap-1.5">
            <input type="checkbox" checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
          <button onClick={() => setShowCreate(true)} className="ditech-btn-primary text-sm">
            + Add new
          </button>
        </div>
      </div>

      <div className="ditech-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            {search ? 'No results' : 'No entries yet'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {columns.map((c) => (
                    <th key={c.key}
                      style={{ width: c.width }}
                      className="text-left px-3 py-2 text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-100"
                      onClick={() => {
                        if (sortKey === c.key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                        else { setSortKey(c.key); setSortDir('asc'); }
                      }}>
                      {c.label}
                      {sortKey === c.key && <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                    </th>
                  ))}
                  <th className="w-32 px-3 py-2 text-xs font-semibold text-gray-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row: any) => (
                  <tr key={row.id} className={`border-b hover:bg-gray-50 ${row.isActive === false ? 'opacity-50' : ''}`}>
                    {columns.map((c) => {
                      const val = c.key.split('.').reduce((acc: any, k) => acc?.[k], row);
                      return (
                        <td key={c.key} className="px-3 py-2">
                          {c.render ? c.render(val, row) : (val ?? '—')}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => setEditing(row)}
                        className="text-xs text-blue-600 hover:underline mr-3">Edit</button>
                      <button onClick={() => onDelete(row)}
                        className="text-xs text-red-600 hover:underline">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(showCreate || editing) && (
        <FormModal
          title={editing ? `Edit ${title.replace(/s$/, '')}` : `Add ${title.replace(/s$/, '')}`}
          fields={formFields}
          initial={editing || undefined}
          onClose={() => { setShowCreate(false); setEditing(null); }}
          onSubmit={(data) => {
            if (editing) updateMut.mutate({ id: getId(editing), data });
            else createMut.mutate(data);
          }}
          submitting={createMut.isPending || updateMut.isPending}
        />
      )}
    </div>
  );
}

function FormModal({ title, fields, initial, onClose, onSubmit, submitting }: {
  title: string;
  fields: FieldDef[];
  initial?: any;
  onClose: () => void;
  onSubmit: (data: any) => void;
  submitting?: boolean;
}) {
  const [form, setForm] = useState<Record<string, any>>(() => {
    const init: any = {};
    fields.forEach((f) => { init[f.key] = initial?.[f.key] ?? ''; });
    return init;
  });

  const set = (key: string, value: any) => setForm((s) => ({ ...s, [key]: value }));
  const submit = () => {
    for (const f of fields) {
      if (f.required && !form[f.key]) { alert(`${f.label} is required`); return; }
    }
    onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h3 className="font-medium">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          {fields.map((f) => (
            <label key={f.key} className="block">
              <span className="text-xs text-gray-700 mb-1 block">
                {f.label}{f.required && <span className="text-red-500"> *</span>}
              </span>
              {f.type === 'textarea' ? (
                <textarea value={form[f.key] || ''} onChange={(e) => set(f.key, e.target.value)}
                  placeholder={f.placeholder} rows={3}
                  className="w-full ditech-input" />
              ) : f.type === 'select' ? (
                <select value={form[f.key] || ''} onChange={(e) => set(f.key, e.target.value)}
                  className="w-full ditech-input">
                  <option value="">— select —</option>
                  {f.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <input type={f.type === 'url' || f.type === 'email' || f.type === 'tel' ? f.type : 'text'}
                  value={form[f.key] || ''}
                  onChange={(e) => set(f.key, f.uppercase ? e.target.value.toUpperCase() : e.target.value)}
                  placeholder={f.placeholder}
                  className="w-full ditech-input" />
              )}
              {f.hint && <span className="text-[10px] text-gray-500 mt-0.5 block">{f.hint}</span>}
            </label>
          ))}
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={submitting}
            className="ditech-btn-primary text-sm disabled:opacity-50">
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
