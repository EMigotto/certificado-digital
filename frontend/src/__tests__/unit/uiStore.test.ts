import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore } from '@/store/uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    // Reset state before each test
    useUiStore.setState({
      sidebarOpen: false,
      modals: [],
      toasts: [],
    });
  });

  describe('sidebar', () => {
    it('starts closed', () => {
      expect(useUiStore.getState().sidebarOpen).toBe(false);
    });

    it('toggles open and closed', () => {
      useUiStore.getState().toggleSidebar();
      expect(useUiStore.getState().sidebarOpen).toBe(true);
      useUiStore.getState().toggleSidebar();
      expect(useUiStore.getState().sidebarOpen).toBe(false);
    });

    it('sets sidebar open directly', () => {
      useUiStore.getState().setSidebarOpen(true);
      expect(useUiStore.getState().sidebarOpen).toBe(true);
      useUiStore.getState().setSidebarOpen(false);
      expect(useUiStore.getState().sidebarOpen).toBe(false);
    });
  });

  describe('modal stack', () => {
    it('starts empty', () => {
      expect(useUiStore.getState().modals).toHaveLength(0);
    });

    it('pushes modals onto stack', () => {
      useUiStore.getState().pushModal({ id: 'm1', title: 'First' });
      useUiStore.getState().pushModal({ id: 'm2', title: 'Second' });
      expect(useUiStore.getState().modals).toHaveLength(2);
      expect(useUiStore.getState().modals[1].title).toBe('Second');
    });

    it('pops last modal from stack', () => {
      useUiStore.getState().pushModal({ id: 'm1', title: 'First' });
      useUiStore.getState().pushModal({ id: 'm2', title: 'Second' });
      useUiStore.getState().popModal();
      expect(useUiStore.getState().modals).toHaveLength(1);
      expect(useUiStore.getState().modals[0].id).toBe('m1');
    });

    it('clears all modals', () => {
      useUiStore.getState().pushModal({ id: 'm1', title: 'First' });
      useUiStore.getState().pushModal({ id: 'm2', title: 'Second' });
      useUiStore.getState().clearModals();
      expect(useUiStore.getState().modals).toHaveLength(0);
    });
  });

  describe('toast queue', () => {
    it('starts empty', () => {
      expect(useUiStore.getState().toasts).toHaveLength(0);
    });

    it('adds toast with auto-generated ID', () => {
      useUiStore.getState().addToast({ type: 'success', message: 'Done!' });
      const toasts = useUiStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].id).toMatch(/^toast-/);
      expect(toasts[0].type).toBe('success');
      expect(toasts[0].message).toBe('Done!');
    });

    it('removes toast by ID', () => {
      useUiStore.getState().addToast({ type: 'error', message: 'Failed' });
      const id = useUiStore.getState().toasts[0].id;
      useUiStore.getState().removeToast(id);
      expect(useUiStore.getState().toasts).toHaveLength(0);
    });

    it('supports multiple toasts', () => {
      useUiStore.getState().addToast({ type: 'success', message: 'A' });
      useUiStore.getState().addToast({ type: 'error', message: 'B' });
      useUiStore.getState().addToast({ type: 'info', message: 'C' });
      expect(useUiStore.getState().toasts).toHaveLength(3);
    });

    it('removes correct toast from middle of queue', () => {
      useUiStore.getState().addToast({ type: 'success', message: 'A' });
      useUiStore.getState().addToast({ type: 'error', message: 'B' });
      useUiStore.getState().addToast({ type: 'info', message: 'C' });

      const middleId = useUiStore.getState().toasts[1].id;
      useUiStore.getState().removeToast(middleId);

      const remaining = useUiStore.getState().toasts;
      expect(remaining).toHaveLength(2);
      expect(remaining[0].message).toBe('A');
      expect(remaining[1].message).toBe('C');
    });
  });
});
