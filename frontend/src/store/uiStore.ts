import { create } from 'zustand';

/** Toast notification type */
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

/** Modal descriptor in the stack */
export interface ModalEntry {
  id: string;
  title: string;
}

interface UiState {
  /* Sidebar */
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  /* Modal stack */
  modals: ModalEntry[];
  pushModal: (modal: ModalEntry) => void;
  popModal: () => void;
  clearModals: () => void;

  /* Toast queue */
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

let toastCounter = 0;

export const useUiStore = create<UiState>((set) => ({
  /* Sidebar */
  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  /* Modal stack */
  modals: [],
  pushModal: (modal) => set((s) => ({ modals: [...s.modals, modal] })),
  popModal: () => set((s) => ({ modals: s.modals.slice(0, -1) })),
  clearModals: () => set({ modals: [] }),

  /* Toast queue */
  toasts: [],
  addToast: (toast) =>
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id: `toast-${++toastCounter}` }],
    })),
  removeToast: (id) =>
    set((s) => ({
      toasts: s.toasts.filter((t) => t.id !== id),
    })),
}));
