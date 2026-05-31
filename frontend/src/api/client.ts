import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  timeout: 120_000, // 120s — verify endpoint can take 30-60s on large multi-day events
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ditech_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ditech_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);
