import { api } from './client';

// ─── Types ──────────────────────────────────────────────────────────

export type EventStatus =
  | 'PLANNING'
  | 'IN_PROGRESS'
  | 'DATA_COLLECTED'
  | 'REPORT_READY'
  | 'COMPLETED'
  | 'CANCELLED';

export type EventProfile = 'SIMPLE' | 'STANDARD' | 'FULL';

export type EventReportStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type GateType = 'ENTRANCE' | 'PASSERBY';

export interface EventDay {
  id: string;
  eventId: string;
  dayNumber: number;
  date: string;
  label: string;
  color: string;
}

export interface EventGate {
  id: string;
  eventId: string;
  name: string;
  gateType: GateType;
  sortOrder: number;
}

export interface EventZone {
  id: string;
  eventId: string;
  name: string;
  abbrev?: string | null;
  sortOrder: number;
}

export interface EventActivity {
  id: string;
  eventId: string;
  date: string;
  startTime: string;
  endTime: string;
  name: string;
  zone?: string | null;
  description?: string | null;
}

export interface EventReport {
  id: string;
  eventId: string;
  status: EventReportStatus;
  profile: string;
  rawdataPath?: string | null;
  htmlPath?: string | null;
  xlsxPath?: string | null;
  htmlSize?: number | null;
  xlsxSize?: number | null;
  queuedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  triggeredBy?: { id: string; fullName: string } | null;
  createdAt: string;
}

export interface LinkedPlan {
  id: string;
  storeName: string;
  branchName?: string | null;
  planStatus: string;
  scheduledDate?: string | null;
}

export interface Event {
  id: string;
  name: string;
  organizer?: string | null;
  venue?: string | null;
  venueType: string;
  startDate: string;
  endDate: string;
  status: EventStatus;
  profile: EventProfile;
  description?: string | null;
  systemCredit: string;
  confidential: boolean;
  showPasserby: boolean;
  displayHoursStart: number;
  displayHoursEnd: number;
  dwellMinSec: number;
  dwellMaxSec: number;
  engagementThresholdSec: number;
  excludeStaff: boolean;
  sponsorZones?: string | null;
  customerId?: string | null;
  customer?: { id: string; customerCode: string; customerName: string } | null;
  days?: EventDay[];
  gates?: EventGate[];
  zones?: EventZone[];
  activities?: EventActivity[];
  plans?: LinkedPlan[];
  reports?: EventReport[];
  createdBy?: { id: string; fullName: string } | null;
  _count?: { plans: number; days: number; reports: number };
  createdAt: string;
  updatedAt: string;
}

// ─── Inputs ─────────────────────────────────────────────────────────

export interface EventCreateInput {
  name: string;
  organizer?: string;
  venue?: string;
  venueType?: string;
  startDate: string;
  endDate: string;
  profile?: EventProfile;
  description?: string;
  systemCredit?: string;
  confidential?: boolean;
  showPasserby?: boolean;
  customerId?: string | null;
  displayHoursStart?: number;
  displayHoursEnd?: number;
  dwellMinSec?: number;
  dwellMaxSec?: number;
  engagementThresholdSec?: number;
  excludeStaff?: boolean;
  sponsorZones?: string;
  days?: Array<{ dayNumber: number; date: string; label: string; color?: string }>;
  gates?: Array<{ name: string; gateType: GateType; sortOrder?: number }>;
  zones?: Array<{ name: string; abbrev?: string; sortOrder?: number }>;
  activities?: Array<{ date: string; startTime: string; endTime: string; name: string; zone?: string; description?: string }>;
}

// ─── Filters ────────────────────────────────────────────────────────

export interface EventFilters {
  status?: EventStatus;
  customerId?: string;
  q?: string;
  from?: string;
  to?: string;
}

// ─── API ────────────────────────────────────────────────────────────

export const eventsApi = {
  list: (filters?: EventFilters) =>
    api.get<{ success: boolean; data: Event[] }>('/events', { params: filters }).then((r) => r.data.data),

  get: (id: string) =>
    api.get<{ success: boolean; data: Event }>(`/events/${id}`).then((r) => r.data.data),

  create: (data: EventCreateInput) =>
    api.post<{ success: boolean; data: Event }>('/events', data).then((r) => r.data.data),

  update: (id: string, data: Partial<EventCreateInput>) =>
    api.patch<{ success: boolean; data: Event }>(`/events/${id}`, data).then((r) => r.data.data),

  setStatus: (id: string, status: EventStatus) =>
    api.patch<{ success: boolean; data: Event }>(`/events/${id}/status`, { status }).then((r) => r.data.data),

  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/events/${id}`).then((r) => r.data),

  // ── Sub-collections (replace-all) ──
  setDays: (id: string, days: EventCreateInput['days']) =>
    api.put<{ success: boolean }>(`/events/${id}/days`, { days }).then((r) => r.data),

  setGates: (id: string, gates: EventCreateInput['gates']) =>
    api.put<{ success: boolean }>(`/events/${id}/gates`, { gates }).then((r) => r.data),

  setZones: (id: string, zones: EventCreateInput['zones']) =>
    api.put<{ success: boolean }>(`/events/${id}/zones`, { zones }).then((r) => r.data),

  setActivities: (id: string, activities: EventCreateInput['activities']) =>
    api.put<{ success: boolean }>(`/events/${id}/activities`, { activities }).then((r) => r.data),

  // ── Plan linkage ──
  linkPlan: (eventId: string, planId: string) =>
    api.post<{ success: boolean }>(`/events/${eventId}/plans/${planId}`).then((r) => r.data),

  unlinkPlan: (planId: string) =>
    api.delete<{ success: boolean }>(`/events/plans/${planId}`).then((r) => r.data),

  // ── Rawdata + Reports ──
  uploadRawdata: (id: string, file: File, onProgress?: (pct: number) => void) => {
    const fd = new FormData();
    fd.append('file', file);
    return api
      .post<{ success: boolean; data: { filename: string; size: number; uploadedAt: string } }>(
        `/events/${id}/rawdata`,
        fd,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total));
          },
        },
      )
      .then((r) => r.data.data);
  },

  rawdataStatus: (id: string) =>
    api.get<{ success: boolean; data: { uploaded: boolean } }>(`/events/${id}/rawdata/status`).then((r) => r.data.data),

  generate: (id: string) =>
    api.post<{ success: boolean; data: EventReport }>(`/events/${id}/generate`).then((r) => r.data.data),

  reports: (id: string) =>
    api.get<{ success: boolean; data: EventReport[] }>(`/events/${id}/reports`).then((r) => r.data.data),

  report: (reportId: string) =>
    api.get<{ success: boolean; data: EventReport }>(`/events/reports/${reportId}`).then((r) => r.data.data),

  // URLs (browser opens with cookie auth)
  dashboardHtmlUrl: (id: string) => `/api/events/${id}/dashboard.html`,
  dashboardXlsxUrl: (id: string) => `/api/events/${id}/dashboard.xlsx`,
};

// ─── Helpers ────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<EventStatus, string> = {
  PLANNING: 'Planning',
  IN_PROGRESS: 'In Progress',
  DATA_COLLECTED: 'Data Collected',
  REPORT_READY: 'Report Ready',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const STATUS_COLOR: Record<EventStatus, string> = {
  PLANNING: 'bg-gray-100 text-gray-700 border-gray-300',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 border-blue-300',
  DATA_COLLECTED: 'bg-purple-100 text-purple-700 border-purple-300',
  REPORT_READY: 'bg-green-100 text-green-700 border-green-300',
  COMPLETED: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  CANCELLED: 'bg-red-100 text-red-700 border-red-300',
};

export const REPORT_STATUS_COLOR: Record<EventReportStatus, string> = {
  QUEUED: 'bg-gray-100 text-gray-700',
  RUNNING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-amber-100 text-amber-700',
};

export const PROFILE_DESC: Record<EventProfile, string> = {
  SIMPLE: 'ทางเข้าอย่างเดียว — ไม่มี zone/dwell/activity',
  STANDARD: 'ทางเข้า + Zone + Dwell — ไม่มีกิจกรรม',
  FULL: 'ครบทุกอย่าง — ทางเข้า + Zone + Dwell + Activities',
};
