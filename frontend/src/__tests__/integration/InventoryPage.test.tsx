import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import InventoryPage from '@/pages/InventoryPage';

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
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
  it('renders the page title with Inventário', () => {
    renderWithProviders();
    expect(screen.getByText(/Inventário/)).toBeInTheDocument();
  });

  it('renders the C1 Inventory tag', () => {
    renderWithProviders();
    expect(screen.getByText(/C1 · Inventory/)).toBeInTheDocument();
  });
});
