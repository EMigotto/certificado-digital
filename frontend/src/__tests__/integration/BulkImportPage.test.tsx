import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BulkImportPage from '@/pages/BulkImportPage';

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/certificates/import']}>
        <BulkImportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BulkImportPage', () => {
  it('renders the page title', () => {
    renderWithProviders();
    expect(screen.getByText(/Importação em Lote/)).toBeInTheDocument();
  });

  it('renders the page subtitle', () => {
    renderWithProviders();
    expect(screen.getByText(/C2 Bulk Import/)).toBeInTheDocument();
  });
});
