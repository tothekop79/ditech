import { api } from './client';

// ── Types ──
export interface DashboardFilter {
  from?: string;        // 'YYYY-MM-DD'
  to?: string;          // 'YYYY-MM-DD'
  region?: 'BANGKOK' | 'UPC';
  customerId?: string;
}

export interface DashboardData {
  filter: { from: string; to: string; region: string | null; customerId: string | null };
  stats: {
    total: number;
    draft: number;
    confirmed: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    completionRate: number;
    totalSensors: number;
    upcomingThisWeek: number;
    upcomingThisMonth: number;
    unassignedCount: number;
  };
  statusBreakdown: Array<{ status: string; count: number }>;
  regionBreakdown: Array<{ region: string; count: number }>;
  teamWorkload: Array<{
    teamId: string; teamName: string; region: string;
    total: number; completed: number; inProgress: number; sensors: number;
  }>;
  customerBreakdown: Array<{
    customerId: string; customerCode: string; customerName: string;
    total: number; completed: number; sensors: number;
  }>;
  upcoming: Array<{
    id: string;
    scheduledDate: string | null;
    storeName: string;
    branchName: string | null;
    province: string | null;
    storeRegion: string;
    sensorCount: number;
    planStatus: string;
    readiness: string;
    customer: { customerCode: string; customerName: string };
    team: { name: string } | null;
  }>;
}

export const reportsApi = {
  // NEW: dashboard endpoint
  dashboard: (filter: DashboardFilter = {}) =>
    api.get<{ success: boolean; data: DashboardData }>('/reports/dashboard', { params: filter })
      .then((r) => r.data.data),

  // ── Existing methods (kept for backward compat) ──
  weekly: (weekStart: string) =>
    api.get<{ data: any }>('/reports/weekly', { params: { weekStart } }).then((r) => r.data.data),
  monthly: (year: number, month: number) =>
    api.get<{ data: any }>('/reports/monthly', { params: { year, month } }).then((r) => r.data.data),
  exportUrl: (params: { format: 'xlsx' | 'pdf'; period: 'weekly' | 'monthly'; weekStart?: string; year?: number; month?: number }) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
    return `/api/reports/export?${q.toString()}`;
  },
  download: async (params: any, filename: string) => {
    const token = localStorage.getItem('ditech_token');
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v as any)));
    const res = await fetch(`/api/reports/export?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  },
};
