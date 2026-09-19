/**
 * Event Report v2 — Vion data source endpoints.
 *
 * Every route here is dark on the server unless EVENT_V2_ENABLED=true, in which case it
 * answers 404. Callers treat a 404 as "feature off" and hide the UI rather than erroring.
 */
import { api } from './client';

export type VionServer = 'MALL' | 'RETAIL';
export type EventDataSource = 'UPLOAD' | 'VION';
export type EventFetchStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
export type EventFetchTrigger = 'MANUAL' | 'SCHEDULE';

export interface VionProbeResult {
  plazaName: string;
  deviceCount: number;
  /** names that can appear in the rawdata Location column */
  gates: string[];
  zones: string[];
  /** oldest day inside the retention window that still has rows */
  firstSeen: string | null;
  retentionProbedDays: number;
  retentionFloor: string;
  retentionDays: number;
}

export interface EventFetchRun {
  id: string;
  eventId: string;
  date: string;
  status: EventFetchStatus;
  triggeredBy: EventFetchTrigger;
  force: boolean;
  rows: number | null;
  fullDayRows: number | null;
  reportedTotal: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  attempt: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface FetchHistory {
  runs: EventFetchRun[];
  /** dates whose rawdata file came from the API — drives the API/Upload badge */
  apiDates: string[];
  retentionFloor: string;
  retentionDays: number;
}

export const VION_SERVERS: { value: VionServer; label: string; host: string }[] = [
  { value: 'MALL', label: 'Mall', host: 'mall.vion-cloud.com' },
  { value: 'RETAIL', label: 'Retail', host: 'retail.vionyun.com' },
];

export interface VionConfigInput {
  dataSource: EventDataSource;
  vionServer?: VionServer | null;
  vionPlazaId?: string | null;
  /** 5-field daily cron, "M H * * *" */
  fetchSchedule?: string | null;
  fetchTz?: string | null;
  autoGenerate?: boolean;
  autoSendRuleId?: string | null;
}

/** "23:30" → "30 23 * * *" */
export function cronFromTime(hhmm: string): string {
  const m = hhmm.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) throw new Error(`bad time ${hhmm}`);
  return `${Number(m[2])} ${Number(m[1])} * * *`;
}

/** "30 23 * * *" → "23:30", or null when it is not a plain daily cron */
export function timeFromCron(cron?: string | null): string | null {
  const m = (cron ?? '').match(/^([0-5]?\d) ([01]?\d|2[0-3]) \* \* \*$/);
  return m ? `${m[2].padStart(2, '0')}:${m[1].padStart(2, '0')}` : null;
}

/**
 * Next occurrence of a daily HH:MM in `tz`, as a local-readable string.
 * Only daily crons are produced by this UI, so no cron library is needed.
 */
export function nextRunLabel(cron?: string | null, tz = 'Asia/Bangkok'): string | null {
  const hhmm = timeFromCron(cron);
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const now = new Date();
  // what time is it right now at the site?
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const todayPassed = get('hour') * 60 + get('minute') >= h * 60 + m;
  const base = new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
  if (todayPassed) base.setUTCDate(base.getUTCDate() + 1);
  const day = base.toISOString().slice(0, 10);
  const label = todayPassed ? 'พรุ่งนี้' : 'วันนี้';
  return `${label} ${day} ${hhmm} (${tz})`;
}

export const vionApi = {
  saveConfig: (eventId: string, body: VionConfigInput) =>
    api.put<{ success: boolean; data: { event: unknown; backfillQueued: number } }>(
      `/events/${eventId}/vion/config`, body,
    ).then((r) => r.data.data),

  probe: (eventId: string) =>
    api.post<{ success: boolean; data: VionProbeResult }>(`/events/${eventId}/vion/probe`).then((r) => r.data.data),

  fetch: (eventId: string, body: { dates?: string[]; force?: boolean } = {}) =>
    api.post<{ success: boolean; data: EventFetchRun[] }>(`/events/${eventId}/vion/fetch`, body).then((r) => r.data.data),

  fetches: (eventId: string) =>
    api.get<{ success: boolean; data: FetchHistory }>(`/events/${eventId}/vion/fetches`).then((r) => r.data.data),
};

/** True when the server said "this feature does not exist here". */
export function isFeatureOff(err: unknown): boolean {
  return (err as { response?: { status?: number } })?.response?.status === 404;
}
