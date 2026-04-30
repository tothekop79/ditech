import { api } from './client';

export const photosApi = {
  list: (planId: string) =>
    api.get<{ success: boolean; data: any[] }>(`/photos/plan/${planId}`).then((r) => r.data.data),
  upload: async (planId: string, file: File, category: string, caption?: string) => {
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('category', category);
    if (caption) fd.append('caption', caption);
    const res = await api.post(`/photos/plan/${planId}/upload`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  },
  update: (id: string, payload: { caption?: string; category?: string }) =>
    api.patch<{ success: boolean; data: any }>(`/photos/${id}`, payload).then((r) => r.data.data),
  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/photos/${id}`).then((r) => r.data),
};

// Build photo URL — uses Vite proxy: /uploads → backend
// Works in both dev (Vite proxy) and production (same origin)
export function photoUrl(storagePath: string): string {
  if (!storagePath) return '';
  // storagePath is like "/uploads/photos/abc.jpg"
  // Both dev (Vite) and prod serve this from the same origin via proxy
  if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
    return storagePath;
  }
  return storagePath.startsWith('/') ? storagePath : `/${storagePath}`;
}
