import { create } from "zustand";

export type ToastVariant = "error" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  variant: ToastVariant;
  message: string;
  action?: ToastAction;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
}

const AUTO_DISMISS_MS = 6000;

/** Client-only toast queue (Zustand) — `shared/ui/toast.tsx`'s `<Toaster/>`
 * renders whatever's in `toasts`; any layer (upload queue's failed state,
 * generic network errors) calls `push` to surface a message without owning
 * any rendering itself. */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (toast) => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    window.setTimeout(() => {
      get().dismiss(id);
    }, AUTO_DISMISS_MS);
    return id;
  },
  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
