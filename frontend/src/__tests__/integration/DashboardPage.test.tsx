import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
  it('renders the section title', () => {
    renderWithProviders();
    expect(screen.getByText(/Dashboard/)).toBeInTheDocument();
    expect(screen.getByText(/de expiração/)).toBeInTheDocument();
  });

  it('renders the C3 tag', () => {
    renderWithProviders();
    expect(screen.getByText(/C3 · Monitoring & Alerts/)).toBeInTheDocument();
  });

  it('shows loading skeletons initially', () => {
    renderWithProviders();
    expect(screen.getByTestId('kpi-loading')).toBeInTheDocument();
  });

  it('renders 4 KPI cards after loading', async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText('2.847')).toBeInTheDocument();
    });

    // AC 4.1: Total managed displayed accurately
    expect(screen.getByText('Total gerenciados')).toBeInTheDocument();
    expect(screen.getByText('2.847')).toBeInTheDocument();

    // AC 4.2: Valid count with percentage
    expect(screen.getByText('Válidos')).toBeInTheDocument();
    expect(screen.getByText('2.798')).toBeInTheDocument();
    expect(screen.getByText('98.3% do inventário')).toBeInTheDocument();

    // AC 4.3: Expiring < 30d with trend delta
    expect(screen.getByText('Expiram < 30 dias')).toBeInTheDocument();
    expect(screen.getByText('23')).toBeInTheDocument();

    // Expired / Revoked
    expect(screen.getByText('Vencidos / Revogados')).toBeInTheDocument();
    expect(screen.getByText('26')).toBeInTheDocument();
  });

  it('renders trend deltas with correct signs', async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText('2.847')).toBeInTheDocument();
    });

    // Total managed: +47
    expect(screen.getByText('+47')).toBeInTheDocument();
    expect(screen.getByText('nos últimos 7d')).toBeInTheDocument();

    // Expiring < 30d: +5
    expect(screen.getByText('+5')).toBeInTheDocument();
    expect(screen.getByText('vs. ontem')).toBeInTheDocument();
  });

  it('renders auto-refresh timestamp in header', async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText('2.847')).toBeInTheDocument();
    });

    expect(screen.getByText(/Auto-refresh 60s/)).toBeInTheDocument();
    expect(screen.getByText(/Última:/)).toBeInTheDocument();
  });
});
