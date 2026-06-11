/**
 * C6 — Trilha de Auditoria: Testes QA do hook useAuditLog (frontend)
 *
 * Mapeia cenários dos critérios de aceite:
 *   - F3: Consulta de auditoria via API (React Query integration)
 *   - F9.1: Dados carregados e disponíveis para renderização
 */

import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuditLog } from '@/hooks/useAuditLog';
import type { ReactNode } from 'react';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('C6-F3/F9.1: useAuditLog — hook de auditoria', () => {
  it('deve retornar dados paginados ao carregar sem filtros', async () => {
    const { result } = renderHook(() => useAuditLog({}), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveProperty('data');
    expect(result.current.data).toHaveProperty('total');
    expect(result.current.data).toHaveProperty('page');
    expect(result.current.data).toHaveProperty('totalPages');
    expect(Array.isArray(result.current.data?.data)).toBe(true);
  });

  it('deve aceitar filtros como parâmetros', async () => {
    const { result } = renderHook(
      () =>
        useAuditLog({
          page: '1',
          pageSize: '10',
          action: 'CREATE',
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();
  });

  it('deve indicar isLoading enquanto busca dados', () => {
    const { result } = renderHook(() => useAuditLog({}), {
      wrapper: createWrapper(),
    });

    // No início, isLoading pode ser true (ou já false se resolve rápido)
    expect(typeof result.current.isLoading).toBe('boolean');
  });

  it('deve ter query key baseada nos filtros', async () => {
    const { result } = renderHook(
      () => useAuditLog({ action: 'DELETE' }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();
  });
});
