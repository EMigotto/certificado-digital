import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar/Sidebar';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('Sidebar', () => {
  it('renders brand name "cipher"', () => {
    render(
      <MemoryRouter initialEntries={['/certificates']}>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText('cipher')).toBeInTheDocument();
  });

  it('renders subtitle "mTLS Control Plane"', () => {
    render(
      <MemoryRouter initialEntries={['/certificates']}>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText('mTLS Control Plane')).toBeInTheDocument();
  });

  it('renders all 3 navigation sections', () => {
    render(
      <MemoryRouter initialEntries={['/certificates']}>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText('Operação')).toBeInTheDocument();
    expect(screen.getByText('Governança')).toBeInTheDocument();
    expect(screen.getByText('Sistema')).toBeInTheDocument();
  });

  it('renders all 8 nav items from prototype', () => {
    render(
      <MemoryRouter initialEntries={['/certificates']}>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Certificados')).toBeInTheDocument();
    expect(screen.getByText('Expirando')).toBeInTheDocument();
    expect(screen.getByText('Requisições')).toBeInTheDocument();
    expect(screen.getByText('Zonas')).toBeInTheDocument();
    expect(screen.getByText('CAs')).toBeInTheDocument();
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
    expect(screen.getByText('API & CLI')).toBeInTheDocument();
  });

  it('renders badges with correct counts', () => {
    render(
      <MemoryRouter initialEntries={['/certificates']}>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText('2.847')).toBeInTheDocument();
    expect(screen.getByText('23')).toBeInTheDocument();
  });

  it('renders user card with initials and info', () => {
    render(
      <MemoryRouter initialEntries={['/certificates']}>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText('RC')).toBeInTheDocument();
    expect(screen.getByText('Rafael Costa')).toBeInTheDocument();
    expect(screen.getByText('pki-admin · zone:bank')).toBeInTheDocument();
  });

  it('marks Certificados as active on /certificates route', () => {
    render(
      <MemoryRouter initialEntries={['/certificates']}>
        <Sidebar />
      </MemoryRouter>,
    );
    const certButton = screen.getByRole('button', { name: 'Certificados' });
    expect(certButton).toHaveAttribute('aria-current', 'page');
  });

  it('marks Dashboard as active on /dashboard route', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar />
      </MemoryRouter>,
    );
    const dashButton = screen.getByRole('button', { name: 'Dashboard' });
    expect(dashButton).toHaveAttribute('aria-current', 'page');
  });

  it('navigates on nav item click', () => {
    render(
      <MemoryRouter initialEntries={['/certificates']}>
        <Sidebar />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Audit Log' }));
    expect(mockNavigate).toHaveBeenCalledWith('/audit');
  });

  it('has correct navigation aria-label', () => {
    render(
      <MemoryRouter initialEntries={['/certificates']}>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
  });
});
