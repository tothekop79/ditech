import { api } from './client';

export const commLogsApi = {
  list: (planId: string) =>
    api.get<{ success: boolean; data: any[] }>(`/communication-logs/plan/${planId}`).then((r) => r.data.data),
  create: (planId: string, payload: any) =>
    api.post<{ success: boolean; data: any }>(`/communication-logs/plan/${planId}`, payload).then((r) => r.data.data),
  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/communication-logs/${id}`).then((r) => r.data),
};
