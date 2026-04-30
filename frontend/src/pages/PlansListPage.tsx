import { useState, useMemo } from 'react';
import { usePersistedFilters } from '../hooks/usePersistedFilters';
import { MultiStatusFilter } from '../components/MultiStatusFilter';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { plansApi } from '../api/plans';
import { DateRangeFilter, getPresetRange, DateRange } from '../components/DateRangeFilter';
import { CreatePlanModal } from '../components/CreatePlanModal';
import { teamsApi } from '../api/teams';
import { masterApi } from '../api/master';
import { useToast } from '../components/Toast';
import { StatusPill } from '../components/StatusPill';
import { InlineCell } from '../components/InlineCell';
import type { InstallationPlan } from '../api/types';

const STATUSES = ['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const READINESS = ['PENDING', 'NOT_READY', 'READY', 'ON_HOLD'];
const REGIONS = ['BANGKOK', 'UPC'];

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-200 text-gray-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700 line-through',
};

const READINESS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  NOT_READY: 'bg-red-50 text-red-700',
  READY: 'bg-green-50 text-green-700',
  ON_HOLD: 'bg-amber-50 text-amber-700',
};

export function PlansListPage() {
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);

  const [filters, setFilters, resetFilters] = usePersistedFilters<any>('plans-list', {
    search: '',
    customerId: '',
    departmentId: '',
    teamId: '',
    planStatuses: ['DRAFT', 'CONFIRMED', 'IN_PROGRESS'],  // multi-select; default hides COMPLETED + CANCELLED
    readiness: '',
    storeRegion: '',
    province: '',
  });

  const [sortBy, setSortBy] = useState<string>('scheduledDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [range, setRange] = useState<DateRange>(() => getPresetRange('all'));
  const [showCreate, setShowCreate] = useState(false);
  const [groupBy, setGroupBy] = useState<'none' | 'customer' | 'department' | 'team' | 'region' | 'province' | 'status'>('none');
  const [showFilters, setShowFilters] = useState(true);
  const limit = 100;

  const { data: plansResp, isLoading } = useQuery({
    queryKey: ['plans-list', filters, sortBy, sortDir, page, range.from.toISOString(), range.to.toISOString()],
    queryFn: () =>
      plansApi.list({
        ...Object.fromEntries(
          Object.entries(filters)
            .filter(([k, v]) => {
              if (k === 'planStatuses') return Array.isArray(v) && v.length > 0;
              return v;
            })
            .map(([k, v]) => k === 'planStatuses' ? ['planStatus', (v as string[]).join(',')] : [k, v])
        ),
        scheduledFrom: range.from.toISOString(),
        scheduledTo: range.to.toISOString(),
        sortBy,
        sortDir,
        page,
        limit,
      }),
  });

  const { data: teams } = useQuery({ queryKey: ['teams'], queryFn: teamsApi.list });
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: masterApi.customers });
  const { data: departments } = useQuery({ queryKey: ['departments'], queryFn: masterApi.departments });

  const plans: InstallationPlan[] = plansResp?.data || [];
  const pagination = plansResp?.pagination;

  // Distinct provinces from current data — for filter dropdown
  const provinceOptions = useMemo(() => {
    const set = new Set<string>();
    plans.forEach((p: any) => p.province && set.add(p.province));
    return Array.from(set).sort();
  }, [plans]);

  // Inline update mutation
  const updatePlan = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => plansApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plans-list'] });
      qc.invalidateQueries({ queryKey: ['plans'] });
      qc.invalidateQueries({ queryKey: ['plan'] });
      qc.invalidateQueries({ queryKey: ['gantt-plans'] });
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message || e?.message || 'Update failed';
      showToast(`Save failed: ${msg}`);
      throw e; // re-throw so InlineCell shows error too
    },
  });

  const saveField = async (id: string, field: string, value: any) => {
    return updatePlan.mutateAsync({ id, payload: { [field]: value } });
  };

  const bulkUpdate = useMutation({
    mutationFn: async ({ ids, payload }: any) => {
      await Promise.all(ids.map((id: string) => plansApi.update(id, payload)));
    },
    onSuccess: () => {
      showToast(`Updated ${selected.size} plans`);
      qc.invalidateQueries({ queryKey: ['plans-list'] });
      qc.invalidateQueries({ queryKey: ['plans'] });
      setSelected(new Set());
    },
    onError: (e: any) => showToast(e.message || 'Bulk update failed'),
  });

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    plans.forEach(p => { counts[p.planStatus] = (counts[p.planStatus] || 0) + 1; });
    return counts;
  }, [plans]);

  const toggleAll = () => {
    if (selected.size === plans.length) setSelected(new Set());
    else setSelected(new Set(plans.map(p => p.id)));
  };
  const toggleOne = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };

  const setFilter = (k: string, v: string) => {
    setFilters({ ...filters, [k]: v });
    setPage(1);
  };
  const clearFilters = () => {
    resetFilters();
    setPage(1);
  };

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  // Group plans (for display)
  const grouped = useMemo(() => {
    if (groupBy === 'none') return null;
    const map = new Map<string, { label: string; plans: InstallationPlan[] }>();
    plans.forEach((p: any) => {
      let key = '_';
      let label = '—';
      if (groupBy === 'customer') {
        key = p.customerId; label = p.customer?.customerCode || 'Unknown';
      } else if (groupBy === 'department') {
        key = p.departmentId; label = p.department?.departmentName || 'Unknown';
      } else if (groupBy === 'team') {
        key = p.teamId || '_un'; label = p.team?.name || '— Unassigned —';
      } else if (groupBy === 'region') {
        key = p.storeRegion || '_'; label = p.storeRegion || '—';
      } else if (groupBy === 'province') {
        key = p.province || '_'; label = p.province || '— No province —';
      } else if (groupBy === 'status') {
        key = p.planStatus; label = p.planStatus;
      }
      if (!map.has(key)) map.set(key, { label, plans: [] });
      map.get(key)!.plans.push(p);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].label.localeCompare(b[1].label));
  }, [plans, groupBy]);

  // Active filters count
  const activeFilterCount = Object.entries(filters).filter(([k, v]) => {
    if (k === 'planStatuses') {
      // Count as active filter if it differs from default (less than all 5)
      return Array.isArray(v) && v.length > 0 && v.length < 5;
    }
    return v;
  }).length;

  // Number column — global index (across pagination)
  const baseIndex = (page - 1) * limit;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-medium">All Plans · {pagination?.total || 0}</h2>
          <div className="text-xs text-gray-500 mt-1 flex gap-3 flex-wrap">
            {Object.entries(stats).map(([s, c]) => (
              <span key={s} className={`px-1.5 rounded ${STATUS_COLORS[s] || ''}`}>
                {s}: <strong>{c}</strong>
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangeFilter value={range} onChange={setRange} />
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm bg-white">
            <option value="none">No grouping</option>
            <option value="customer">Group by customer</option>
            <option value="department">Group by department</option>
            <option value="team">Group by team</option>
            <option value="region">Group by region</option>
            <option value="province">Group by province</option>
            <option value="status">Group by status</option>
          </select>
          <button onClick={() => setShowFilters(!showFilters)}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50">
            {showFilters ? 'Hide' : 'Show'} filters {activeFilterCount > 0 && <span className="ml-1 px-1.5 bg-blue-500 text-white rounded text-xs">{activeFilterCount}</span>}
          </button>
          <button onClick={() => setShowCreate(true)}
            className="ditech-btn-primary text-sm">
            + New plan
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white border border-gray-200 rounded px-2 py-1.5 flex items-center gap-2 flex-wrap text-sm">
          <input placeholder="🔍 Store name..." value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            className="px-2 py-1 text-xs border border-gray-300 rounded outline-none focus:border-blue-500 w-48" />

          <select value={filters.customerId} onChange={(e) => setFilter('customerId', e.target.value)}
            className={`px-2 py-1 text-xs border rounded outline-none focus:border-blue-500 ${filters.customerId ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}`}>
            <option value="">All customers</option>
            {customers?.map((c: any) => <option key={c.id} value={c.id}>{c.customerCode}</option>)}
          </select>

          <select value={filters.departmentId} onChange={(e) => setFilter('departmentId', e.target.value)}
            className={`px-2 py-1 text-xs border rounded outline-none focus:border-blue-500 ${filters.departmentId ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}`}>
            <option value="">All departments</option>
            {departments?.map((d: any) => <option key={d.id} value={d.id}>{d.departmentName}</option>)}
          </select>

          <select value={filters.storeRegion} onChange={(e) => setFilter('storeRegion', e.target.value)}
            className={`px-2 py-1 text-xs border rounded outline-none focus:border-blue-500 ${filters.storeRegion ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}`}>
            <option value="">All regions</option>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <select value={filters.province} onChange={(e) => setFilter('province', e.target.value)}
            className={`px-2 py-1 text-xs border rounded outline-none focus:border-blue-500 ${filters.province ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}`}>
            <option value="">All provinces</option>
            {provinceOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select value={filters.teamId} onChange={(e) => setFilter('teamId', e.target.value)}
            className={`px-2 py-1 text-xs border rounded outline-none focus:border-blue-500 ${filters.teamId ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}`}>
            <option value="">All teams</option>
            <option value="null">— Unassigned —</option>
            {teams?.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          <MultiStatusFilter
            values={filters.planStatuses || []}
            onChange={(next) => setFilter('planStatuses', next)}
            options={[
              { value: 'DRAFT',       label: 'Draft' },
              { value: 'CONFIRMED',   label: 'Confirmed' },
              { value: 'IN_PROGRESS', label: 'In progress' },
              { value: 'COMPLETED',   label: 'Completed' },
              { value: 'CANCELLED',   label: 'Cancelled' },
            ]}
          />

          <select value={filters.readiness} onChange={(e) => setFilter('readiness', e.target.value)}
            className={`px-2 py-1 text-xs border rounded outline-none focus:border-blue-500 ${filters.readiness ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}`}>
            <option value="">All readiness</option>
            {READINESS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline px-1.5">
              Clear
            </button>
          )}
        </div>
      )}

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded px-4 py-2 flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-medium text-blue-900">{selected.size} selected</span>
          <div className="flex gap-2 text-sm">
            <select onChange={(e) => {
              if (e.target.value) {
                bulkUpdate.mutate({
                  ids: Array.from(selected),
                  payload: { teamId: e.target.value === 'null' ? null : e.target.value },
                });
                e.target.value = '';
              }
            }} className="ditech-input">
              <option value="">Bulk: assign team...</option>
              <option value="null">— Unassign —</option>
              {teams?.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>

            <select onChange={(e) => {
              if (e.target.value) {
                bulkUpdate.mutate({
                  ids: Array.from(selected),
                  payload: { planStatus: e.target.value },
                });
                e.target.value = '';
              }
            }} className="ditech-input">
              <option value="">Bulk: set status...</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <select onChange={(e) => {
              if (e.target.value) {
                bulkUpdate.mutate({
                  ids: Array.from(selected),
                  payload: { readiness: e.target.value },
                });
                e.target.value = '';
              }
            }} className="ditech-input">
              <option value="">Bulk: set readiness...</option>
              {READINESS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <button onClick={() => setSelected(new Set())}
              className="px-3 py-1 text-blue-700 hover:underline">Clear</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-gray-400">Loading...</div>
        ) : plans.length === 0 ? (
          <div className="py-12 text-center text-gray-400">No plans found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b sticky top-0">
                <tr className="text-left text-xs text-gray-600 uppercase tracking-wide">
                  <th className="px-2 py-2 w-10">
                    <input type="checkbox" checked={selected.size === plans.length && plans.length > 0}
                      onChange={toggleAll} />
                  </th>
                  <th className="px-2 py-2 w-12 text-center">#</th>
                  <Th col="scheduledDate" sortBy={sortBy} sortDir={sortDir} onSort={handleSort}>Scheduled</Th>
                  <th className="px-2 py-2">Customer</th>
                  <th className="px-2 py-2">Department</th>
                  <Th col="storeName" sortBy={sortBy} sortDir={sortDir} onSort={handleSort}>Branch</Th>
                  <th className="px-2 py-2 w-24">Region</th>
                  <th className="px-2 py-2 w-32">Province</th>
                  <th className="px-2 py-2 w-28">Team</th>
                  <th className="px-2 py-2 w-16 text-center">Sensors</th>
                  <th className="px-2 py-2 w-32">Status</th>
                  <th className="px-2 py-2 w-32">Readiness</th>
                  <th className="px-2 py-2 w-12 text-center">⋯</th>
                </tr>
              </thead>
              <tbody>
                {grouped ? (
                  grouped.flatMap(([key, g]) => [
                    <tr key={`grp-${key}`} className="bg-gray-100 border-t border-gray-200">
                      <td colSpan={12} className="px-3 py-1.5 text-xs font-semibold text-gray-700">
                        ▾ {g.label} <span className="text-gray-500 font-normal">· {g.plans.length} plans</span>
                      </td>
                    </tr>,
                    ...g.plans.map((p: any, idx: number) =>
                      renderRow(p, idx, baseIndex, {
                        selected, toggleOne, saveField, teams, STATUSES, READINESS, REGIONS,
                        STATUS_COLORS, READINESS_COLORS,
                      })
                    ),
                  ])
                ) : (
                  plans.map((p: any, idx: number) =>
                    renderRow(p, idx, baseIndex, {
                      selected, toggleOne, saveField, teams, STATUSES, READINESS, REGIONS,
                      STATUS_COLORS, READINESS_COLORS,
                    })
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pagination && pagination.total > limit && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Page {page} of {Math.ceil(pagination.total / limit)} · {pagination.total} total</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-30">Previous</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page * limit >= pagination.total}
              className="px-3 py-1 border border-gray-300 rounded disabled:opacity-30">Next</button>
          </div>
        </div>
      )}

      {showCreate && <CreatePlanModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function renderRow(p: any, idx: number, baseIndex: number, ctx: any) {
  const { selected, toggleOne, saveField, teams, STATUSES, READINESS, REGIONS,
    STATUS_COLORS, READINESS_COLORS } = ctx;
  return (
    <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
      <td className="px-2 py-1 align-middle">
        <input type="checkbox" checked={selected.has(p.id)}
          onChange={() => toggleOne(p.id)} onClick={(e) => e.stopPropagation()} />
      </td>
      <td className="px-2 py-1 text-center text-xs text-gray-400 align-middle">
        {baseIndex + idx + 1}
      </td>
      <td className="align-middle whitespace-nowrap">
        <InlineCell
          type="date"
          value={p.scheduledDate ? p.scheduledDate.substring(0, 10) : ''}
          display={p.scheduledDate ? p.scheduledDate.substring(0, 10) : <span className="text-gray-400 italic">— set date —</span>}
          onSave={(v) => saveField(p.id, 'scheduledDate', v ? new Date(v).toISOString() : null)}
        />
      </td>
      <td className="px-2 py-1 text-xs text-gray-700 align-middle whitespace-nowrap">
        {p.customer?.logoUrl && (
          <img src={p.customer.logoUrl} alt="" className="inline-block w-4 h-4 mr-1 align-middle rounded-sm object-cover" />
        )}
        <span className="font-semibold">{p.customer?.customerCode || '—'}</span>
      </td>
      <td className="px-2 py-1 text-xs text-gray-700 align-middle whitespace-nowrap">
        {p.department?.departmentName || '—'}
      </td>
      <td className="px-2 py-1 align-middle">
        <Link to={`/plans/${p.id}`} className="text-blue-700 hover:underline font-medium">
          {p.branchName || p.storeName || '—'}
        </Link>
      </td>
      <td className="align-middle">
        <InlineCell
          type="select"
          value={p.storeRegion || ''}
          options={[{ value: '', label: '—' }, ...REGIONS.map((r: string) => ({ value: r, label: r }))]}
          display={
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
              p.storeRegion === 'BANGKOK' ? 'bg-blue-100 text-blue-700' :
              p.storeRegion === 'UPC' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
            }`}>{p.storeRegion || '—'}</span>
          }
          onSave={(v) => saveField(p.id, 'storeRegion', v || null)}
        />
      </td>
      <td className="align-middle">
        <InlineCell
          type="text"
          value={p.province || ''}
          display={p.province || <span className="text-gray-400">—</span>}
          onSave={(v) => saveField(p.id, 'province', v || null)}
          placeholder="Province name"
        />
      </td>
      <td className="align-middle">
        <InlineCell
          type="select"
          value={p.teamId || ''}
          options={[{ value: '', label: '— Unassigned —' }, ...(teams || []).map((t: any) => ({ value: t.id, label: t.name }))]}
          display={
            p.team ? <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded">{p.team.name}</span>
                   : <span className="text-xs text-amber-600">unassigned</span>
          }
          onSave={(v) => saveField(p.id, 'teamId', v || null)}
        />
      </td>
      <td className="align-middle text-center">
        <InlineCell
          type="number"
          value={p.sensorCount}
          display={<span className="font-medium">{p.sensorCount}</span>}
          align="center"
          onSave={(v) => saveField(p.id, 'sensorCount', v)}
          validate={(v: number) => (v < 0 || v > 999) ? 'Must be 0-999' : null}
        />
      </td>
      <td className="align-middle">
        <InlineCell
          type="select"
          value={p.planStatus}
          options={STATUSES.map((s: string) => ({ value: s, label: s }))}
          display={
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[p.planStatus] || 'bg-gray-100'}`}>
              {p.planStatus}
            </span>
          }
          onSave={(v) => saveField(p.id, 'planStatus', v)}
        />
      </td>
      <td className="align-middle">
        <InlineCell
          type="select"
          value={p.readiness}
          options={READINESS.map((r: string) => ({ value: r, label: r }))}
          display={
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${READINESS_COLORS[p.readiness] || 'bg-gray-100'}`}>
              {p.readiness}
            </span>
          }
          onSave={(v) => saveField(p.id, 'readiness', v)}
        />
      </td>
      <td className="px-2 py-1 align-middle text-center">
        <Link to={`/plans/${p.id}`}
          className="text-gray-400 hover:text-gray-700 text-lg" title="Open detail">
          ↗
        </Link>
      </td>
    </tr>
  );
}

function Th({ col, sortBy, sortDir, onSort, children }: any) {
  const active = sortBy === col;
  return (
    <th onClick={() => onSort(col)} className="px-2 py-2 cursor-pointer select-none whitespace-nowrap hover:bg-gray-100">
      {children}
      {active && <span className="ml-1 text-xs">{sortDir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}
