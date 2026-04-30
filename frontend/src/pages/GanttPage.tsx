import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { plansApi } from '../api/plans';
import { DateRangeFilter, getPresetRange, DateRange } from '../components/DateRangeFilter';
import { masterApi } from '../api/master';
import type { InstallationPlan } from '../api/types';

const RANGES = [
  { label: '2 weeks', months: 0.5 },
  { label: '1 month', months: 1 },
  { label: '3 months', months: 3 },
  { label: '6 months', months: 6 },
];

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-300 text-gray-800 border-gray-400',
  CONFIRMED: 'bg-blue-400 text-white border-blue-500',
  IN_PROGRESS: 'bg-amber-400 text-white border-amber-500',
  COMPLETED: 'bg-green-500 text-white border-green-600',
  CANCELLED: 'bg-red-300 text-white line-through border-red-400',
};

export function GanttPage() {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(new Date());
  const [monthsRange, setMonthsRange] = useState(1);
  const [range, setRange] = useState<DateRange>(() => getPresetRange('this_month'));
  const [groupBy, setGroupBy] = useState<'team' | 'customer' | 'department' | 'region' | 'province' | 'status'>('customer');

  // Filters
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterProvince, setFilterProvince] = useState('');

  // NEW — track which group keys are expanded
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: masterApi.customers });
  const { data: departments } = useQuery({ queryKey: ['departments'], queryFn: masterApi.departments });

  useEffect(() => {
    setCursor(new Date(range.from.getFullYear(), range.from.getMonth(), 1));
    const months = (range.to.getFullYear() - range.from.getFullYear()) * 12 + (range.to.getMonth() - range.from.getMonth()) + 1;
    if (months <= 0.5) setMonthsRange(0.5);
    else if (months <= 1) setMonthsRange(1);
    else if (months <= 3) setMonthsRange(3);
    else setMonthsRange(6);
  }, [range]);

  const start = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1), [cursor]);

  const end = useMemo(() => {
    if (monthsRange < 1) {
      const e = new Date(start);
      e.setDate(e.getDate() + 13);
      return e;
    }
    return new Date(start.getFullYear(), start.getMonth() + monthsRange, 0);
  }, [start, monthsRange]);

  const { data: plansResp, isLoading } = useQuery({
    queryKey: ['gantt-plans', start.toISOString(), end.toISOString(), filterCustomer, filterDepartment, filterRegion, filterProvince],
    queryFn: () => plansApi.list({
      scheduledFrom: start.toISOString(),
      scheduledTo: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59).toISOString(),
      ...(filterCustomer && { customerId: filterCustomer }),
      ...(filterDepartment && { departmentId: filterDepartment }),
      ...(filterRegion && { storeRegion: filterRegion }),
      ...(filterProvince && { province: filterProvince }),
      limit: 500,
    }),
  });

  const plans: InstallationPlan[] = plansResp?.data || [];
  const provinceOptions = Array.from(new Set(plans.map((p: any) => p.province).filter(Boolean))).sort() as string[];
  const totalDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // Generate day list
  const days = useMemo(() => {
    const list: { date: Date; isWeekend: boolean; isToday: boolean }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const wd = d.getDay();
      list.push({
        date: d,
        isWeekend: wd === 0 || wd === 6,
        isToday: d.getTime() === today.getTime(),
      });
    }
    return list;
  }, [start, totalDays]);

  // Group plans
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; plans: InstallationPlan[]; subLabel?: string }>();
    plans.forEach((p: any) => {
      let key = '';
      let label = '';
      let subLabel: string | undefined;
      if (groupBy === 'team') {
        key = p.teamId || '_unassigned';
        label = p.team?.name || '— Unassigned —';
      } else if (groupBy === 'customer') {
        key = p.customerId;
        label = p.customer?.customerCode || 'Unknown';
        subLabel = p.customer?.customerName;
      } else if (groupBy === 'department') {
        key = p.departmentId;
        label = p.department?.departmentName || 'Unknown';
      } else if (groupBy === 'province') {
        key = p.province || '_';
        label = p.province || '— No province —';
      } else if (groupBy === 'region') {
        key = p.storeRegion || '_none';
        label = p.storeRegion || '— No region —';
      } else if (groupBy === 'status') {
        key = p.planStatus || '_none';
        label = p.planStatus || '— No status —';
      }
      if (!map.has(key)) map.set(key, { label, plans: [], subLabel });
      map.get(key)!.plans.push(p);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].label.localeCompare(b[1].label));
  }, [plans, groupBy]);

  // Helper — stack plans into rows that don't overlap
  const stackPlans = (plansList: InstallationPlan[]): InstallationPlan[][] => {
    const rows: InstallationPlan[][] = [];
    const sorted = [...plansList].sort((a: any, b: any) => {
      const ad = a.scheduledDate ? new Date(a.scheduledDate).getTime() : 0;
      const bd = b.scheduledDate ? new Date(b.scheduledDate).getTime() : 0;
      return ad - bd;
    });
    sorted.forEach((p: any) => {
      if (!p.scheduledDate) return;
      const planStart = new Date(p.scheduledDate);
      const planEnd = new Date(planStart);
      planEnd.setDate(planEnd.getDate() + (p.durationDays || 1) - 1);
      let placed = false;
      for (const row of rows) {
        const overlaps = row.some((other: any) => {
          const os = new Date(other.scheduledDate);
          const oe = new Date(os);
          oe.setDate(oe.getDate() + (other.durationDays || 1) - 1);
          return !(planEnd < os || planStart > oe);
        });
        if (!overlaps) { row.push(p); placed = true; break; }
      }
      if (!placed) rows.push([p]);
    });
    return rows;
  };

  // Day width — auto adjust
  const dayWidth = monthsRange < 1 ? 60 : monthsRange === 1 ? 36 : monthsRange === 3 ? 18 : 10;
  const showDayLabels = dayWidth >= 18;
  const labelWidth = 240;

  // Month groupings for top header row
  const monthHeaders = useMemo(() => {
    const headers: { name: string; days: number }[] = [];
    let i = 0;
    while (i < days.length) {
      const month = days[i].date.getMonth();
      let count = 0;
      while (i + count < days.length && days[i + count].date.getMonth() === month) count++;
      headers.push({
        name: days[i].date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        days: count,
      });
      i += count;
    }
    return headers;
  }, [days]);

  const expandAll = () => setExpanded(new Set(groups.map(([k]) => k)));
  const collapseAll = () => setExpanded(new Set());

  const groupByLabel = {
    team: 'Team', customer: 'Customer', department: 'Department',
    region: 'Region', province: 'Province', status: 'Status'
  }[groupBy];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-medium">Gantt · {plans.length} plans across {totalDays} days</h2>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <DateRangeFilter value={range} onChange={setRange} />
          <select value={monthsRange} onChange={(e) => setMonthsRange(parseFloat(e.target.value))}
            className="px-3 py-1.5 border border-gray-300 rounded">
            {RANGES.map(r => <option key={r.months} value={r.months}>{r.label}</option>)}
          </select>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)}
            className="px-3 py-1.5 border border-gray-300 rounded">
            <option value="customer">Group by customer</option>
            <option value="department">Group by department</option>
            <option value="team">Group by team</option>
            <option value="region">Group by region</option>
            <option value="province">Group by province</option>
            <option value="status">Group by status</option>
          </select>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="px-3 py-1.5 border border-gray-300 rounded">‹</button>
          <button onClick={() => setCursor(new Date())}
            className="px-3 py-1.5 border border-gray-300 rounded">Today</button>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="px-3 py-1.5 border border-gray-300 rounded">›</button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded px-2 py-1.5 flex items-center gap-2 flex-wrap text-sm">
        <select value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)}
          className={`px-2 py-1 text-xs border rounded outline-none focus:border-blue-500 ${filterCustomer ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}`}>
          <option value="">All customers</option>
          {customers?.map((c: any) => <option key={c.id} value={c.id}>{c.customerCode}</option>)}
        </select>
        <select value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)}
          className={`px-2 py-1 text-xs border rounded outline-none focus:border-blue-500 ${filterDepartment ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}`}>
          <option value="">All departments</option>
          {departments?.map((d: any) => <option key={d.id} value={d.id}>{d.departmentName}</option>)}
        </select>
        <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)}
          className={`px-2 py-1 text-xs border rounded outline-none focus:border-blue-500 ${filterRegion ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}`}>
          <option value="">All regions</option>
          <option value="BANGKOK">BANGKOK</option>
          <option value="UPC">UPC</option>
        </select>
        <select value={filterProvince} onChange={(e) => setFilterProvince(e.target.value)}
          className={`px-2 py-1 text-xs border rounded outline-none focus:border-blue-500 ${filterProvince ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}`}>
          <option value="">All provinces</option>
          {provinceOptions.map((p: string) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button onClick={() => { setFilterCustomer(''); setFilterDepartment(''); setFilterRegion(''); setFilterProvince(''); }}
          className="text-xs text-blue-600 hover:underline px-1.5">Clear</button>
      </div>

      {/* Expand/collapse helpers */}
      {groups.length > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">{groups.length} groups · {expanded.size} expanded</span>
          <button onClick={expandAll}
            className="px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-50">Expand all</button>
          <button onClick={collapseAll}
            className="px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-50">Collapse all</button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-gray-400">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: labelWidth + totalDays * dayWidth }}>
              {/* Month header row */}
              <div className="flex bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <div style={{ width: labelWidth }} className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-gray-600 border-r border-gray-200">
                  {groupByLabel}
                </div>
                <div className="flex flex-1">
                  {monthHeaders.map((m, i) => (
                    <div key={i} style={{ width: m.days * dayWidth }}
                      className="text-xs font-semibold text-gray-700 px-2 py-1.5 border-r border-gray-300 whitespace-nowrap text-center">
                      {m.name}
                    </div>
                  ))}
                </div>
              </div>

              {/* Day numbers row */}
              {showDayLabels && (
                <div className="flex bg-white border-b border-gray-200">
                  <div style={{ width: labelWidth }} className="flex-shrink-0 border-r border-gray-200" />
                  <div className="flex flex-1">
                    {days.map((dayInfo, i) => (
                      <div key={i} style={{ width: dayWidth }}
                        className={`text-[10px] py-1 text-center border-r border-gray-100 whitespace-nowrap ${
                          dayInfo.isWeekend ? 'bg-gray-50 text-gray-400' : 'text-gray-600'
                        } ${dayInfo.isToday ? 'bg-yellow-50 font-bold text-blue-700' : ''}`}>
                        <div>{dayInfo.date.getDate()}</div>
                        <div className="text-[8px] text-gray-400">{['S','M','T','W','T','F','S'][dayInfo.date.getDay()]}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Group rows */}
              {groups.length === 0 ? (
                <div className="py-12 text-center text-gray-400">No plans in this range</div>
              ) : groups.map(([key, group]) => {
                const isExpanded = expanded.has(key);
                const totalSensors = group.plans.reduce((s: number, p: any) => s + (p.sensorCount || 0), 0);
                const statusBreakdown: Record<string, number> = {};
                group.plans.forEach((p: any) => {
                  statusBreakdown[p.planStatus] = (statusBreakdown[p.planStatus] || 0) + 1;
                });

                // ── Collapsed: stacked bars (overlap-stack algorithm)
                const stackedRows = !isExpanded ? stackPlans(group.plans) : [];
                const collapsedHeight = !isExpanded
                  ? Math.max(30, stackedRows.length * 22 + 8)
                  : 0;

                return (
                  <div key={key}>
                    {/* Group header / collapsed row */}
                    <div className={`flex border-b border-gray-200 ${isExpanded ? 'bg-blue-50/40' : 'hover:bg-gray-50'}`}>
                      <div style={{ width: labelWidth }} className="flex-shrink-0 px-2 py-2 border-r border-gray-200 flex items-start gap-2">
                        <button onClick={() => toggleGroup(key)}
                          className="mt-0.5 w-5 h-5 flex items-center justify-center text-gray-500 hover:bg-gray-200 rounded text-xs flex-shrink-0">
                          {isExpanded ? '▼' : '▶'}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate" title={group.label}>
                            {group.label}
                          </div>
                          {group.subLabel && (
                            <div className="text-[10px] text-gray-500 truncate">{group.subLabel}</div>
                          )}
                          <div className="text-xs text-gray-500 mt-0.5">
                            {group.plans.length} plans · {totalSensors} sensors
                          </div>
                          {/* Status breakdown chips when collapsed — saves info */}
                          {!isExpanded && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {Object.entries(statusBreakdown).map(([s, n]) => (
                                <span key={s}
                                  className={`text-[9px] px-1 py-0 rounded border ${STATUS_COLORS[s] || 'bg-gray-100'}`}>
                                  {s.charAt(0)}{n}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right side: stacked summary bars (collapsed only) */}
                      {!isExpanded && (
                        <div className="flex-1 relative" style={{ minHeight: collapsedHeight, height: collapsedHeight }}>
                          {/* Day grid */}
                          {days.map((dayInfo, i) => (
                            <div key={i} style={{ position: 'absolute', left: i * dayWidth, top: 0, bottom: 0, width: dayWidth }}
                              className={`border-r border-gray-100 ${dayInfo.isWeekend ? 'bg-gray-50' : ''} ${dayInfo.isToday ? 'bg-yellow-50' : ''}`} />
                          ))}
                          {stackedRows.flatMap((row, rIdx) =>
                            row.map((p: any) => {
                              if (!p.scheduledDate) return null;
                              const planStart = new Date(p.scheduledDate);
                              const dayOffset = Math.floor((planStart.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                              if (dayOffset < 0 || dayOffset >= totalDays) return null;
                              const left = dayOffset * dayWidth;
                              const width = Math.max(dayWidth * (p.durationDays || 1) - 2, dayWidth - 2);
                              const top = rIdx * 22 + 4;
                              return (
                                <div
                                  key={p.id}
                                  onClick={() => navigate(`/plans/${p.id}`)}
                                  style={{ position: 'absolute', left, top, width, height: 18 }}
                                  className={`${STATUS_COLORS[p.planStatus] || 'bg-gray-300'} rounded text-[10px] px-1.5 cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-blue-500 truncate flex items-center border shadow-sm`}
                                  title={`${p.customer?.customerCode} · ${p.storeName} · ${p.scheduledDate?.substring(0,10)} · ${p.planStatus}`}
                                >
                                  <span className="truncate font-medium">
                                    {monthsRange < 1 ? `${p.customer?.customerCode} ${p.storeName}` :
                                     monthsRange <= 1 ? p.storeName :
                                     monthsRange <= 3 ? p.storeName.substring(0, 12) :
                                     p.customer?.customerCode}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}

                      {/* When expanded, header right side just shows day grid (no bars — they're in sub-rows) */}
                      {isExpanded && (
                        <div className="flex-1 relative" style={{ minHeight: 30, height: 30 }}>
                          {days.map((dayInfo, i) => (
                            <div key={i} style={{ position: 'absolute', left: i * dayWidth, top: 0, bottom: 0, width: dayWidth }}
                              className={`border-r border-gray-100 ${dayInfo.isWeekend ? 'bg-gray-50' : ''} ${dayInfo.isToday ? 'bg-yellow-50' : ''}`} />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Expanded: 1 row per plan */}
                    {isExpanded && group.plans
                      .slice()
                      .sort((a: any, b: any) => {
                        const ad = a.scheduledDate ? new Date(a.scheduledDate).getTime() : 0;
                        const bd = b.scheduledDate ? new Date(b.scheduledDate).getTime() : 0;
                        return ad - bd;
                      })
                      .map((p: any) => {
                        if (!p.scheduledDate) return null;
                        const planStart = new Date(p.scheduledDate);
                        const dayOffset = Math.floor((planStart.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                        const visible = dayOffset >= 0 && dayOffset < totalDays;
                        const left = dayOffset * dayWidth;
                        const width = Math.max(dayWidth * (p.durationDays || 1) - 2, dayWidth - 2);

                        return (
                          <div key={p.id} className="flex border-b border-gray-100 hover:bg-blue-50/30 cursor-pointer"
                            onClick={() => navigate(`/plans/${p.id}`)}>
                            <div style={{ width: labelWidth }} className="flex-shrink-0 px-2 py-1.5 border-r border-gray-200 pl-9">
                              <div className="text-xs font-medium truncate" title={p.storeName}>
                                {p.storeName}
                              </div>
                              <div className="text-[10px] text-gray-500 flex items-center gap-1.5">
                                <span>{p.sensorCount || 0} sensors</span>
                                {p.team && (
                                  <>
                                    <span>·</span>
                                    <span className="truncate">{p.team.name}</span>
                                  </>
                                )}
                                {p.province && (
                                  <>
                                    <span>·</span>
                                    <span className="truncate">{p.province}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex-1 relative" style={{ minHeight: 28, height: 28 }}>
                              {/* Day grid */}
                              {days.map((dayInfo, i) => (
                                <div key={i} style={{ position: 'absolute', left: i * dayWidth, top: 0, bottom: 0, width: dayWidth }}
                                  className={`border-r border-gray-100 ${dayInfo.isWeekend ? 'bg-gray-50' : ''} ${dayInfo.isToday ? 'bg-yellow-50' : ''}`} />
                              ))}

                              {/* Plan bar */}
                              {visible && (
                                <div
                                  style={{ position: 'absolute', left, top: 5, width, height: 18 }}
                                  className={`${STATUS_COLORS[p.planStatus] || 'bg-gray-300'} rounded text-[10px] px-1.5 truncate flex items-center border shadow-sm hover:ring-2 hover:ring-blue-500`}
                                  title={`${p.scheduledDate?.substring(0,10)} · ${p.planStatus}`}
                                >
                                  <span className="truncate font-medium">{p.planStatus}</span>
                                </div>
                              )}
                              {!visible && (
                                <div className="absolute inset-0 flex items-center pl-2 text-[10px] text-gray-400 italic">
                                  scheduled outside view ({p.scheduledDate?.substring(0,10)})
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-xs flex-wrap">
        <span className="text-gray-500">Legend:</span>
        {Object.entries(STATUS_COLORS).map(([s, cls]) => (
          <span key={s} className={`px-2 py-0.5 rounded border ${cls}`}>{s}</span>
        ))}
        <span className="text-gray-500 ml-3">▶ click to expand · click bar → plan detail</span>
      </div>
    </div>
  );
}
