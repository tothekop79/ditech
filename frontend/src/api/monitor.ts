import { api } from './client';

// ─── Types ──────────────────────────────────────────────────────────
// Derived from backend/src/services/deviceMonitor.service.ts (fleetOverview),
// backend/src/routes/monitor.routes.ts and the MonitoredSite / MonitoredDevice / Alert
// models in backend/prisma/schema.prisma. Dates arrive as ISO strings over JSON.

export type MonitorSource = 'MALL' | 'RETAIL';
export type SiteHealth = 'OK' | 'DEGRADED' | 'DOWN' | 'EMPTY';
export type CustomerSource = 'VENDOR' | 'MANUAL';

export type AlertState = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
export type AlertSeverity = 'INFO' | 'WARN' | 'CRIT';
export type AlertType =
  | 'OFFLINE'
  | 'DEVICE_MISSING'
  | 'SILENT'
  | 'STALE'
  | 'IMBALANCE'
  | 'ZERO'
  | 'SPIKE';

/** MonitoredDevice.currentStatus — the vendor's raw code. */
export const DEVICE_STATUS = { OFFLINE: 0, ONLINE: 1, DISABLED: 3, UNKNOWN: -1 } as const;

export interface MonitorCustomerRef {
  id: string;
  customerName: string;
}

/** Raw plazaInfo.businessHours entry — week 1 = Mon … 7 = Sun. */
export interface BusinessHour {
  week: number;
  startTime: string;
  endTime: string;
}

/** Raw vendor channelList entry stored on MonitoredDevice.channels. */
export interface DeviceChannel {
  serialnum: string;
  channelNo: string;
  deviceId?: number;
  gateId?: number;
  site?: { gateUnid: string; gateName: string; isMallGate: number } | null;
}

// ── GET /monitor/overview ──
export interface FleetSite {
  id: string;
  source: MonitorSource;
  plazaName: string;
  plazaUnid: string;
  customer: MonitorCustomerRef | null;
  customerSource: CustomerSource | null;
  vendorGroupName: string | null;
  vendorAccountName: string | null;
  accountAmbiguous: boolean;
  monitored: boolean;
  alwaysOpen: boolean;
  devices: number;
  online: number;
  offline: number;
  health: SiteHealth;
}

export interface FleetOverview {
  /** device counts cover monitored sites only, even when ?all=1 lists the unmonitored ones */
  devices: { total: number; online: number; offline: number; missing: number; disabled: number };
  openAlerts: number;
  /** max(MonitoredDevice.lastPolledAt) across the fleet */
  lastPolledAt: string | null;
  sites: FleetSite[];
}

// ── GET / PATCH /monitor/sites/:id ──
export interface MonitoredSiteRow {
  id: string;
  source: MonitorSource;
  plazaUnid: string;
  plazaName: string;
  plazaExternalId: string | null;
  timeZone: string;
  businessHours: BusinessHour[] | null;
  monitored: boolean;
  alwaysOpen: boolean;
  vendorGroupName: string | null;
  vendorAccountName: string | null;
  accountAmbiguous: boolean;
  customerSource: CustomerSource | null;
  customerId: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MonitoredDevice {
  id: string;
  siteId: string;
  serialnum: string;
  name: string | null;
  mac: string | null;
  localIp: string | null;
  channelCount: number;
  channels: DeviceChannel[] | null;
  /** 0 offline · 1 online · 3 disabled · -1 unknown/missing */
  currentStatus: number;
  vendorModifyTime: string | null;
  lastSeenOnline: string | null;
  lastPolledAt: string | null;
  statusSince: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MonitorAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  state: AlertState;
  siteId: string;
  deviceId: string | null;
  message: string;
  details: Record<string, unknown> | null;
  openedAt: string;
  acknowledgedAt: string | null;
  acknowledgedById: string | null;
  resolvedAt: string | null;
  notifiedAt: string | null;
}

/** GET /monitor/alerts also embeds the site + device it belongs to. */
export interface MonitorAlertRow extends MonitorAlert {
  site: { plazaName: string; source: MonitorSource; customer: { customerName: string } | null };
  device: { serialnum: string; name: string | null; localIp: string | null } | null;
}

export interface MonitoredSiteDetail extends MonitoredSiteRow {
  customer: MonitorCustomerRef | null;
  devices: MonitoredDevice[];
  /** OPEN + ACKNOWLEDGED only — resolved ones come from GET /monitor/alerts. */
  alerts: MonitorAlert[];
}

// ── Inputs / run results ──
export interface SitePatch {
  monitored?: boolean;
  /** null clears the link and re-opens the site to vendor auto-link on next sync. */
  customerId?: string | null;
  alwaysOpen?: boolean;
}

export interface SiteAssignment {
  siteId: string;
  customerId: string | null;
}

export interface AlertFilters {
  /** omitted = OPEN + ACKNOWLEDGED */
  state?: AlertState;
  type?: AlertType;
  siteId?: string;
  limit?: number;
}

export interface UptimeResult {
  days: number;
  uptimePct: number;
  transitions: number;
}

export interface PollResult {
  sites: number;
  devices: number;
  changed: number;
  opened: number;
  resolved: number;
  errors: number;
}

export interface SyncResultEntry {
  sites: number;
  accounts: number;
  autoLinked: number;
  ambiguous: number;
}

/** keyed by source ("MALL" | "RETAIL") */
export type SyncResult = Record<string, SyncResultEntry>;

export interface DigestResult {
  sent: boolean;
  open: number;
  fresh: number;
  recovered: number;
}

// ─── API ────────────────────────────────────────────────────────────

export const monitorApi = {
  /** all = true → ?all=1, which also lists unmonitored sites */
  overview: (all = false) =>
    api
      .get<{ success: boolean; data: FleetOverview }>('/monitor/overview', { params: all ? { all: 1 } : undefined })
      .then((r) => r.data.data),

  site: (id: string) =>
    api.get<{ success: boolean; data: MonitoredSiteDetail }>(`/monitor/sites/${id}`).then((r) => r.data.data),

  patchSite: (id: string, patch: SitePatch) =>
    api.patch<{ success: boolean; data: MonitoredSiteRow }>(`/monitor/sites/${id}`, patch).then((r) => r.data.data),

  assign: (assignments: SiteAssignment[]) =>
    api
      .post<{ success: boolean; data: { updated: number } }>('/monitor/sites/assign', { assignments })
      .then((r) => r.data.data),

  alerts: (params?: AlertFilters) =>
    api.get<{ success: boolean; data: MonitorAlertRow[] }>('/monitor/alerts', { params }).then((r) => r.data.data),

  ackAlert: (id: string) =>
    api.post<{ success: boolean; data: MonitorAlert }>(`/monitor/alerts/${id}/ack`).then((r) => r.data.data),

  uptime: (deviceId: string, days = 7) =>
    api
      .get<{ success: boolean; data: UptimeResult }>(`/monitor/devices/${deviceId}/uptime`, { params: { days } })
      .then((r) => r.data.data),

  runPoll: () =>
    api.post<{ success: boolean; data: PollResult }>('/monitor/run/poll').then((r) => r.data.data),

  runSync: () =>
    api.post<{ success: boolean; data: SyncResult }>('/monitor/run/sync').then((r) => r.data.data),

  runDigest: () =>
    api.post<{ success: boolean; data: DigestResult }>('/monitor/run/digest').then((r) => r.data.data),
};

// ─── Helpers ────────────────────────────────────────────────────────

export const HEALTH_LABEL: Record<SiteHealth, string> = {
  OK: 'OK',
  DEGRADED: 'Degraded',
  DOWN: 'Down',
  EMPTY: 'Empty',
};

export const HEALTH_COLOR: Record<SiteHealth, string> = {
  OK: 'bg-green-100 text-green-700 border-green-300',
  DEGRADED: 'bg-amber-100 text-amber-700 border-amber-300',
  DOWN: 'bg-red-100 text-red-700 border-red-300',
  EMPTY: 'bg-gray-100 text-gray-500 border-gray-300',
};

export const SOURCE_COLOR: Record<MonitorSource, string> = {
  MALL: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  RETAIL: 'bg-teal-50 text-teal-700 border-teal-200',
};

export const ALERT_STATE_COLOR: Record<AlertState, string> = {
  OPEN: 'bg-red-100 text-red-700 border-red-300',
  ACKNOWLEDGED: 'bg-amber-100 text-amber-700 border-amber-300',
  RESOLVED: 'bg-green-100 text-green-700 border-green-300',
};

export const ALERT_STATE_LABEL: Record<AlertState, string> = {
  OPEN: 'Open · ค้างอยู่',
  ACKNOWLEDGED: 'Acknowledged · รับทราบแล้ว',
  RESOLVED: 'Resolved · จบแล้ว',
};

export const ALERT_TYPES: AlertType[] = ['OFFLINE', 'DEVICE_MISSING', 'SILENT', 'STALE', 'IMBALANCE', 'ZERO', 'SPIKE'];

export const SOURCES: MonitorSource[] = ['MALL', 'RETAIL'];
export const HEALTHS: SiteHealth[] = ['OK', 'DEGRADED', 'DOWN', 'EMPTY'];

/** week 1 = Monday … 7 = Sunday (vendor convention, same as businessHoursState()). */
export const WEEK_LABEL: Record<number, string> = {
  1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun',
};

export function deviceStatusMeta(status: number): { label: string; color: string } {
  switch (status) {
    case DEVICE_STATUS.ONLINE:
      return { label: 'Online', color: 'bg-green-100 text-green-700 border-green-300' };
    case DEVICE_STATUS.OFFLINE:
      return { label: 'Offline', color: 'bg-red-100 text-red-700 border-red-300' };
    case DEVICE_STATUS.DISABLED:
      return { label: 'Disabled', color: 'bg-gray-100 text-gray-500 border-gray-300' };
    default:
      return { label: 'Missing', color: 'bg-purple-100 text-purple-700 border-purple-300' };
  }
}

/** "3h 20m ago" — compact, same tone as the other pages. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms)) return '—';
  const min = Math.floor(Math.abs(ms) / 60_000);
  const suffix = ms >= 0 ? ' ago' : ' from now';
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m${suffix}`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ${min % 60}m${suffix}`;
  return `${Math.floor(h / 24)}d${suffix}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const UNASSIGNED = '(unassigned)';
