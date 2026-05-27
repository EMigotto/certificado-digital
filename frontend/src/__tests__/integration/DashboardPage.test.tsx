import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardPage from '@/pages/DashboardPage';

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DashboardPage', () => {
  it('renders the page title', () => {
    renderWithProviders();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders the page subtitle', () => {
    renderWithProviders();
    expect(screen.getByText(/C3 Monitoring/)).toBeInTheDocument();
  });
});
