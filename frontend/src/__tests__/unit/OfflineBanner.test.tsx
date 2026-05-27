import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { OfflineBanner } from '@/components/OfflineBanner/OfflineBanner';

describe('OfflineBanner', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  it('renders nothing when online', () => {
    const { container } = render(<OfflineBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('renders banner when offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    render(<OfflineBanner />);
    expect(screen.getByText(/Sem conexão/)).toBeInTheDocument();
  });

  it('has role="alert" for accessibility', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    render(<OfflineBanner />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows banner when going offline dynamically', () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByText(/Sem conexão/)).toBeInTheDocument();
  });

  it('hides banner when going back online', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    render(<OfflineBanner />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
