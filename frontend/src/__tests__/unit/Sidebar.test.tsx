import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from '@/components/Sidebar/Sidebar';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderSidebar(initialEntries: string[] = ['/certificates']) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Sidebar', () => {
  it('renders brand name "cipher"', () => {
    renderSidebar();
    expect(screen.getByText('cipher')).toBeInTheDocument();
  });

  it('renders subtitle "mTLS Control Plane"', () => {
    renderSidebar();
    expect(screen.getByText('mTLS Control Plane')).toBeInTheDocument();
  });

  it('renders all 3 navigation sections', () => {
    renderSidebar();
    expect(screen.getByText('Operação')).toBeInTheDocument();
    expect(screen.getByText('Governança')).toBeInTheDocument();
    expect(screen.getByText('Sistema')).toBeInTheDocument();
  });

  it('renders all 8 nav items from prototype', () => {
    renderSidebar();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Certificados')).toBeInTheDocument();
    expect(screen.getByText('Expirando')).toBeInTheDocument();
    expect(screen.getByText('Requisições')).toBeInTheDocument();
    expect(screen.getByText('Zonas')).toBeInTheDocument();
    expect(screen.getByText('CAs')).toBeInTheDocument();
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
    expect(screen.getByText('API & CLI')).toBeInTheDocument();
  });

  it('renders static badge for Certificados', () => {
    renderSidebar();
    expect(screen.getByText('2.847')).toBeInTheDocument();
  });

  it('shows skeleton badge while dashboard data is loading', () => {
    renderSidebar();
    // Before API response, skeleton badge should be visible
    expect(screen.getByTestId('badge-skeleton')).toBeInTheDocument();
  });

  it('shows dynamic expiring badge from dashboard snapshot', async () => {
    renderSidebar();
    // MSW returns snapshot with expiringLessThan30d: 23
    await waitFor(() => {
      expect(screen.getByText('23')).toBeInTheDocument();
    });
    // Skeleton should no longer be present
    expect(screen.queryByTestId('badge-skeleton')).not.toBeInTheDocument();
  });

  it('applies warn styling to the expiring badge', async () => {
    renderSidebar();
    await waitFor(() => {
      expect(screen.getByText('23')).toBeInTheDocument();
    });
    const badge = screen.getByText('23');
    expect(badge.className).toContain('navBadgeWarn');
  });

  it('renders user card with initials and info', () => {
    renderSidebar();
    expect(screen.getByText('RC')).toBeInTheDocument();
    expect(screen.getByText('Rafael Costa')).toBeInTheDocument();
    expect(screen.getByText('pki-admin · zone:bank')).toBeInTheDocument();
  });

  it('marks Certificados as active on /certificates route', () => {
    renderSidebar();
    const certButton = screen.getByRole('button', { name: 'Certificados' });
    expect(certButton).toHaveAttribute('aria-current', 'page');
  });

  it('marks Dashboard as active on /dashboard route', () => {
    renderSidebar(['/dashboard']);
    const dashButton = screen.getByRole('button', { name: 'Dashboard' });
    expect(dashButton).toHaveAttribute('aria-current', 'page');
  });

  it('navigates on nav item click', () => {
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Audit Log' }));
    expect(mockNavigate).toHaveBeenCalledWith('/audit');
  });

  it('navigates to /expiring when Expirando is clicked', () => {
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Expirando' }));
    expect(mockNavigate).toHaveBeenCalledWith('/expiring');
  });

  it('has correct navigation aria-label', () => {
    renderSidebar();
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
  });
});
