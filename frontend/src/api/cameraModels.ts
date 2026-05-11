import { api } from './client';

// ════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════
export type CoverageRow = { height: number; width: number; depth: number };

export interface CameraModel {
  id: string;
  brand: string;
  modelName: string;
  variant: string | null;
  displayName: string;
  coverageTable: CoverageRow[];
  minHeight: number;
  maxHeight: number;
  resolution: string | null;
  powerSupply: string | null;
  notes: string | null;
  supportedFunctions: string[];
  imageUrl: string | null;
  iconColor: string | null;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCameraModelDTO {
  brand: string;
  modelName: string;
  variant?: string | null;
  displayName: string;
  coverageTable: CoverageRow[];
  minHeight?: number;
  maxHeight?: number;
  resolution?: string | null;
  powerSupply?: string | null;
  notes?: string | null;
  supportedFunctions?: string[];
  iconColor?: string | null;
}

export type UpdateCameraModelDTO = Partial<CreateCameraModelDTO> & { isActive?: boolean };

// ════════════════════════════════════════════════
// API
// ════════════════════════════════════════════════
export const cameraModelsApi = {
  list: (filters?: { brand?: string; isSystem?: boolean; isActive?: boolean }) =>
    api.get<{ success: boolean; data: CameraModel[] }>('/camera-models', { params: filters }).then(r => r.data.data),

  get: (id: string) =>
    api.get<{ success: boolean; data: CameraModel }>(`/camera-models/${id}`).then(r => r.data.data),

  create: (dto: CreateCameraModelDTO) =>
    api.post<{ success: boolean; data: CameraModel }>('/camera-models', dto).then(r => r.data.data),

  update: (id: string, dto: UpdateCameraModelDTO) =>
    api.patch<{ success: boolean; data: CameraModel }>(`/camera-models/${id}`, dto).then(r => r.data.data),

  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/camera-models/${id}`).then(r => r.data),

  uploadImage: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    return api.post<{ success: boolean; data: CameraModel }>(`/camera-models/${id}/image`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data.data);
  },

  clearImage: (id: string) =>
    api.delete<{ success: boolean; data: CameraModel }>(`/camera-models/${id}/image`).then(r => r.data.data),
};
