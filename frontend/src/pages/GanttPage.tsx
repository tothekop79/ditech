import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { plansApi } from '../api/plans';
import { DateRangeFilter, getPresetRange, type DateRange } from '../components/DateRangeFilter';
import { buildDateColorMap, collectPlanDateKeys, dateKey, type DateColor } from '../utils/dateColor';

// ─────────────────────────────────────────────────────────────────────────────
//   Types
// ─────────────────────────────────────────────────────────────────────────────

type PlanStatus = 'DRAFT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'ATTENTION';
type GroupBy = 'customer' | 'region' | 'team' | 'status';

interface Plan {
  id: string;
  storeName: string;
  branchName?: string | null;
  storeRegion: string;
  province?: string | null;
  address?: string | null;
  description?: string | null;
  scheduledDate?: string | null;
  completedDate?: string | null;
  durationDays?: number | null;
  workStartTime?: string | null;
  workEndTime?: string | null;
  planStatus: PlanStatus;
  workScope?: string[] | null;
  sensorCount?: number | null;
  sensorModel?: string | null;
  poeSwitchModel?: string | null;
  cctvCount?: number | null;       // future field; falls back to '—' if missing
  contactPerson?: string | null;
  contactPhone?: string | null;
  contactLine?: string | null;
  detail?: string | null;
  readinessNote?: string | null;
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
  DRAFT:       { label: 'DRAFT',                bg: '#64748B', text: '#FFFFFF', chipBg: '#F1F5F9', chipText: '#334155' },
  CONFIRMED:   { label: 'CONFIRMED',            bg: '#3B82F6', text: '#FFFFFF', chipBg: '#DBEAFE', chipText: '#1E40AF' },
  IN_PROGRESS: { label: 'IN PROGRESS',          bg: '#EAB308', text: '#FFFFFF', chipBg: '#FEF9C3', chipText: '#854D0E' },
  COMPLETED:   { label: 'COMPLETED',            bg: '#10B981', text: '#FFFFFF', chipBg: '#D1FAE5', chipText: '#065F46' },
  CANCELLED:   { label: 'CANCELLED',            bg: '#F43F5E', text: '#FFFFFF', chipBg: '#FFE4E6', chipText: '#9F1239' },
  ATTENTION:   { label: 'DELAYED / ATTENTION',  bg: '#A855F7', text: '#FFFFFF', chipBg: '#F3E8FF', chipText: '#6B21A8' },
};

// Region indicator colors — top half of each Gantt bar
const REGION_COLORS: Record<string, string> = {
  BANGKOK:  '#06B6D4',  // cyan-500 — turquoise blue
  UPC:      '#FB923C',  // orange-400 — soft orange (UPC = Upcountry / ต่างจังหวัด)
  _default: '#94A3B8',  // slate-400 fallback
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
const LEFT_CUSTOMER = 200;  // wider — date badge + day-of-week + work time line
const LEFT_SUMMARY = 420;   // wider — holds long plan details line
const LEFT_TOTAL = LEFT_CUSTOMER + LEFT_SUMMARY;

// ─────────────────────────────────────────────────────────────────────────────
//   Main page
// ─────────────────────────────────────────────────────────────────────────────

export function GanttPage() {
  const navigate = useNavigate();

  // ── Persisted user preferences (dateRange, groupBy, filters, showPlanDetails) ─
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const saved = loadPref<{ from: string; to: string; label: string } | null>('dateRange', null);
    if (saved && saved.from && saved.to) {
      // Re-hydrate Date objects (localStorage stores ISO strings)
      return { from: new Date(saved.from), to: new Date(saved.to), label: saved.label };
    }
    return getPresetRange('this_month');
  });
  const [groupBy, setGroupBy] = useState<GroupBy>(() => loadPref('groupBy', 'customer' as GroupBy));
  const [filters, setFilters] = useState(() => loadPref('filters', {
    customer: '', department: '', region: '', province: '', status: '', team: '',
  }));
  const [showPlanDetails, setShowPlanDetails] = useState(() => loadPref('showPlanDetails', false));

  // ── Non-persisted ephemeral state ─────────────────────────────────────────
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [hoveredBar, setHoveredBar] = useState<{ plan: Plan; x: number; y: number } | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  // ── Save prefs to localStorage on change ──────────────────────────────────
  useEffect(() => { savePref('dateRange', dateRange); }, [dateRange]);
  useEffect(() => { savePref('groupBy', groupBy); }, [groupBy]);
  useEffect(() => { savePref('filters', filters); }, [filters]);
  useEffect(() => { savePref('showPlanDetails', showPlanDetails); }, [showPlanDetails]);

  const { rangeStart, rangeEnd, days } = useMemo(() => {
    const start = startOfDay(dateRange.from);
    const end = startOfDay(dateRange.to);
    const arr: Date[] = [];
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) arr.push(new Date(d));
    return { rangeStart: start, rangeEnd: end, days: arr };
  }, [dateRange]);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['plans', 'gantt'],
    queryFn: () => plansApi.list({ limit: 1000 }).then((r: any) => r.data || []),
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
  const teamOptions = useMemo(
    () => uniqueBy<Plan, string, string>(plans, (p) => p.team?.id, (p) => p.team?.name || ''),
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
      if (filters.team && p.team?.id !== filters.team) return false;
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
    }    const rows: GroupRow[] = Array.from(buckets.entries()).map(([key, v]) => {
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
    let cctv = 0, lanJobs = 0, unassigned = 0, withNotes = 0;
    for (const p of filteredPlans) {
      if (p.customer?.id) customerSet.add(p.customer.id);
      sensors += p.sensorCount || 0;
      cctv += p.cctvCount || 0;
      if ((p.workScope || []).includes('INSTALL_LAN')) lanJobs++;
      if (!p.team && !p.contractorName) unassigned++;
      if ((p.detail && p.detail.trim()) || (p.readinessNote && p.readinessNote.trim())) withNotes++;
      if (p.planStatus === 'IN_PROGRESS') inProgress++;
      if (p.planStatus === 'COMPLETED') completed++;
      if (p.planStatus === 'CANCELLED' || p.planStatus === 'ATTENTION') attention++;
    }
    return {
      plans: filteredPlans.length,
      customers: customerSet.size,
      sensors, cctv, lanJobs, unassigned, withNotes,
      inProgress, completed, attention,
    };
  }, [filteredPlans]);

  // ─── Date Color Banding: build map of dateKey → color for each plan date ──
  const dateColorMap = useMemo(() => {
    const keys = collectPlanDateKeys(filteredPlans);
    return buildDateColorMap(keys);
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
    if (filters.team) {
      const opt = teamOptions.find((o) => o.value === filters.team);
      chips.push({ key: 'team', label: opt?.label || filters.team });
    }
    return chips;
  }, [filters, customerOptions, departmentOptions, teamOptions]);

  const resetFilters = () => setFilters({ customer: '', department: '', region: '', province: '', status: '', team: '' });
  const clearChip = (key: keyof typeof filters) => setFilters({ ...filters, [key]: '' });

  const toggleGroup = (key: string) => {
    const next = new Set(collapsedGroups);
    next.has(key) ? next.delete(key) : next.add(key);
    setCollapsedGroups(next);
  };
  const expandAll  = () => setCollapsedGroups(new Set());
  const collapseAll = () => setCollapsedGroups(new Set(groups.map((g) => g.key)));

  const handlePrint = () => {
    // Open dedicated print route in a new tab. The PrintGanttPage component
    // there handles its own layout, auto-triggers window.print(), and uses
    // semantic <table> markup so browser natively repeats <thead>/<tfoot>.
    const params = new URLSearchParams();
    if (dateRange.from) params.set('from', dateRange.from.toISOString().slice(0, 10));
    if (dateRange.to)   params.set('to',   dateRange.to.toISOString().slice(0, 10));
    params.set('group', groupBy);
    if (filters.customer)   params.set('customer',   filters.customer);
    if (filters.department) params.set('department', filters.department);
    if (filters.region)     params.set('region',     filters.region);
    if (filters.province)   params.set('province',   filters.province);
    if (filters.status)     params.set('status',     filters.status);
    if (filters.team)       params.set('team',       filters.team);
    window.open(`/gantt/print?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  if (isLoading) {
    return <div className="py-24 text-center text-slate-400">Loading schedule…</div>;
  }

  return (
    <div className="gantt-page bg-[#f1f5f9] min-h-screen pb-12">
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
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              className="px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg outline-none cursor-pointer hover:bg-slate-50 shadow-sm">
              <option value="customer">Group by customer</option>
              <option value="region">Group by region</option>
              <option value="team">Group by team</option>
              <option value="status">Group by status</option>
            </select>
          </div>
        </header>

        {/* ───── KPI cards + nav buttons ───── */}
        <div className="kpi-strip flex items-center gap-2">
          <div className="flex gap-2 flex-1 min-w-0 overflow-x-auto">
            <KpiCard icon="📋" iconBg="#3B82F6" label="Plans"        value={kpis.plans}      unit="" />
            <KpiCard icon="👥" iconBg="#8B5CF6" label="Customers"    value={kpis.customers}  unit="" />
            <KpiCard icon="📷" iconBg="#0EA5E9" label="People Cnt."  value={kpis.sensors}    unit="" />
            <KpiCard icon="🎥" iconBg="#06B6D4" label="CCTV"         value={kpis.cctv}       unit="" />
            <KpiCard icon="🔌" iconBg="#10B981" label="LAN Jobs"     value={kpis.lanJobs}    unit="" />
            <KpiCard icon="⚙"  iconBg="#F59E0B" label="In Progress"  value={kpis.inProgress} unit="" />
            <KpiCard icon="✓"  iconBg="#16A34A" label="Completed"    value={kpis.completed}  unit="" />
            <KpiCard icon="!"  iconBg="#DC2626" label="Attention"    value={kpis.attention}  unit="" />
            <KpiCard icon="⚠"  iconBg={kpis.unassigned > 0 ? '#DC2626' : '#9CA3AF'} label="Unassigned" value={kpis.unassigned} unit="" />
            <KpiCard icon="📝" iconBg="#7C3AED" label="With Notes"   value={kpis.withNotes}  unit="" />
          </div>

          <div className="flex items-center gap-2 no-print shrink-0">
            <button onClick={handlePrint} className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm inline-flex items-center gap-1">
              🖨️ Print
            </button>
            <button onClick={handlePrint} className="px-3 py-2 text-xs font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-900 shadow-sm inline-flex items-center gap-1">
              📥 PDF
            </button>
          </div>
        </div>

        {/* ───── Filters ───── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden no-print">
          <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto">
            <span className="text-xs font-semibold text-slate-700 mr-1 shrink-0">Filters</span>

            <FilterSelect value={filters.customer}   onChange={(v) => setFilters({ ...filters, customer: v })}   placeholder="All customers"   options={customerOptions} />
            <FilterSelect value={filters.department} onChange={(v) => setFilters({ ...filters, department: v })} placeholder="All departments" options={departmentOptions} />
            <FilterSelect value={filters.team}       onChange={(v) => setFilters({ ...filters, team: v })}       placeholder="All teams"       options={teamOptions} />
            <FilterSelect value={filters.region}     onChange={(v) => setFilters({ ...filters, region: v })}     placeholder="All regions"     options={regionOptions.map((r) => ({ value: r, label: r }))} />
            <FilterSelect value={filters.province}   onChange={(v) => setFilters({ ...filters, province: v })}   placeholder="All provinces"   options={provinceOptions.map((p) => ({ value: p, label: p }))} />
            <FilterSelect value={filters.status}     onChange={(v) => setFilters({ ...filters, status: v })}     placeholder="All status"      options={Object.entries(STATUS_CONFIG).map(([v, c]) => ({ value: v, label: c.label }))} />

            <button onClick={resetFilters} className="shrink-0 px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap">
              Reset
            </button>

            {/* Active chips inline */}
            {activeChips.length > 0 && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 shrink-0">
                {activeChips.map((c) => (
                  <span key={c.key} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-300 rounded-full whitespace-nowrap max-w-[140px]">
                    <span className="truncate">{c.label}</span>
                    <button onClick={() => clearChip(c.key)} className="hover:text-sky-900 shrink-0">✕</button>
                  </span>
                ))}
              </div>
            )}

            {/* Spacer pushes right-side actions to the end */}
            <div className="flex-1" />

            <button onClick={expandAll}   className="shrink-0 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap">Expand all</button>
            <button onClick={collapseAll} className="shrink-0 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap">Collapse all</button>

            <label className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md cursor-pointer transition-colors whitespace-nowrap ${
              showPlanDetails
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}>
              <input type="checkbox"
                checked={showPlanDetails}
                onChange={(e) => setShowPlanDetails(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-sky-600 cursor-pointer" />
              Show plan details
            </label>
          </div>
        </section>

        {/* ───── Gantt table ───── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <GanttTable
            days={days}
            groups={groups}
            collapsedGroups={collapsedGroups}
            onToggleGroup={toggleGroup}
            selectedPlanId={selectedPlanId}
            showPlanDetails={showPlanDetails}
            dateColorMap={dateColorMap}
            onBarClick={(plan) => {
              setSelectedPlanId(plan.id);
              // Scroll detail row into view
              setTimeout(() => {
                const el = document.getElementById(`work-row-${plan.id}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 50);
            }}
            onBarHover={setHoveredBar}
            onOpenPlan={(plan) => navigate(`/plans/${plan.id}`)}
          />
        </section>

        {/* ───── Legend ───── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</span>
          {(Object.entries(STATUS_CONFIG) as [PlanStatus, typeof STATUS_CONFIG[PlanStatus]][]).map(([k, c]) => (
            <span key={k}
              className="inline-flex items-center px-2.5 py-1 rounded text-[11px] font-bold tracking-wider"
              style={{ background: c.bg, color: c.text }}>
              {c.label}
            </span>
          ))}

          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide ml-3 pl-3 border-l border-slate-200">Region</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
            <span className="inline-block w-6 h-3 rounded" style={{ background: REGION_COLORS.BANGKOK }}></span>
            BANGKOK
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
            <span className="inline-block w-6 h-3 rounded" style={{ background: REGION_COLORS.UPC }}></span>
            UPC (ต่างจังหวัด)
          </span>

          <span className="text-xs text-slate-600 inline-flex items-center gap-1.5 ml-auto">
            <span className="inline-block w-0.5 h-4 bg-blue-600 align-middle"></span>
            Today: {new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <span className="text-xs text-slate-500 inline-flex items-center gap-1.5">
            <span className="inline-block w-4 h-4 bg-slate-100 border border-slate-200 align-middle"></span>
            Weekend
          </span>
        </section>
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
    <div className="kpi-card bg-white border border-slate-200 rounded-lg shadow-sm px-2 py-1.5 flex items-center gap-2 shrink-0" style={{ minWidth: 110 }}>
      <div className="w-7 h-7 rounded-md flex items-center justify-center text-white text-sm font-bold shrink-0"
           style={{ background: iconBg }}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 truncate leading-tight">{label}</div>
        <div className="flex items-baseline gap-1">
          <span className="text-base font-bold text-slate-900 leading-none tabular-nums">{value}</span>
          {unit && <span className="text-[10px] text-slate-500">{unit}</span>}
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
      className="shrink-0 px-2 py-1.5 text-xs text-slate-700 bg-white border border-slate-300 rounded-md hover:border-slate-400 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 min-w-[110px] max-w-[160px]">
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
  selectedPlanId: string | null;
  showPlanDetails: boolean;
  onBarClick: (plan: Plan) => void;
  onBarHover: (bar: { plan: Plan; x: number; y: number } | null) => void;
  onOpenPlan: (plan: Plan) => void;
  dateColorMap: Map<string, DateColor>;
}

function GanttTable({ days, groups, collapsedGroups, onToggleGroup, selectedPlanId, showPlanDetails, onBarClick, onBarHover, onOpenPlan, dateColorMap }: GanttTableProps) {
  const totalW = days.length * DAY_W;
  const weeks = useMemo(() => weekSpans(days), [days]);
  const todayIdx = days.findIndex((d) => isSameDay(d, new Date()));

  return (
    <div className="overflow-x-auto gantt-scroll">
      <div style={{ width: LEFT_TOTAL + totalW, minWidth: '100%' }}>
        {/* Header */}
        <div className="flex items-stretch bg-slate-50 border-b-2 border-slate-300 sticky top-0 z-30">
          <div className="sticky left-0 z-30 bg-slate-50 flex border-r border-slate-300 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.12)]"
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
              selectedPlanId={selectedPlanId}
              showPlanDetails={showPlanDetails}
              onBarClick={onBarClick}
              onBarHover={onBarHover}
              onOpenPlan={onOpenPlan}
              todayIdx={todayIdx}
              dateColorMap={dateColorMap}
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
  selectedPlanId: string | null;
  showPlanDetails: boolean;
  onBarClick: (plan: Plan) => void;
  onBarHover: (bar: { plan: Plan; x: number; y: number } | null) => void;
  onOpenPlan: (plan: Plan) => void;
  todayIdx: number;
  dateColorMap: Map<string, DateColor>;
}

function GanttGroupRow({ group, groupIndex, days, totalW, collapsed, onToggle, selectedPlanId, showPlanDetails, onBarClick, onBarHover, onOpenPlan, todayIdx, dateColorMap }: GroupRowProps) {
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
  const overviewBarsHeight = collapsed ? ROW_H : Math.max(ROW_H, laneCount * (BAR_H + 6) + 18);

  // ─── Plans sorted by date+time, used when showPlanDetails is on ─────────
  const sortedPlans = useMemo(() => {
    return [...group.plans]
      .filter((p) => !!p.scheduledDate)
      .sort((a, b) => {
        const da = new Date(a.scheduledDate!).getTime();
        const db = new Date(b.scheduledDate!).getTime();
        if (da !== db) return da - db;
        return (a.workStartTime || '').localeCompare(b.workStartTime || '');
      });
  }, [group.plans]);

  const PLAN_ROW_H = 38; // single-line plan row

  return (
    <>
      {/* ─── Group header row ─── */}
      <div className="group-header-row flex items-stretch border-b border-slate-200 hover:bg-slate-50 transition-colors"
           style={{ background: bgColor }}>
        {/* Left fixed */}
        <div className="sticky left-0 z-20 flex border-r border-slate-300 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.12)]"
             style={{ width: LEFT_TOTAL, background: bgColor }}>
          <div style={{ width: LEFT_CUSTOMER }} className="px-4 py-3 flex items-start gap-2 border-r border-slate-200">
            <button onClick={onToggle}
              className="mt-0.5 text-slate-400 hover:text-slate-700 text-xs leading-none w-4 shrink-0"
              aria-label={collapsed ? 'Expand' : 'Collapse'}>
              {collapsed ? '▶' : '▼'}
            </button>
            <div className="min-w-0">
              <div className="text-base font-bold text-slate-900 truncate uppercase tracking-wide">{group.label}</div>
              {group.subtitle && <div className="text-sm text-slate-500 truncate mt-0.5">{group.subtitle}</div>}
            </div>
          </div>

          <div style={{ width: LEFT_SUMMARY }} className="px-3 py-2.5 flex flex-col gap-1">
            <div className="text-sm text-slate-700">
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

        {/* Right: Gantt overview — bars stacked when collapsed or showPlanDetails=OFF;
            empty backdrop when showPlanDetails=ON (per-plan rows below own the bars) */}
        <div className="relative" style={{ width: totalW }}>
          <DayGridBackground days={days} todayIdx={todayIdx} />

          {!collapsed && !showPlanDetails && (
            <div className="relative" style={{ height: overviewBarsHeight }}>
              {bars.map((b, i) => (
                <GanttPlanBar
                  key={b.plan.id}
                  plan={b.plan}
                  left={b.left}
                  width={b.width}
                  top={lanes[i] * (BAR_H + 6) + 10}
                  selected={selectedPlanId === b.plan.id}
                  onClick={() => onBarClick(b.plan)}
                  onHover={(x, y) => onBarHover({ plan: b.plan, x, y })}
                  onLeave={() => onBarHover(null)}
                />
              ))}
            </div>
          )}

          {collapsed && (
            <div className="relative h-full flex items-center" style={{ height: ROW_H }}>
              <div className="text-xs text-slate-400 italic px-3">— Collapsed ({group.totals.plans} hidden) —</div>
            </div>
          )}
          {/* When !collapsed && showPlanDetails: header row stays tall enough for left summary; right side is just backdrop */}
          {!collapsed && showPlanDetails && (
            <div style={{ height: ROW_H }} />
          )}
        </div>
      </div>

      {/* ─── Per-plan rows (only when expanded + showPlanDetails) ─── */}
      {!collapsed && showPlanDetails && (() => {
        // Build (header, plan, plan, header, plan, ...) sequence with date groups.
        // We compute plans-per-date once so the header can show "N plans" count.
        const plansByDate = new Map<string, Plan[]>();
        for (const p of sortedPlans) {
          const k = dateKey(new Date(p.scheduledDate!));
          if (!plansByDate.has(k)) plansByDate.set(k, []);
          plansByDate.get(k)!.push(p);
        }

        const elements: React.ReactNode[] = [];
        let lastDateKey: string | null = null;

        sortedPlans.forEach((plan) => {
          const scheduled = startOfDay(new Date(plan.scheduledDate!));
          const startOffset = Math.max(0, daysBetween(rangeStart, scheduled));
          const dur = Math.max(1, plan.durationDays || 1);
          const endIdx = Math.min(days.length - 1, startOffset + dur - 1);
          const startIdx = Math.min(days.length - 1, startOffset);
          const widthDays = Math.max(1, endIdx - startIdx + 1);
          const barLeft = startIdx * DAY_W + 3;
          const barWidth = widthDays * DAY_W - 6;

          // Insert Date Group Header if this plan starts a new date group
          const planDateKey = dateKey(scheduled);
          if (planDateKey !== lastDateKey) {
            const count = plansByDate.get(planDateKey)?.length ?? 1;
            elements.push(
              <DateGroupHeaderRow
                key={`dgh-${planDateKey}`}
                date={scheduled}
                planCount={count}
                totalW={totalW}
                dateColorMap={dateColorMap}
                days={days}
                todayIdx={todayIdx}
              />
            );
            lastDateKey = planDateKey;
          }

          elements.push(
            <PlanDetailRow
              key={plan.id}
              plan={plan}
              rowHeight={PLAN_ROW_H}
              barLeft={barLeft}
              barWidth={barWidth}
              totalW={totalW}
              days={days}
              todayIdx={todayIdx}
              selected={selectedPlanId === plan.id}
              bgColor={bgColor}
              dateColorMap={dateColorMap}
              onClick={() => onBarClick(plan)}
              onHover={(x, y) => onBarHover({ plan, x, y })}
              onLeave={() => onBarHover(null)}
              onOpenPlan={() => onOpenPlan(plan)}
            />
          );
        });

        return elements;
      })()}
    </>
  );
}

/**
 * Date Group Header — appears on the left side only, before the first plan
 * of each date. Shows "Fri 15 May · 3 plans" with pastel background and
 * a colored left border matching the date palette.
 *
 * The right-side (timeline) area renders an EMPTY row of the same height
 * so the next plan row's Gantt bar still lines up with the date column
 * in the timeline header (alignment is preserved).
 */
const DATE_HEADER_H = 30;

function DateGroupHeaderRow({ date, planCount, totalW, dateColorMap, days, todayIdx }: {
  date: Date; planCount: number; totalW: number;
  dateColorMap: Map<string, DateColor>; days: Date[]; todayIdx: number;
}) {
  const color = dateColorMap.get(dateKey(date));
  const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short' });
  const dateLabel = date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });

  // Full pastel band + colored left border
  const leftStyle: React.CSSProperties = {
    width: LEFT_TOTAL,
    background: color?.bg ?? '#f1f5f9',
    borderLeft: color ? `4px solid ${color.border}` : '4px solid #cbd5e1',
  };

  return (
    <div className="flex items-stretch border-b border-slate-200" style={{ minHeight: DATE_HEADER_H }}>
      {/* Left fixed area — date label + plan count, both on left (count next to label) */}
      <div className="sticky left-0 z-10 flex items-center gap-2 pl-4 pr-4 border-r border-slate-300 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.12)]"
           style={leftStyle}>
        <span className="text-[13px] font-bold tabular-nums tracking-tight"
              style={{ color: color?.text ?? '#334155' }}>
          {dayLabel} {dateLabel}
        </span>
        <span className="shrink-0 text-[12px] font-bold tabular-nums px-2.5 py-0.5 rounded-md"
              style={{
                background: 'white',
                color: color?.text ?? '#475569',
                border: `1px solid ${color?.border ?? '#cbd5e1'}`,
              }}>
          {planCount} {planCount === 1 ? 'plan' : 'plans'}
        </span>
      </div>

      {/* Right (timeline) area — EMPTY spacer with day grid so columns align */}
      <div className="relative" style={{ width: totalW, height: DATE_HEADER_H }}>
        <DayGridBackground days={days} todayIdx={todayIdx} />
      </div>
    </div>
  );
}

/**
 * Re-usable day grid background (with today highlight + weekend tint).
 * Used by group header and each per-plan row to keep visual alignment identical.
 */
function DayGridBackground({ days, todayIdx }: { days: Date[]; todayIdx: number }) {
  return (
    <>
      <div className="absolute inset-0 flex pointer-events-none">
        {days.map((d, i) => {
          const isToday = isSameDay(d, new Date());
          const we = isWeekend(d);
          const sun = isSunday(d);
          return (
            <div key={i}
              className={`border-r ${
                isToday ? 'bg-amber-50/60 border-amber-200'
                : sun ? 'bg-slate-200/80 border-slate-300'
                : we ? 'bg-slate-100 border-slate-200'
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
    </>
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
  selected: boolean;
  onClick: () => void;
  onHover: (x: number, y: number) => void;
  onLeave: () => void;
}

function GanttPlanBar({ plan, left, width, top, selected, onClick, onHover, onLeave }: BarProps) {
  const c = STATUS_CONFIG[plan.planStatus] || STATUS_CONFIG.DRAFT;
  const showAttentionIcon = plan.planStatus === 'ATTENTION' || plan.planStatus === 'CANCELLED';
  const labelText = `${plan.storeName}${plan.branchName ? ` ${plan.branchName}` : ''}`;
  const meta = `P${planSeq(plan)} · ${plan.sensorCount || 0} sensor${(plan.sensorCount || 0) === 1 ? '' : 's'}`;
  const regionColor = REGION_COLORS[plan.storeRegion] || REGION_COLORS._default;

  // Reserve left padding only when bar is wide enough to fit the dot + text
  const showDot = width >= 28;

  return (
    <button
      onClick={onClick}
      onMouseEnter={(e) => onHover(e.clientX, e.clientY)}
      onMouseMove={(e) => onHover(e.clientX, e.clientY)}
      onMouseLeave={onLeave}
      className={`absolute rounded-md transition-all text-left overflow-hidden cursor-pointer focus:outline-none ${
        selected
          ? 'ring-2 ring-offset-2 ring-sky-500 shadow-lg z-20 brightness-110 scale-[1.02]'
          : 'shadow-sm hover:shadow-md hover:brightness-105 active:brightness-95 border border-black/10 focus:ring-2 focus:ring-sky-400 focus:ring-offset-1'
      }`}
      style={{
        left, width, top, height: BAR_H,
        background: regionColor,
        color: '#FFFFFF',
      }}
      title={`${plan.storeRegion} · ${plan.storeName} · ${c.label}`}
    >
      {/* Status dot — left side, r=5px (10px diameter), white ring */}
      {showDot && (
        <span
          className="absolute rounded-full"
          style={{
            left: 4, top: '50%', transform: 'translateY(-50%)',
            width: 10, height: 10,
            background: c.bg,
            boxShadow: '0 0 0 1.5px #FFFFFF, 0 1px 2px rgba(0,0,0,0.15)',
          }}
          aria-label={c.label}
        />
      )}

      {/* Text — padded right of the dot */}
      <div
        className="flex flex-col justify-center h-full"
        style={{ paddingLeft: showDot ? 20 : 8, paddingRight: 8 }}
      >
        <div className="text-[11px] font-bold leading-tight truncate flex items-center gap-1 drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]">
          {showAttentionIcon && <span className="opacity-90">⚠</span>}
          <span className="truncate">{labelText}</span>
        </div>
        {width > 90 && (
          <div className="text-[10px] leading-tight truncate opacity-95 font-medium drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]">{meta}</div>
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

// ─────────────────────────────────────────────────────────────────────────────
//   PlanDetailRow — one row per plan: compact left summary + aligned Gantt bar
//   Rendered as siblings to the group header when showPlanDetails is ON.
// ─────────────────────────────────────────────────────────────────────────────

interface PlanDetailRowProps {
  plan: Plan;
  rowHeight: number;
  barLeft: number;
  barWidth: number;
  totalW: number;
  days: Date[];
  todayIdx: number;
  selected: boolean;
  bgColor: string;
  dateColorMap: Map<string, DateColor>;
  onClick: () => void;
  onHover: (x: number, y: number) => void;
  onLeave: () => void;
  onOpenPlan: () => void;
}

function PlanDetailRow({
  plan, rowHeight, barLeft, barWidth, totalW, days, todayIdx,
  selected, bgColor, dateColorMap, onClick, onHover, onLeave, onOpenPlan,
}: PlanDetailRowProps) {
  const [copied, setCopied] = useState(false);
  const scope = plan.workScope || [];
  const date = new Date(plan.scheduledDate!);
  const dayStr = date.toLocaleDateString('en-US', { weekday: 'short' });
  const timeStr = (plan.workStartTime || plan.workEndTime)
    ? `${plan.workStartTime || '—'}–${plan.workEndTime || '—'}`
    : null;
  const sensors = plan.sensorCount || 0;
  const cctv = plan.cctvCount || 0;
  const notesText = [plan.detail, plan.readinessNote].filter(Boolean).join(' · ');
  const contactLine = [plan.contactPerson, plan.contactPhone].filter(Boolean).join(' · ');

  // Date color from shared palette
  const planColor = dateColorMap.get(dateKey(date));
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(buildWorkSummaryText(plan)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  const rowBg = selected ? '#e0f2fe' : bgColor;

  return (
    <div
      id={`work-row-${plan.id}`}
      onClick={onClick}
      className={`plan-detail-row group flex items-stretch border-b border-slate-100 cursor-pointer transition-colors ${
        selected ? 'bg-sky-50 ring-1 ring-sky-300' : 'hover:bg-slate-50'
      }`}
      style={{ minHeight: rowHeight, background: rowBg }}
    >
      {/* Left fixed: compact one-line plan summary */}
      <div className="sticky left-0 z-10 flex border-r border-slate-300 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.12)]"
           style={{ width: LEFT_TOTAL, background: rowBg }}>
        {/* Date column — professional: white bg, no color tint, just badge + time */}
        <div style={{ width: LEFT_CUSTOMER }}
             className="pl-3 pr-3 py-2 flex items-center gap-3 border-r border-slate-200 min-w-0">
          {/* Date badge — filled muted bg from palette + colored border, dark text */}
          <div className="shrink-0 flex flex-col items-center justify-center px-1.5 py-1 rounded-md tabular-nums leading-none"
               style={{
                 width: 46,
                 background: planColor?.bg ?? '#f1f5f9',
                 border: planColor ? `1.5px solid ${planColor.border}` : '1.5px solid #cbd5e1',
               }}>
            <span className="text-[17px] font-extrabold leading-none text-slate-900">{date.getDate()}</span>
            <span className="text-[8px] uppercase tracking-wider font-bold mt-0.5"
                  style={{ color: planColor?.text ?? '#475569' }}>
              {date.toLocaleDateString('en-US', { month: 'short' })}
            </span>
            <span className="text-[8px] uppercase tracking-wider font-semibold text-slate-500 mt-0.5">
              {dayStr}
            </span>
          </div>

          {/* Time row — standalone, full-line, never truncated */}
          <div className="flex flex-col leading-tight min-w-0">
            <span className={`text-[12px] font-semibold tabular-nums whitespace-nowrap ${timeStr ? 'text-slate-700' : 'text-slate-400 italic'}`}
                  title={timeStr || 'No time set'}>
              🕐 {timeStr || 'Time: —'}
            </span>
          </div>
        </div>

        {/* Summary line + actions */}
        <div style={{ width: LEFT_SUMMARY }} className="relative px-3 py-1.5 flex items-start gap-2 text-[12px] min-w-0">
          <div className="min-w-0 flex-1 leading-tight">
            {/* Line 1: Customer · Site */}
            <div className="truncate text-[13px]">
              <span className="font-bold text-slate-900">
                {plan.customer?.customerName || plan.customer?.customerCode || '—'}
              </span>
              <span className="text-slate-600"> · {plan.storeName}{plan.branchName ? ` · ${plan.branchName}` : ''}</span>
            </div>

            {/* Line 2: Equipment chips + Contact — wrap onto a second line if too long */}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5 text-[11px] text-slate-600">
              {sensors > 0 && (
                <span className="font-semibold text-sky-700 whitespace-nowrap">
                  📷 {sensors}{plan.sensorModel ? ` x ${plan.sensorModel}` : ''}
                </span>
              )}
              {cctv > 0 && (
                <span className="font-semibold text-cyan-700 whitespace-nowrap">🎥 {cctv} x CCTV</span>
              )}
              {/* Skip INSTALL_CAMERA: it duplicates the sensor count above. Other scopes get label after icon. */}
              {scope.filter((s) => s !== 'INSTALL_CAMERA').map((s) => (
                <span key={s}
                  className="text-slate-700 whitespace-nowrap"
                  title={s === 'INSTALL_POE' && plan.poeSwitchModel ? plan.poeSwitchModel : undefined}>
                  {workScopeLabelShort(s)}
                </span>
              ))}
              {contactLine && <span className="text-slate-500 whitespace-nowrap">📞 {contactLine}</span>}
            </div>

            {/* Line 3: Notes (only if present) */}
            {notesText && (
              <div className="mt-0.5 text-[11px] text-slate-700 bg-slate-50 border-l-2 border-amber-400 pl-1.5 pr-1 py-0.5 rounded-r leading-snug line-clamp-2"
                   title={notesText}>
                📝 {notesText}
              </div>
            )}
          </div>

          {/* Actions — visible on hover. Absolutely positioned so they don't steal width from text. */}
          <div className="absolute right-1 top-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity no-print bg-white/95 backdrop-blur-sm rounded px-0.5 py-0.5 shadow-sm border border-slate-200 z-10">
            <button
              onClick={(e) => { e.stopPropagation(); onOpenPlan(); }}
              className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-800 text-white rounded hover:bg-slate-900 whitespace-nowrap"
              title="Open plan"
            >↗</button>
            <button
              onClick={copy}
              className={`px-1.5 py-0.5 text-[10px] font-medium rounded border whitespace-nowrap ${
                copied
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
              title="Copy summary"
            >{copied ? '✓' : '📋'}</button>
          </div>
        </div>
      </div>

      {/* Right: single lane with this plan's bar */}
      <div className="relative" style={{ width: totalW }}>
        <DayGridBackground days={days} todayIdx={todayIdx} />
        <div className="relative" style={{ height: rowHeight }}>
          <GanttPlanBar
            plan={plan}
            left={barLeft}
            width={barWidth}
            top={6}
            selected={selected}
            onClick={onClick}
            onHover={onHover}
            onLeave={onLeave}
          />
        </div>
      </div>
    </div>
  );
}

// Short chip text for inline use in the compact plan row (icon + short label)
function workScopeLabelShort(s: string): string {
  switch (s) {
    case 'INSTALL_CAMERA': return '📷 Camera';
    case 'INSTALL_LAN':    return '🔌 Lan';
    case 'INSTALL_POE':    return '⚡ POE';
    case 'CALIBRATION':    return '🎯 Calibrate';
    case 'TESTING':        return '✓ Test';
    case 'CLOUD_SETUP':    return '☁ Cloud';
    case 'MAINTENANCE':    return '🔧 Maint.';
    default: return s;
  }
}

function workScopeLabel(s: string): string {
  switch (s) {
    case 'INSTALL_CAMERA': return '📷 Camera';
    case 'INSTALL_LAN':    return '🔌 LAN';
    case 'INSTALL_POE':    return '⚡ PoE';
    case 'CALIBRATION':    return '🎯 Calibration';
    case 'TESTING':        return '✓ Testing';
    case 'CLOUD_SETUP':    return '☁ Cloud';
    case 'MAINTENANCE':    return '🔧 Maint.';
    default: return s;
  }
}

function buildWorkSummaryText(plan: Plan): string {
  const lines: string[] = [];
  lines.push('📋 ใบงานติดตั้ง / Installation Work Summary');
  lines.push('━━━━━━━━━━━━━━━━━━━━');
  if (plan.scheduledDate) {
    const d = new Date(plan.scheduledDate);
    lines.push(`📅 วันที่: ${d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}`);
  }
  if (plan.workStartTime || plan.workEndTime) {
    lines.push(`🕐 เวลา: ${plan.workStartTime || '—'} – ${plan.workEndTime || '—'} น.`);
  }
  if ((plan.durationDays || 1) > 1) lines.push(`⏱ ระยะเวลา: ${plan.durationDays} วัน`);
  lines.push('');
  lines.push(`🏪 ลูกค้า: ${plan.customer?.customerName || plan.customer?.customerCode || '—'}`);
  lines.push(`📍 สาขา: ${plan.storeName}${plan.branchName ? ` · ${plan.branchName}` : ''}`);
  if (plan.province) lines.push(`🗺 จังหวัด: ${plan.province} (${plan.storeRegion})`);
  if (plan.address) lines.push(`🏠 ที่อยู่: ${plan.address}`);
  lines.push('');
  if (plan.team) lines.push(`👥 ทีม: ${plan.team.name}`);
  else if (plan.contractorName) lines.push(`👥 ผู้รับเหมา: ${plan.contractorName}`);
  else lines.push(`⚠ ยังไม่ได้มอบหมายทีม`);
  lines.push('');
  lines.push('🛠 งานที่ต้องทำ:');
  const scope = plan.workScope || [];
  if (scope.length === 0) lines.push('  • (ไม่ได้ระบุ)');
  else scope.forEach((s) => lines.push(`  • ${workScopeLabel(s)}`));
  lines.push('');
  if ((plan.sensorCount || 0) > 0) {
    lines.push(`📷 กล้องนับคน: ${plan.sensorCount} ตัว${plan.sensorModel ? ` (${plan.sensorModel})` : ''}`);
  }
  if ((plan.cctvCount || 0) > 0) lines.push(`🎥 CCTV: ${plan.cctvCount} ตัว`);
  if (plan.poeSwitchModel) lines.push(`⚡ PoE Switch: ${plan.poeSwitchModel}`);
  lines.push('');
  lines.push(`📊 สถานะ: ${STATUS_CONFIG[plan.planStatus].label}`);
  if (plan.contactPerson || plan.contactPhone) {
    lines.push('');
    lines.push('📞 ผู้ติดต่อหน้างาน:');
    if (plan.contactPerson) lines.push(`  ${plan.contactPerson}`);
    if (plan.contactPhone)  lines.push(`  ${plan.contactPhone}`);
    if (plan.contactLine)   lines.push(`  LINE: ${plan.contactLine}`);
  }
  const notes = [plan.detail, plan.readinessNote].filter(Boolean).join('\n');
  if (notes) {
    lines.push('');
    lines.push('📝 หมายเหตุ:');
    lines.push(notes);
  }
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push('DITECH Installation Planner');
  return lines.join('\n');
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

// ─────────────────────────────────────────────────────────────────────────────
//   localStorage helpers — persist user preferences across sessions
// ─────────────────────────────────────────────────────────────────────────────

const PREF_PREFIX = 'ditech.gantt.';

function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREF_PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function savePref<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREF_PREFIX + key, JSON.stringify(value));
  } catch {
    // ignore quota / privacy mode errors
  }
}
