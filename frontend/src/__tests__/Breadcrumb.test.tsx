import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Breadcrumb } from '@/components/Breadcrumb/Breadcrumb';

describe('Breadcrumb', () => {
  it('should render all segments', () => {
    render(
      <MemoryRouter>
        <Breadcrumb
          segments={[
            { label: 'Certificados', path: '/certificates' },
            { label: 'api-payments.bank.internal' },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Certificados')).toBeDefined();
    expect(screen.getByText('api-payments.bank.internal')).toBeDefined();
  });

  it('should render separator between segments', () => {
    render(
      <MemoryRouter>
        <Breadcrumb
          segments={[
            { label: 'Certificados', path: '/certificates' },
            { label: 'detail' },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('›')).toBeDefined();
  });

  it('should make first segment clickable when path is provided', () => {
    render(
      <MemoryRouter>
        <Breadcrumb
          segments={[
            { label: 'Certificados', path: '/certificates' },
            { label: 'detail' },
          ]}
        />
      </MemoryRouter>,
    );
    const link = screen.getByText('Certificados');
    expect(link.tagName).toBe('BUTTON');
  });

  it('should make last segment non-clickable', () => {
    render(
      <MemoryRouter>
        <Breadcrumb
          segments={[
            { label: 'Certificados', path: '/certificates' },
            { label: 'detail' },
          ]}
        />
      </MemoryRouter>,
    );
    const last = screen.getByText('detail');
    expect(last.tagName).toBe('SPAN');
  });

  it('should have nav aria-label', () => {
    render(
      <MemoryRouter>
        <Breadcrumb segments={[{ label: 'Home' }]} />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('Breadcrumb')).toBeDefined();
  });
});
