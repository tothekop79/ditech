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
import { PageHeader, KpiCard, FilterBar, DataTable, Pill } from '../components/ui';
import type { Column, PillTone, RowGroup } from '../components/ui';
import { format } from 'date-fns';

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

// STATUS_COLORS above still drives the count chips; the table cells use Pill tones.
const STATUS_TONE: Record<string, PillTone> = {
  DRAFT: 'neutral',
  CONFIRMED: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

const READINESS_TONE: Record<string, PillTone> = {
  PENDING: 'neutral',
  NOT_READY: 'danger',
  READY: 'success',
  ON_HOLD: 'warning',
};

const REGION_TONE: Record<string, PillTone> = {
  BANGKOK: 'info',
  UPC: 'warning',
};

/** filter control: same `.ui-input` base, tinted while it holds a value */
const inputCls = (active: boolean) =>
  `ui-input${active ? ' border-ditech-navy bg-ditech-gold-soft' : ''}`;

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

  const saveField = async (id: string, field: string, value: unknown): Promise<void> => {
    await updatePlan.mutateAsync({ id, payload: { [field]: value } });
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

  const setFilter = (k: string, v: string | string[]) => {
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
    return Array.from(map.entries())
      .sort((a, b) => a[1].label.localeCompare(b[1].label))
      .map<RowGroup<InstallationPlan>>(([key, g]) => ({
        key,
        label: (
          <>
            ▾ {g.label} <span className="text-ink-secondary font-normal">· {g.plans.length} plans</span>
          </>
        ),
        rows: g.plans,
      }));
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

  // Row number has to survive grouping, so it is resolved by identity rather than
  // by the map index — grouped rows are reordered relative to `plans`.
  const rowNumber = useMemo(() => {
    const m = new Map<string, number>();
    plans.forEach((p, i) => m.set(p.id, baseIndex + i + 1));
    return m;
  }, [plans, baseIndex]);

  const allSelected = selected.size === plans.length && plans.length > 0;

  const columns: Column<InstallationPlan>[] = [
    {
      key: 'select',
      width: 40,
      header: (
        <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="เลือกทั้งหมด" />
      ),
      render: (p) => (
        <input
          type="checkbox"
          checked={selected.has(p.id)}
          onChange={() => toggleOne(p.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`เลือก ${p.branchName || p.storeName || p.id}`}
        />
      ),
    },
    {
      key: 'index',
      header: '#',
      align: 'center',
      width: 48,
      render: (p) => <span className="text-xs text-ink-muted">{rowNumber.get(p.id)}</span>,
    },
    {
      key: 'scheduledDate',
      header: <SortHeader col="scheduledDate" sortBy={sortBy} sortDir={sortDir} onSort={handleSort}>Scheduled</SortHeader>,
      width: 124,
      render: (p) => (
        <span className="whitespace-nowrap tabular-nums">
          <InlineCell
            type="date"
            value={p.scheduledDate ? p.scheduledDate.substring(0, 10) : ''}
            display={p.scheduledDate ? p.scheduledDate.substring(0, 10) : <span className="text-ink-muted italic">— set date —</span>}
            onSave={(v: string) => saveField(p.id, 'scheduledDate', v ? new Date(v).toISOString() : null)}
          />
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (p) => (
        <span className="text-xs whitespace-nowrap">
          {p.customer?.logoUrl && (
            <img src={p.customer.logoUrl} alt="" className="inline-block w-4 h-4 mr-1 align-middle rounded-sm object-cover" />
          )}
          <span className="font-semibold">{p.customer?.customerCode || '—'}</span>
        </span>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      render: (p) => (
        <span className="text-xs whitespace-nowrap">{p.department?.departmentName || '—'}</span>
      ),
    },
    {
      key: 'storeName',
      header: <SortHeader col="storeName" sortBy={sortBy} sortDir={sortDir} onSort={handleSort}>Branch</SortHeader>,
      render: (p) => (
        <Link to={`/plans/${p.id}`} className="text-ditech-navy font-medium hover:underline">
          {p.branchName || p.storeName || '—'}
        </Link>
      ),
    },
    {
      key: 'storeRegion',
      header: 'Region',
      width: 96,
      render: (p) => (
        <InlineCell
          type="select"
          value={p.storeRegion || ''}
          options={[{ value: '', label: '—' }, ...REGIONS.map((r) => ({ value: r, label: r }))]}
          display={
            p.storeRegion
              ? <Pill tone={REGION_TONE[p.storeRegion] ?? 'neutral'} size="sm">{p.storeRegion}</Pill>
              : <span className="text-ink-muted text-xs">—</span>
          }
          onSave={(v: string) => saveField(p.id, 'storeRegion', v || null)}
        />
      ),
    },
    {
      key: 'province',
      header: 'Province',
      width: 128,
      render: (p) => (
        <InlineCell
          type="text"
          value={p.province || ''}
          display={p.province || <span className="text-ink-muted">—</span>}
          onSave={(v: string) => saveField(p.id, 'province', v || null)}
          placeholder="Province name"
        />
      ),
    },
    {
      key: 'team',
      header: 'Team',
      width: 112,
      render: (p) => (
        <InlineCell
          type="select"
          value={p.teamId || ''}
          options={[{ value: '', label: '— Unassigned —' }, ...(teams || []).map((t: { id: string; name: string }) => ({ value: t.id, label: t.name }))]}
          display={
            p.team
              ? <Pill tone="neutral" size="sm">{p.team.name}</Pill>
              : <span className="text-xs text-warning">unassigned</span>
          }
          onSave={(v: string) => saveField(p.id, 'teamId', v || null)}
        />
      ),
    },
    {
      key: 'sensorCount',
      header: 'Sensors',
      align: 'right',
      width: 80,
      render: (p) => (
        <InlineCell
          type="number"
          value={p.sensorCount}
          display={<span className="font-medium tabular-nums">{p.sensorCount}</span>}
          align="right"
          onSave={(v: number) => saveField(p.id, 'sensorCount', v)}
          validate={(v: number) => (v < 0 || v > 999) ? 'Must be 0-999' : null}
        />
      ),
    },
    {
      key: 'planStatus',
      header: 'Status',
      width: 128,
      render: (p) => (
        <InlineCell
          type="select"
          value={p.planStatus}
          options={STATUSES.map((st) => ({ value: st, label: st }))}
          display={
            <Pill
              tone={STATUS_TONE[p.planStatus] ?? 'neutral'}
              className={p.planStatus === 'CANCELLED' ? 'line-through' : undefined}
            >
              {p.planStatus}
            </Pill>
          }
          onSave={(v: string) => saveField(p.id, 'planStatus', v)}
        />
      ),
    },
    {
      key: 'readiness',
      header: 'Readiness',
      width: 128,
      render: (p) => (
        <InlineCell
          type="select"
          value={p.readiness}
          options={READINESS.map((r) => ({ value: r, label: r }))}
          display={<Pill tone={READINESS_TONE[p.readiness] ?? 'neutral'}>{p.readiness}</Pill>}
          onSave={(v: string) => saveField(p.id, 'readiness', v)}
        />
      ),
    },
    {
      key: 'open',
      header: '⋯',
      align: 'center',
      width: 48,
      render: (p) => (
        <Link to={`/plans/${p.id}`} className="text-ink-muted hover:text-ink-primary text-lg" title="Open detail">
          ↗
        </Link>
      ),
    },
  ];

  const rangeLabel = `${format(range.from, 'dd MMM yy')} – ${format(range.to, 'dd MMM yy')}`;

  return (
    <div className="space-y-3">
      {/* Header */}
      <PageHeader
        title={`All Plans · ${pagination?.total || 0}`}
        subtitle={rangeLabel}
        actions={
          <>
            <DateRangeFilter value={range} onChange={setRange} />
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
              className="ui-input">
              <option value="none">No grouping</option>
              <option value="customer">Group by customer</option>
              <option value="department">Group by department</option>
              <option value="team">Group by team</option>
              <option value="region">Group by region</option>
              <option value="province">Group by province</option>
              <option value="status">Group by status</option>
            </select>
            <button onClick={() => setShowFilters(!showFilters)}
              className="h-9 px-3.5 rounded-lg border border-surface-border bg-surface-card text-sm font-medium hover:bg-surface-page">
              {showFilters ? 'Hide' : 'Show'} filters {activeFilterCount > 0 && <span className="ml-1 px-1.5 bg-ditech-navy text-white rounded-full text-xs">{activeFilterCount}</span>}
            </button>
            <button onClick={() => setShowCreate(true)}
              className="h-9 px-3.5 rounded-lg bg-ditech-navy text-white text-sm font-medium hover:bg-ditech-navy-light">
              + New plan
            </button>
          </>
        }
      />

      {/* Status count chips — unchanged source (`stats`, from the loaded rows) */}
      <div className="text-xs text-ink-secondary flex gap-3 flex-wrap">
        {Object.entries(stats).map(([s, c]) => (
          <span key={s} className={`px-1.5 rounded ${STATUS_COLORS[s] || ''}`}>
            {s}: <strong>{c}</strong>
          </span>
        ))}
      </div>

      {/* KPI — one card only; per-status cards need a server aggregate (step 5) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="แผนทั้งหมด"
          value={pagination?.total ?? 0}
          hint="ตามตัวกรองปัจจุบัน"
        />
      </div>

      {/* Filters */}
      {showFilters && (
        <FilterBar onReset={activeFilterCount > 0 ? clearFilters : undefined}>
          <input data-app-search placeholder="ค้นหาสาขา…" value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            className={`${inputCls(!!filters.search)} w-52`} />

          <select value={filters.customerId} onChange={(e) => setFilter('customerId', e.target.value)}
            className={inputCls(!!filters.customerId)}>
            <option value="">All customers</option>
            {customers?.map((c: any) => <option key={c.id} value={c.id}>{c.customerCode}</option>)}
          </select>

          <select value={filters.departmentId} onChange={(e) => setFilter('departmentId', e.target.value)}
            className={inputCls(!!filters.departmentId)}>
            <option value="">All departments</option>
            {departments?.map((d: any) => <option key={d.id} value={d.id}>{d.departmentName}</option>)}
          </select>

          <select value={filters.storeRegion} onChange={(e) => setFilter('storeRegion', e.target.value)}
            className={inputCls(!!filters.storeRegion)}>
            <option value="">All regions</option>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <select value={filters.province} onChange={(e) => setFilter('province', e.target.value)}
            className={inputCls(!!filters.province)}>
            <option value="">All provinces</option>
            {provinceOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select value={filters.teamId} onChange={(e) => setFilter('teamId', e.target.value)}
            className={inputCls(!!filters.teamId)}>
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
            className={inputCls(!!filters.readiness)}>
            <option value="">All readiness</option>
            {READINESS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

        </FilterBar>
      )}

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="bg-ditech-gold-soft border border-ditech-gold-deep/40 rounded-xl px-4 py-2 flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-medium text-ink-primary">{selected.size} selected</span>
          <div className="flex gap-2 text-sm">
            <select onChange={(e) => {
              if (e.target.value) {
                bulkUpdate.mutate({
                  ids: Array.from(selected),
                  payload: { teamId: e.target.value === 'null' ? null : e.target.value },
                });
                e.target.value = '';
              }
            }} className="ui-input">
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
            }} className="ui-input">
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
            }} className="ui-input">
              <option value="">Bulk: set readiness...</option>
              {READINESS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <button onClick={() => setSelected(new Set())}
              className="px-3 py-1 text-ditech-navy hover:underline">Clear</button>
          </div>
        </div>
      )}

      {/* Table */}
      <DataTable
        columns={columns}
        rows={plans}
        groups={grouped ?? undefined}
        rowKey={(p) => p.id}
        density="compact"
        emptyText={isLoading ? 'Loading…' : 'No plans found'}
      />

      {pagination && pagination.total > limit && (
        <div className="flex items-center justify-between text-sm text-ink-secondary">
          <span>Page {page} of {Math.ceil(pagination.total / limit)} · {pagination.total} total</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="h-9 px-3.5 rounded-lg border border-surface-border bg-surface-card disabled:opacity-30 hover:bg-surface-page">Previous</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page * limit >= pagination.total}
              className="h-9 px-3.5 rounded-lg border border-surface-border bg-surface-card disabled:opacity-30 hover:bg-surface-page">Next</button>
          </div>
        </div>
      )}

      {showCreate && <CreatePlanModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

/** Sortable column header. Same toggle semantics as the table it replaced. */
function SortHeader({ col, sortBy, sortDir, onSort, children }: {
  col: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  onSort: (col: string) => void;
  children: React.ReactNode;
}) {
  const active = sortBy === col;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink-primary
                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                 focus-visible:outline-ditech-gold rounded"
    >
      {children}
      {active && <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
    </button>
  );
}
