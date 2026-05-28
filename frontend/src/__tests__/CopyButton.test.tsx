import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CopyButton } from '@/components/CopyButton/CopyButton';

// Mock the uiStore
vi.mock('@/store/uiStore', () => {
  const addToast = vi.fn();
  return {
    useUiStore: (selector: (s: { addToast: typeof addToast }) => unknown) =>
      selector({ addToast }),
  };
});

describe('CopyButton', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should render the copy icon button', () => {
    render(<CopyButton value="test-value" />);
    const btn = screen.getByRole('button', { name: /copiar/i });
    expect(btn).toBeDefined();
  });

  it('should copy text on click when clipboard is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<CopyButton value="serial-123" label="Serial" />);
    const btn = screen.getByRole('button', { name: /copiar serial/i });

    await act(async () => {
      btn.click();
    });

    expect(writeText).toHaveBeenCalledWith('serial-123');
  });

  it('should show checkmark after successful copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<CopyButton value="test" label="Test" />);
    const btn = screen.getByRole('button', { name: /copiar test/i });

    await act(async () => {
      btn.click();
    });

    // After clicking, the button should have the check animation svg
    const svgs = btn.querySelectorAll('svg');
    expect(svgs.length).toBe(1);
    // Check it's the checkmark path (d starts with "M20 6")
    const path = svgs[0].querySelector('path');
    expect(path?.getAttribute('d')).toBe('M20 6 9 17l-5-5');
  });

  it('should have proper aria-label', () => {
    render(<CopyButton value="test" label="Fingerprint" />);
    expect(screen.getByLabelText('Copiar Fingerprint')).toBeDefined();
  });

  it('should use default label when no label prop given', () => {
    render(<CopyButton value="test" />);
    expect(screen.getByLabelText('Copiar valor')).toBeDefined();
  });
});
