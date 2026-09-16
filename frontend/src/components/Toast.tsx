import { create } from 'zustand';

export interface ToastAction {
  label: string;
  run: () => void;
}

interface ToastState {
  message: string | null;
  action: ToastAction | null;
  show: (msg: string, action?: ToastAction) => void;
  hide: () => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;

export const useToast = create<ToastState>((set) => ({
  message: null,
  action: null,
  show: (message, action) => {
    // a second toast must not be cut short by the previous one's timer
    if (timer) clearTimeout(timer);
    set({ message, action: action ?? null });
    timer = setTimeout(() => set({ message: null, action: null }), action ? 8000 : 2400);
  },
  hide: () => {
    if (timer) clearTimeout(timer);
    set({ message: null, action: null });
  },
}));

export function Toaster() {
  const msg = useToast((s) => s.message);
  const action = useToast((s) => s.action);
  const hide = useToast((s) => s.hide);
  if (!msg) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-2 rounded-md shadow-lg z-50 text-sm flex items-center gap-3">
      <span>{msg}</span>
      {action && (
        <button
          onClick={() => { action.run(); hide(); }}
          className="text-amber-300 hover:text-amber-200 underline underline-offset-2">
          {action.label}
        </button>
      )}
    </div>
  );
}
