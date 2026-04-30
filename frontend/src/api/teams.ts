import { api } from './client';

export const teamsApi = {
  list: () =>
    api.get<{ success: boolean; data: any[] }>('/teams').then((r) => r.data.data),

  create: (data: { name: string; region: string; telegramChatId?: string | null; dailyCap?: number }) =>
    api.post<{ success: boolean; data: any }>('/teams', data).then((r) => r.data.data),

  update: (teamId: string, data: { name?: string; region?: string; telegramChatId?: string | null; dailyCap?: number; isActive?: boolean }) =>
    api.patch<{ success: boolean; data: any }>(`/teams/${teamId}`, data).then((r) => r.data.data),

  delete: (teamId: string) =>
    api.delete<{ success: boolean }>(`/teams/${teamId}`).then((r) => r.data),

  addMember: (teamId: string, userId: string) =>
    api.post<{ success: boolean; data: any }>(`/teams/${teamId}/members`, { userId }).then((r) => r.data.data),

  removeMember: (teamId: string, userId: string) =>
    api.delete<{ success: boolean }>(`/teams/${teamId}/members/${userId}`).then((r) => r.data),

  setLead: (teamId: string, userId: string | null) =>
    api.patch<{ success: boolean; data: any }>(`/teams/${teamId}/lead`, { userId }).then((r) => r.data.data),

  updateChatId: (teamId: string, telegramChatId: string | null) =>
    api.patch<{ success: boolean; data: any }>(`/teams/${teamId}/chat-id`, { telegramChatId }).then((r) => r.data.data),
};
