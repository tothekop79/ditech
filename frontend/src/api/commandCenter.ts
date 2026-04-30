import { api } from './client';

export interface CCSnapshot {
  generatedAt: string;
  kpi: {
    totalPlans: number;
    todayCount: number;
    weekAheadCount: number;
    completedThisMonth: number;
    readyCount: number;
    notReadyCount: number;
    totalSensors: number;
  };
  todaysList: any[];
  tomorrowsList: any[];
  teams: Array<{
    id: string;
    name: string;
    region: string;
    dailyCap: number;
    hasChatId: boolean;
    weekLoad: number;
    breakdown: { confirmed: number; inProgress: number; completed: number; draft: number };
  }>;
  recentChanges: any[];
  recentTelegramLogs: any[];
  recentPhotos: any[];
  byRegion: { BANGKOK: any[]; UPC: any[] };
  monthCalendar: {
    year: number;
    month: number;
    monthLabel: string;
    totalInMonth: number;
    cells: Array<{
      date: string;
      day: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      count: number;
      plans: any[];
    }>;
  };
  upcoming30Days: any[];
}

export const commandCenterApi = {
  snapshot: () =>
    api.get<{ success: boolean; data: CCSnapshot }>('/command-center/snapshot').then((r) => r.data.data),

  // SSE URL with token in query string (EventSource can't send headers)
  streamUrl: (token: string) => {
    const base = (api.defaults.baseURL || '').replace(/\/$/, '');
    return `${base}/command-center/stream?token=${encodeURIComponent(token)}`;
  },
};
