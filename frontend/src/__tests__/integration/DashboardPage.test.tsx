import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    expect(screen.getByTestId('panels-loading')).toBeInTheDocument();
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

  // ─── Heatmap panel tests (AC 4.4) ─────────────────────────────────────

  it('renders the heatmap panel title', async () => {
    renderWithProviders();
    await waitFor(() => {
      expect(screen.getByText('Expirações nos próximos 90 dias')).toBeInTheDocument();
    });
  });

  it('renders 90 heatmap cells in a grid', async () => {
    renderWithProviders();
    await waitFor(() => {
      expect(screen.getByRole('grid', { name: /heatmap/i })).toBeInTheDocument();
    });
    const cells = screen.getAllByRole('gridcell');
    expect(cells).toHaveLength(90);
  });

  it('renders the heatmap axis labels', async () => {
    renderWithProviders();
    await waitFor(() => {
      expect(screen.getByText('Hoje')).toBeInTheDocument();
    });
    expect(screen.getByText('+30d')).toBeInTheDocument();
    expect(screen.getByText('+60d')).toBeInTheDocument();
    expect(screen.getByText('+90d')).toBeInTheDocument();
  });

  it('renders the heatmap legend', async () => {
    renderWithProviders();
    await waitFor(() => {
      expect(screen.getByText('Menos')).toBeInTheDocument();
    });
    expect(screen.getByText('Mais')).toBeInTheDocument();
  });

  it('shows tooltip on heatmap cell hover', async () => {
    const user = userEvent.setup();
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getAllByRole('gridcell').length).toBe(90);
    });

    const cells = screen.getAllByRole('gridcell');
    // Hover over first cell (day 0)
    await user.hover(cells[0]);

    // Tooltip should appear with count and date
    await waitFor(() => {
      expect(screen.getByText(/cert\(s\)/)).toBeInTheDocument();
    });
  });

  // ─── Critical alerts panel tests (AC 4.5) ─────────────────────────────

  it('renders the critical alerts panel', async () => {
    renderWithProviders();
    await waitFor(() => {
      expect(screen.getByText('Alertas críticos')).toBeInTheDocument();
    });
  });

  it('renders alert items matching the mock data', async () => {
    renderWithProviders();
    await waitFor(() => {
      expect(screen.getByText('api-payments.bank.internal')).toBeInTheDocument();
    });
    expect(screen.getByText('mtls-broker-kafka.bank.internal')).toBeInTheDocument();
    expect(screen.getByText('gateway-edge.bank.internal')).toBeInTheDocument();
    expect(screen.getByText('auth-svc.bank.internal')).toBeInTheDocument();
    expect(screen.getByText('notification-worker.bank.internal')).toBeInTheDocument();
  });

  it('renders days-left badges for alerts', async () => {
    renderWithProviders();
    await waitFor(() => {
      expect(screen.getByText('2d')).toBeInTheDocument();
    });
    expect(screen.getByText('5d')).toBeInTheDocument();
    expect(screen.getByText('12d')).toBeInTheDocument();
    expect(screen.getByText('18d')).toBeInTheDocument();
    expect(screen.getByText('26d')).toBeInTheDocument();
  });

  it('renders alert meta info (env · owner)', async () => {
    renderWithProviders();
    await waitFor(() => {
      expect(screen.getByText(/prd · time-pagamentos/)).toBeInTheDocument();
    });
    expect(screen.getByText(/prd · time-data/)).toBeInTheDocument();
  });
});
