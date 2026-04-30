import { create } from 'zustand';
import { api } from '../../api/client';

interface User { id: string; email: string; fullName: string; role: string; }

interface AuthState {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const initialToken = typeof localStorage !== 'undefined' ? localStorage.getItem('ditech_token') : null;
const initialUser = typeof localStorage !== 'undefined' ? localStorage.getItem('ditech_user') : null;

export const useAuth = create<AuthState>((set) => ({
  token: initialToken,
  user: initialUser ? JSON.parse(initialUser) : null,
  login: async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { token, user } = res.data.data;
    localStorage.setItem('ditech_token', token);
    localStorage.setItem('ditech_user', JSON.stringify(user));
    set({ token, user });
  },
  logout: () => {
    localStorage.removeItem('ditech_token');
    localStorage.removeItem('ditech_user');
    set({ token: null, user: null });
  },
}));
