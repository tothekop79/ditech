import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { plansApi } from '../api/plans';
import './gantt-print.css';

// ─────────────────────────────────────────────────────────────────────────────
//   Types
// ─────────────────────────────────────────────────────────────────────────────

type PlanStatus = 'DRAFT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'ATTENTION';
type GroupBy = 'customer' | 'region' | 'team' | 'status';
type ViewMode = '2weeks' | 'month' | 'quarter';

interface Plan {
  id: string;
  storeName: string;
  branchName?: string | null;
  storeRegion: string;
  province?: string | null;
  scheduledDate?: string | null;
  completedDate?: string | null;
  durationDays?: number | null;
  planStatus: PlanStatus;
  sensorCount?: number | null;
  contactPerson?: string | null;
  customer?: { id: string; customerCode: string; customerName: string };
  department?: { id: string; departmentName: string };
  team?: { id: string; name: string } | null;
  contractorName?: string | null;
}

interface GroupRow {
  key: string;
  label: string;
  subtitle?: string;
  plans: Plan[];
  totals: {
    plans: number;
    sensors: number;
    draft: number;
    confirmed: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    attention: number;
  };
  completionPct: number;
}

// ─────────────────────────────────────────────────────────────────────────────
//   Status config — single source of truth
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<PlanStatus, { label: string; bg: string; text: string; chipBg: string; chipText: string }> = {
  DRAFT:       { label: 'DRAFT',                bg: '#6B7280', text: '#FFFFFF', chipBg: '#E5E7EB', chipText: '#374151' },
  CONFIRMED:   { label: 'CONFIRMED',            bg: '#2563EB', text: '#FFFFFF', chipBg: '#DBEAFE', chipText: '#1E40AF' },
  IN_PROGRESS: { label: 'IN PROGRESS',          bg: '#F59E0B', text: '#1F2937', chipBg: '#FEF3C7', chipText: '#92400E' },
  COMPLETED:   { label: 'COMPLETED',            bg: '#16A34A', text: '#FFFFFF', chipBg: '#DCFCE7', chipText: '#166534' },
  CANCELLED:   { label: 'CANCELLED',            bg: '#DC2626', text: '#FFFFFF', chipBg: '#FEE2E2', chipText: '#991B1B' },
  ATTENTION:   { label: 'DELAYED / ATTENTION',  bg: '#7C3AED', text: '#FFFFFF', chipBg: '#EDE9FE', chipText: '#5B21B6' },
};

// ─────────────────────────────────────────────────────────────────────────────
//   Date utilities
// ─────────────────────────────────────────────────────────────────────────────

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
const isSameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
const isSunday = (d: Date) => d.getDay() === 0;
const monthLabel = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const dateRangeLabel = (s: Date, e: Date) =>
  `${s.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })} – ${e.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}`;

function buildDateRange(mode: ViewMode, anchor: Date): { start: Date; end: Date; days: Date[] } {
  let start: Date, end: Date;
  if (mode === '2weeks') {
    start = startOfDay(anchor); end = addDays(start, 13);
  } else if (mode === 'quarter') {
    const m = Math.floor(anchor.getMonth() / 3) * 3;
    start = new Date(anchor.getFullYear(), m, 1);
    end = new Date(anchor.getFullYear(), m + 3, 0);
  } else {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  }
  const days: Date[] = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) days.push(new Date(d));
  return { start, end, days };
}

function weekSpans(days: Date[]): { startIdx: number; len: number; label: string }[] {
  const out: { startIdx: number; len: number; label: string }[] = [];
  if (days.length === 0) return out;
  let curStart = 0;
  for (let i = 1; i <= days.length; i++) {
    const prev = days[i - 1];
    const next = i < days.length ? days[i] : null;
    if (!next || next.getDay() === 1 /* Monday starts new week */) {
      const weekNum = getISOWeek(prev);
      out.push({ startIdx: curStart, len: i - curStart, label: `Week ${weekNum}` });
      curStart = i;
    }
  }
  return out;
}

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// ─────────────────────────────────────────────────────────────────────────────
//   Sizing constants
// ─────────────────────────────────────────────────────────────────────────────

const DAY_W = 44;
const ROW_H = 64;
const BAR_H = 28;
const LEFT_CUSTOMER = 220;
const LEFT_SUMMARY = 180;
const LEFT_TOTAL = LEFT_CUSTOMER + LEFT_SUMMARY;

// ─────────────────────────────────────────────────────────────────────────────
//   Main page
// ─────────────────────────────────────────────────────────────────────────────

export function GanttPage() {
  const navigate = useNavigate();

  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [groupBy, setGroupBy] = useState<GroupBy>('customer');
  const [filters, setFilters] = useState({
    customer: '', department: '', region: '', province: '', status: '',
  });
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [hoveredBar, setHoveredBar] = useState<{ plan: Plan; x: number; y: number } | null>(null);

  const { start: rangeStart, end: rangeEnd, days } = useMemo(
    () => buildDateRange(viewMode, anchorDate),
    [viewMode, anchorDate],
  );

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['plans', 'gantt'],
    queryFn: () => plansApi.list({ pageSize: 500 }).then((r: any) => r.data || []),
  });

  const customerOptions = useMemo(
    () => uniqueBy<Plan, string, string>(plans, (p) => p.customer?.id, (p) => p.customer?.customerName || p.customer?.customerCode || ''),
    [plans],
  );
  const departmentOptions = useMemo(
    () => uniqueBy<Plan, string, string>(plans, (p) => p.department?.id, (p) => p.department?.departmentName || ''),
    [plans],
  );
  const regionOptions = useMemo(
    () => Array.from(new Set((plans as Plan[]).map((p) => p.storeRegion).filter(Boolean))) as string[],
    [plans],
  );
  const provinceOptions = useMemo(
    () => Array.from(new Set((plans as Plan[]).map((p) => p.province).filter(Boolean))) as string[],
    [plans],
  );

  const filteredPlans = useMemo(() => {
    return (plans as Plan[]).filter((p) => {
      if (!p.scheduledDate) return false;
      const start = startOfDay(new Date(p.scheduledDate));
      const dur = Math.max(1, p.durationDays || 1);
      const end = addDays(start, dur - 1);
      if (end < rangeStart || start > rangeEnd) return false;
      if (filters.customer && p.customer?.id !== filters.customer) return false;
      if (filters.department && p.department?.id !== filters.department) return false;
      if (filters.region && p.storeRegion !== filters.region) return false;
      if (filters.province && p.province !== filters.province) return false;
      if (filters.status && p.planStatus !== filters.status) return false;
      return true;
    });
  }, [plans, rangeStart, rangeEnd, filters]);

  const groups: GroupRow[] = useMemo(() => {
    const buckets = new Map<string, { label: string; subtitle?: string; plans: Plan[] }>();
    for (const p of filteredPlans) {
      let key = ''; let label = ''; let subtitle = '';
      if (groupBy === 'customer') {
        key = p.customer?.id || '__none';
        label = p.customer?.customerName || p.customer?.customerCode || 'No customer';
        subtitle = p.customer?.customerName ? `${p.customer.customerName}` : '';
      } else if (groupBy === 'region') {
        key = p.storeRegion || '__none'; label = p.storeRegion || 'No region';
      } else if (groupBy === 'team') {
        key = p.team?.id || '__none'; label = p.team?.name || 'Unassigned';
      } else {
        key = p.planStatus; label = STATUS_CONFIG[p.planStatus]?.label || p.planStatus;
      }
      const entry = buckets.get(key) || { label, subtitle, plans: [] };
      entry.plans.push(p);
      buckets.set(key, entry);
    }
    const rows: GroupRow[] = Array.from(buckets.entries()).map(([key, v]) => {
      const totals = {
        plans: v.plans.length,
        sensors: v.plans.reduce((s, p) => s + (p.sensorCount || 0), 0),
        draft: 0, confirmed: 0, inProgress: 0, completed: 0, cancelled: 0, attention: 0,
      };
      for (const p of v.plans) {
        if (p.planStatus === 'DRAFT') totals.draft++;
        else if (p.planStatus === 'CONFIRMED') totals.confirmed++;
        else if (p.planStatus === 'IN_PROGRESS') totals.inProgress++;
        else if (p.planStatus === 'COMPLETED') totals.completed++;
        else if (p.planStatus === 'CANCELLED') totals.cancelled++;
        else if (p.planStatus === 'ATTENTION') totals.attention++;
      }
      const completionPct = totals.plans > 0 ? Math.round((totals.completed / totals.plans) * 100) : 0;
      return { key, label: v.label, subtitle: v.subtitle, plans: v.plans, totals, completionPct };
    });
    rows.sort((a, b) => a.label.localeCompare(b.label));
    return rows;
  }, [filteredPlans, groupBy]);

  const kpis = useMemo(() => {
    const customerSet = new Set<string>();
    let sensors = 0, inProgress = 0, completed = 0, attention = 0;
    for (const p of filteredPlans) {
      if (p.customer?.id) customerSet.add(p.customer.id);
      sensors += p.sensorCount || 0;
      if (p.planStatus === 'IN_PROGRESS') inProgress++;
      if (p.planStatus === 'COMPLETED') completed++;
      if (p.planStatus === 'CANCELLED' || p.planStatus === 'ATTENTION') attention++;
    }
    return { plans: filteredPlans.length, customers: customerSet.size, sensors, inProgress, completed, attention };
  }, [filteredPlans]);

  const activeChips = useMemo(() => {
    const chips: { key: keyof typeof filters; label: string }[] = [];
    if (filters.customer) {
      const opt = customerOptions.find((o) => o.value === filters.customer);
      chips.push({ key: 'customer', label: opt?.label || filters.customer });
    }
    if (filters.department) {
      const opt = departmentOptions.find((o) => o.value === filters.department);
      chips.push({ key: 'department', label: opt?.label || filters.department });
    }
    if (filters.region)   chips.push({ key: 'region',   label: filters.region });
    if (filters.province) chips.push({ key: 'province', label: filters.province });
    if (filters.status)   chips.push({ key: 'status',   label: STATUS_CONFIG[filters.status as PlanStatus]?.label || filters.status });
    return chips;
  }, [filters, customerOptions, departmentOptions]);

  const resetFilters = () => setFilters({ customer: '', department: '', region: '', province: '', status: '' });
  const clearChip = (key: keyof typeof filters) => setFilters({ ...filters, [key]: '' });

  const goToday = () => setAnchorDate(startOfDay(new Date()));
  const goPrev = () => setAnchorDate(viewMode === '2weeks' ? addDays(anchorDate, -14)
    : viewMode === 'quarter' ? new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 3, 1)
    : new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1));
  const goNext = () => setAnchorDate(viewMode === '2weeks' ? addDays(anchorDate, 14)
    : viewMode === 'quarter' ? new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 3, 1)
    : new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1));

  const toggleGroup = (key: string) => {
    const next = new Set(collapsedGroups);
    next.has(key) ? next.delete(key) : next.add(key);
    setCollapsedGroups(next);
  };
  const expandAll  = () => setCollapsedGroups(new Set());
  const collapseAll = () => setCollapsedGroups(new Set(groups.map((g) => g.key)));

  const handlePrint = () => window.print();

  if (isLoading) {
    return <div className="py-24 text-center text-slate-400">Loading schedule…</div>;
  }

  return (
    <div className="gantt-page bg-slate-50 min-h-screen pb-12">
      <GanttPrintHeader rangeStart={rangeStart} rangeEnd={rangeEnd} groupBy={groupBy} />

      <div className="max-w-[1800px] mx-auto px-6 pt-6 space-y-4">
        {/* ───── Title + view controls ───── */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-bold text-slate-900 tracking-tight leading-tight">
              Installation Gantt Schedule
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {monthLabel(rangeStart)} · {kpis.plans} plan{kpis.plans === 1 ? '' : 's'} across {days.length} day{days.length === 1 ? '' : 's'}
            </p>
          </div>

          <div className="flex items-center gap-2 no-print">
            <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
              <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700">
                <span>📅</span>
                <span>{dateRangeLabel(rangeStart, rangeEnd)}</span>
              </div>
              <select value={viewMode} onChange={(e) => setViewMode(e.target.value as ViewMode)}
                className="border-l border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 bg-white outline-none cursor-pointer hover:bg-slate-50">
                <option value="2weeks">2 weeks</option>
                <option value="month">1 month</option>
                <option value="quarter">Quarter</option>
              </select>
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                className="border-l border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 bg-white outline-none cursor-pointer hover:bg-slate-50">
                <option value="customer">Group by customer</option>
                <option value="region">Group by region</option>
                <option value="team">Group by team</option>
                <option value="status">Group by status</option>
              </select>
            </div>
          </div>
        </header>

        {/* ───── KPI cards + nav buttons ───── */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard icon="📋" iconBg="#3B82F6" label="Total Plans"  value={kpis.plans}      unit="plans" />
            <KpiCard icon="👥" iconBg="#8B5CF6" label="Customers"    value={kpis.customers}  unit="customers" />
            <KpiCard icon="📷" iconBg="#0EA5E9" label="Sensors"      value={kpis.sensors}    unit="sensors" />
            <KpiCard icon="⚙"  iconBg="#F59E0B" label="In Progress"  value={kpis.inProgress} unit="plans" />
            <KpiCard icon="✓"  iconBg="#16A34A" label="Completed"    value={kpis.completed}  unit="plans" />
            <KpiCard icon="!"  iconBg="#DC2626" label="Attention"    value={kpis.attention}  unit="plans" />
          </div>

          <div className="col-span-12 lg:col-span-4 flex items-center justify-end gap-2 no-print">
            <button onClick={goToday}    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm">Today</button>
            <button onClick={goPrev}     className="px-3 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm">‹</button>
            <button onClick={goNext}     className="px-3 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm">›</button>
            <button onClick={handlePrint} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm inline-flex items-center gap-1.5">
              🖨️ Print / Export for Team
            </button>
            <button onClick={handlePrint} className="px-4 py-2 text-sm font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-900 shadow-sm inline-flex items-center gap-1.5">
              📥 Export PDF
            </button>
          </div>
        </div>

        {/* ───── Filters ───── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden no-print">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="text-sm font-semibold text-slate-700 mr-1">Filters</span>

            <FilterSelect value={filters.customer}   onChange={(v) => setFilters({ ...filters, customer: v })} placeholder="All customers"   options={customerOptions} />
            <FilterSelect value={filters.department} onChange={(v) => setFilters({ ...filters, department: v })} placeholder="All departments" options={departmentOptions} />
            <FilterSelect value={filters.region}     onChange={(v) => setFilters({ ...filters, region: v })}     placeholder="All regions"     options={regionOptions.map((r) => ({ value: r, label: r }))} />
            <FilterSelect value={filters.province}   onChange={(v) => setFilters({ ...filters, province: v })}   placeholder="All provinces"   options={provinceOptions.map((p) => ({ value: p, label: p }))} />
            <FilterSelect value={filters.status}     onChange={(v) => setFilters({ ...filters, status: v })}     placeholder="All status"      options={Object.entries(STATUS_CONFIG).map(([v, c]) => ({ value: v, label: c.label }))} />

            <button onClick={resetFilters} className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50">
              Reset filters
            </button>

            <div className="flex items-center gap-2 ml-auto flex-wrap">
              {activeChips.length > 0 && (
                <>
                  <span className="text-xs text-slate-500">Active filters:</span>
                  {activeChips.map((c) => (
                    <span key={c.key} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200 rounded-full">
                      {c.label}
                      <button onClick={() => clearChip(c.key)} className="hover:text-sky-900 ml-0.5">✕</button>
                    </span>
                  ))}
                  <button onClick={resetFilters} className="text-xs text-sky-600 hover:underline">Clear all</button>
                </>
              )}
              <button onClick={expandAll}   className="ml-2 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50">Expand all</button>
              <button onClick={collapseAll} className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50">Collapse all</button>
            </div>
          </div>
        </section>

        {/* ───── Gantt table ───── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <GanttTable
            days={days}
            groups={groups}
            collapsedGroups={collapsedGroups}
            onToggleGroup={toggleGroup}
            onBarClick={(plan) => navigate(`/plans/${plan.id}`)}
            onBarHover={setHoveredBar}
          />
        </section>

        {/* ───── Legend ───── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Legend</span>
          {(Object.entries(STATUS_CONFIG) as [PlanStatus, typeof STATUS_CONFIG[PlanStatus]][]).map(([k, c]) => (
            <span key={k}
              className="inline-flex items-center px-2.5 py-1 rounded text-[11px] font-bold tracking-wider"
              style={{ background: c.bg, color: c.text }}>
              {c.label}
            </span>
          ))}
          <span className="text-xs text-slate-600 inline-flex items-center gap-1.5 ml-auto">
            <span className="inline-block w-0.5 h-4 bg-blue-600 align-middle"></span>
            Today: {new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <span className="text-xs text-slate-500 inline-flex items-center gap-1.5">
            <span className="inline-block w-4 h-4 bg-slate-100 border border-slate-200 align-middle"></span>
            Weekend
          </span>
          <span className="text-xs text-slate-400 italic ml-2">* Click plan bar to view details</span>
        </section>

        {/* Print-only footer */}
        <footer className="hidden print:flex items-center justify-between mt-4 pt-3 border-t border-slate-300 text-xs text-slate-600">
          <span>DITECH Installation Planner v1.0</span>
          <span>Generated · {new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        </footer>
      </div>

      {hoveredBar && <PlanBarTooltip plan={hoveredBar.plan} x={hoveredBar.x} y={hoveredBar.y} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   KPI card
// ─────────────────────────────────────────────────────────────────────────────

function KpiCard({ icon, iconBg, label, value, unit }: { icon: string; iconBg: string; label: string; value: number; unit: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 flex items-center gap-3">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-lg font-bold shrink-0"
           style={{ background: iconBg }}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">{label}</div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold text-slate-900 leading-none">{value}</span>
          <span className="text-xs text-slate-500">{unit}</span>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ value, onChange, placeholder, options }: {
  value: string; onChange: (v: string) => void; placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="px-3 py-1.5 text-sm text-slate-700 bg-white border border-slate-300 rounded-md hover:border-slate-400 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 min-w-[140px]">
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   Gantt table
// ─────────────────────────────────────────────────────────────────────────────

interface GanttTableProps {
  days: Date[];
  groups: GroupRow[];
  collapsedGroups: Set<string>;
  onToggleGroup: (key: string) => void;
  onBarClick: (plan: Plan) => void;
  onBarHover: (bar: { plan: Plan; x: number; y: number } | null) => void;
}

function GanttTable({ days, groups, collapsedGroups, onToggleGroup, onBarClick, onBarHover }: GanttTableProps) {
  const totalW = days.length * DAY_W;
  const weeks = useMemo(() => weekSpans(days), [days]);
  const todayIdx = days.findIndex((d) => isSameDay(d, new Date()));

  return (
    <div className="overflow-x-auto gantt-scroll">
      <div style={{ width: LEFT_TOTAL + totalW, minWidth: '100%' }}>
        {/* Header */}
        <div className="flex items-stretch bg-slate-50 border-b-2 border-slate-300 sticky top-0 z-30">
          <div className="sticky left-0 z-30 bg-slate-50 flex border-r-2 border-slate-300 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
               style={{ width: LEFT_TOTAL }}>
            <div style={{ width: LEFT_CUSTOMER }} className="px-4 py-3 flex items-center text-xs font-bold uppercase tracking-wider text-slate-600 border-r border-slate-200">
              Customer / Group
            </div>
            <div style={{ width: LEFT_SUMMARY }} className="px-4 py-3 flex items-center text-xs font-bold uppercase tracking-wider text-slate-600">
              Summary
            </div>
          </div>

          <div className="relative" style={{ width: totalW }}>
            <div className="h-7 flex items-center justify-center text-sm font-bold text-slate-700 border-b border-slate-200 bg-slate-100">
              {monthLabel(days[0])}
            </div>

            <div className="h-7 flex border-b border-slate-200 relative">
              {weeks.map((w, i) => (
                <div key={i}
                  className="flex items-center justify-center text-[11px] font-semibold text-slate-500 border-r border-slate-200"
                  style={{ width: w.len * DAY_W }}>
                  {w.label}
                </div>
              ))}
              {todayIdx >= 0 && (
                <div className="absolute top-0 bottom-0 flex items-center justify-center bg-amber-300 text-[10px] font-bold text-amber-900 border-l border-r border-amber-400 pointer-events-none"
                  style={{ left: todayIdx * DAY_W, width: DAY_W }}>
                  Today
                </div>
              )}
            </div>

            <div className="h-12 flex">
              {days.map((d, i) => {
                const isToday = isSameDay(d, new Date());
                const we = isWeekend(d);
                const sun = isSunday(d);
                return (
                  <div key={i}
                    className={`flex flex-col items-center justify-center text-[10px] border-r ${
                      isToday ? 'bg-amber-100 border-amber-400'
                      : sun ? 'bg-slate-200 border-slate-300'
                      : we ? 'bg-slate-100 border-slate-200'
                      : 'bg-white border-slate-200'
                    }`}
                    style={{ width: DAY_W }}>
                    <div className={`font-bold ${isToday ? 'text-amber-900' : we ? 'text-slate-500' : 'text-slate-800'}`}>
                      {d.getDate()}
                    </div>
                    <div className={`uppercase ${isToday ? 'text-amber-700' : 'text-slate-400'}`}>
                      {d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Rows */}
        {groups.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-400 text-sm">
            No plans match the current filters or date range.
          </div>
        ) : (
          groups.map((g, gi) => (
            <GanttGroupRow
              key={g.key}
              group={g}
              groupIndex={gi}
              days={days}
              totalW={totalW}
              collapsed={collapsedGroups.has(g.key)}
              onToggle={() => onToggleGroup(g.key)}
              onBarClick={onBarClick}
              onBarHover={onBarHover}
              todayIdx={todayIdx}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   Group row
// ─────────────────────────────────────────────────────────────────────────────

interface GroupRowProps {
  group: GroupRow;
  groupIndex: number;
  days: Date[];
  totalW: number;
  collapsed: boolean;
  onToggle: () => void;
  onBarClick: (plan: Plan) => void;
  onBarHover: (bar: { plan: Plan; x: number; y: number } | null) => void;
  todayIdx: number;
}

function GanttGroupRow({ group, groupIndex, days, totalW, collapsed, onToggle, onBarClick, onBarHover, todayIdx }: GroupRowProps) {
  const rangeStart = days[0];
  const bgColor = groupIndex % 2 === 0 ? '#ffffff' : '#f8fafc';

  const bars = useMemo(() => {
    return group.plans.map((p) => {
      const scheduled = startOfDay(new Date(p.scheduledDate!));
      const startOffset = Math.max(0, daysBetween(rangeStart, scheduled));
      const dur = Math.max(1, p.durationDays || 1);
      const endIdx = Math.min(days.length - 1, startOffset + dur - 1);
      const startIdx = Math.min(days.length - 1, startOffset);
      const widthDays = Math.max(1, endIdx - startIdx + 1);
      return { plan: p, left: startIdx * DAY_W + 3, width: widthDays * DAY_W - 6 };
    });
  }, [group.plans, days, rangeStart]);

  const lanes = useMemo(() => assignLanes(bars), [bars]);
  const laneCount = Math.max(1, ...lanes.map((l) => l + 1));
  const rowHeight = collapsed ? ROW_H : Math.max(ROW_H, laneCount * (BAR_H + 6) + 18);

  return (
    <div className="flex items-stretch border-b border-slate-200 hover:bg-sky-50/30 transition-colors"
         style={{ minHeight: rowHeight, background: bgColor }}>
      {/* Left fixed */}
      <div className="sticky left-0 z-20 flex border-r-2 border-slate-300 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
           style={{ width: LEFT_TOTAL, background: bgColor }}>
        <div style={{ width: LEFT_CUSTOMER }} className="px-4 py-3 flex items-start gap-2 border-r border-slate-200">
          <button onClick={onToggle}
            className="mt-0.5 text-slate-400 hover:text-slate-700 text-xs leading-none w-4 shrink-0"
            aria-label={collapsed ? 'Expand' : 'Collapse'}>
            {collapsed ? '▶' : '▼'}
          </button>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 truncate uppercase tracking-wide">{group.label}</div>
            {group.subtitle && <div className="text-xs text-slate-500 truncate mt-0.5">{group.subtitle}</div>}
          </div>
        </div>

        <div style={{ width: LEFT_SUMMARY }} className="px-3 py-2.5 flex flex-col gap-1">
          <div className="text-xs text-slate-600">
            <span className="font-semibold">{group.totals.plans}</span> plan{group.totals.plans === 1 ? '' : 's'} ·{' '}
            <span className="font-semibold">{group.totals.sensors}</span> sensor{group.totals.sensors === 1 ? '' : 's'}
          </div>
          <ProgressBar pct={group.completionPct} />
          <div className="flex flex-wrap gap-1 mt-0.5">
            {group.totals.draft       > 0 && <StatusBadge status="DRAFT"       count={group.totals.draft} />}
            {group.totals.confirmed   > 0 && <StatusBadge status="CONFIRMED"   count={group.totals.confirmed} />}
            {group.totals.inProgress  > 0 && <StatusBadge status="IN_PROGRESS" count={group.totals.inProgress} />}
            {group.totals.completed   > 0 && <StatusBadge status="COMPLETED"   count={group.totals.completed} />}
            {group.totals.attention   > 0 && <StatusBadge status="ATTENTION"   count={group.totals.attention} />}
            {group.totals.cancelled   > 0 && <StatusBadge status="CANCELLED"   count={group.totals.cancelled} />}
          </div>
        </div>
      </div>

      {/* Right scrolling */}
      <div className="relative" style={{ width: totalW }}>
        <div className="absolute inset-0 flex pointer-events-none">
          {days.map((d, i) => {
            const isToday = isSameDay(d, new Date());
            const we = isWeekend(d);
            const sun = isSunday(d);
            return (
              <div key={i}
                className={`border-r ${
                  isToday ? 'bg-amber-50/60 border-amber-200'
                  : sun ? 'bg-slate-100/70 border-slate-200'
                  : we ? 'bg-slate-50/80 border-slate-200'
                  : 'border-slate-100'
                }`}
                style={{ width: DAY_W }}
              />
            );
          })}
        </div>

        {todayIdx >= 0 && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-blue-600 z-10 pointer-events-none"
               style={{ left: todayIdx * DAY_W + DAY_W / 2 - 1 }}
          />
        )}

        {!collapsed ? (
          <div className="relative" style={{ height: rowHeight }}>
            {bars.map((b, i) => (
              <GanttPlanBar
                key={b.plan.id}
                plan={b.plan}
                left={b.left}
                width={b.width}
                top={lanes[i] * (BAR_H + 6) + 10}
                onClick={() => onBarClick(b.plan)}
                onHover={(x, y) => onBarHover({ plan: b.plan, x, y })}
                onLeave={() => onBarHover(null)}
              />
            ))}
          </div>
        ) : (
          <div className="relative h-full flex items-center" style={{ height: ROW_H }}>
            <div className="text-xs text-slate-400 italic px-3">— Collapsed ({group.totals.plans} hidden) —</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const color = pct === 100 ? '#16A34A' : pct >= 50 ? '#0EA5E9' : pct > 0 ? '#F59E0B' : '#CBD5E1';
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] font-semibold text-slate-600 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}

function StatusBadge({ status, count }: { status: PlanStatus; count: number }) {
  const c = STATUS_CONFIG[status];
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded tabular-nums"
          style={{ background: c.chipBg, color: c.chipText }}>
      {count}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   Plan bar
// ─────────────────────────────────────────────────────────────────────────────

interface BarProps {
  plan: Plan; left: number; width: number; top: number;
  onClick: () => void;
  onHover: (x: number, y: number) => void;
  onLeave: () => void;
}

function GanttPlanBar({ plan, left, width, top, onClick, onHover, onLeave }: BarProps) {
  const c = STATUS_CONFIG[plan.planStatus] || STATUS_CONFIG.DRAFT;
  const showAttentionIcon = plan.planStatus === 'ATTENTION' || plan.planStatus === 'CANCELLED';
  const labelText = `${plan.storeName}${plan.branchName ? ` ${plan.branchName}` : ''}`;
  const meta = `P${planSeq(plan)} · ${plan.sensorCount || 0} sensor${(plan.sensorCount || 0) === 1 ? '' : 's'}`;

  return (
    <button
      onClick={onClick}
      onMouseEnter={(e) => onHover(e.clientX, e.clientY)}
      onMouseMove={(e) => onHover(e.clientX, e.clientY)}
      onMouseLeave={onLeave}
      className="absolute rounded-md shadow-sm hover:shadow-md hover:brightness-105 active:brightness-95 transition-all text-left overflow-hidden border border-black/10 cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-1"
      style={{
        left, width, top, height: BAR_H,
        background: c.bg, color: c.text,
      }}
    >
      <div className="px-2 py-0.5 flex flex-col justify-center h-full">
        <div className="text-[11px] font-bold leading-tight truncate flex items-center gap-1">
          {showAttentionIcon && <span className="opacity-90">⚠</span>}
          <span className="truncate">{labelText}</span>
        </div>
        {width > 90 && (
          <div className="text-[10px] leading-tight truncate opacity-90 font-medium">{meta}</div>
        )}
      </div>
    </button>
  );
}

function PlanBarTooltip({ plan, x, y }: { plan: Plan; x: number; y: number }) {
  const c = STATUS_CONFIG[plan.planStatus];
  const scheduled = plan.scheduledDate ? new Date(plan.scheduledDate) : null;
  const end = scheduled ? addDays(scheduled, Math.max(1, plan.durationDays || 1) - 1) : null;
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const left = Math.min(x + 14, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 320);
  const top = Math.min(y + 14, (typeof window !== 'undefined' ? window.innerHeight : 800) - 220);

  return (
    <div className="fixed z-50 pointer-events-none bg-white border border-slate-200 rounded-lg shadow-xl p-3 w-[300px] text-xs"
         style={{ left, top }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="font-bold text-slate-900 text-sm leading-snug">{plan.storeName}{plan.branchName ? ` · ${plan.branchName}` : ''}</div>
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider shrink-0"
              style={{ background: c.bg, color: c.text }}>
          {c.label}
        </span>
      </div>
      <div className="grid grid-cols-[80px_1fr] gap-y-1 text-slate-600">
        <span className="text-slate-400">Customer</span><span>{plan.customer?.customerName || plan.customer?.customerCode || '—'}</span>
        <span className="text-slate-400">Region</span><span>{plan.storeRegion}{plan.province ? ` · ${plan.province}` : ''}</span>
        {scheduled && end && (
          <>
            <span className="text-slate-400">Schedule</span>
            <span>{fmt(scheduled)} → {fmt(end)} ({plan.durationDays || 1} day{(plan.durationDays || 1) > 1 ? 's' : ''})</span>
          </>
        )}
        <span className="text-slate-400">Team</span><span>{plan.team?.name || plan.contractorName || <span className="text-slate-400 italic">unassigned</span>}</span>
        <span className="text-slate-400">Sensors</span><span className="font-medium">{plan.sensorCount || 0}</span>
        {plan.contactPerson && (<><span className="text-slate-400">Contact</span><span>{plan.contactPerson}</span></>)}
      </div>
    </div>
  );
}

function GanttPrintHeader({ rangeStart, rangeEnd, groupBy }: { rangeStart: Date; rangeEnd: Date; groupBy: GroupBy }) {
  return (
    <div className="hidden print:flex items-start justify-between px-6 pt-4 pb-3 border-b-2 border-slate-800 mb-3">
      <div>
        <div className="text-2xl font-extrabold text-slate-900 tracking-tight">DITECH · Installation Planner</div>
        <div className="text-sm text-slate-600 mt-0.5">Installation Schedule</div>
      </div>
      <div className="text-right text-xs text-slate-700">
        <div><span className="font-semibold">Date Range:</span> {dateRangeLabel(rangeStart, rangeEnd)}</div>
        <div><span className="font-semibold">Grouped by:</span> {groupBy}</div>
        <div><span className="font-semibold">Generated:</span> {new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   Helpers
// ─────────────────────────────────────────────────────────────────────────────

function uniqueBy<T, K, L>(arr: T[], keyFn: (x: T) => K | undefined, labelFn: (x: T) => L): { value: K; label: L }[] {
  const map = new Map<K, L>();
  for (const x of arr) {
    const k = keyFn(x);
    if (k !== undefined && !map.has(k)) map.set(k, labelFn(x));
  }
  return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
}

function assignLanes(bars: { left: number; width: number }[]): number[] {
  const result: number[] = new Array(bars.length).fill(0);
  const order = bars.map((_, i) => i).sort((a, b) => bars[a].left - bars[b].left);
  const laneRightEdge: number[] = [];
  for (const i of order) {
    const b = bars[i];
    let placed = -1;
    for (let l = 0; l < laneRightEdge.length; l++) {
      if (laneRightEdge[l] <= b.left) { placed = l; break; }
    }
    if (placed === -1) {
      laneRightEdge.push(b.left + b.width);
      placed = laneRightEdge.length - 1;
    } else {
      laneRightEdge[placed] = b.left + b.width;
    }
    result[i] = placed;
  }
  return result;
}

function planSeq(plan: Plan): number {
  let s = 0;
  for (const ch of plan.id) s = (s + ch.charCodeAt(0)) % 9;
  return s + 1;
}
