import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { usePagination } from '@/hooks/usePagination';

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('usePagination', () => {
  it('should initialize with defaults', () => {
    const { result } = renderHook(() => usePagination(), { wrapper });
    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(25);
  });

  it('should change page', () => {
    const { result } = renderHook(() => usePagination(), { wrapper });

    act(() => {
      result.current.setPage(3);
    });

    expect(result.current.page).toBe(3);
  });

  it('should go to next/prev page', () => {
    const { result } = renderHook(() => usePagination(), { wrapper });

    act(() => {
      result.current.nextPage();
    });
    expect(result.current.page).toBe(2);

    act(() => {
      result.current.nextPage();
    });
    expect(result.current.page).toBe(3);

    act(() => {
      result.current.prevPage();
    });
    expect(result.current.page).toBe(2);
  });

  it('should not go below page 1', () => {
    const { result } = renderHook(() => usePagination(), { wrapper });

    act(() => {
      result.current.prevPage();
    });

    expect(result.current.page).toBe(1);
  });

  it('should change page size and reset to page 1', () => {
    const { result } = renderHook(() => usePagination(), { wrapper });

    act(() => {
      result.current.setPage(5);
    });
    expect(result.current.page).toBe(5);

    act(() => {
      result.current.setPageSize(50);
    });

    expect(result.current.pageSize).toBe(50);
    expect(result.current.page).toBe(1); // Reset
  });

  it('should reset page', () => {
    const { result } = renderHook(() => usePagination(), { wrapper });

    act(() => {
      result.current.setPage(10);
    });
    expect(result.current.page).toBe(10);

    act(() => {
      result.current.resetPage();
    });
    expect(result.current.page).toBe(1);
  });
});
