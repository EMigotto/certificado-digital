import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useFilters } from '@/hooks/useFilters';

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('useFilters', () => {
  it('should initialize with no active filters', () => {
    const { result } = renderHook(() => useFilters(), { wrapper });
    expect(result.current.activeFilters).toEqual([]);
    expect(result.current.hasFilters).toBe(false);
  });

  it('should toggle expiresIn filter', () => {
    const { result } = renderHook(() => useFilters(), { wrapper });

    act(() => {
      result.current.toggleFilter('expiresIn', '30');
    });

    expect(result.current.activeFilters).toHaveLength(1);
    expect(result.current.activeFilters[0].label).toBe('expira: < 30d');
    expect(result.current.hasFilters).toBe(true);

    // Toggle off
    act(() => {
      result.current.toggleFilter('expiresIn', '30');
    });

    expect(result.current.activeFilters).toHaveLength(0);
    expect(result.current.hasFilters).toBe(false);
  });

  it('should toggle multi-value filter (environment)', () => {
    const { result } = renderHook(() => useFilters(), { wrapper });

    act(() => {
      result.current.toggleFilter('environment', 'prd');
    });

    expect(result.current.filterParams.environment).toEqual(['prd']);

    act(() => {
      result.current.toggleFilter('environment', 'hml');
    });

    expect(result.current.filterParams.environment).toEqual(['prd', 'hml']);

    // Remove prd
    act(() => {
      result.current.toggleFilter('environment', 'prd');
    });

    expect(result.current.filterParams.environment).toEqual(['hml']);
  });

  it('should remove specific filter', () => {
    const { result } = renderHook(() => useFilters(), { wrapper });

    act(() => {
      result.current.toggleFilter('environment', 'prd');
      result.current.toggleFilter('environment', 'hml');
    });

    act(() => {
      result.current.removeFilter('environment', 'prd');
    });

    expect(result.current.filterParams.environment).toEqual(['hml']);
  });

  it('should clear all filters', () => {
    const { result } = renderHook(() => useFilters(), { wrapper });

    act(() => {
      result.current.toggleFilter('expiresIn', '30');
    });
    act(() => {
      result.current.toggleFilter('environment', 'prd');
    });

    expect(result.current.hasFilters).toBe(true);

    act(() => {
      result.current.clearAllFilters();
    });

    expect(result.current.hasFilters).toBe(false);
    expect(result.current.activeFilters).toEqual([]);
  });

  it('should check if filter is active', () => {
    const { result } = renderHook(() => useFilters(), { wrapper });

    expect(result.current.isActive('expiresIn', '30')).toBe(false);

    act(() => {
      result.current.toggleFilter('expiresIn', '30');
    });

    expect(result.current.isActive('expiresIn', '30')).toBe(true);
    expect(result.current.isActive('expiresIn', '7')).toBe(false);
  });
});
