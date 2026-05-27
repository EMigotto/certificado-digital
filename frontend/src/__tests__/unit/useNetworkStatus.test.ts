import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

describe('useNetworkStatus', () => {
  beforeEach(() => {
    // Reset navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  it('returns true when browser is online', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current).toBe(true);
  });

  it('returns false when browser is offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current).toBe(false);
  });

  it('updates to false when offline event fires', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current).toBe(false);
  });

  it('updates to true when online event fires', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current).toBe(true);
  });

  it('cleans up event listeners on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useNetworkStatus());

    expect(addSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('offline', expect.any(Function));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
