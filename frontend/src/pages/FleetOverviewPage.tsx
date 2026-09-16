import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { masterApi } from '../api/master';
import type { Customer } from '../api/types';
import {
  monitorApi,
  HEALTHS,
  HEALTH_COLOR,
  HEALTH_LABEL,
  SOURCES,
  SOURCE_COLOR,
  UNASSIGNED,
  fmtDateTime,
  relativeTime,
  type FleetOverview,
  type FleetSite,
  type MonitorCustomerRef,
  type MonitorSource,
  type SiteHealth,
  type SitePatch,
} from '../api/monitor';
import { useToast } from '../components/Toast';

/** /overview and /overview?all=1 are cached separately; invalidating the prefix refreshes both. */
const OVERVIEW_ROOT = ['monitor-overview'];
const overviewKey = (all: boolean) => [...OVERVIEW_ROOT, all];

/** collapse state is a UI preference — keyed by customer id, or NO_CUSTOMER for the unassigned group */
const COLLAPSED_KEY = 'ditech_monitor_collapsed';
const NO_CUSTOMER = '__none__';
const NEW_CUSTOMER = '__new__';

/** worst-first — EMPTY (no cameras registered) ranks above OK, below a real outage */
const HEALTH_RANK: Record<SiteHealth, number> = { DOWN: 4, DEGRADED: 3, EMPTY: 2, OK: 1 };

interface CustomerGroup {
  key: string;
  name: string;
  sites: FleetSite[];
  devices: number;
  online: number;
  offline: number;
  worst: SiteHealth;
}

function loadCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function FleetOverviewPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);

  const [q, setQ] = useState('');
  const [health, setHealth] = useState<SiteHealth | undefined>();
  const [source, setSource] = useState<MonitorSource | undefined>();
  const [customerId, setCustomerId] = useState<string>('');
  const [showUnmonitored, setShowUnmonitored] = useState(false);
  const [view, setView] = useState<'sites' | 'customers'>('sites');
  /** page-local, never persisted — guards the inline controls against stray clicks */
  const [editMode, setEditMode] = useState(false);
  /** explicit user choices only; groups with no entry fall back to "expanded when something is offline" */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);
  const [newCustomerFor, setNewCustomerFor] = useState<FleetSite | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed));
    } catch {
      /* private mode / quota — collapse state just won't stick */
    }
  }, [collapsed]);

  const activeKey = overviewKey(showUnmonitored);

  const { data: overview, isLoading, dataUpdatedAt } = useQuery({
    queryKey: activeKey,
    queryFn: () => monitorApi.overview(showUnmonitored),
    refetchInterval: 60_000,
    // keep the current table on screen while the other list (all vs monitored-only) loads
    placeholderData: (prev: FleetOverview | undefined) => prev,
  });

  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: masterApi.customers });

  const patchSite = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SitePatch; customer?: MonitorCustomerRef | null }) =>
      monitorApi.patchSite(id, patch),
    onMutate: async ({ id, patch, customer }) => {
      await qc.cancelQueries({ queryKey: activeKey });
      const prev = qc.getQueryData<FleetOverview>(activeKey);
      const resolved =
        customer !== undefined
          ? customer
          : customers.find((c) => c.id === patch.customerId) ?? null;
      qc.setQueryData<FleetOverview>(activeKey, (old) =>
        old
          ? {
              ...old,
              sites: old.sites.map((s) => (s.id === id ? applyPatch(s, patch, resolved) : s)),
            }
          : old,
      );
      return { prev };
    },
    onError: (e: any, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(activeKey, ctx.prev);
      showToast(e?.response?.data?.message || 'Failed to update site');
    },
    onSuccess: () => showToast('Site updated'),
    onSettled: () => qc.invalidateQueries({ queryKey: OVERVIEW_ROOT }),
  });

  const createCustomer = useMutation({
    // the site travels in the variables so onSuccess knows what to assign the new customer to
    mutationFn: ({ customerName, customerCode }: { customerName: string; customerCode: string; site: FleetSite }) =>
      masterApi.customers.create({ customerName, customerCode }),
    onSuccess: (c: Customer, vars) => {
      showToast(`Customer ${c.customerName} created`);
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['master-customers'] });
      setNewCustomerFor(null);
      // assign straight away, handing the fresh customer to the optimistic update
      patchSite.mutate({ id: vars.site.id, patch: { customerId: c.id }, customer: { id: c.id, customerName: c.customerName } });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to create customer'),
  });

  const runPoll = useMutation({
    mutationFn: () => monitorApi.runPoll(),
    onSuccess: (r) => {
      showToast(`Poll done · ${r.sites} sites / ${r.devices} devices · +${r.opened} alerts · -${r.resolved} · ${r.errors} errors`);
      qc.invalidateQueries({ queryKey: OVERVIEW_ROOT });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Poll failed'),
  });

  const runDigest = useMutation({
    mutationFn: () => monitorApi.runDigest(),
    onSuccess: (r) =>
      showToast(r.sent ? `Digest sent · ${r.open} open (new ${r.fresh}) · recovered ${r.recovered}` : 'Nothing to report — digest not sent'),
    onError: (e: any) => showToast(e?.response?.data?.message || 'Digest failed'),
  });

  const sites = overview?.sites ?? [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sites.filter((s) => {
      if (health && s.health !== health) return false;
      if (source && s.source !== source) return false;
      if (customerId && (customerId === NO_CUSTOMER ? !!s.customer : s.customer?.id !== customerId)) return false;
      if (!needle) return true;
      return (
        s.plazaName.toLowerCase().includes(needle) ||
        (s.customer?.customerName ?? UNASSIGNED).toLowerCase().includes(needle) ||
        (s.vendorGroupName ?? '').toLowerCase().includes(needle)
      );
    });
  }, [sites, q, health, source, customerId]);

  /** one grouping feeds both views — everything below comes from the overview payload */
  const groups = useMemo<CustomerGroup[]>(() => {
    const map = new Map<string, CustomerGroup>();
    for (const s of filtered) {
      const key = s.customer?.id ?? NO_CUSTOMER;
      let g = map.get(key);
      if (!g) {
        g = { key, name: s.customer?.customerName ?? UNASSIGNED, sites: [], devices: 0, online: 0, offline: 0, worst: 'OK' };
        map.set(key, g);
      }
      g.sites.push(s);
      g.devices += s.devices;
      g.online += s.online;
      g.offline += s.offline;
      if (HEALTH_RANK[s.health] > HEALTH_RANK[g.worst]) g.worst = s.health;
    }
    return [...map.values()].sort((a, b) => {
      if (a.name === UNASSIGNED) return 1;
      if (b.name === UNASSIGNED) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [filtered]);

  const byOffline = useMemo(
    () =>
      [...groups].sort((a, b) => {
        if (b.offline !== a.offline) return b.offline - a.offline;
        if (a.name === UNASSIGNED) return 1;
        if (b.name === UNASSIGNED) return -1;
        return a.name.localeCompare(b.name);
      }),
    [groups],
  );

  const setAllCollapsed = (value: boolean) =>
    setCollapsed((c) => ({ ...c, ...Object.fromEntries(groups.map((g) => [g.key, value])) }));

  const openCustomerInSites = (g: CustomerGroup) => {
    setCustomerId(g.key);
    setCollapsed((c) => ({ ...c, [g.key]: false }));
    setView('sites');
  };

  const d = overview?.devices;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">📷 Camera Monitor</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            สถานะกล้องทุกสาขา — ดึงจากเซิร์ฟเวอร์ผู้ผลิตทุก 5 นาที · หน้านี้รีเฟรชเองทุก 60 วินาที
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEditMode(!editMode)}
            className={`px-3 py-1.5 text-sm rounded border ${
              editMode
                ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}>
            {editMode ? '✓ Done / เสร็จสิ้น' : '✏️ Edit / แก้ไข'}
          </button>
          <button
            onClick={() => runPoll.mutate()}
            disabled={runPoll.isPending}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {runPoll.isPending ? 'Polling…' : '🔄 Poll now'}
          </button>
          <button
            onClick={() => runDigest.mutate()}
            disabled={runDigest.isPending}
            className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50">
            {runDigest.isPending ? 'Sending…' : '📨 Send digest'}
          </button>
        </div>
      </div>

      {editMode && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 rounded px-3 py-1.5 text-xs">
          ✏️ Edit mode on · แก้ไขอยู่ — เปลี่ยนลูกค้า / เปิด-ปิดมอนิเตอร์ / 24h ได้ทันที กด “Done” เมื่อเสร็จ
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2">
        <Kpi label="Devices · ทั้งหมด" value={d?.total ?? 0} />
        <Kpi label="Online · ออนไลน์" value={d?.online ?? 0} tone="text-green-600" />
        <Kpi label="Offline · ออฟไลน์" value={d?.offline ?? 0} tone="text-red-600" />
        <Kpi label="Missing · หาย" value={d?.missing ?? 0} tone="text-purple-600" />
        <Kpi label="Disabled · ปิดใช้" value={d?.disabled ?? 0} tone="text-gray-500" />
        <Kpi label="Open alerts · แจ้งเตือน" value={overview?.openAlerts ?? 0} tone="text-amber-600" />
        <div className="bg-white border border-gray-200 rounded-lg p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-gray-400">Last poll · โพลล์ล่าสุด</div>
          <div className="text-sm font-medium text-gray-700 mt-0.5" title={fmtDateTime(overview?.lastPolledAt)}>
            {relativeTime(overview?.lastPolledAt)}
          </div>
          <div className="text-[10px] text-gray-400">
            refreshed {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('en-GB') : '—'}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="🔍 Search site / customer / vendor group…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-1 min-w-[220px] px-2 py-1.5 text-sm border border-gray-300 rounded"
        />

        <div className="flex flex-wrap gap-1">
          <FilterBtn active={!health} onClick={() => setHealth(undefined)}>All health</FilterBtn>
          {HEALTHS.map((h) => (
            <FilterBtn key={h} active={health === h} onClick={() => setHealth(health === h ? undefined : h)}>
              {HEALTH_LABEL[h]}
            </FilterBtn>
          ))}
        </div>

        <div className="flex flex-wrap gap-1">
          <FilterBtn active={!source} onClick={() => setSource(undefined)}>All sources</FilterBtn>
          {SOURCES.map((s) => (
            <FilterBtn key={s} active={source === s} onClick={() => setSource(source === s ? undefined : s)}>
              {s}
            </FilterBtn>
          ))}
        </div>

        <select
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="px-2 py-1.5 text-sm border border-gray-300 rounded bg-white">
          <option value="">All customers · ทุกลูกค้า</option>
          <option value={NO_CUSTOMER}>{UNASSIGNED}</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.customerName}</option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-xs text-gray-600" title="โหลดจาก /overview?all=1 — รวม site ที่ปิดมอนิเตอร์ (demo / งานที่จบแล้ว)">
          <input type="checkbox" checked={showUnmonitored} onChange={(e) => setShowUnmonitored(e.target.checked)} />
          Show unmonitored · แสดงที่ปิดมอนิเตอร์
        </label>

        {view === 'sites' && (
          <span className="text-xs text-gray-500 flex gap-2">
            <button onClick={() => setAllCollapsed(false)} className="text-blue-600 hover:underline">Expand all</button>
            <button onClick={() => setAllCollapsed(true)} className="text-blue-600 hover:underline">Collapse all</button>
          </span>
        )}

        <span className="text-xs text-gray-500 ml-auto">
          {groups.length} customers · {filtered.length} sites
        </span>
      </div>

      {/* View switch */}
      <div className="flex gap-1 border-b border-gray-200">
        <TabBtn active={view === 'sites'} onClick={() => setView('sites')}>📍 Sites</TabBtn>
        <TabBtn active={view === 'customers'} onClick={() => setView('customers')}>🏢 By customer / รายลูกค้า</TabBtn>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-400 text-sm">
          No sites match — ไม่พบสาขาตามเงื่อนไข
        </div>
      ) : view === 'customers' ? (
        <CustomerTable groups={byOffline} onOpen={openCustomerInSites} />
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
                <th className="px-3 py-2 font-medium">Site · สาขา</th>
                <th className="px-2 py-2 font-medium text-right">Devices</th>
                <th className="px-2 py-2 font-medium text-right">Online</th>
                <th className="px-2 py-2 font-medium text-right">Offline</th>
                <th className="px-2 py-2 font-medium">Health</th>
                <th className="px-2 py-2 font-medium">Vendor group</th>
                <th className="px-2 py-2 font-medium text-center">24h</th>
                <th className="px-2 py-2 font-medium">Customer · ลูกค้า</th>
                <th className="px-2 py-2 font-medium text-center">Monitor</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows
                  key={g.key}
                  group={g}
                  collapsed={collapsed[g.key] ?? g.offline === 0}
                  editMode={editMode}
                  customers={customers}
                  onToggle={() => setCollapsed((c) => ({ ...c, [g.key]: !(c[g.key] ?? g.offline === 0) }))}
                  onOpen={(id) => navigate(`/monitor/sites/${id}`)}
                  onPatch={(id, patch, customer) => patchSite.mutate({ id, patch, customer })}
                  onNewCustomer={(site) => setNewCustomerFor(site)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {newCustomerFor && (
        <NewCustomerModal
          site={newCustomerFor}
          submitting={createCustomer.isPending}
          onClose={() => setNewCustomerFor(null)}
          onCreate={(input) => createCustomer.mutate({ ...input, site: newCustomerFor })}
        />
      )}
    </div>
  );
}

// ─── Sites view ───

function GroupRows({
  group,
  collapsed,
  editMode,
  customers,
  onToggle,
  onOpen,
  onPatch,
  onNewCustomer,
}: {
  group: CustomerGroup;
  collapsed: boolean;
  editMode: boolean;
  customers: Customer[];
  onToggle: () => void;
  onOpen: (id: string) => void;
  onPatch: (id: string, patch: SitePatch, customer?: MonitorCustomerRef | null) => void;
  onNewCustomer: (site: FleetSite) => void;
}) {
  return (
    <>
      <tr className="bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100" onClick={onToggle}>
        <td colSpan={9} className="px-3 py-1.5 text-xs font-semibold text-gray-700">
          <span className="inline-block w-3 text-gray-400">{collapsed ? '▸' : '▾'}</span>
          🏢 {group.name}
          <span className="ml-2 font-normal text-gray-400">
            {group.sites.length} sites · {group.devices} devices
            {group.offline > 0 ? <span className="text-red-600"> · {group.offline} offline</span> : ' · 0 offline'}
          </span>
        </td>
      </tr>
      {!collapsed &&
        group.sites.map((s) => (
          <tr
            key={s.id}
            onClick={() => onOpen(s.id)}
            className={`border-b border-gray-100 cursor-pointer hover:bg-blue-50/50 ${s.monitored ? '' : 'opacity-50'}`}>
            <td className="px-3 py-1.5">
              <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border mr-1.5 ${SOURCE_COLOR[s.source]}`}>
                {s.source}
              </span>
              <span className="text-gray-900">{s.plazaName}</span>
              {s.accountAmbiguous && <span className="ml-1 text-amber-500" title="vendor group matches more than one account">⚠️</span>}
            </td>
            <td className="px-2 py-1.5 text-right text-gray-600">{s.devices}</td>
            <td className="px-2 py-1.5 text-right text-green-700">{s.online}</td>
            <td className={`px-2 py-1.5 text-right ${s.offline > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>{s.offline}</td>
            <td className="px-2 py-1.5">
              <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${HEALTH_COLOR[s.health]}`}>
                {HEALTH_LABEL[s.health]}
              </span>
            </td>
            <td className="px-2 py-1.5 text-xs text-gray-500">{s.vendorGroupName || '—'}</td>
            <td className="px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
              {editMode ? (
                <button
                  onClick={() => onPatch(s.id, { alwaysOpen: !s.alwaysOpen })}
                  title={s.alwaysOpen ? 'Always open 24h — เปิดตลอด' : 'Business hours — ตามเวลาทำการ'}
                  className={s.alwaysOpen ? '' : 'opacity-40'}>
                  {s.alwaysOpen ? '🕛' : '🕗'}
                </button>
              ) : (
                <span
                  title={s.alwaysOpen ? 'Always open 24h — เปิดตลอด' : 'Business hours — ตามเวลาทำการ'}
                  className={s.alwaysOpen ? '' : 'opacity-40'}>
                  {s.alwaysOpen ? '🕛' : '🕗'}
                </span>
              )}
            </td>
            <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
              {editMode ? (
                <select
                  value={s.customer?.id ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === NEW_CUSTOMER) return onNewCustomer(s);
                    const c = customers.find((x) => x.id === v);
                    onPatch(s.id, { customerId: v || null }, c ? { id: c.id, customerName: c.customerName } : null);
                  }}
                  className="text-xs px-1.5 py-1 border border-gray-300 rounded bg-white max-w-[180px]">
                  <option value="">— ไม่ระบุ · unassigned</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.customerName}</option>
                  ))}
                  <option value={NEW_CUSTOMER}>+ ลูกค้าใหม่ · new customer</option>
                </select>
              ) : (
                <span className="text-gray-700">{s.customer?.customerName ?? UNASSIGNED}</span>
              )}
              {s.customerSource && <span className="ml-1 text-[10px] text-gray-400">{s.customerSource}</span>}
            </td>
            <td className="px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={s.monitored}
                disabled={!editMode}
                title={editMode ? undefined : 'กด Edit เพื่อแก้ไข'}
                onChange={(e) => onPatch(s.id, { monitored: e.target.checked })}
              />
            </td>
          </tr>
        ))}
    </>
  );
}

// ─── Customer view ───

function CustomerTable({ groups, onOpen }: { groups: CustomerGroup[]; onOpen: (g: CustomerGroup) => void }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
            <th className="px-3 py-2 font-medium">Customer · ลูกค้า</th>
            <th className="px-2 py-2 font-medium text-right">Sites</th>
            <th className="px-2 py-2 font-medium text-right">Devices</th>
            <th className="px-2 py-2 font-medium text-right">Online</th>
            <th className="px-2 py-2 font-medium text-right">Offline</th>
            <th className="px-2 py-2 font-medium text-right">Online %</th>
            <th className="px-2 py-2 font-medium">Worst site · แย่สุด</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const pct = g.devices ? (100 * g.online) / g.devices : null;
            return (
              <tr
                key={g.key}
                onClick={() => onOpen(g)}
                className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-blue-50/50">
                <td className="px-3 py-1.5 text-gray-900">🏢 {g.name}</td>
                <td className="px-2 py-1.5 text-right text-gray-600">{g.sites.length}</td>
                <td className="px-2 py-1.5 text-right text-gray-600">{g.devices}</td>
                <td className="px-2 py-1.5 text-right text-green-700">{g.online}</td>
                <td className={`px-2 py-1.5 text-right ${g.offline > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>{g.offline}</td>
                <td className={`px-2 py-1.5 text-right font-mono text-xs ${pctTone(pct)}`}>
                  {pct === null ? '—' : `${pct.toFixed(1)}%`}
                </td>
                <td className="px-2 py-1.5">
                  <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${HEALTH_COLOR[g.worst]}`}>
                    {HEALTH_LABEL[g.worst]}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── New customer modal ───

/** Code defaults to the name (uppercased, spaces stripped) until the user edits it by hand. */
function deriveCode(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, '').slice(0, 20);
}

function NewCustomerModal({
  site,
  submitting,
  onClose,
  onCreate,
}: {
  site: FleetSite;
  submitting: boolean;
  onClose: () => void;
  onCreate: (input: { customerName: string; customerCode: string }) => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const effectiveCode = codeTouched ? code : deriveCode(name);
  const valid = name.trim().length > 0 && effectiveCode.length > 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-gray-900">🏢 New customer · ลูกค้าใหม่</h3>
        <p className="text-xs text-gray-500 mt-0.5">สร้างแล้วผูกกับสาขา “{site.plazaName}” ทันที</p>

        <div className="space-y-2 mt-3">
          <div>
            <label className="text-xs text-gray-600">Display name · ชื่อลูกค้า *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded mt-0.5"
              placeholder="e.g. King Power"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">Customer code * <span className="text-gray-400">(ตัวพิมพ์ใหญ่ ไม่มีเว้นวรรค)</span></label>
            <input
              value={effectiveCode}
              onChange={(e) => { setCodeTouched(true); setCode(e.target.value.toUpperCase()); }}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded mt-0.5 font-mono"
              placeholder="KINGPOWER"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => onCreate({ customerName: name.trim(), customerCode: effectiveCode })}
            disabled={!valid || submitting}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {submitting ? 'Creating…' : 'Create & assign'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bits ───

function Kpi({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`text-xl font-semibold mt-0.5 ${tone || 'text-gray-900'}`}>{value}</div>
    </div>
  );
}

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2 py-1 rounded border ${
        active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
      }`}>
      {children}
    </button>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm border-b-2 -mb-px ${
        active ? 'border-blue-600 text-blue-700 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}>
      {children}
    </button>
  );
}

function pctTone(pct: number | null): string {
  if (pct === null) return 'text-gray-300';
  if (pct >= 99) return 'text-green-700';
  if (pct >= 95) return 'text-amber-600';
  return 'text-red-600';
}

function applyPatch(site: FleetSite, patch: SitePatch, customer: MonitorCustomerRef | null): FleetSite {
  const next: FleetSite = { ...site };
  if (patch.monitored !== undefined) next.monitored = patch.monitored;
  if (patch.alwaysOpen !== undefined) next.alwaysOpen = patch.alwaysOpen;
  if (patch.customerId !== undefined) {
    next.customer = customer;
    next.customerSource = customer ? 'MANUAL' : null;
  }
  return next;
}
