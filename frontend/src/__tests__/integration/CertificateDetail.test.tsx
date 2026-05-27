import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CertificateDetailPage from '@/pages/CertificateDetailPage';

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/certificates/cert-detail-1']}>
        <Routes>
          <Route path="/certificates/:id" element={<CertificateDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CertificateDetailPage', () => {
  it('renders without crashing', () => {
    renderWithProviders();
    expect(document.body).toBeInTheDocument();
  });

  it('loads and displays certificate CN from API', async () => {
    renderWithProviders();
    // MSW handler returns a cert with CN "api-payments.bank.internal"
    // The CN appears in both breadcrumb and title, so use getAllByText
    await waitFor(
      () => {
        const elements = screen.getAllByText(/api-payments\.bank\.internal/);
        expect(elements.length).toBeGreaterThanOrEqual(1);
      },
      { timeout: 3000 },
    );
  });

  it('displays certificate metadata after loading', async () => {
    renderWithProviders();
    await waitFor(
      () => {
        expect(screen.getByText(/RSA 2048/)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it('displays SAN list', async () => {
    renderWithProviders();
    await waitFor(
      () => {
        expect(screen.getByText(/payments-v2\.bank\.internal/)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });
});
