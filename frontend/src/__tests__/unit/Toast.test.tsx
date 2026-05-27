import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastContainer } from '@/components/Toast/Toast';
import { useUiStore } from '@/store/uiStore';

describe('ToastContainer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Clear toasts before each test
    useUiStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when no toasts', () => {
    const { container } = render(<ToastContainer />);
    expect(container.innerHTML).toBe('');
  });

  it('renders a success toast', () => {
    useUiStore.getState().addToast({ type: 'success', message: 'Certificado importado!' });
    render(<ToastContainer />);
    expect(screen.getByText('Certificado importado!')).toBeInTheDocument();
  });

  it('renders an error toast', () => {
    useUiStore.getState().addToast({ type: 'error', message: 'Erro ao importar.' });
    render(<ToastContainer />);
    expect(screen.getByText('Erro ao importar.')).toBeInTheDocument();
  });

  it('renders an info toast', () => {
    useUiStore.getState().addToast({ type: 'info', message: 'Processando...' });
    render(<ToastContainer />);
    expect(screen.getByText('Processando...')).toBeInTheDocument();
  });

  it('has role="alert" for accessibility', () => {
    useUiStore.getState().addToast({ type: 'success', message: 'test' });
    render(<ToastContainer />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('removes toast when close button clicked', () => {
    useUiStore.getState().addToast({ type: 'success', message: 'Dismiss me' });
    render(<ToastContainer />);

    const closeBtn = screen.getByLabelText('Fechar notificação');
    fireEvent.click(closeBtn);

    expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument();
  });

  it('auto-dismisses toast after 5 seconds', () => {
    useUiStore.getState().addToast({ type: 'info', message: 'Auto dismiss' });
    render(<ToastContainer />);
    expect(screen.getByText('Auto dismiss')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5100);
    });

    expect(useUiStore.getState().toasts).toHaveLength(0);
  });

  it('renders multiple toasts simultaneously', () => {
    useUiStore.getState().addToast({ type: 'success', message: 'Toast 1' });
    useUiStore.getState().addToast({ type: 'error', message: 'Toast 2' });
    render(<ToastContainer />);
    expect(screen.getByText('Toast 1')).toBeInTheDocument();
    expect(screen.getByText('Toast 2')).toBeInTheDocument();
  });
});
