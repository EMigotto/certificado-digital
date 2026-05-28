/**
 * QA test helpers — wrappers for rendering with routing + React Query.
 */

import { ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Creates a fresh QueryClient with aggressive retry-off settings.
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

/**
 * Renders a component inside MemoryRouter + QueryClientProvider.
 * `initialEntries` lets you navigate to a specific path.
 */
export function renderWithProviders(
  ui: ReactNode,
  {
    initialEntries = ['/'],
    queryClient,
    ...renderOptions
  }: RenderOptions & {
    initialEntries?: string[];
    queryClient?: QueryClient;
  } = {},
) {
  const client = queryClient ?? createTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }
  return { ...render(ui, { wrapper: Wrapper, ...renderOptions }), queryClient: client };
}

/**
 * Renders a routed page component at a specific path with parameters.
 */
export function renderRoute(
  path: string,
  element: ReactNode,
  initialEntry: string,
  queryClient?: QueryClient,
) {
  const client = queryClient ?? createTestQueryClient();
  return {
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path={path} element={element} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
    queryClient: client,
  };
}
