import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetadataGrid } from '@/pages/CertificateDetail/components/MetadataGrid';
import type { Certificate } from '@certificado-digital/shared';

// Mock clipboard + toast store
vi.mock('@/store/uiStore', () => {
  const addToast = vi.fn();
  return {
    useUiStore: (selector: (s: { addToast: typeof addToast }) => unknown) =>
      selector({ addToast }),
  };
});

const mockCert: Certificate = {
  id: 'cert-1',
  commonName: 'api-payments.bank.internal',
  sans: ['payments-v2', 'payments-canary'],
  serial: 'AA:BB:CC:DD:EE:FF',
  issuer: 'CN=Vault PKI Intermediate CA',
  notBefore: '2024-01-15T00:00:00Z',
  notAfter: '2025-01-15T00:00:00Z',
  algorithm: 'RSA 2048',
  fingerprintSha256: 'AB:CD:EF:12:34:56:78:9A:BC:DE:F0:12:34:56:78:9A:BC:DE:F0:12:34:56:78:9A:BC:DE:F0:12:34:56:78:9A',
  owner: 'time-pagamentos',
  application: 'payments-api',
  environment: 'prd',
  zone: 'bank-prd',
  caProvider: 'Vault PKI',
  revoked: false,
  tags: { team: 'payments', tier: 'p0' },
  customFields: {},
  description: 'API principal de pagamentos',
  createdAt: '2024-01-15T00:00:00Z',
  updatedAt: '2024-01-15T00:00:00Z',
};

describe('MetadataGrid', () => {
  it('should render all key metadata fields', () => {
    render(<MetadataGrid cert={mockCert} status="active" daysUntilExpiry={180} />);

    const grid = screen.getByTestId('metadata-grid');
    expect(grid).toBeDefined();

    // Serial
    expect(screen.getByText('AA:BB:CC:DD:EE:FF')).toBeDefined();

    // Algorithm
    expect(screen.getByText('RSA 2048')).toBeDefined();

    // Owner
    expect(screen.getByText('time-pagamentos')).toBeDefined();

    // Application
    expect(screen.getByText('payments-api')).toBeDefined();

    // Zone
    expect(screen.getByText('bank-prd')).toBeDefined();

    // Environment
    expect(screen.getByText('prd')).toBeDefined();

    // CA Provider
    expect(screen.getByText('Vault PKI')).toBeDefined();
  });

  it('should render tags as comma-separated values', () => {
    render(<MetadataGrid cert={mockCert} status="active" daysUntilExpiry={180} />);
    expect(screen.getByText('team:payments, tier:p0')).toBeDefined();
  });

  it('should render description', () => {
    render(<MetadataGrid cert={mockCert} status="active" daysUntilExpiry={180} />);
    expect(screen.getByText('API principal de pagamentos')).toBeDefined();
  });

  it('should show dash for empty optional fields', () => {
    const certNoApp = { ...mockCert, application: '', zone: '', description: '' };
    render(<MetadataGrid cert={certNoApp} status="active" daysUntilExpiry={180} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('should display days until expiry with correct label', () => {
    render(<MetadataGrid cert={mockCert} status="active" daysUntilExpiry={45} />);
    expect(screen.getByText('45 dias')).toBeDefined();
  });

  it('should display expired message for negative days', () => {
    render(<MetadataGrid cert={mockCert} status="expired" daysUntilExpiry={-10} />);
    expect(screen.getByText('Expirado (10 dias atrás)')).toBeDefined();
  });

  it('should have copy buttons for serial and fingerprint', () => {
    render(<MetadataGrid cert={mockCert} status="active" daysUntilExpiry={180} />);
    const copyButtons = screen.getAllByRole('button', { name: /copiar/i });
    // At least serial, fingerprint, and issuer should have copy buttons
    expect(copyButtons.length).toBeGreaterThanOrEqual(3);
  });
});
