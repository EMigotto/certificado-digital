import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/Button/Button';

describe('Button', () => {
  it('renders children text', () => {
    render(<Button>Emitir certificado</Button>);
    expect(screen.getByText('Emitir certificado')).toBeInTheDocument();
  });

  it('renders as primary by default', () => {
    const { container } = render(<Button>Primary</Button>);
    expect(container.querySelector('.primary')).toBeInTheDocument();
  });

  it('renders secondary variant', () => {
    const { container } = render(<Button variant="secondary">Cancel</Button>);
    expect(container.querySelector('.secondary')).toBeInTheDocument();
  });

  it('renders danger variant', () => {
    const { container } = render(<Button variant="danger">Revogar</Button>);
    expect(container.querySelector('.danger')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByText('Click'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('supports disabled state', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>,
    );
    const btn = screen.getByText('Disabled').closest('button')!;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('supports custom className', () => {
    const { container } = render(<Button className="custom-class">Styled</Button>);
    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });
});
