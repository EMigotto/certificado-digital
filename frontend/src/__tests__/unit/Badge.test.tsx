import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/Badge/Badge';

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge variant="ok">Válido</Badge>);
    expect(screen.getByText('Válido')).toBeInTheDocument();
  });

  it('renders ok variant with dot', () => {
    const { container } = render(<Badge variant="ok">Active</Badge>);
    expect(container.querySelector('.dot')).toBeInTheDocument();
    expect(container.querySelector('.ok')).toBeInTheDocument();
  });

  it('renders warn variant', () => {
    const { container } = render(<Badge variant="warn">Atenção</Badge>);
    expect(container.querySelector('.warn')).toBeInTheDocument();
  });

  it('renders crit variant', () => {
    const { container } = render(<Badge variant="crit">Crítico</Badge>);
    expect(container.querySelector('.crit')).toBeInTheDocument();
  });

  it('renders rev variant', () => {
    const { container } = render(<Badge variant="rev">Revogado</Badge>);
    expect(container.querySelector('.rev')).toBeInTheDocument();
  });

  it('renders pending variant with animated dot', () => {
    const { container } = render(<Badge variant="pending">Pendente</Badge>);
    expect(container.querySelector('.pending')).toBeInTheDocument();
    expect(container.querySelector('.dot')).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
  });

  it('renders issued variant', () => {
    const { container } = render(<Badge variant="issued">Emitido</Badge>);
    expect(container.querySelector('.issued')).toBeInTheDocument();
    expect(screen.getByText('Emitido')).toBeInTheDocument();
  });

  it('renders renewed variant', () => {
    const { container } = render(<Badge variant="renewed">Renewed</Badge>);
    expect(container.querySelector('.renewed')).toBeInTheDocument();
    expect(screen.getByText('Renewed')).toBeInTheDocument();
  });

  it('renders with correct semantic structure (span with dot)', () => {
    const { container } = render(<Badge variant="ok">Test</Badge>);
    const badge = container.querySelector('.badge');
    expect(badge).toBeInTheDocument();
    expect(badge?.querySelector('.dot')).toBeInTheDocument();
    expect(badge?.textContent).toContain('Test');
  });
});
