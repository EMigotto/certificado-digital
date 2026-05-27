import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import { Badge } from '@/components/Badge/Badge';
import { Button } from '@/components/Button/Button';
import { Modal } from '@/components/Modal/Modal';
import { useUiStore } from '@/store/uiStore';

/* ── Sidebar ── */
describe('Sidebar', () => {
  it('should render brand name and subtitle', () => {
    render(
      <MemoryRouter initialEntries={['/certificates']}>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText('cipher')).toBeDefined();
    expect(screen.getByText('mTLS Control Plane')).toBeDefined();
  });

  it('should render all navigation sections', () => {
    render(
      <MemoryRouter initialEntries={['/certificates']}>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText('Operação')).toBeDefined();
    expect(screen.getByText('Governança')).toBeDefined();
    expect(screen.getByText('Sistema')).toBeDefined();
  });

  it('should render all nav items', () => {
    render(
      <MemoryRouter initialEntries={['/certificates']}>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText('Dashboard')).toBeDefined();
    expect(screen.getByText('Certificados')).toBeDefined();
    expect(screen.getByText('Expirando')).toBeDefined();
    expect(screen.getByText('Requisições')).toBeDefined();
    expect(screen.getByText('Zonas')).toBeDefined();
    expect(screen.getByText('CAs')).toBeDefined();
    expect(screen.getByText('Audit Log')).toBeDefined();
    expect(screen.getByText('API & CLI')).toBeDefined();
  });

  it('should render badges with counts', () => {
    render(
      <MemoryRouter initialEntries={['/certificates']}>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText('2.847')).toBeDefined();
    expect(screen.getByText('23')).toBeDefined();
  });

  it('should render user card', () => {
    render(
      <MemoryRouter initialEntries={['/certificates']}>
        <Sidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText('RC')).toBeDefined();
    expect(screen.getByText('Rafael Costa')).toBeDefined();
    expect(screen.getByText('pki-admin · zone:bank')).toBeDefined();
  });

  it('should mark active nav item based on route', () => {
    render(
      <MemoryRouter initialEntries={['/certificates']}>
        <Sidebar />
      </MemoryRouter>,
    );
    const certButton = screen.getByRole('button', { name: 'Certificados' });
    expect(certButton.getAttribute('aria-current')).toBe('page');
  });
});

/* ── Badge ── */
describe('Badge', () => {
  it('should render ok variant', () => {
    render(<Badge variant="ok">Válido</Badge>);
    expect(screen.getByText('Válido')).toBeDefined();
  });

  it('should render warn variant', () => {
    render(<Badge variant="warn">Atenção</Badge>);
    expect(screen.getByText('Atenção')).toBeDefined();
  });

  it('should render crit variant', () => {
    render(<Badge variant="crit">Crítico</Badge>);
    expect(screen.getByText('Crítico')).toBeDefined();
  });

  it('should render rev variant', () => {
    render(<Badge variant="rev">Revogado</Badge>);
    expect(screen.getByText('Revogado')).toBeDefined();
  });
});

/* ── Button ── */
describe('Button', () => {
  it('should render primary button', () => {
    render(<Button variant="primary">Emitir certificado</Button>);
    expect(screen.getByText('Emitir certificado')).toBeDefined();
  });

  it('should render secondary button', () => {
    render(<Button variant="secondary">Cancelar</Button>);
    expect(screen.getByText('Cancelar')).toBeDefined();
  });

  it('should render danger button', () => {
    render(<Button variant="danger">Revogar</Button>);
    expect(screen.getByText('Revogar')).toBeDefined();
  });

  it('should handle click events', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);
    screen.getByText('Click me').click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('should support disabled state', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByText('Disabled').closest('button')?.disabled).toBe(true);
  });
});

/* ── Modal ── */
describe('Modal', () => {
  it('should render title and children', () => {
    render(
      <Modal title="Confirmar ação" onClose={() => {}}>
        <p>Conteúdo do modal</p>
      </Modal>,
    );
    expect(screen.getByText('Confirmar ação')).toBeDefined();
    expect(screen.getByText('Conteúdo do modal')).toBeDefined();
  });

  it('should have close button with aria-label', () => {
    render(
      <Modal title="Test" onClose={() => {}}>
        Content
      </Modal>,
    );
    expect(screen.getByLabelText('Fechar modal')).toBeDefined();
  });
});

/* ── uiStore ── */
describe('uiStore', () => {
  it('should toggle sidebar', () => {
    const store = useUiStore.getState();
    expect(store.sidebarOpen).toBe(false);
    store.toggleSidebar();
    expect(useUiStore.getState().sidebarOpen).toBe(true);
    store.toggleSidebar();
    expect(useUiStore.getState().sidebarOpen).toBe(false);
  });

  it('should manage toast queue', () => {
    const store = useUiStore.getState();
    store.addToast({ type: 'success', message: 'Certificado importado!' });
    const toasts = useUiStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe('Certificado importado!');
    expect(toasts[0].type).toBe('success');

    store.removeToast(toasts[0].id);
    expect(useUiStore.getState().toasts).toHaveLength(0);
  });

  it('should manage modal stack', () => {
    const store = useUiStore.getState();
    store.pushModal({ id: 'm1', title: 'Confirm' });
    store.pushModal({ id: 'm2', title: 'Nested' });
    expect(useUiStore.getState().modals).toHaveLength(2);

    store.popModal();
    expect(useUiStore.getState().modals).toHaveLength(1);
    expect(useUiStore.getState().modals[0].id).toBe('m1');

    store.clearModals();
    expect(useUiStore.getState().modals).toHaveLength(0);
  });
});
