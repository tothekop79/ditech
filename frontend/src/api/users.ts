// Extended users API (for document profile fields)
import { api } from './client';

export const usersApi = {
  list: () =>
    api.get<{ success: boolean; data: any[] }>('/users').then((r) => r.data.data),

  // Create new user (ADMIN only) — supports full profile fields
  create: (data: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    role: string;
    idCard?: string | null;
    idCardPhotoUrl?: string | null;
    position?: string | null;
    phoneForDoc?: string | null;
    province?: string | null;
  }) =>
    api.post<{ success: boolean; data: any }>('/users', data).then((r) => r.data.data),

  // Update user (ADMIN only) — partial fields, used for role change, activation, etc.
  update: (userId: string, data: {
    fullName?: string;
    phone?: string;
    role?: string;
    isActive?: boolean;
    idCard?: string | null;
    idCardPhotoUrl?: string | null;
    position?: string | null;
    phoneForDoc?: string | null;
    province?: string | null;
  }) =>
    api.patch<{ success: boolean; data: any }>(`/users/${userId}`, data).then((r) => r.data.data),

  // Profile patch (uses dedicated /profile endpoint — preserved for IdCardProfileModal)
  patchProfile: (userId: string, data: {
    idCard?: string;
    position?: string;
    phoneForDoc?: string;
    fullName?: string;
    phoneNumber?: string;
    province?: string;
    idCardPhotoUrl?: string;
  }) =>
    api.patch<{ success: boolean; data: any }>(`/users/${userId}/profile`, data).then((r) => r.data.data),

  uploadIdCardPhoto: (userId: string, file: File) => {
    const fd = new FormData();
    fd.append('photo', file);
    return api.post<{ success: boolean; data: any }>(`/users/${userId}/id-card-photo`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data.data);
  },
};
