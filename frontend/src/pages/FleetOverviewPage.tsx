import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { masterApi } from '../api/master';
import type { Customer } from '../api/types';
import {
  monitorApi,
  HEALTHS,
  HEALTH_COLOR,
  HEALTH_LABEL,
  SOURCE_COLOR,
  UNASSIGNED,
  contractChip,
  fmtDate,
  fmtDateTime,
  relativeTime,
  type ContractInput,
  type ContractState,
  type FleetOverview,
  type FleetSite,
  type MonitorCustomerRef,
  type MonitorSource,
  type SiteHealth,
  type SitePatch,
} from '../api/monitor';
import { useToast } from '../components/Toast';
import { FleetDevicePanel, type DevicePanelSpec } from '../components/monitor/FleetDevicePanel';
import { CancelSiteModal, ContractModal } from '../components/monitor/ContractModals';

/** /overview and /overview?all=1 are cached separately; invalidating the prefix refreshes both. */
const OVERVIEW_ROOT = ['monitor-overview'];
const overviewKey = (all: boolean, source?: MonitorSource) => [...OVERVIEW_ROOT, all, source ?? 'ALL'];

/** primary scope — the backend applies it to every number it returns, so nothing is recounted here */
const SOURCE_TABS: { value?: MonitorSource; label: string; short: string }[] = [
  { value: undefined, label: 'ทั้งหมด · All', short: 'ทั้งหมด · All' },
  { value: 'MALL', label: '🏬 Mall (King Power / Robinson)', short: 'Mall' },
  { value: 'RETAIL', label: '🛍 Retail', short: 'Retail' },
];

/** collapse state is a UI preference — keyed by customer id, or NO_CUSTOMER for the unassigned group */
const COLLAPSED_KEY = 'ditech_monitor_collapsed';
const NO_CUSTOMER = '__none__';
const NEW_CUSTOMER = '__new__';

/** One slide-over per device KPI tile. Keys double as the device query key. */
const DEVICE_PANELS: Record<string, DevicePanelSpec> = {
  all: { key: 'all', title: 'All devices · อุปกรณ์ทั้งหมด', params: {} },
  online: { key: 'online', title: 'Online · ออนไลน์', params: { status: '1' } },
  offlineInHours: {
    key: 'offlineInHours',
    title: 'Offline in business hours · ดับในเวลาทำการ',
    params: { status: '0,-1', inHours: 1 },
  },
  offlineExpected: {
    key: 'offlineExpected',
    title: 'Offline — closed / expected · ดับนอกเวลาทำการ',
    // the API has no "not in hours" flag, so fetch every offline device and cut it here
    params: { status: '0,-1' },
    filter: (d) => d.hoursState !== 'OPEN',
  },
  offlineOver24h: { key: 'offlineOver24h', title: 'Offline > 24h · ดับเกิน 24 ชม.', params: { status: '0', minOfflineHours: 24 } },
  missing: { key: 'missing', title: 'Missing · หายจากระบบ', params: { status: '-1' } },
  disabled: { key: 'disabled', title: 'Disabled · ปิดใช้งาน', params: { status: '3' } },
  wentOfflineToday: { key: 'wentOfflineToday', title: 'Went offline today · ดับวันนี้', params: { status: '0', since: 'today' } },
  recoveredToday: { key: 'recoveredToday', title: 'Recovered today · กลับมาวันนี้', params: { status: '1', since: 'today' } },
};

/** contract filter — CANCELLED is not a contract state, it's the cancelledAt flag */
type ContractFilter = '' | 'EXPIRING' | 'EXPIRED' | 'NONE' | 'CANCELLED';
const CONTRACT_FILTERS: { value: ContractFilter; label: string }[] = [
  { value: '', label: 'All contracts' },
  { value: 'EXPIRING', label: 'Expiring · ใกล้หมด' },
  { value: 'EXPIRED', label: 'Expired · หมดแล้ว' },
  { value: 'NONE', label: 'No contract · ไม่ระบุ' },
  { value: 'CANCELLED', label: 'Cancelled · ยกเลิก' },
];

/** EXPIRED first, then EXPIRING soonest-first; everything else keeps the API's name order */
const CONTRACT_SORT: Record<ContractState, number> = { EXPIRED: 0, EXPIRING: 1, ACTIVE: 2, NONE: 2 };

/** worst-first — EMPTY (no cameras registered) ranks above OK, below a real outage */
const HEALTH_RANK: Record<SiteHealth, number> = { DOWN: 4, DEGRADED: 3, EMPTY: 2, OK: 1 };

interface CustomerGroup {
  key: string;
  name: string;
  sites: FleetSite[];
  devices: number;
  online: number;
  offline: number;
  offlineInHours: number;
  offlineOver24h: number;
  openAlerts: number;
  expiring: number;
  expired: number;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const sourceParam = searchParams.get('source');
  const source: MonitorSource | undefined = sourceParam === 'MALL' || sourceParam === 'RETAIL' ? sourceParam : undefined;
  const setSource = (next?: MonitorSource) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next) p.set('source', next);
        else p.delete('source');
        return p;
      },
      { replace: true },
    );
  const [customerId, setCustomerId] = useState<string>('');
  const [showUnmonitored, setShowUnmonitored] = useState(false);
  const [view, setView] = useState<'sites' | 'customers'>('sites');
  /** page-local, never persisted — guards the inline controls against stray clicks */
  const [editMode, setEditMode] = useState(false);
  /** explicit user choices only; groups with no entry fall back to "expanded when something is offline" */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);
  const [newCustomerFor, setNewCustomerFor] = useState<FleetSite | null>(null);
  const [contract, setContract] = useState<ContractFilter>('');
  const [panel, setPanel] = useState<DevicePanelSpec | null>(null);
  const [contractFor, setContractFor] = useState<ContractTarget | null>(null);
  const [cancelFor, setCancelFor] = useState<FleetSite | null>(null);
  const sitesRef = useRef<HTMLDivElement>(null);

  /** every tile's device list is scoped to the same server as the tile's number */
  const openPanel = (spec: DevicePanelSpec) =>
    setPanel(
      source
        ? { ...spec, key: `${spec.key}:${source}`, params: { ...spec.params, source } }
        : spec,
    );

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed));
    } catch {
      /* private mode / quota — collapse state just won't stick */
    }
  }, [collapsed]);

  const activeKey = overviewKey(showUnmonitored, source);

  const { data: overview, isLoading, dataUpdatedAt } = useQuery({
    queryKey: activeKey,
    queryFn: () => monitorApi.overview(showUnmonitored, source),
    refetchInterval: 60_000,
    // keep the current table on screen while the other list (all vs monitored-only) loads
    placeholderData: (prev: FleetOverview | undefined) => prev,
  });

  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: masterApi.customers });

  // per-customer alert counts — one fetch, counted client-side via siteId
  const { data: openAlertRows = [] } = useQuery({
    queryKey: ['monitor-alerts', { state: 'OPEN', limit: 1000 }],
    queryFn: () => monitorApi.alerts({ state: 'OPEN', limit: 1000 }),
    enabled: view === 'customers',
    refetchInterval: 60_000,
  });

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

  const setContractMut = useMutation({
    mutationFn: ({ siteIds, body }: { siteIds: string[]; body: ContractInput }) => monitorApi.setContract(siteIds, body),
    onSuccess: (r) => {
      showToast(`Contract saved · ${r.updated} site${r.updated === 1 ? '' : 's'}`);
      setContractFor(null);
      qc.invalidateQueries({ queryKey: OVERVIEW_ROOT });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to save contract'),
  });

  const cancelSite = useMutation({
    mutationFn: ({ site, note }: { site: FleetSite; note?: string }) => monitorApi.cancelSite(site.id, note),
    onSuccess: (_row, vars) => {
      setCancelFor(null);
      qc.invalidateQueries({ queryKey: OVERVIEW_ROOT });
      // undo only restores monitoring — cancelledAt stays as history, as the backend intends
      showToast(`ยกเลิก “${vars.site.plazaName}” แล้ว`, {
        label: 'Undo',
        run: () => patchSite.mutate({ id: vars.site.id, patch: { monitored: true } }),
      });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to cancel site'),
  });

  const runPoll = useMutation({
    mutationFn: () => monitorApi.runPoll(),
    onSuccess: (r) => {
      showToast(`Poll done · ${r.sites} sites / ${r.devices} devices · +${r.opened} alerts · -${r.resolved} · ${r.errors} errors`);
      qc.invalidateQueries({ queryKey: OVERVIEW_ROOT });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Poll failed'),
  });

  const exportXlsx = useMutation({
    mutationFn: () => monitorApi.downloadExport({ source, all: showUnmonitored }),
    onSuccess: (name) => showToast(`Downloaded ${name}`),
    onError: (e: any) => showToast(e?.message || 'Export failed'),
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
      if (contract === 'CANCELLED' ? !s.cancelledAt : contract && s.contractState !== contract) return false;
      if (customerId && (customerId === NO_CUSTOMER ? !!s.customer : s.customer?.id !== customerId)) return false;
      if (!needle) return true;
      return (
        s.plazaName.toLowerCase().includes(needle) ||
        (s.customer?.customerName ?? UNASSIGNED).toLowerCase().includes(needle) ||
        (s.vendorGroupName ?? '').toLowerCase().includes(needle)
      );
    });
  }, [sites, q, health, customerId, contract]);

  const alertsBySite = useMemo(() => {
    const m = new Map<string, number>();
    // GET /alerts has no source filter — scope it here so the column matches the selected server
    for (const a of openAlertRows) {
      if (source && a.site.source !== source) continue;
      m.set(a.siteId, (m.get(a.siteId) ?? 0) + 1);
    }
    return m;
  }, [openAlertRows, source]);

  /** one grouping feeds both views — everything below comes from the overview payload */
  const groups = useMemo<CustomerGroup[]>(() => {
    const map = new Map<string, CustomerGroup>();
    for (const s of filtered) {
      const key = s.customer?.id ?? NO_CUSTOMER;
      let g = map.get(key);
      if (!g) {
        g = {
          key, name: s.customer?.customerName ?? UNASSIGNED, sites: [],
          devices: 0, online: 0, offline: 0, offlineInHours: 0, offlineOver24h: 0, openAlerts: 0,
          expiring: 0, expired: 0, worst: 'OK',
        };
        map.set(key, g);
      }
      g.sites.push(s);
      g.devices += s.devices;
      g.online += s.online;
      g.offline += s.offline;
      g.offlineInHours += s.offlineInHours;
      g.offlineOver24h += s.offlineOver24h;
      g.openAlerts += alertsBySite.get(s.id) ?? 0;
      if (s.contractState === 'EXPIRING') g.expiring++;
      if (s.contractState === 'EXPIRED') g.expired++;
      if (HEALTH_RANK[s.health] > HEALTH_RANK[g.worst]) g.worst = s.health;
    }
    // contract trouble floats to the top of every group
    for (const g of map.values()) {
      g.sites.sort((a, b) => {
        const r = CONTRACT_SORT[a.contractState] - CONTRACT_SORT[b.contractState];
        if (r) return r;
        if (CONTRACT_SORT[a.contractState] < 2) return (a.contractDaysLeft ?? 0) - (b.contractDaysLeft ?? 0);
        return a.plazaName.localeCompare(b.plazaName);
      });
    }
    return [...map.values()].sort((a, b) => {
      if (a.name === UNASSIGNED) return 1;
      if (b.name === UNASSIGNED) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [filtered, alertsBySite]);

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

  /** site tiles filter the table below instead of opening a panel */
  const focusSites = (next: { health?: SiteHealth; unassigned?: boolean; contract?: ContractFilter }) => {
    setView('sites');
    setHealth(next.health);
    setContract(next.contract ?? '');
    setCustomerId(next.unassigned ? NO_CUSTOMER : '');
    setAllCollapsed(false);
    setTimeout(() => sitesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const openCustomerInSites = (g: CustomerGroup) => {
    setCustomerId(g.key);
    setCollapsed((c) => ({ ...c, [g.key]: false }));
    setView('sites');
  };

  const d = overview?.devices;
  const k = overview?.kpi;
  const sourceTab = SOURCE_TABS.find((t) => t.value === source) ?? SOURCE_TABS[0];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">📷 Camera Monitor</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            สถานะกล้องทุกสาขา — ดึงจากเซิร์ฟเวอร์ผู้ผลิตทุก 5 นาที · หน้านี้รีเฟรชเองทุก 60 วินาที
          </p>
          <p className="text-xs text-gray-600 mt-0.5">
            แสดง: <span className="font-medium">{sourceTab.short}</span> · {sites.length} sites · {d?.total ?? 0} devices
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
          <button
            onClick={() => exportXlsx.mutate()}
            disabled={exportXlsx.isPending}
            title="ไฟล์ Excel ตามขอบเขตที่เลือกอยู่ — ใช้เวลาสักครู่"
            className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1.5">
            {exportXlsx.isPending ? (
              <>
                <span className="w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                Exporting…
              </>
            ) : (
              '📥 Export Excel'
            )}
          </button>
        </div>
      </div>

      {/* Primary scope — one vendor server at a time. Kept in the URL so links keep the view. */}
      <div className="inline-flex rounded-lg border border-gray-300 bg-white overflow-hidden">
        {SOURCE_TABS.map((t) => (
          <button
            key={t.label}
            onClick={() => setSource(t.value)}
            className={`px-4 py-2 text-sm border-r border-gray-200 last:border-r-0 ${
              source === t.value ? 'bg-blue-600 text-white font-medium' : 'text-gray-600 hover:bg-gray-50'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {editMode && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 rounded px-3 py-1.5 text-xs">
          ✏️ Edit mode on · แก้ไขอยู่ — เปลี่ยนลูกค้า / เปิด-ปิดมอนิเตอร์ / 24h ได้ทันที กด “Done” เมื่อเสร็จ
        </div>
      )}

      {/* KPI row 1 — devices. Every tile opens the matching device list. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2">
        <Kpi label="Devices · ทั้งหมด" value={d?.total ?? 0} onClick={() => openPanel(DEVICE_PANELS.all)} />
        <Kpi label="Online · ออนไลน์" value={d?.online ?? 0} tone="text-green-600" onClick={() => openPanel(DEVICE_PANELS.online)} />
        <Kpi
          label="Offline in hours · ดับในเวลาทำการ"
          value={k?.offlineInHours ?? 0}
          tone="text-red-600"
          hint="กล้องที่ดับอยู่ในเวลาทำการ — ต้องตามทันที"
          onClick={() => openPanel(DEVICE_PANELS.offlineInHours)}
        />
        <Kpi
          label="Offline closed · ดับนอกเวลา"
          value={k?.offlineExpected ?? 0}
          tone="text-gray-500"
          hint="ดับนอกเวลาทำการ — ปกติ ไม่ต้องตาม"
          onClick={() => openPanel(DEVICE_PANELS.offlineExpected)}
        />
        <Kpi
          label="Offline > 24h · ดับเกิน 24 ชม."
          value={k?.offlineOver24h ?? 0}
          tone="text-amber-600"
          onClick={() => openPanel(DEVICE_PANELS.offlineOver24h)}
        />
        <Kpi label="Missing · หาย" value={d?.missing ?? 0} tone="text-purple-600" onClick={() => openPanel(DEVICE_PANELS.missing)} />
        <Kpi label="Disabled · ปิดใช้" value={d?.disabled ?? 0} tone="text-gray-500" onClick={() => openPanel(DEVICE_PANELS.disabled)} />
      </div>

      {/* KPI row 2 — fleet. Site tiles filter the table below; churn tiles open a device list. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-5 gap-2">
        <Kpi label="Sites OK · ปกติ" value={k?.sitesOk ?? 0} tone="text-green-600" onClick={() => focusSites({ health: 'OK' })} />
        <Kpi label="Sites degraded · บางส่วน" value={k?.sitesDegraded ?? 0} tone="text-amber-600" onClick={() => focusSites({ health: 'DEGRADED' })} />
        <Kpi label="Sites down · ดับทั้งสาขา" value={k?.sitesDown ?? 0} tone="text-red-600" onClick={() => focusSites({ health: 'DOWN' })} />
        <Kpi label="Went offline today · ดับวันนี้" value={k?.wentOfflineToday ?? 0} tone="text-red-600" onClick={() => openPanel(DEVICE_PANELS.wentOfflineToday)} />
        <Kpi label="Recovered today · กลับมาวันนี้" value={k?.recoveredToday ?? 0} tone="text-green-600" onClick={() => openPanel(DEVICE_PANELS.recoveredToday)} />
        <Kpi label="Open alerts · แจ้งเตือน" value={overview?.openAlerts ?? 0} tone="text-amber-600" onClick={() => navigate('/monitor/alerts')} />
        <Kpi label="Unassigned sites · ยังไม่ผูกลูกค้า" value={k?.unassignedSites ?? 0} onClick={() => focusSites({ unassigned: true })} />
        <div className="col-span-2 xl:col-span-2 bg-white border border-gray-200 rounded-lg p-1.5">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 px-1 pb-1">สัญญา · Contract</div>
          <div className="grid grid-cols-3 gap-1.5">
            <Kpi flat label="Expired · หมด" value={k?.contractExpired ?? 0} tone="text-red-600" onClick={() => focusSites({ contract: 'EXPIRED' })} />
            <Kpi flat label="≤30d · ใกล้หมด" value={k?.contractExpiring ?? 0} tone="text-amber-600" onClick={() => focusSites({ contract: 'EXPIRING' })} />
            <Kpi flat label="No contract · ไม่ระบุ" value={k?.contractNone ?? 0} tone="text-gray-500" onClick={() => focusSites({ contract: 'NONE' })} />
          </div>
        </div>
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
          {CONTRACT_FILTERS.map((c) => (
            <FilterBtn
              key={c.value}
              active={contract === c.value}
              onClick={() => {
                const next = contract === c.value ? '' : c.value;
                setContract(next);
                // cancelled sites are monitored=false, so they need the ?all=1 list to be visible at all
                if (next === 'CANCELLED') setShowUnmonitored(true);
              }}>
              {c.label}
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

      </div>

      {/* View switch — tabs left, list controls right */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 flex-wrap">
        <div className="flex gap-1">
          <TabBtn active={view === 'sites'} onClick={() => setView('sites')}>📍 Sites</TabBtn>
          <TabBtn active={view === 'customers'} onClick={() => setView('customers')}>🏢 By customer / รายลูกค้า</TabBtn>
        </div>

        <div className="flex items-center gap-3 pb-1.5 text-xs text-gray-500">
          <span>{groups.length} customers · {filtered.length} sites</span>

          <label className="flex items-center gap-1.5 text-gray-600" title="โหลดจาก /overview?all=1 — รวม site ที่ปิดมอนิเตอร์ (demo / งานที่จบแล้ว)">
            <input type="checkbox" checked={showUnmonitored} onChange={(e) => setShowUnmonitored(e.target.checked)} />
            Show unmonitored · แสดงที่ปิดมอนิเตอร์
          </label>

          {view === 'sites' && (
            <span className="flex gap-2">
              <button onClick={() => setAllCollapsed(false)} className="text-blue-600 hover:underline">Expand all</button>
              <button onClick={() => setAllCollapsed(true)} className="text-blue-600 hover:underline">Collapse all</button>
            </span>
          )}
        </div>
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
        <div ref={sitesRef} className="bg-white border border-gray-200 rounded-lg overflow-x-auto scroll-mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
                <th className="px-3 py-2 font-medium">Site · สาขา</th>
                <th className="px-2 py-2 font-medium text-right">Devices</th>
                <th className="px-2 py-2 font-medium text-right">Online</th>
                <th className="px-2 py-2 font-medium text-right">Offline</th>
                <th className="px-2 py-2 font-medium">Health</th>
                <th className="px-2 py-2 font-medium">Vendor group</th>
                <th className="px-2 py-2 font-medium">สัญญาเริ่ม</th>
                <th className="px-2 py-2 font-medium">สิ้นสุด</th>
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
                  showSource={!source}
                  onNewCustomer={(site) => setNewCustomerFor(site)}
                  onContract={(target) => setContractFor(target)}
                  onCancel={(site) => setCancelFor(site)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {panel && <FleetDevicePanel spec={panel} onClose={() => setPanel(null)} />}

      {contractFor && (
        <ContractModal
          title={contractFor.title}
          subtitle={contractFor.subtitle}
          contractStart={contractFor.contractStart}
          contractEnd={contractFor.contractEnd}
          contractNote={contractFor.contractNote}
          renew={contractFor.renew}
          submitting={setContractMut.isPending}
          onClose={() => setContractFor(null)}
          onSubmit={(body) => setContractMut.mutate({ siteIds: contractFor.siteIds, body })}
        />
      )}

      {cancelFor && (
        <CancelSiteModal
          siteName={cancelFor.plazaName}
          submitting={cancelSite.isPending}
          onClose={() => setCancelFor(null)}
          onConfirm={(note) => cancelSite.mutate({ site: cancelFor, note })}
        />
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

/** What the contract modal is about to write — one site, or every site of a customer. */
interface ContractTarget {
  siteIds: string[];
  title: string;
  subtitle?: string;
  contractStart?: string | null;
  contractEnd?: string | null;
  contractNote?: string | null;
  renew?: boolean;
}

function RowMenu({ items }: { items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        title="More actions · การจัดการ"
        className="px-1 text-gray-400 hover:text-gray-700">
        …
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl w-52 py-1 z-20 text-left">
          {items.map((it) => (
            <button
              key={it.label}
              onClick={() => { setOpen(false); it.onClick(); }}
              className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${it.danger ? 'text-red-600' : 'text-gray-700'}`}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function GroupRows({
  group,
  collapsed,
  editMode,
  customers,
  showSource,
  onToggle,
  onOpen,
  onPatch,
  onNewCustomer,
  onContract,
  onCancel,
}: {
  group: CustomerGroup;
  collapsed: boolean;
  editMode: boolean;
  customers: Customer[];
  /** the badge is redundant once the page is scoped to one server */
  showSource: boolean;
  onToggle: () => void;
  onOpen: (id: string) => void;
  onPatch: (id: string, patch: SitePatch, customer?: MonitorCustomerRef | null) => void;
  onNewCustomer: (site: FleetSite) => void;
  onContract: (target: ContractTarget) => void;
  onCancel: (site: FleetSite) => void;
}) {
  return (
    <>
      <tr className="bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100" onClick={onToggle}>
        <td colSpan={11} className="px-3 py-1.5 text-xs font-semibold text-gray-700">
          <span className="inline-block w-3 text-gray-400">{collapsed ? '▸' : '▾'}</span>
          🏢 {group.name}
          {group.expired > 0 && <span className="ml-1 text-red-600" title={`${group.expired} สาขาสัญญาหมดแล้ว`}>●</span>}
          <span className="ml-2 font-normal text-gray-400">
            {group.sites.length} sites · {group.devices} devices
            {group.offline > 0 ? <span className="text-red-600"> · {group.offline} offline</span> : ' · 0 offline'}
            {group.expired > 0 && <span className="text-red-600"> · {group.expired} หมดสัญญา</span>}
            {group.expiring > 0 && <span className="text-amber-600"> · {group.expiring} ใกล้หมด</span>}
          </span>
          {editMode && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onContract({
                  siteIds: group.sites.map((x) => x.id),
                  title: 'ตั้งค่าสัญญาทั้งลูกค้า · Set contract for all sites',
                  // applies to the sites currently listed for this customer — filters narrow it
                  subtitle: `${group.name} — ${group.sites.length} สาขาที่แสดงอยู่ (ทับค่าเดิมทั้งหมด)`,
                });
              }}
              className="ml-2 text-[11px] px-1.5 py-0.5 rounded border border-gray-300 text-gray-600 hover:bg-white font-normal">
              📄 ตั้งค่าสัญญาทั้งลูกค้า
            </button>
          )}
        </td>
      </tr>
      {!collapsed &&
        group.sites.map((s) => (
          <tr
            key={s.id}
            onClick={() => onOpen(s.id)}
            className={`border-b border-gray-100 cursor-pointer hover:bg-blue-50/50 ${s.monitored ? '' : 'opacity-50'}`}>
            <td className="px-3 py-1.5">
              {showSource && (
                <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border mr-1.5 ${SOURCE_COLOR[s.source]}`}>
                  {s.source}
                </span>
              )}
              <span className={s.cancelledAt ? 'text-gray-500 line-through' : 'text-gray-900'}>{s.plazaName}</span>
              {s.cancelledAt && (
                <span
                  className="ml-1.5 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border bg-gray-100 text-gray-500 border-gray-300"
                  title={`ยกเลิกเมื่อ ${fmtDate(s.cancelledAt)}`}>
                  ยกเลิกแล้ว
                </span>
              )}
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
            <td className="px-2 py-1.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(s.contractStart)}</td>
            <td className="px-2 py-1.5 text-xs text-gray-500 whitespace-nowrap" title={s.contractNote || undefined}>
              {fmtDate(s.contractEnd)}
              <ContractChip state={s.contractState} daysLeft={s.contractDaysLeft} />
            </td>
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
              {editMode && (
                <RowMenu
                  items={[
                    {
                      label: '📄 ตั้งค่าสัญญา / Set contract',
                      onClick: () =>
                        onContract({
                          siteIds: [s.id],
                          title: 'ตั้งค่าสัญญา · Set contract',
                          subtitle: s.plazaName,
                          contractStart: s.contractStart,
                          contractEnd: s.contractEnd,
                          contractNote: s.contractNote,
                        }),
                    },
                    {
                      label: '🔁 ต่อสัญญา / Renew',
                      onClick: () =>
                        onContract({
                          siteIds: [s.id],
                          title: 'ต่อสัญญา · Renew contract',
                          subtitle: `${s.plazaName} — เดิมสิ้นสุด ${fmtDate(s.contractEnd)}`,
                          contractStart: s.contractStart,
                          contractEnd: s.contractEnd,
                          contractNote: s.contractNote,
                          renew: true,
                        }),
                    },
                    { label: '🚫 ยกเลิกสาขา / Cancel site', onClick: () => onCancel(s), danger: true },
                  ]}
                />
              )}
            </td>
          </tr>
        ))}
    </>
  );
}

function ContractChip({ state, daysLeft }: { state: ContractState; daysLeft: number | null }) {
  const chip = contractChip(state, daysLeft);
  return (
    <span className={`ml-1.5 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${chip.color}`}>
      {chip.text}
    </span>
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
            <th className="px-2 py-2 font-medium text-right">In hours · ในเวลา</th>
            <th className="px-2 py-2 font-medium text-right">&gt; 24h</th>
            <th className="px-2 py-2 font-medium text-right">Online %</th>
            <th className="px-2 py-2 font-medium text-right">Alerts</th>
            <th className="px-2 py-2 font-medium text-right">Expiring</th>
            <th className="px-2 py-2 font-medium text-right">Expired</th>
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
                <td className="px-3 py-1.5 text-gray-900">
                  🏢 {g.name}
                  {g.expired > 0 && <span className="ml-1 text-red-600" title={`${g.expired} สาขาสัญญาหมดแล้ว`}>●</span>}
                </td>
                <td className="px-2 py-1.5 text-right text-gray-600">{g.sites.length}</td>
                <td className="px-2 py-1.5 text-right text-gray-600">{g.devices}</td>
                <td className="px-2 py-1.5 text-right text-green-700">{g.online}</td>
                <td className={`px-2 py-1.5 text-right ${g.offline > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>{g.offline}</td>
                <td className={`px-2 py-1.5 text-right ${g.offlineInHours > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                  {g.offlineInHours}
                </td>
                <td className={`px-2 py-1.5 text-right ${g.offlineOver24h > 0 ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                  {g.offlineOver24h}
                </td>
                <td className={`px-2 py-1.5 text-right font-mono text-xs ${pctTone(pct)}`}>
                  {pct === null ? '—' : `${pct.toFixed(1)}%`}
                </td>
                <td className={`px-2 py-1.5 text-right ${g.openAlerts > 0 ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                  {g.openAlerts}
                </td>
                <td className={`px-2 py-1.5 text-right ${g.expiring > 0 ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                  {g.expiring}
                </td>
                <td className={`px-2 py-1.5 text-right ${g.expired > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                  {g.expired}
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

function Kpi({
  label,
  value,
  tone,
  hint,
  flat,
  onClick,
}: {
  label: string;
  value: number;
  tone?: string;
  hint?: string;
  flat?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="text-[10px] uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`text-xl font-semibold mt-0.5 ${tone || 'text-gray-900'}`}>{value}</div>
    </>
  );
  const cls = flat ? 'bg-gray-50 rounded-md p-2 text-left' : 'bg-white border border-gray-200 rounded-lg p-2.5 text-left';
  const hover = flat ? 'hover:bg-blue-50' : 'hover:border-blue-300 hover:bg-blue-50/30';
  return onClick ? (
    <button onClick={onClick} title={hint} className={`${cls} w-full ${hover}`}>
      {body}
    </button>
  ) : (
    <div className={cls} title={hint}>{body}</div>
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
