import { useMemo, useState } from 'react';
import { usePersistedFilters } from '../hooks/usePersistedFilters';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { DndContext, useDraggable, useDroppable, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { plansApi, type InstallationPlan } from '../api/plans';
import { useToast } from '../components/Toast';
import { DateRangeFilter, getPresetRange, type DateRange } from '../components/DateRangeFilter';
import { FilterBar, FilterValues } from '../components/FilterBar';
import { ColorLegend } from '../components/ColorLegend';


const SCOPE_ICONS: Record<string, string> = {
  INSTALL_CAMERA: '📷',
  INSTALL_LAN: '🔌',
  INSTALL_POE: '⚡',
  CALIBRATION: '🎯',
  TESTING: '✓',
  CLOUD_SETUP: '☁️',
  MAINTENANCE: '🔧',
};
// ───── helpers ───────────────────────────────────────────
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const plansOnDate = (plans: InstallationPlan[], d: Date) =>
  plans.filter((p) => {
    const dt = new Date(p.scheduledDate);
    return sameDay(dt, d);
  });

const plansInRange = (plans: InstallationPlan[], from: Date, to: Date) =>
  plans.filter((p) => {
    const dt = new Date(p.scheduledDate);
    return dt >= from && dt <= to;
  });

const sortByDateAsc = (plans: InstallationPlan[]) =>
  [...plans].sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());

// Selection types
type Selection =
  | { type: 'day'; date: Date }
  | { type: 'week'; from: Date; to: Date; year: number; month: number; weekIdx: number }
  | { type: 'month'; year: number; month: number };

const formatSelection = (s: Selection): string => {
  if (s.type === 'day')
    return s.date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (s.type === 'week') {
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    return `Week of ${fmt(s.from)} – ${fmt(s.to)}`;
  }
  return new Date(s.year, s.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const plansForSelection = (plans: InstallationPlan[], s: Selection): InstallationPlan[] => {
  if (s.type === 'day') return plansOnDate(plans, s.date);
  if (s.type === 'week') return plansInRange(plans, s.from, s.to);
  const from = new Date(s.year, s.month, 1);
  const to = new Date(s.year, s.month + 1, 0, 23, 59, 59);
  return plansInRange(plans, from, to);
};

// Color helpers
const readinessChip = (r?: string) => {
  if (r === 'READY') return 'bg-green-100 text-green-700 border-green-300';
  if (r === 'NOT_READY') return 'bg-red-100 text-red-700 border-red-300';
  if (r === 'ON_HOLD') return 'bg-orange-100 text-orange-700 border-orange-300';
  return 'bg-gray-100 text-gray-600 border-gray-300';
};

const statusChip = (s?: string) => {
  if (s === 'COMPLETED') return 'bg-gray-200 text-gray-500';
  if (s === 'IN_PROGRESS') return 'bg-blue-50 text-blue-700';
  if (s === 'CONFIRMED') return 'bg-purple-50 text-purple-700';
  if (s === 'CANCELLED') return 'bg-red-100 text-red-600 line-through';
  return 'bg-gray-100 text-gray-600';
};

// Whole-event styling — dim completed, fade cancelled
const eventCardStyle = (s?: string): string => {
  if (s === 'COMPLETED') return 'opacity-60 grayscale';
  if (s === 'CANCELLED') return 'opacity-50 line-through grayscale';
  return '';
};

const regionChip = (r?: string) =>
  r === 'BANGKOK'
    ? 'bg-sky-50 text-sky-700 border-sky-200'
    : 'bg-amber-50 text-amber-700 border-amber-200';

// ───── Page ──────────────────────────────────────────────
export function CalendarPage() {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(new Date());
  const [monthsToShow, setMonthsToShow] = useState(1);
  const [range, setRange] = useState<DateRange>(() => getPresetRange('this_month'));
  const [filters, setFilters] = usePersistedFilters<FilterValues>('calendar', {} as FilterValues);
  const [selection, setSelection] = useState<Selection | null>(null);
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const { from, to, monthsList } = useMemo(() => {
    const months: { year: number; month: number }[] = [];
    for (let i = 0; i < monthsToShow; i++) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth() + i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    const first = new Date(months[0].year, months[0].month, 1);
    const last = new Date(months[months.length - 1].year, months[months.length - 1].month + 1, 0, 23, 59, 59);
    return { from: first.toISOString(), to: last.toISOString(), monthsList: months };
  }, [cursor, monthsToShow]);

  const { data: plansResp, isLoading } = useQuery({
    queryKey: ['plans', from, to, JSON.stringify(filters)],
    queryFn: () =>
      plansApi.list({
        scheduledFrom: from,
        scheduledTo: to,
        limit: 500,
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v)),
      }),
  });
  const plans: InstallationPlan[] = (plansResp as any)?.data || [];

  const provinceOptions = useMemo(
    () => Array.from(new Set(plans.map((p: any) => p.province).filter(Boolean))).sort() as string[],
    [plans]
  );

  // Summary counts (whole visible range)
  const totals = useMemo(() => {
    const total = plans.length;
    const ready = plans.filter((p: any) => p.readiness === 'READY').length;
    const notReady = plans.filter((p: any) => p.readiness === 'NOT_READY').length;
    const sensorTotal = plans.reduce((s, p: any) => s + (p.sensorCount || 0), 0);
    return { total, ready, notReady, sensors: sensorTotal };
  }, [plans]);

  const updateMutation = useMutation({
    mutationFn: ({ id, scheduledDate }: { id: string; scheduledDate: string }) =>
      plansApi.update(id, { scheduledDate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plans'] });
      showToast('Plan rescheduled');
    },
    onError: () => showToast('Failed to reschedule'),
  });

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const planId = e.active.id as string;
    const newDateKey = e.over.id as string;
    updateMutation.mutate({ id: planId, scheduledDate: new Date(newDateKey).toISOString() });
  };

  const monthInfo = `${totals.total} plans · ${totals.ready} ready · ${totals.notReady} not ready · ${totals.sensors} sensors`;

  const selectedPlans = selection ? sortByDateAsc(plansForSelection(plans, selection)) : [];

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="space-y-3">
        {/* ── Top control bar ───────────────────────────── */}
        <div className="flex items-center gap-2 justify-between flex-wrap">
          <div className="flex items-center gap-2">
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              className="px-3 py-1.5 border border-gray-300 rounded">‹</button>
            <h2 className="text-lg font-semibold mx-2">
              {new Date(monthsList[0].year, monthsList[0].month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              {monthsToShow > 1 && ` – ${new Date(monthsList[monthsList.length - 1].year, monthsList[monthsList.length - 1].month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`}
            </h2>
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              className="px-3 py-1.5 border border-gray-300 rounded">›</button>
            <button onClick={() => { setCursor(new Date()); setSelection({ type: 'day', date: new Date() }); }}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm">Today</button>
          </div>
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <DateRangeFilter value={range} onChange={setRange} />
            <select value={monthsToShow} onChange={(e) => setMonthsToShow(parseInt(e.target.value))}
              className="px-3 py-1.5 border border-gray-300 rounded">
              <option value={1}>1 month</option>
              <option value={2}>2 months</option>
              <option value={3}>3 months</option>
            </select>
            <span className="text-gray-500 hidden md:inline">Click month/week/day to filter</span>
          </div>
        </div>

        <div className="text-sm text-gray-500">{monthInfo}</div>

        {/* ── FilterBar ──────────────────────────────────── */}
        <FilterBar values={filters} onChange={setFilters}
          fields={['search', 'customer', 'department', 'region', 'province', 'team', 'status', 'readiness']}
          provinceOptions={provinceOptions} />
        <ColorLegend />

        {/* ── Month grids (always in same place) ────────── */}
        {isLoading ? (
          <div className="py-12 text-center text-gray-400">Loading...</div>
        ) : (
          <div className={`grid gap-4 ${monthsToShow >= 2 ? 'lg:grid-cols-2' : ''} ${monthsToShow >= 3 ? 'xl:grid-cols-3' : ''}`}>
            {monthsList.map((m) => (
              <MonthGrid key={`${m.year}-${m.month}`} year={m.year} month={m.month}
                plans={plans} compact={monthsToShow > 1}
                selection={selection}
                onDayClick={(d) => setSelection({ type: 'day', date: d })}
                onWeekClick={(from, to, weekIdx) =>
                  setSelection({ type: 'week', from, to, year: m.year, month: m.month, weekIdx })
                }
                onMonthClick={() => setSelection({ type: 'month', year: m.year, month: m.month })}
                onChipClick={(id) => navigate(`/plans/${id}`)} />
            ))}
          </div>
        )}

        {/* ── Selection panel (BELOW calendars) ───────────── */}
        {selection && (
          <SelectionPanel selection={selection} plans={selectedPlans}
            onClose={() => setSelection(null)}
            onPlanClick={(id) => navigate(`/plans/${id}`)} />
        )}
      </div>
    </DndContext>
  );
}

// ───── Selection panel — production-grade plan list ─────
function SelectionPanel({ selection, plans, onClose, onPlanClick }: {
  selection: Selection;
  plans: InstallationPlan[];
  onClose: () => void;
  onPlanClick: (id: string) => void;
}) {
  // Stats for the selected range
  const stats = useMemo(() => {
    const total = plans.length;
    const ready = plans.filter((p: any) => p.readiness === 'READY').length;
    const notReady = plans.filter((p: any) => p.readiness === 'NOT_READY').length;
    const sensors = plans.reduce((s, p: any) => s + (p.sensorCount || 0), 0);
    const teams = new Set(plans.map((p: any) => p.team?.name).filter(Boolean)).size;
    const scopeCount: Record<string, number> = {};
    plans.forEach((p: any) => {
      (p.workScope || []).forEach((s: string) => { scopeCount[s] = (scopeCount[s] || 0) + 1; });
    });
    const scopeSummary = Object.entries(scopeCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { total, ready, notReady, sensors, teams, scopeSummary };
  }, [plans]);

  const labelByType: Record<string, string> = { day: 'DAY', week: 'WEEK', month: 'MONTH' };

  return (
    <div className="bg-white border border-blue-200 rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-200">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] font-semibold tracking-wider px-2 py-0.5 bg-blue-600 text-white rounded">
            {labelByType[selection.type]}
          </span>
          <span className="font-semibold text-gray-900">{formatSelection(selection)}</span>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-gray-700"><strong>{stats.total}</strong> plans</span>
            <span className="text-green-700"><strong>{stats.ready}</strong> ready</span>
            <span className="text-red-700"><strong>{stats.notReady}</strong> not ready</span>
            <span className="text-gray-700"><strong>{stats.sensors}</strong> sensors</span>
            {stats.teams > 0 && <span className="text-gray-700"><strong>{stats.teams}</strong> teams</span>}
            {stats.scopeSummary && stats.scopeSummary.length > 0 && (
              <span className="flex items-center gap-1 text-gray-700">
                <span className="text-[10px] text-gray-500">scope:</span>
                {stats.scopeSummary.map(([scope, count]: [string, number]) => (
                  <span key={scope} className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px]"
                        title={scope.replace('_', ' ')}>
                    {SCOPE_ICONS[scope] || '•'} {count}
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none px-2">✕</button>
      </div>

      {/* Body — 5 column grid of plan cards */}
      {plans.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">No plans in this range</div>
      ) : (
        <div className="p-3 grid gap-2.5 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {plans.map((p: any) => <PlanCard key={p.id} plan={p} onClick={() => onPlanClick(p.id)} />)}
        </div>
      )}
    </div>
  );
}

// ───── PlanCard — rich detail card ──────────────────────
function PlanCard({ plan, onClick }: { plan: any; onClick: () => void }) {
  const date = new Date(plan.scheduledDate);
  const dateLabel = date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });

  return (
    <button onClick={onClick}
      className={`text-left bg-white hover:shadow-md hover:border-blue-300 border border-gray-200 rounded-lg p-2.5 transition flex flex-col gap-1.5 group ${eventCardStyle(plan.planStatus)}`}>
      {/* Header — date pill + readiness */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <div className="bg-gray-100 group-hover:bg-blue-50 rounded px-1.5 py-0.5 leading-tight">
            <div className="text-[9px] text-gray-500 uppercase font-medium">{dayOfWeek}</div>
            <div className="text-xs font-bold text-gray-900">{dateLabel}</div>
          </div>
          {plan.storeRegion && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${regionChip(plan.storeRegion)}`}>
              {plan.storeRegion}
            </span>
          )}
        </div>
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${readinessChip(plan.readiness)}`}>
          {plan.readiness || '—'}
        </span>
      </div>

      {/* Store name */}
      <div className="font-semibold text-sm text-gray-900 leading-tight line-clamp-2 min-h-[2.4em]">
        {plan.storeName}
      </div>

      {/* Customer · Department */}
      <div className="text-[11px] text-gray-600 truncate">
        <span className="font-medium">{plan.customer?.customerCode}</span>
        {plan.department?.departmentName && <span> · {plan.department.departmentName}</span>}
      </div>

      {/* Province */}
      {plan.province && (
        <div className="text-[10px] text-gray-500 flex items-center gap-1">
          <span>📍</span><span className="truncate">{plan.province}</span>
        </div>
      )}

      {/* Work scope chips */}
      {Array.isArray((plan as any).workScope) && (plan as any).workScope.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {(plan as any).workScope.map((s: string) => (
            <span key={s} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded"
                  title={s.replace(/_/g, ' ')}>
              {SCOPE_ICONS[s] || '•'} <span className="capitalize">{s.replace(/_/g, ' ').toLowerCase()}</span>
            </span>
          ))}
        </div>
      )}

      {/* Footer — sensors / team / status */}
      <div className="flex items-center justify-between gap-1 mt-0.5 pt-1.5 border-t border-gray-100 text-[10px]">
        <div className="flex items-center gap-2">
          <span className="text-gray-700">
            <span className="font-bold text-gray-900">{plan.sensorCount || 0}</span> sensors
          </span>
          {plan.team?.name ? (
            <span className="text-gray-600 truncate max-w-[80px]">👥 {plan.team.name}</span>
          ) : (
            <span className="text-orange-600 font-medium">⚠ unassigned</span>
          )}
        </div>
        <span className={`px-1.5 py-0.5 rounded font-medium ${statusChip(plan.planStatus)}`}>
          {plan.planStatus}
        </span>
      </div>
    </button>
  );
}

// ───── MonthGrid ─────────────────────────────────────────
function MonthGrid({ year, month, plans, compact, selection, onDayClick, onWeekClick, onMonthClick, onChipClick }: any) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startWeekday = first.getDay();
  const totalCells = Math.ceil((startWeekday + last.getDate()) / 7) * 7;
  const totalWeeks = totalCells / 7;
  const gridStart = new Date(first); gridStart.setDate(1 - startWeekday);
  const today = new Date();

  const isMonthSelected = selection?.type === 'month' && selection.year === year && selection.month === month;

  return (
    <div className={`bg-white rounded-lg border overflow-hidden transition ${
      isMonthSelected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200'
    }`}>
      <button onClick={onMonthClick}
        className={`w-full text-left px-4 py-2 border-b transition ${
          isMonthSelected ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 hover:bg-blue-50 border-gray-200'
        }`}>
        <h3 className="text-sm font-medium">
          {first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          <span className="ml-2 text-xs text-gray-400 font-normal">click to filter month</span>
        </h3>
      </button>

      <div className="grid grid-cols-[2rem_repeat(7,_1fr)] border-b border-gray-200 bg-gray-50">
        <div className="border-r border-gray-200" />
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="px-2 py-1 text-xs font-medium text-gray-500 text-center">{d}</div>
        ))}
      </div>

      <div>
        {Array.from({ length: totalWeeks }).map((_, w) => {
          const weekStart = new Date(gridStart);
          weekStart.setDate(gridStart.getDate() + w * 7);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          weekEnd.setHours(23, 59, 59);
          const isWeekSelected = selection?.type === 'week' && selection.year === year && selection.month === month && selection.weekIdx === w;
          return (
            <div key={w} className="grid grid-cols-[2rem_repeat(7,_1fr)]">
              {/* W label — in same grid row as day cells, so heights auto-sync */}
              <button
                onClick={() => onWeekClick(weekStart, weekEnd, w)}
                title={`Click to filter week ${w + 1}`}
                className={`border-r border-b border-gray-100 text-[10px] text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition flex items-start justify-center pt-1 ${
                  isWeekSelected ? 'bg-blue-100 text-blue-700 font-semibold' : ''
                }`}>
                W{w + 1}
              </button>

              {/* 7 day cells for this week row */}
              {Array.from({ length: 7 }).map((_, dayIdx) => {
                const i = w * 7 + dayIdx;
                const d = new Date(gridStart);
                d.setDate(gridStart.getDate() + i);
                const isOther = d.getMonth() !== month;
                const isToday = sameDay(d, today);
                const isSelected = selection?.type === 'day' && sameDay(d, selection.date);
                const dk = dateKey(d);
                const dayPlans = plansOnDate(plans, d);
                return (
                  <DayCell key={dk} dateKey={dk} d={d} isOther={isOther} isToday={isToday}
                    isSelected={isSelected}
                    plans={dayPlans} compact={compact}
                    onDayClick={() => onDayClick(d)}
                    onChipClick={onChipClick} />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───── DayCell ───────────────────────────────────────────
function DayCell({ dateKey: dk, d, isOther, isToday, isSelected, plans, compact, onDayClick, onChipClick }: any) {
  const { isOver, setNodeRef } = useDroppable({ id: dk });
  const cls = `${compact ? 'min-h-[60px]' : 'min-h-[100px]'} border-r border-b border-gray-100 p-1 cursor-pointer transition ${
    isOther ? 'bg-gray-50' : 'bg-white hover:bg-blue-50/30'
  } ${isOver ? 'bg-blue-50 ring-2 ring-blue-300' : ''} ${
    isSelected ? 'ring-2 ring-blue-500 bg-blue-50/50' : ''
  }`;
  return (
    <div ref={setNodeRef} className={cls} onClick={onDayClick}>
      <div className={`text-xs ${isOther ? 'text-gray-400' : 'text-gray-700'} ${
        isToday ? 'bg-gray-900 text-white rounded-full w-5 h-5 inline-flex items-center justify-center' : ''
      }`}>
        {d.getDate()}
      </div>
      <div className="space-y-0.5 mt-0.5">
        {plans.slice(0, compact ? 2 : 4).map((p: any) => (
          <DraggableChip key={p.id} plan={p} compact={compact} onChipClick={onChipClick} />
        ))}
        {plans.length > (compact ? 2 : 4) && (
          <div className="text-[10px] text-gray-500 px-1">+{plans.length - (compact ? 2 : 4)} more</div>
        )}
      </div>
    </div>
  );
}

// ───── DraggableChip — color by readiness for production look ─
function DraggableChip({ plan, compact, onChipClick }: { plan: InstallationPlan; compact: boolean; onChipClick: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: plan.id });
  const style: any = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 100, opacity: 0.85 }
    : {};
  const region = (plan as any).storeRegion || 'BANGKOK';
  const colorCls = region === 'BANGKOK'
    ? 'bg-sky-50 text-sky-800 border-sky-300'
    : 'bg-amber-50 text-amber-800 border-amber-300';
  const readiness = (plan as any).readiness;
  // Readiness ring as left-border accent for production look
  const readinessAccent =
    readiness === 'READY' ? 'border-l-2 border-l-green-500' :
    readiness === 'NOT_READY' ? 'border-l-2 border-l-red-500' :
    readiness === 'ON_HOLD' ? 'border-l-2 border-l-orange-500' :
    'border-l-2 border-l-gray-300';
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}
      onClick={(e) => { e.stopPropagation(); if (!isDragging) onChipClick(plan.id); }}
      className={`${colorCls} ${readinessAccent} text-[10px] px-1.5 py-0.5 rounded border cursor-pointer hover:opacity-80 ${compact ? 'leading-tight' : ''} font-medium flex flex-col gap-0 overflow-hidden ${eventCardStyle(plan.planStatus)}`}
      title={`${plan.customer?.customerCode || ''} · ${plan.department?.departmentName || ''} · ${plan.branchName || plan.storeName} · ${plan.team?.name || 'unassigned'} · ${(plan as any).readiness || ''}`}>
      {compact ? (
        <span className="text-[10px] leading-tight truncate" title={`${plan.customer?.customerCode || ''} · ${plan.department?.departmentName || ''} · ${plan.branchName || plan.storeName}`}>
          {plan.department?.departmentName && <span className="opacity-70">{plan.department.departmentName} · </span>}
          <span className="font-bold">{plan.branchName || plan.storeName}</span>
        </span>
      ) : (
        <>
          <span className="font-bold leading-tight truncate">{plan.customer?.customerCode || '—'}</span>
          <span className="text-[9px] leading-tight truncate">
            {plan.department?.departmentName && <span className="opacity-70">{plan.department.departmentName} · </span>}
            {plan.branchName || plan.storeName}
          </span>
        </>
      )}
    </div>
  );
}
