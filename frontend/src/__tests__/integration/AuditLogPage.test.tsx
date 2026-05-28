import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AuditLogPage from '@/pages/AuditLogPage';

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/audit']}>
        <AuditLogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AuditLogPage', () => {
  it('renders the page section title with Audit Log', async () => {
    renderWithProviders();
    await waitFor(() => {
      expect(screen.getByText(/Audit/)).toBeInTheDocument();
    });
  });

  it('renders audit entries after loading', async () => {
    renderWithProviders();
    await waitFor(() => {
      // MSW handler returns 5 audit entries
      expect(screen.getByText(/registros/)).toBeInTheDocument();
    });
  });
});
