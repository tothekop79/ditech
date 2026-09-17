import { api } from './client';
import type { InstallationPlan } from './types';

export interface PlansStats {
  total: number;
  byStatus: Record<string, number>;
  byReadiness: Record<string, number>;
}

export const plansApi = {
  list: (params?: any) =>
    api.get<{ success: boolean; data: InstallationPlan[]; pagination: any }>('/installation-plans', { params })
      .then((r) => r.data),
  /** filtered counts straight from the DB — accepts the same filter params as list() */
  stats: (params?: Record<string, string | undefined>) =>
    api.get<{ success: boolean; data: PlansStats }>('/installation-plans/stats', { params })
      .then((r) => r.data.data),
  get: (id: string) =>
    api.get<{ success: boolean; data: InstallationPlan & { statusHistory: any[] } }>(`/installation-plans/${id}`)
      .then((r) => r.data.data),
  create: (data: any) =>
    api.post<{ success: boolean; data: InstallationPlan }>('/installation-plans', data).then((r) => r.data.data),
  update: (id: string, data: any) =>
    api.put<{ success: boolean; data: InstallationPlan }>(`/installation-plans/${id}`, data).then((r) => r.data.data),
  reschedule: (id: string, newDate: string) =>
    api.patch<{ success: boolean; data: InstallationPlan }>(`/installation-plans/${id}/reschedule`, { newDate })
      .then((r) => r.data.data),
  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/installation-plans/${id}`).then((r) => r.data),
  validateImport: (rows: any[], mode: 'create' | 'upsert' = 'create') =>
    api.post('/installation-plans/bulk-import/validate', { rows, mode }).then(r => r.data.data),
  bulkImport: (rows: any[], mode: 'create' | 'upsert' = 'create') =>
    api.post('/installation-plans/bulk-import', { rows, mode }).then(r => r.data.data),
  statistics: (params?: any) =>
    api.get<{ success: boolean; data: any }>('/installation-plans/statistics', { params }).then((r) => r.data.data),
};
