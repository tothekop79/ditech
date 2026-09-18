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

export const vionApi = {
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
