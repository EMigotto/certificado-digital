import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UploadPage from '@/pages/UploadPage';

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/certificates/upload']}>
        <UploadPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('UploadPage', () => {
  it('renders the page title', () => {
    renderWithProviders();
    expect(screen.getByText(/Upload de Certificado/)).toBeInTheDocument();
  });

  it('renders the page subtitle', () => {
    renderWithProviders();
    expect(screen.getByText(/C2 Import/)).toBeInTheDocument();
  });
});
