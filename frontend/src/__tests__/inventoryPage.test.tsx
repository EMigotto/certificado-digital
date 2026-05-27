import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import InventoryPage from '@/pages/Inventory/InventoryPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/certificates']}>
        <InventoryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InventoryPage', () => {
  it('should render the section heading with Inventário', () => {
    renderPage();
    expect(screen.getByText(/Inventário/)).toBeDefined();
  });

  it('should render search input with correct placeholder', () => {
    renderPage();
    expect(screen.getByPlaceholderText('busca: CN, SAN, serial, owner...')).toBeDefined();
  });

  it('should render the emit certificate button', () => {
    renderPage();
    expect(screen.getByText('Emitir certificado')).toBeDefined();
  });

  it('should render the add filter button', () => {
    renderPage();
    expect(screen.getByText('+ filtro')).toBeDefined();
  });

  it('should render the C1 Inventory tag', () => {
    renderPage();
    expect(screen.getByText('C1 · Inventory')).toBeDefined();
  });
});
