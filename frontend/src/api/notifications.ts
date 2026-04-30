import { api } from './client';

// ─── Types ───
export type NotificationTrigger =
  | 'DAILY_AT' | 'EVENING_DAY_BEFORE' | 'WEEKLY_AT'
  | 'STATUS_CHANGE' | 'READINESS_READY' | 'NOT_READY_NEAR'
  | 'CAPACITY_OVERFLOW' | 'HANDOVER_GENERATED' | 'RESCHEDULED' | 'TEAM_CHANGED' | 'PLAN_CREATED' | 'PHOTO_UPLOADED';

export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED';

export interface NotificationRule {
  id: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  trigger: NotificationTrigger;
  triggerTime?: string | null;     // 'HH:mm'
  triggerDay?: string | null;      // 'Monday' .. 'Sunday'
  triggerCondition?: string | null;
  daysAhead?: number | null;
  recipients: string[];
  templateBody?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationLog {
  id: string;
  ruleId?: string | null;
  rule?: { name: string; trigger: string } | null;
  recipient: string;
  channel: string;
  subject?: string | null;
  body: string;
  attachmentUrl?: string | null;
  status: NotificationStatus;
  errorMessage?: string | null;
  sentAt?: string | null;
  createdAt: string;
}

export interface RecipientOption {
  value: string;
  label: string;
  envVar: string | null;
  configured: boolean;
  teamId?: string;
}

export interface RecipientsList {
  builtIns: RecipientOption[];
  teams: RecipientOption[];
  telegramConfigured: boolean;
}

export interface CreateRuleInput {
  name: string;
  description?: string | null;
  enabled?: boolean;
  trigger: NotificationTrigger;
  triggerTime?: string | null;
  triggerDay?: string | null;
  triggerCondition?: string | null;
  daysAhead?: number | null;
  recipients: string[];
  templateBody?: string | null;
}

// ─── API ───
export const notificationsApi = {
  // Rules
  rules: () =>
    api.get<{ data: NotificationRule[] }>('/notifications/rules').then((r) => r.data.data),
  rule: (id: string) =>
    api.get<{ data: NotificationRule }>(`/notifications/rules/${id}`).then((r) => r.data.data),
  createRule: (data: CreateRuleInput) =>
    api.post<{ data: NotificationRule }>('/notifications/rules', data).then((r) => r.data.data),
  updateRule: (id: string, data: Partial<CreateRuleInput>) =>
    api.put<{ data: NotificationRule }>(`/notifications/rules/${id}`, data).then((r) => r.data.data),
  deleteRule: (id: string) =>
    api.delete(`/notifications/rules/${id}`).then((r) => r.data),
  toggle: (id: string) =>
    api.patch<{ data: NotificationRule }>(`/notifications/rules/${id}/toggle`).then((r) => r.data.data),

  sendNow: (id: string, planId?: string) =>
    api.post<{ success: boolean; message: string }>(`/notifications/rules/${id}/send-now`, planId ? { planId } : {})
      .then((r) => r.data),

  // Recipients (for dropdown)
  recipients: () =>
    api.get<{ data: RecipientsList }>('/notifications/recipients').then((r) => r.data.data),

  // Test connection
  test: (recipient: string) =>
    api.post<{ success: boolean; chatId?: string; message?: string }>('/notifications/test', { recipient })
      .then((r) => r.data),

  // Logs
  logs: (params?: { status?: NotificationStatus; ruleId?: string; limit?: number }) =>
    api.get<{ data: NotificationLog[] }>('/notifications/logs', { params })
      .then((r) => r.data.data),

  // Preview a template (no send)
  preview: (data: { trigger: string; templateBody?: string }) =>
    api.post<{ success: boolean; data: { message: string; sampleSource: string } }>('/notifications/preview', data)
      .then((r) => r.data.data),

  // Seed defaults (admin only)
  seedDefaults: (force = false) =>
    api.post<{ success: boolean; message: string; created: number }>('/notifications/seed-defaults', { force })
      .then((r) => r.data),
};
