import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '@/components/Modal/Modal';

describe('Modal', () => {
  it('renders title and children', () => {
    render(
      <Modal title="Confirmar ação" onClose={() => {}}>
        <p>Conteúdo do modal</p>
      </Modal>,
    );
    expect(screen.getByText('Confirmar ação')).toBeInTheDocument();
    expect(screen.getByText('Conteúdo do modal')).toBeInTheDocument();
  });

  it('has close button with aria-label', () => {
    render(
      <Modal title="Test" onClose={() => {}}>
        Content
      </Modal>,
    );
    expect(screen.getByLabelText('Fechar modal')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal title="Test" onClose={onClose}>
        Content
      </Modal>,
    );
    fireEvent.click(screen.getByLabelText('Fechar modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key pressed', () => {
    const onClose = vi.fn();
    render(
      <Modal title="Test" onClose={onClose}>
        Content
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking overlay background', () => {
    const onClose = vi.fn();
    render(
      <Modal title="Test" onClose={onClose}>
        Content
      </Modal>,
    );
    const overlay = screen.getByRole('dialog');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has correct aria attributes', () => {
    render(
      <Modal title="Confirm" onClose={() => {}}>
        Body
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Confirm');
  });
});
