import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  it('renders the page title', () => {
    renderWithProviders();
    expect(screen.getByText(/Audit Log/)).toBeInTheDocument();
  });

  it('renders the page subtitle', () => {
    renderWithProviders();
    expect(screen.getByText(/C4 Audit/)).toBeInTheDocument();
  });
});
