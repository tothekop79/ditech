import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { masterApi } from '../api/master';
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
  type MonitorSource,
  type SiteHealth,
  type SitePatch,
} from '../api/monitor';
import { useToast } from '../components/Toast';

/** /overview and /overview?all=1 are cached separately; invalidating the prefix refreshes both. */
const OVERVIEW_ROOT = ['monitor-overview'];
const overviewKey = (all: boolean) => [...OVERVIEW_ROOT, all];

export function FleetOverviewPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const showToast = useToast((s) => s.show);

  const [q, setQ] = useState('');
  const [health, setHealth] = useState<SiteHealth | undefined>();
  const [source, setSource] = useState<MonitorSource | undefined>();
  const [customerId, setCustomerId] = useState<string>('');
  const [showUnmonitored, setShowUnmonitored] = useState(false);

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
    mutationFn: ({ id, patch }: { id: string; patch: SitePatch }) => monitorApi.patchSite(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: activeKey });
      const prev = qc.getQueryData<FleetOverview>(activeKey);
      qc.setQueryData<FleetOverview>(activeKey, (old) =>
        old
          ? {
              ...old,
              sites: old.sites.map((s) => (s.id === id ? applyPatch(s, patch, customers) : s)),
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
      if (customerId && (customerId === '__none__' ? !!s.customer : s.customer?.id !== customerId)) return false;
      if (!needle) return true;
      return (
        s.plazaName.toLowerCase().includes(needle) ||
        (s.customer?.customerName ?? UNASSIGNED).toLowerCase().includes(needle) ||
        (s.vendorGroupName ?? '').toLowerCase().includes(needle)
      );
    });
  }, [sites, q, health, source, customerId]);

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; sites: FleetSite[] }>();
    for (const s of filtered) {
      const key = s.customer?.id ?? '__none__';
      if (!map.has(key)) map.set(key, { name: s.customer?.customerName ?? UNASSIGNED, sites: [] });
      map.get(key)!.sites.push(s);
    }
    return [...map.values()].sort((a, b) => {
      if (a.name === UNASSIGNED) return 1;
      if (b.name === UNASSIGNED) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [filtered]);

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
          <option value="__none__">{UNASSIGNED}</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.customerName}</option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-xs text-gray-600" title="โหลดจาก /overview?all=1 — รวม site ที่ปิดมอนิเตอร์ (demo / งานที่จบแล้ว)">
          <input type="checkbox" checked={showUnmonitored} onChange={(e) => setShowUnmonitored(e.target.checked)} />
          Show unmonitored · แสดงที่ปิดมอนิเตอร์
        </label>

        <span className="text-xs text-gray-500 ml-auto">{filtered.length} sites</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-400 text-sm">
          No sites match — ไม่พบสาขาตามเงื่อนไข
        </div>
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
                  key={g.name}
                  group={g}
                  customers={customers}
                  onOpen={(id) => navigate(`/monitor/sites/${id}`)}
                  onPatch={(id, patch) => patchSite.mutate({ id, patch })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Rows ───

function GroupRows({
  group,
  customers,
  onOpen,
  onPatch,
}: {
  group: { name: string; sites: FleetSite[] };
  customers: { id: string; customerName: string }[];
  onOpen: (id: string) => void;
  onPatch: (id: string, patch: SitePatch) => void;
}) {
  const devices = group.sites.reduce((a, s) => a + s.devices, 0);
  const offline = group.sites.reduce((a, s) => a + s.offline, 0);

  return (
    <>
      <tr className="bg-gray-50 border-b border-gray-200">
        <td colSpan={9} className="px-3 py-1.5 text-xs font-semibold text-gray-700">
          🏢 {group.name}
          <span className="ml-2 font-normal text-gray-400">
            {group.sites.length} sites · {devices} devices
            {offline > 0 && <span className="text-red-600"> · {offline} offline</span>}
          </span>
        </td>
      </tr>
      {group.sites.map((s) => {
        const { monitored, alwaysOpen } = s;
        return (
          <tr
            key={s.id}
            onClick={() => onOpen(s.id)}
            className={`border-b border-gray-100 cursor-pointer hover:bg-blue-50/50 ${monitored ? '' : 'opacity-50'}`}>
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
              <button
                onClick={() => onPatch(s.id, { alwaysOpen: !alwaysOpen })}
                title={alwaysOpen ? 'Always open 24h — เปิดตลอด' : 'Business hours — ตามเวลาทำการ'}
                className={alwaysOpen ? '' : 'opacity-40'}>
                {alwaysOpen ? '🕛' : '🕗'}
              </button>
            </td>
            <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
              <select
                value={s.customer?.id ?? ''}
                onChange={(e) => onPatch(s.id, { customerId: e.target.value || null })}
                className="text-xs px-1.5 py-1 border border-gray-300 rounded bg-white max-w-[180px]">
                <option value="">{UNASSIGNED}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.customerName}</option>
                ))}
              </select>
              {s.customerSource && <span className="ml-1 text-[10px] text-gray-400">{s.customerSource}</span>}
            </td>
            <td className="px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" checked={monitored} onChange={(e) => onPatch(s.id, { monitored: e.target.checked })} />
            </td>
          </tr>
        );
      })}
    </>
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

function applyPatch(site: FleetSite, patch: SitePatch, customers: { id: string; customerName: string }[]): FleetSite {
  const next: FleetSite = { ...site };
  if (patch.monitored !== undefined) next.monitored = patch.monitored;
  if (patch.alwaysOpen !== undefined) next.alwaysOpen = patch.alwaysOpen;
  if (patch.customerId !== undefined) {
    const c = patch.customerId ? customers.find((x) => x.id === patch.customerId) : undefined;
    next.customer = c ? { id: c.id, customerName: c.customerName } : null;
    next.customerSource = c ? 'MANUAL' : null;
  }
  return next;
}
