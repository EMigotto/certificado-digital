import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import ExpiringPage from '@/pages/ExpiringPage';

/**
 * Helper component that captures the current location for assertions.
 */
function LocationCapture({ onLocation }: { onLocation: (loc: string) => void }) {
  const location = useLocation();
  onLocation(location.pathname + location.search);
  return <div data-testid="inventory-page">Inventory</div>;
}

describe('ExpiringPage', () => {
  it('redirects to /certificates?expiresIn=30', async () => {
    let capturedLocation = '';

    render(
      <MemoryRouter initialEntries={['/expiring']}>
        <Routes>
          <Route path="/expiring" element={<ExpiringPage />} />
          <Route
            path="/certificates"
            element={
              <LocationCapture
                onLocation={(loc) => {
                  capturedLocation = loc;
                }}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(capturedLocation).toBe('/certificates?expiresIn=30');
    });
  });

  it('renders the inventory page after redirect', async () => {
    render(
      <MemoryRouter initialEntries={['/expiring']}>
        <Routes>
          <Route path="/expiring" element={<ExpiringPage />} />
          <Route
            path="/certificates"
            element={<div data-testid="inventory-page">Inventory</div>}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.querySelector('[data-testid="inventory-page"]')).toBeInTheDocument();
    });
  });
});
