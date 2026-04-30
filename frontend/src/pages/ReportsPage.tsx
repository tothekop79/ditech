import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { reportsApi, type DashboardFilter, type DashboardData } from '../api/reports';
import { useToast } from '../components/Toast';
import { api } from '../api/client';

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#9CA3AF',
  CONFIRMED: '#A78BFA',
  IN_PROGRESS: '#3B82F6',
  COMPLETED: '#10B981',
  CANCELLED: '#EF4444',
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};
const REGION_COLORS: Record<string, string> = {
  BANGKOK: '#0EA5E9',
  UPC: '#F59E0B',
};

// ──────────────────────────────────────────────────────────────
// Date preset helpers
// ──────────────────────────────────────────────────────────────
type Preset = 'last_7_days' | 'last_30_days' | 'last_90_days' | 'this_month' | 'this_year' | 'all_time' | 'custom';

function presetToRange(preset: Preset): { from: string; to: string } {
  const today = new Date();
  const ymd = (d: Date) => d.toISOString().split('T')[0];
  const to = ymd(today);

  if (preset === 'last_7_days') {
    const f = new Date(today); f.setDate(today.getDate() - 7);
    return { from: ymd(f), to };
  }
  if (preset === 'last_30_days') {
    const f = new Date(today); f.setDate(today.getDate() - 30);
    return { from: ymd(f), to };
  }
  if (preset === 'last_90_days') {
    const f = new Date(today); f.setDate(today.getDate() - 90);
    return { from: ymd(f), to };
  }
  if (preset === 'this_month') {
    const f = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: ymd(f), to };
  }
  if (preset === 'this_year') {
    const f = new Date(today.getFullYear(), 0, 1);
    return { from: ymd(f), to };
  }
  // all_time → big range
  return { from: '2024-01-01', to };
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────
export function ReportsPage() {
  const showToast = useToast((s) => s.show);
  const [preset, setPreset] = useState<Preset>('last_30_days');
  const [customRange, setCustomRange] = useState<{ from: string; to: string }>(() => presetToRange('last_30_days'));
  const [region, setRegion] = useState<'' | 'BANGKOK' | 'UPC'>('');
  const [customerId, setCustomerId] = useState<string>('');

  // Compute effective range
  const range = preset === 'custom' ? customRange : presetToRange(preset);

  const filter: DashboardFilter = useMemo(() => ({
    from: range.from,
    to: range.to,
    ...(region ? { region } : {}),
    ...(customerId ? { customerId } : {}),
  }), [range.from, range.to, region, customerId]);

  // Fetch dashboard
  const { data, isLoading, error } = useQuery({
    queryKey: ['report-dashboard', filter],
    queryFn: () => reportsApi.dashboard(filter),
  });

  // Fetch customer list for filter dropdown
  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ['customers-master'],
    queryFn: () => api.get('/master/customers').then((r) => r.data.data ?? r.data),
  });

  // ── Excel/PDF export (uses existing endpoint, monthly view) ──
  const downloadExport = async (format: 'xlsx' | 'pdf') => {
    try {
      const today = new Date();
      const params = {
        format,
        period: 'monthly' as const,
        year: today.getFullYear(),
        month: today.getMonth() + 1,
      };
      const fn = `DITECH_dashboard_${range.from}_to_${range.to}`;
      await reportsApi.download(params, `${fn}.${format}`);
      showToast(`${format.toUpperCase()} downloaded`);
    } catch {
      showToast('Download failed');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400 text-sm">Loading dashboard…</div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700 text-sm">
        Failed to load report. {(error as any)?.message}
      </div>
    );
  }

  const s = data.stats;

  return (
    <div className="space-y-4">
      {/* ─────────── Header + Filter Bar ─────────── */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">📊 Reports Dashboard</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {new Date(range.from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              {' '}–{' '}
              {new Date(range.to).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              {' · '}
              {s.total} plans
            </p>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => downloadExport('xlsx')}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">
              📊 Excel
            </button>
            <button onClick={() => downloadExport('pdf')}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">
              📄 PDF
            </button>
          </div>
        </div>

        <div className="flex items-end flex-wrap gap-2">
          {/* Date preset */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Date range</label>
            <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded bg-white">
              <option value="last_7_days">Last 7 days</option>
              <option value="last_30_days">Last 30 days</option>
              <option value="last_90_days">Last 90 days</option>
              <option value="this_month">This month</option>
              <option value="this_year">This year</option>
              <option value="all_time">All time</option>
              <option value="custom">Custom…</option>
            </select>
          </div>

          {preset === 'custom' && (
            <>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">From</label>
                <input type="date" value={customRange.from}
                  onChange={(e) => setCustomRange({ ...customRange, from: e.target.value })}
                  className="px-2 py-1.5 text-xs border border-gray-300 rounded" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">To</label>
                <input type="date" value={customRange.to}
                  onChange={(e) => setCustomRange({ ...customRange, to: e.target.value })}
                  className="px-2 py-1.5 text-xs border border-gray-300 rounded" />
              </div>
            </>
          )}

          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Region</label>
            <select value={region} onChange={(e) => setRegion(e.target.value as any)}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded bg-white">
              <option value="">All regions</option>
              <option value="BANGKOK">Bangkok</option>
              <option value="UPC">UPC</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Customer</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-300 rounded bg-white max-w-[180px]">
              <option value="">All customers</option>
              {customers.map((c: any) => (
                <option key={c.id} value={c.id}>{c.customerCode} — {c.customerName}</option>
              ))}
            </select>
          </div>

          {(region || customerId || preset !== 'last_30_days') && (
            <button
              onClick={() => { setPreset('last_30_days'); setRegion(''); setCustomerId(''); }}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 underline">
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ─────────── KPI Cards ─────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <KpiCard label="Total plans" value={s.total} sub="in range" />
        <KpiCard label="In progress" value={s.inProgress} sub={`${s.confirmed} confirmed`} color="text-blue-600" />
        <KpiCard label="Completed" value={s.completed} sub={`${s.completionRate}% rate`} color="text-green-600" />
        <KpiCard label="Sensors" value={s.totalSensors} sub="cameras planned" />
        <KpiCard label="This week" value={s.upcomingThisWeek} sub="upcoming" color="text-purple-600" />
        <KpiCard label="Unassigned" value={s.unassignedCount} sub="no team" color={s.unassignedCount > 0 ? 'text-amber-600' : 'text-gray-400'} />
      </div>

      {/* ─────────── Charts row 1: Status donut + Region bar ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Status breakdown">
          {data.statusBreakdown.length === 0 ? (
            <EmptyState text="No data in this range" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={data.statusBreakdown}
                  dataKey="count"
                  nameKey="status"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={2}
                  label={({ status, count }: any) => `${STATUS_LABELS[status] || status}: ${count}`}
                  labelLine={false}
                >
                  {data.statusBreakdown.map((d) => (
                    <Cell key={d.status} fill={STATUS_COLORS[d.status] || '#9CA3AF'} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any, name: any) => [value, STATUS_LABELS[name] || name]}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Region split">
          {data.regionBreakdown.length === 0 ? (
            <EmptyState text="No regions in this range" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.regionBreakdown} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis type="number" stroke="#9CA3AF" fontSize={11} />
                <YAxis type="category" dataKey="region" stroke="#6B7280" fontSize={12} width={70} />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {data.regionBreakdown.map((d) => (
                    <Cell key={d.region} fill={REGION_COLORS[d.region] || '#9CA3AF'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ─────────── Charts row 2: Team workload + Customer breakdown ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Team workload">
          {data.teamWorkload.length === 0 ? (
            <EmptyState text="No teams assigned" />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, data.teamWorkload.length * 36 + 40)}>
              <BarChart data={data.teamWorkload} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis type="number" stroke="#9CA3AF" fontSize={11} />
                <YAxis type="category" dataKey="teamName" stroke="#6B7280" fontSize={11} width={110} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="completed" stackId="a" fill="#10B981" name="Completed" />
                <Bar dataKey="inProgress" stackId="a" fill="#3B82F6" name="In progress" />
                <Bar dataKey="total" stackId="b" fill="transparent" name="Total" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Top customers">
          {data.customerBreakdown.length === 0 ? (
            <EmptyState text="No customers in this range" />
          ) : (
            <div className="space-y-2 px-1 py-1 max-h-[280px] overflow-y-auto">
              {data.customerBreakdown.slice(0, 10).map((c) => {
                const pct = c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0;
                return (
                  <div key={c.customerId} className="border-b border-gray-100 last:border-0 pb-2 last:pb-0">
                    <div className="flex justify-between items-center text-xs mb-1">
                      <div className="font-medium text-gray-900 truncate max-w-[180px]" title={c.customerName}>
                        {c.customerCode}
                      </div>
                      <div className="text-gray-500 whitespace-nowrap ml-2">
                        {c.completed}/{c.total} · {c.sensors} sensors
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded overflow-hidden">
                        <div className="h-full bg-green-500" style={{ width: `${pct}%` }}></div>
                      </div>
                      <span className="text-[10px] text-gray-500 w-8 text-right">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>
      </div>

      {/* ─────────── Timeline: upcoming installations ─────────── */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">📅 Upcoming installations</h3>
          <span className="text-xs text-gray-500">
            {s.upcomingThisWeek} this week · {s.upcomingThisMonth} next 30 days
          </span>
        </div>

        {data.upcoming.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            🎉 No upcoming installations in the next 30 days
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="text-left py-1.5 font-medium">Date</th>
                  <th className="text-left py-1.5 font-medium">Customer</th>
                  <th className="text-left py-1.5 font-medium">Store</th>
                  <th className="text-left py-1.5 font-medium">Region</th>
                  <th className="text-left py-1.5 font-medium">Province</th>
                  <th className="text-left py-1.5 font-medium">Sensors</th>
                  <th className="text-left py-1.5 font-medium">Team</th>
                  <th className="text-left py-1.5 font-medium">Readiness</th>
                  <th className="text-left py-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.upcoming.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="py-1.5">
                      {p.scheduledDate
                        ? new Date(p.scheduledDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                        : '—'}
                    </td>
                    <td className="py-1.5 font-medium">{p.customer.customerCode}</td>
                    <td className="py-1.5">
                      <Link to={`/plans/${p.id}`} className="text-blue-600 hover:underline">
                        {p.storeName}{p.branchName ? ` · ${p.branchName}` : ''}
                      </Link>
                    </td>
                    <td className="py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        p.storeRegion === 'BANGKOK' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {p.storeRegion}
                      </span>
                    </td>
                    <td className="py-1.5 text-gray-600">{p.province || '—'}</td>
                    <td className="py-1.5">{p.sensorCount}</td>
                    <td className="py-1.5 text-gray-600">{p.team?.name || <span className="text-amber-600">Unassigned</span>}</td>
                    <td className="py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        p.readiness === 'READY' ? 'bg-green-100 text-green-700' :
                        p.readiness === 'NOT_READY' ? 'bg-red-100 text-red-700' :
                        p.readiness === 'ON_HOLD' ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {p.readiness}
                      </span>
                    </td>
                    <td className="py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        p.planStatus === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                        p.planStatus === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                        p.planStatus === 'CONFIRMED' ? 'bg-purple-100 text-purple-700' :
                        p.planStatus === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {p.planStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Reusable subcomponents
// ──────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`text-2xl font-semibold mt-0.5 ${color || 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">{title}</h3>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-[200px] text-gray-400 text-sm italic">
      {text}
    </div>
  );
}
