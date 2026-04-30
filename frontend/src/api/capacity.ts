import { api } from './client';
import type { CapacityData, Conflict } from './types';

export const capacityApi = {
  daily: (date: string) =>
    api.get<{ data: CapacityData }>(`/capacity/daily/${date}`).then((r) => r.data.data),
  heatmap: (year: number, month: number) =>
    api.get<{ data: CapacityData[] }>('/capacity/heatmap', { params: { year, month } }).then((r) => r.data.data),
  conflicts: (params?: { from?: string; to?: string }) =>
    api.get<{ data: Conflict[] }>('/capacity/conflicts', { params }).then((r) => r.data.data),
};
