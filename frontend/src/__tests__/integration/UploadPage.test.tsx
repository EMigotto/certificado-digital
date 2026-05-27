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
    // Title is split: <em>Upload</em> de certificado
    expect(screen.getByText(/de certificado/)).toBeInTheDocument();
    // "Upload" appears in both title and breadcrumb
    expect(screen.getAllByText('Upload').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the file drop zone', () => {
    renderWithProviders();
    expect(screen.getByLabelText('Selecionar arquivo de certificado')).toBeInTheDocument();
  });

  it('renders the subtitle with format info', () => {
    renderWithProviders();
    expect(screen.getByText(/PEM, DER ou PKCS#12/)).toBeInTheDocument();
  });

  it('renders breadcrumb navigation', () => {
    renderWithProviders();
    expect(screen.getByText('Certificados')).toBeInTheDocument();
  });

  it('renders accepted formats hint', () => {
    renderWithProviders();
    expect(screen.getByText(/Formatos aceitos:/)).toBeInTheDocument();
  });
});
