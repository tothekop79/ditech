import { api } from './client';

export type DocType = 'WORK_PERMIT' | 'INSTALLATION_CONFIRM';
export type DocStatus = 'DRAFT' | 'FINALIZED' | 'SIGNED' | 'CANCELLED';

export interface Document {
  id: string;
  planId: string;
  docType: DocType;
  docNumber: string;
  status: DocStatus;
  payload: any;
  signedByName?: string | null;
  pdfUrl?: string | null;
  workStartTime?: string | null;
  workEndTime?: string | null;
  notes?: string | null;
  poeCount?: number | null;
  equipmentList?: string[] | null;
  preInstallChecklist?: string[] | null;
  workingChecklist?: string[] | null;
  handoverChecklist?: string[] | null;
  createdAt: string;
  finalizedAt?: string | null;
  signedAt?: string | null;
  createdBy?: { id: string; fullName: string } | null;
  plan?: any;
}

export const documentsApi = {
  list: (planId?: string, docType?: DocType) =>
    api
      .get<{ success: boolean; data: Document[] }>('/documents', {
        params: { planId, docType },
      })
      .then((r) => r.data.data),

  get: (id: string) =>
    api.get<{ success: boolean; data: Document }>(`/documents/${id}`).then((r) => r.data.data),

  create: (planId: string, docType: DocType) =>
    api
      .post<{ success: boolean; data: Document }>('/documents', { planId, docType })
      .then((r) => r.data.data),

  update: (id: string, data: Partial<Document>) =>
    api.patch<{ success: boolean; data: Document }>(`/documents/${id}`, data).then((r) => r.data.data),

  delete: (id: string) => api.delete(`/documents/${id}`).then((r) => r.data),

  // URL helpers — return the URL string (browser will GET with auth via cookie/header)
  previewUrl: (id: string) => `/api/documents/${id}/preview`,
  pdfUrl: (id: string) => `/api/documents/${id}/pdf`,
};
