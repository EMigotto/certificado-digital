import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
      <MemoryRouter initialEntries={['/certificates/cert-1']}>
        <CertificateDetailPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CertificateDetailPage', () => {
  it('renders the page title', () => {
    renderWithProviders();
    expect(screen.getByText(/Detalhe do Certificado/)).toBeInTheDocument();
  });

  it('renders the page subtitle', () => {
    renderWithProviders();
    expect(screen.getByText(/C1 Detail/)).toBeInTheDocument();
  });
});
