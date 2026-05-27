import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useSearch } from '@/hooks/useSearch';

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('useSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with empty values', () => {
    const { result } = renderHook(() => useSearch(), { wrapper });
    expect(result.current.inputValue).toBe('');
    expect(result.current.searchTerm).toBe('');
    expect(result.current.hint).toBe('');
  });

  it('should show hint when input < 2 chars', () => {
    const { result } = renderHook(() => useSearch(), { wrapper });

    act(() => {
      result.current.setInputValue('a');
    });

    expect(result.current.hint).toBe('Mínimo 2 caracteres');
    expect(result.current.searchTerm).toBe('');
  });

  it('should debounce search term after 300ms', () => {
    const { result } = renderHook(() => useSearch(), { wrapper });

    act(() => {
      result.current.setInputValue('api-pay');
    });

    // Not yet debounced
    expect(result.current.searchTerm).toBe('');

    // After debounce
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.searchTerm).toBe('api-pay');
    expect(result.current.hint).toBe('');
  });

  it('should clear search', () => {
    const { result } = renderHook(() => useSearch(), { wrapper });

    act(() => {
      result.current.setInputValue('test');
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.searchTerm).toBe('test');

    act(() => {
      result.current.clearSearch();
    });

    expect(result.current.inputValue).toBe('');
    expect(result.current.searchTerm).toBe('');
  });

  it('should not search for single character', () => {
    const { result } = renderHook(() => useSearch(), { wrapper });

    act(() => {
      result.current.setInputValue('x');
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.searchTerm).toBe('');
  });
});
