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
    // Title is split: <em>Importação</em> em lote
    expect(screen.getByText('Importação')).toBeInTheDocument();
    expect(screen.getByText(/em lote/)).toBeInTheDocument();
  });

  it('renders the CSV upload panel', () => {
    renderWithProviders();
    expect(screen.getByText('Arquivo CSV')).toBeInTheDocument();
  });

  it('renders the drop zone', () => {
    renderWithProviders();
    expect(screen.getByLabelText('Selecionar arquivo CSV')).toBeInTheDocument();
  });

  it('renders template download link', () => {
    renderWithProviders();
    expect(screen.getByText('Download template CSV')).toBeInTheDocument();
  });

  it('renders breadcrumb navigation', () => {
    renderWithProviders();
    expect(screen.getByText('Certificados')).toBeInTheDocument();
    expect(screen.getByText('Importação CSV')).toBeInTheDocument();
  });

  it('renders required columns info', () => {
    renderWithProviders();
    expect(screen.getByText(/cn, issuer, owner, environment/)).toBeInTheDocument();
  });
});
