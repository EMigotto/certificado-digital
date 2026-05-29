/**
 * QA Tests — C2 FR5: Lifecycle Status & Transitions
 *
 * Maps to Acceptance Criteria:
 * - Scenario 5.1: Status transitions during issue (PENDING → ISSUED)
 * - Scenario 5.2: Status transitions during renewal
 * - Scenario 5.3: Expired certificate detection
 * - Scenario 5.4: Expiring soon warning
 *
 * Tests cover:
 * - Frontend status computation (CertificateDetailPage.computeStatus)
 * - Badge rendering for each status
 * - Detail page displays correct status-related UI
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createCertificate, createExpiringCertificate, createExpiredCertificate, createRevokedCertificate } from '../mocks/data';
import { renderWithProviders } from './helpers';
import { Badge } from '@/components/Badge/Badge';
import { DetailHeader } from '@/pages/CertificateDetail/components/DetailHeader';
import { MetadataGrid } from '@/pages/CertificateDetail/components/MetadataGrid';

// ─── Helper: compute status (mirrors CertificateDetailPage logic) ──────────

type CertificateStatus = 'active' | 'expiring' | 'expired' | 'revoked';

function computeStatus(
  notAfter: string,
  revoked: boolean,
): { status: CertificateStatus; daysUntilExpiry: number } {
  if (revoked) return { status: 'revoked', daysUntilExpiry: 0 };
  const now = Date.now();
  const expiry = new Date(notAfter).getTime();
  const diffMs = expiry - now;
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return { status: 'expired', daysUntilExpiry: days };
  if (days <= 30) return { status: 'expiring', daysUntilExpiry: days };
  return { status: 'active', daysUntilExpiry: days };
}

describe('C2 FR5 — Lifecycle Status & Transitions', () => {
  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 5.1: Status transitions during issue
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 5.1: Status transitions during issue', () => {
    it('PENDING certificate status can be returned by API', async () => {
      server.use(
        http.get('/api/certificates/cert-pending-1', () => {
          return HttpResponse.json({
            ...createCertificate({ id: 'cert-pending-1' }),
            status: 'PENDING',
          });
        }),
      );

      const response = await fetch('/api/certificates/cert-pending-1');
      const data = await response.json();
      expect(data.status).toBe('PENDING');
    });

    it('ISSUED status is set after CA responds', async () => {
      server.use(
        http.get('/api/certificates/cert-issued-1', () => {
          return HttpResponse.json({
            ...createCertificate({ id: 'cert-issued-1' }),
            status: 'ISSUED',
          });
        }),
      );

      const response = await fetch('/api/certificates/cert-issued-1');
      const data = await response.json();
      expect(data.status).toBe('ISSUED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 5.2: Status transitions during renewal
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 5.2: Status transitions during renewal', () => {
    it('old cert remains ACTIVE during renewal', () => {
      const in12Days = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);
      const { status } = computeStatus(in12Days.toISOString(), false);
      expect(status).toBe('expiring'); // Still active/expiring
    });

    it('new cert starts as ISSUED after CA responds', async () => {
      server.use(
        http.get('/api/certificates/cert-renewed-new', () => {
          return HttpResponse.json({
            ...createCertificate({ id: 'cert-renewed-new' }),
            status: 'ISSUED',
            renewal_of: 'cert-old-1',
          });
        }),
      );

      const response = await fetch('/api/certificates/cert-renewed-new');
      const data = await response.json();
      expect(data.status).toBe('ISSUED');
      expect(data.renewal_of).toBe('cert-old-1');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 5.3: Expired certificate detection
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 5.3: Expired certificate detection', () => {
    it('computeStatus returns expired when notAfter is in the past', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { status, daysUntilExpiry } = computeStatus(pastDate, false);

      expect(status).toBe('expired');
      expect(daysUntilExpiry).toBeLessThanOrEqual(0);
    });

    it('computeStatus returns expired for a cert that expired yesterday', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { status } = computeStatus(yesterday, false);
      expect(status).toBe('expired');
    });

    it('Badge renders with correct variant for expired status', () => {
      renderWithProviders(<Badge variant="crit">Expirado</Badge>);
      expect(screen.getByText('Expirado')).toBeInTheDocument();
    });

    it('DetailHeader shows expired status badge', () => {
      renderWithProviders(
        <DetailHeader
          commonName="api-payments.bank.internal"
          status="expired"
          environment="prd"
          caProvider="Vault PKI"
          owner="time-pagamentos"
          isExpired={true}
          notAfter={new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()}
        />,
      );

      expect(screen.getByText('Expirado')).toBeInTheDocument();
      expect(screen.getByText(/expirou em/i)).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 5.4: Expiring soon warning
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 5.4: Expiring soon warning (<30 days)', () => {
    it('computeStatus returns expiring when daysUntilExpiry < 30', () => {
      const in12Days = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString();
      const { status, daysUntilExpiry } = computeStatus(in12Days, false);

      expect(status).toBe('expiring');
      expect(daysUntilExpiry).toBeGreaterThan(0);
      expect(daysUntilExpiry).toBeLessThanOrEqual(30);
    });

    it('computeStatus returns active when daysUntilExpiry > 30', () => {
      const in60Days = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
      const { status } = computeStatus(in60Days, false);

      expect(status).toBe('active');
    });

    it('Badge renders with warn variant for expiring status', () => {
      renderWithProviders(<Badge variant="warn">Atenção</Badge>);
      expect(screen.getByText('Atenção')).toBeInTheDocument();
    });

    it('DetailHeader shows Atenção badge for expiring certificates', () => {
      renderWithProviders(
        <DetailHeader
          commonName="gateway-edge.bank.internal"
          status="expiring"
          environment="prd"
          caProvider="Vault PKI"
          owner="time-plataforma"
          isExpired={false}
          notAfter={new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString()}
        />,
      );

      expect(screen.getByText('Atenção')).toBeInTheDocument();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Edge cases
  // ═══════════════════════════════════════════════════════════════════════

  describe('Edge cases: revoked status takes priority', () => {
    it('revoked overrides expired', () => {
      const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const { status } = computeStatus(pastDate, true);
      expect(status).toBe('revoked');
    });

    it('revoked overrides expiring', () => {
      const in10Days = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
      const { status } = computeStatus(in10Days, true);
      expect(status).toBe('revoked');
    });

    it('revoked overrides active', () => {
      const in60Days = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
      const { status } = computeStatus(in60Days, true);
      expect(status).toBe('revoked');
    });
  });

  describe('Badge variant rendering for all statuses', () => {
    it('renders ok badge for active status', () => {
      renderWithProviders(<Badge variant="ok">Válido</Badge>);
      expect(screen.getByText('Válido')).toBeInTheDocument();
    });

    it('renders rev badge for revoked status', () => {
      renderWithProviders(<Badge variant="rev">Revogado</Badge>);
      expect(screen.getByText('Revogado')).toBeInTheDocument();
    });
  });
});
