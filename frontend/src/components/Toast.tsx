import { create } from 'zustand';
import { useEffect } from 'react';

interface ToastState {
  message: string | null;
  show: (msg: string) => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  show: (message) => {
    set({ message });
    setTimeout(() => set({ message: null }), 2400);
  },
  hide: () => set({ message: null }),
}));

export function Toaster() {
  const msg = useToast((s) => s.message);
  if (!msg) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-2 rounded-md shadow-lg z-50 text-sm">
      {msg}
    </div>
  );
}
