/**
 * PrintGanttPage — Dedicated print/export route for installation schedules.
 *
 * Route: /gantt/print?from=YYYY-MM-DD&to=YYYY-MM-DD&group=team&...
 *
 * Architecture:
 *   - Uses semantic <table> markup so the browser natively repeats <thead> on
 *     every printed page (no JS hacks needed).
 *   - Left columns: plan details (date/time, customer/site, work summary, notes).
 *   - Right columns: timeline day cells with Gantt bars positioned in correct days.
 *   - Group continuation header is rendered with a `data-group-name` attribute;
 *     CSS handles the "— continued" label on every page repeat of the group.
 *   - Auto-triggers window.print() once data is loaded.
 *
 * This component does NOT depend on screen layout / sticky / transforms.
 * It's a pure document layout optimized for A4 landscape print.
 */
import { useEffect, useMemo, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { plansApi } from '../api/plans';
import './print-gantt.css';

// ─────────────────────────────────────────────────────────────────────────────
//   Types (slim subset of GanttPage types — kept minimal for print)
// ─────────────────────────────────────────────────────────────────────────────

type GroupBy = 'customer' | 'region' | 'team' | 'status';
type PlanStatus = 'DRAFT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'ATTENTION';

interface Plan {
  id: string;
  storeName: string;
  branchName?: string | null;
  storeRegion: string;
  province?: string | null;
  scheduledDate?: string | null;
  completedDate?: string | null;
  durationDays?: number | null;
  workStartTime?: string | null;
  workEndTime?: string | null;
  planStatus: PlanStatus;
  workScope?: string[] | null;
  sensorCount?: number | null;
  sensorModel?: string | null;
  cctvCount?: number | null;
  contactPerson?: string | null;
  contactPhone?: string | null;
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
  plans: Plan[];
  totalSensors: number;
}

// ─────────────────────────────────────────────────────────────────────────────
//   Helpers
// ─────────────────────────────────────────────────────────────────────────────

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const daysBetween = (a: Date, b: Date) =>
  Math.floor((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
const isSunday = (d: Date) => d.getDay() === 0;

function enumerateDays(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cur = startOfDay(start);
  const stop = startOfDay(end);
  while (cur.getTime() <= stop.getTime()) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

interface WeekSpan { weekNum: number; firstIdx: number; lastIdx: number; }
function weekSpans(days: Date[]): WeekSpan[] {
  if (days.length === 0) return [];
  const spans: WeekSpan[] = [];
  let cur: WeekSpan = { weekNum: getISOWeek(days[0]), firstIdx: 0, lastIdx: 0 };
  for (let i = 1; i < days.length; i++) {
    const w = getISOWeek(days[i]);
    if (w !== cur.weekNum) {
      spans.push(cur);
      cur = { weekNum: w, firstIdx: i, lastIdx: i };
    } else {
      cur.lastIdx = i;
    }
  }
  spans.push(cur);
  return spans;
}
function getISOWeek(d: Date): number {
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  return 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
}

const STATUS_COLOR: Record<PlanStatus, string> = {
  DRAFT:       '#64748B',
  CONFIRMED:   '#3B82F6',
  IN_PROGRESS: '#EAB308',
  COMPLETED:   '#10B981',
  CANCELLED:   '#F43F5E',
  ATTENTION:   '#A855F7',
};
const REGION_COLOR = (r?: string) =>
  r === 'BANGKOK' ? '#06B6D4' : r === 'UPC' ? '#FB923C' : '#94A3B8';

function dateRangeLabel(start: Date, end: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
  return `${fmt(start)} – ${fmt(end)}`;
}
function shortMonth(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
}
function dayOfMonth(d?: string | null): string {
  if (!d) return '—';
  return String(new Date(d).getDate());
}
function dayOfWeek(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short' });
}
function timeRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return '';
  return `${start || '—'} – ${end || '—'}`;
}

function workScopeShort(s: string): string {
  const map: Record<string, string> = {
    INSTALL_CAMERA: '📷',
    INSTALL_LAN:    '🔌 LAN',
    INSTALL_POE:    '⚡ POE',
    CALIBRATION:    '🎯 Cal',
    TESTING:        '✓ Test',
    CLOUD_SETUP:    '☁ Cloud',
    MAINTENANCE:    '🔧 Maint',
  };
  return map[s] || s;
}

// ─────────────────────────────────────────────────────────────────────────────
//   Grouping logic (mirrors GanttPage)
// ─────────────────────────────────────────────────────────────────────────────

function groupPlans(plans: Plan[], groupBy: GroupBy): GroupRow[] {
  const buckets = new Map<string, { label: string; plans: Plan[] }>();
  for (const p of plans) {
    let key = ''; let label = '';
    switch (groupBy) {
      case 'team':
        key = p.team?.id || '__unassigned__';
        label = p.team?.name || 'Unassigned';
        break;
      case 'customer':
        key = p.customer?.id || '__unknown__';
        label = p.customer?.customerName || p.customer?.customerCode || 'Unknown';
        break;
      case 'region':
        key = p.storeRegion || '__none__';
        label = p.storeRegion || 'No region';
        break;
      case 'status':
        key = p.planStatus;
        label = p.planStatus;
        break;
    }
    if (!buckets.has(key)) buckets.set(key, { label, plans: [] });
    buckets.get(key)!.plans.push(p);
  }
  return Array.from(buckets.entries()).map(([key, v]) => ({
    key,
    label: v.label,
    plans: v.plans.sort((a, b) => {
      const da = a.scheduledDate ? new Date(a.scheduledDate).getTime() : Number.MAX_SAFE_INTEGER;
      const db = b.scheduledDate ? new Date(b.scheduledDate).getTime() : Number.MAX_SAFE_INTEGER;
      return da - db;
    }),
    totalSensors: v.plans.reduce((sum, p) => sum + (p.sensorCount || 0), 0),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
//   Main component
// ─────────────────────────────────────────────────────────────────────────────

export function PrintGanttPage() {
  const [params] = useSearchParams();

  // ─── Parse URL params ─────────────────────────────────────────────────────
  const fromStr = params.get('from');
  const toStr = params.get('to');
  const groupBy = (params.get('group') || 'team') as GroupBy;
  const fCustomer = params.get('customer') || '';
  const fDepartment = params.get('department') || '';
  const fRegion = params.get('region') || '';
  const fProvince = params.get('province') || '';
  const fStatus = params.get('status') || '';
  const fTeam = params.get('team') || '';

  // Default range: next 30 days
  const defaultStart = startOfDay(new Date());
  const defaultEnd = new Date(defaultStart); defaultEnd.setDate(defaultEnd.getDate() + 29);

  // Clamp rangeStart to TODAY — don't waste columns showing past days.
  // If the URL says from=2026-05-11 but today is 2026-05-12, start at 05-12.
  const today = startOfDay(new Date());
  const requestedStart = fromStr ? startOfDay(new Date(fromStr)) : defaultStart;
  const rangeStart = requestedStart < today ? today : requestedStart;
  const rangeEnd = toStr ? startOfDay(new Date(toStr)) : defaultEnd;
  const days = useMemo(() => enumerateDays(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const weeks = useMemo(() => weekSpans(days), [days]);

  // ─── Fetch plans ──────────────────────────────────────────────────────────
  const { data: plans = [], isLoading, isError } = useQuery({
    queryKey: ['plans', 'print', fromStr, toStr],
    queryFn: () => plansApi.list({ limit: 500 }).then((r: any) => r.data || []),
  });

  // ─── Filter plans ─────────────────────────────────────────────────────────
  const filteredPlans = useMemo(() => {
    return (plans as Plan[]).filter((p) => {
      if (fCustomer && p.customer?.id !== fCustomer) return false;
      if (fDepartment && p.department?.id !== fDepartment) return false;
      if (fRegion && p.storeRegion !== fRegion) return false;
      if (fProvince && p.province !== fProvince) return false;
      if (fStatus && p.planStatus !== fStatus) return false;
      if (fTeam && p.team?.id !== fTeam) return false;
      // Date range: keep plans whose scheduled date is within range OR unscheduled
      if (p.scheduledDate) {
        const ps = startOfDay(new Date(p.scheduledDate));
        if (ps < rangeStart || ps > rangeEnd) return false;
      }
      return true;
    });
  }, [plans, fCustomer, fDepartment, fRegion, fProvince, fStatus, fTeam, rangeStart, rangeEnd]);

  // ─── Group plans ──────────────────────────────────────────────────────────
  const groups = useMemo(() => groupPlans(filteredPlans, groupBy), [filteredPlans, groupBy]);

  // ─── KPI totals ───────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const customers = new Set(filteredPlans.map((p) => p.customer?.id).filter(Boolean));
    return {
      plans: filteredPlans.length,
      customers: customers.size,
      sensors: filteredPlans.reduce((s, p) => s + (p.sensorCount || 0), 0),
      cctv: filteredPlans.reduce((s, p) => s + (p.cctvCount || 0), 0),
      lanJobs: filteredPlans.filter((p) => (p.workScope || []).includes('INSTALL_LAN')).length,
      inProgress: filteredPlans.filter((p) => p.planStatus === 'IN_PROGRESS').length,
      completed: filteredPlans.filter((p) => p.planStatus === 'COMPLETED').length,
      attention: filteredPlans.filter((p) => p.planStatus === 'ATTENTION').length,
      unassigned: filteredPlans.filter((p) => !p.team).length,
      withNotes: filteredPlans.filter((p) => p.detail || p.readinessNote).length,
    };
  }, [filteredPlans]);

  // ─── Auto-trigger print after data loaded ─────────────────────────────────
  useEffect(() => {
    if (!isLoading && !isError && filteredPlans.length > 0) {
      // small delay to let fonts + layout settle
      const t = setTimeout(() => {
        window.print();
      }, 600);
      return () => clearTimeout(t);
    }
  }, [isLoading, isError, filteredPlans.length]);

  // ─── Loading/error states ────────────────────────────────────────────────
  if (isLoading) {
    return <div className="pg-loading">Loading installation schedule…</div>;
  }
  if (isError) {
    return <div className="pg-loading">Failed to load schedule data.</div>;
  }
  if (filteredPlans.length === 0) {
    return <div className="pg-loading">No plans match the selected filters.</div>;
  }

  // ─── Generated timestamp ─────────────────────────────────────────────────
  const generated = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const monthLabel = rangeStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // total columns = 2 (left) + N (timeline days)
  const totalCols = 2 + days.length;
  const todayIdx = days.findIndex((d) => isSameDay(d, today));

  return (
    <div className="pg-document">
      {/* ═══════════════════════════════════════════════════════════════════
          Print header — sits above main table, doesn't repeat on its own,
          but the table's thead does. Page header content is in <thead>.
          ═══════════════════════════════════════════════════════════════════ */}

      <table className="pg-table">
        <thead>
          {/* Row 1 — Page header meta (repeats on every page) */}
          <tr className="pg-page-header">
            <th colSpan={totalCols}>
              <div className="pg-ph-row">
                <div className="pg-ph-left">
                  <div className="pg-ph-title">DITECH · Installation Planner</div>
                  <div className="pg-ph-subtitle">Installation Schedule</div>
                </div>
                <div className="pg-ph-right">
                  <div><b>Date Range:</b> {dateRangeLabel(rangeStart, rangeEnd)}</div>
                  <div><b>Grouped by:</b> {groupBy}</div>
                  <div><b>Generated:</b> {generated}</div>
                </div>
              </div>
            </th>
          </tr>

          {/* Row 2 — Title + KPI strip (repeats every page) */}
          <tr className="pg-title-row">
            <th colSpan={totalCols}>
              <div className="pg-title-block">
                <div className="pg-title">Installation Gantt Schedule</div>
                <div className="pg-subtitle">
                  {monthLabel} · {kpis.plans} plans across {days.length} days
                </div>
              </div>
              <div className="pg-kpi-strip">
                <Kpi icon="📋" color="#3B82F6" label="Plans"        value={kpis.plans} />
                <Kpi icon="👥" color="#8B5CF6" label="Customers"    value={kpis.customers} />
                <Kpi icon="📷" color="#0EA5E9" label="People Cnt."  value={kpis.sensors} />
                <Kpi icon="🎥" color="#06B6D4" label="CCTV"         value={kpis.cctv} />
                <Kpi icon="🔌" color="#10B981" label="LAN Jobs"     value={kpis.lanJobs} />
                <Kpi icon="⚙" color="#F59E0B"  label="In Progress"  value={kpis.inProgress} />
                <Kpi icon="✓" color="#16A34A"  label="Completed"    value={kpis.completed} />
                <Kpi icon="!" color="#DC2626"  label="Attention"    value={kpis.attention} />
                <Kpi icon="⚠" color={kpis.unassigned > 0 ? '#DC2626' : '#9CA3AF'} label="Unassigned" value={kpis.unassigned} />
                <Kpi icon="📝" color="#7C3AED" label="With Notes"   value={kpis.withNotes} />
              </div>
            </th>
          </tr>

          {/* Row 3 — Month label */}
          <tr className="pg-month-row">
            <th colSpan={2} className="pg-left-header">PLAN DETAIL</th>
            <th colSpan={days.length} className="pg-month-label">{monthLabel}</th>
          </tr>

          {/* Row 4 — Week numbers */}
          <tr className="pg-week-row">
            <th colSpan={2}></th>
            {weeks.map((w) => (
              <th key={`w-${w.weekNum}`} colSpan={w.lastIdx - w.firstIdx + 1}>
                Week {w.weekNum}
              </th>
            ))}
          </tr>

          {/* Row 5 — Day numbers + DOW */}
          <tr className="pg-day-row">
            <th className="pg-col-date">Date / Time</th>
            <th className="pg-col-detail">Customer · Site · Summary</th>
            {days.map((d, i) => {
              const isToday = isSameDay(d, today);
              return (
                <th key={i} className={`pg-day-cell ${isToday ? 'pg-today' : ''} ${isSunday(d) ? 'pg-sun' : isWeekend(d) ? 'pg-sat' : ''}`}>
                  <div className="pg-day-num">{d.getDate()}</div>
                  <div className="pg-day-dow">{d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3).toUpperCase()}</div>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {groups.map((g) => (
            <Fragment key={g.key}>
              {/* Group header row — colspan full width */}
              <tr className="pg-group-row" data-group-name={g.label}>
                <td colSpan={totalCols}>
                  <span className="pg-group-name">{g.label}</span>
                  <span className="pg-group-stats">
                    {g.plans.length} {g.plans.length === 1 ? 'plan' : 'plans'} · {g.totalSensors} {g.totalSensors === 1 ? 'sensor' : 'sensors'}
                  </span>
                </td>
              </tr>

              {/* Plan rows */}
              {g.plans.map((p) => (
                <PlanRow key={p.id} plan={p} days={days} rangeStart={rangeStart} todayIdx={todayIdx} />
              ))}
            </Fragment>
          ))}

          {/* Legend — appears once at end of table (last page) */}
          <tr className="pg-legend-row">
            <td colSpan={totalCols}>
              <div className="pg-legend">
                <div className="pg-legend-group">
                  <span className="pg-legend-label">STATUS</span>
                  <span className="pg-legend-chip" style={{ background: STATUS_COLOR.DRAFT }}>DRAFT</span>
                  <span className="pg-legend-chip" style={{ background: STATUS_COLOR.CONFIRMED }}>CONFIRMED</span>
                  <span className="pg-legend-chip" style={{ background: STATUS_COLOR.IN_PROGRESS }}>IN PROGRESS</span>
                  <span className="pg-legend-chip" style={{ background: STATUS_COLOR.COMPLETED }}>COMPLETED</span>
                  <span className="pg-legend-chip" style={{ background: STATUS_COLOR.CANCELLED }}>CANCELLED</span>
                  <span className="pg-legend-chip" style={{ background: STATUS_COLOR.ATTENTION }}>DELAYED / ATTENTION</span>
                </div>
                <div className="pg-legend-group">
                  <span className="pg-legend-label">REGION</span>
                  <span className="pg-legend-swatch" style={{ background: '#06B6D4' }}></span>
                  <span className="pg-legend-text">BANGKOK</span>
                  <span className="pg-legend-swatch" style={{ background: '#FB923C' }}></span>
                  <span className="pg-legend-text">UPC (ต่างจังหวัด)</span>
                </div>
                <div className="pg-legend-group pg-legend-right">
                  <span className="pg-legend-divider">|</span>
                  <span className="pg-legend-text">Today: {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span className="pg-legend-swatch pg-legend-weekend"></span>
                  <span className="pg-legend-text">Weekend</span>
                </div>
              </div>
            </td>
          </tr>
        </tbody>

        <tfoot>
          <tr className="pg-page-footer">
            <td colSpan={totalCols}>
              <div className="pg-pf-row">
                <span className="pg-pf-left">DITECH Installation Planner · v1.0</span>
                <span className="pg-pf-center">{dateRangeLabel(rangeStart, rangeEnd)} · Group by {groupBy}</span>
                <span className="pg-pf-right">© Digital Intelligence Technology Co., Ltd.</span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   Plan row — 1 plan per <tr>, left side = details, right side = timeline cells
// ─────────────────────────────────────────────────────────────────────────────

function PlanRow({ plan, days, rangeStart, todayIdx }: {
  plan: Plan; days: Date[]; rangeStart: Date; todayIdx: number;
}) {
  const sched = plan.scheduledDate ? startOfDay(new Date(plan.scheduledDate)) : null;
  const dur = Math.max(1, plan.durationDays || 1);
  const startIdx = sched ? Math.max(0, daysBetween(rangeStart, sched)) : -1;
  const endIdx = startIdx >= 0 ? Math.min(days.length - 1, startIdx + dur - 1) : -1;

  // Plan details (left columns)
  const customerName = plan.customer?.customerName || plan.customer?.customerCode || '—';
  const sitePart = [plan.storeName, plan.branchName].filter(Boolean).join(' · ');
  const dateBadge = sched ? `${dayOfMonth(plan.scheduledDate)} ${dayOfWeek(plan.scheduledDate)} ${shortMonth(plan.scheduledDate)}` : '—';
  const timeStr = (plan.workStartTime || plan.workEndTime) ? timeRange(plan.workStartTime, plan.workEndTime) : '';

  // Build work summary chips
  const chips: string[] = [];
  if (plan.sensorCount) {
    const model = plan.sensorModel ? `${plan.sensorCount} x ${plan.sensorModel}` : `${plan.sensorCount} Sensor`;
    chips.push(`📷 ${model}`);
  }
  if (plan.cctvCount && plan.cctvCount > 0) chips.push(`🎥 ${plan.cctvCount} CCTV`);
  if ((plan.workScope || []).includes('INSTALL_LAN')) chips.push('🔌 LAN');
  if ((plan.workScope || []).includes('INSTALL_POE')) chips.push('⚡ POE');
  if (plan.contactPerson || plan.contactPhone) {
    const c = [plan.contactPerson, plan.contactPhone].filter(Boolean).join(' ');
    chips.push(`📞 ${c}`);
  }

  const notes = [plan.detail, plan.readinessNote].filter(Boolean).join(' ');
  const barColor = REGION_COLOR(plan.storeRegion);
  const statusColor = STATUS_COLOR[plan.planStatus] || '#94A3B8';

  return (
    <tr className="pg-plan-row">
      {/* Left column 1 — Date / Time */}
      <td className="pg-col-date">
        <div className="pg-date-badge">{dateBadge}</div>
        {timeStr && <div className="pg-time">🕐 {timeStr}</div>}
      </td>

      {/* Left column 2 — Plan details */}
      <td className="pg-col-detail">
        <div className="pg-customer">
          <b>{customerName}</b>{sitePart && <span> · {sitePart}</span>}
          {plan.province && <span className="pg-province"> · {plan.province}</span>}
        </div>
        {chips.length > 0 && (
          <div className="pg-chips">{chips.join(' · ')}</div>
        )}
        {notes && (
          <div className="pg-notes">📝 {notes}</div>
        )}
      </td>

      {/* Timeline cells */}
      {days.map((d, i) => {
        const isToday = i === todayIdx;
        const inBar = startIdx >= 0 && i >= startIdx && i <= endIdx;
        const isBarStart = i === startIdx;
        const cls = [
          'pg-day-cell-body',
          isToday ? 'pg-today' : '',
          isSunday(d) ? 'pg-sun' : isWeekend(d) ? 'pg-sat' : '',
          inBar ? 'pg-bar-cell' : '',
          isBarStart ? 'pg-bar-start' : '',
        ].filter(Boolean).join(' ');

        return (
          <td key={i} className={cls}>
            {inBar && (
              <div className="pg-bar" style={{ background: barColor }}>
                {isBarStart && (
                  <span className="pg-bar-label">
                    <span className="pg-status-dot" style={{ background: statusColor }} />
                    {customerName.substring(0, 1)}
                  </span>
                )}
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   KPI tile (used in print thead title row)
// ─────────────────────────────────────────────────────────────────────────────

function Kpi({ icon, color, label, value }: { icon: string; color: string; label: string; value: number }) {
  return (
    <div className="pg-kpi">
      <div className="pg-kpi-icon" style={{ background: color }}>{icon}</div>
      <div className="pg-kpi-meta">
        <div className="pg-kpi-label">{label}</div>
        <div className="pg-kpi-value">{value}</div>
      </div>
    </div>
  );
}

export default PrintGanttPage;
