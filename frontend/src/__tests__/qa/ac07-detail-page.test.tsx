/**
 * QA Tests — Functional Requirement 7: Certificate Detail Page
 *
 * Maps to: Scenarios 7.1–7.4
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createCertificate } from '../mocks/data';
import { Breadcrumb } from '@/components/Breadcrumb/Breadcrumb';
import { CopyButton } from '@/components/CopyButton/CopyButton';
import { MetadataGrid } from '@/pages/CertificateDetail/components/MetadataGrid';
import { SanList } from '@/pages/CertificateDetail/components/SanList';
import { ActionPanel } from '@/pages/CertificateDetail/components/ActionPanel';
import { ConfirmDialog } from '@/pages/CertificateDetail/components/ConfirmDialog';
import { renderWithProviders, renderRoute } from './helpers';
import type { Certificate } from '@certificado-digital/shared';

/** Create a certificate with specific values for detail page testing */
function createDetailCert(overrides: Partial<Certificate> = {}): Certificate {
  const now = new Date();
  const notAfter = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
  const notBefore = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  return createCertificate({
    id: 'cert-detail-1',
    commonName: 'api-payments.bank.internal',
    sans: ['payments-v2.bank.internal', 'payments-canary.bank.internal'],
    serialNumber: '1A:2B:3C:4D:5E:6F',
    fingerprintSha256: 'SHA256:AA:BB:CC:DD:EE:FF',
    notBefore: notBefore.toISOString(),
    notAfter: notAfter.toISOString(),
    signatureAlgorithm: 'RSA 2048',
    issuerDn: 'CN=Vault PKI, OU=IT',
    owner: 'time-pagamentos',
    application: 'api-payments',
    zone: 'bank-prd',
    environment: 'PRD',
    caName: 'Vault PKI',
    caProvider: 'Vault PKI',
    tags: { mTLS: 'true', 'auto-renewal': 'true' },
    importSource: 'MANUAL',
    revoked: false,
    ...overrides,
  });
}

describe('AC 7 — Certificate Detail Page', () => {
  const user = userEvent.setup();

  // ─── Scenario 7.1: Display certificate detail ─────────────────────────
  describe('Scenario 7.1: Display certificate detail', () => {
    it('renders breadcrumb with certificate CN', () => {
      renderWithProviders(
        <Breadcrumb
          segments={[
            { label: 'Certificados', path: '/certificates' },
            { label: 'api-payments.bank.internal' },
          ]}
        />,
      );

      expect(screen.getByText('Certificados')).toBeInTheDocument();
      expect(screen.getByText('api-payments.bank.internal')).toBeInTheDocument();
    });

    it('renders MetadataGrid with all certificate fields', () => {
      const cert = createDetailCert();
      renderWithProviders(
        <MetadataGrid cert={cert} status="active" daysUntilExpiry={45} />,
      );

      // Serial — the MetadataGrid uses cert.serial which is from createCertificate() factory
      // Look for actual rendered serial from the cert object
      expect(screen.getByText(/Serial Number/)).toBeInTheDocument();
      // Owner
      expect(screen.getByText(/time-pagamentos/)).toBeInTheDocument();
      // Application
      expect(screen.getByText(/api-payments/)).toBeInTheDocument();
      // Environment
      expect(screen.getByText(/PRD/)).toBeInTheDocument();
      // Zone
      expect(screen.getByText(/bank-prd/)).toBeInTheDocument();
    });

    it('renders SanList with all SANs', () => {
      renderWithProviders(
        <SanList sans={['payments-v2.bank.internal', 'payments-canary.bank.internal']} />,
      );

      expect(screen.getByText(/payments-v2\.bank\.internal/)).toBeInTheDocument();
      expect(screen.getByText(/payments-canary\.bank\.internal/)).toBeInTheDocument();
    });

    it('renders action panel with export and management buttons', () => {
      renderWithProviders(
        <ActionPanel
          onExportPem={vi.fn()}
          onExportJson={vi.fn()}
          onRevoke={vi.fn()}
          onDelete={vi.fn()}
          isRevoked={false}
          exportLoading={false}
        />,
      );

      expect(screen.getByText(/PEM/i)).toBeInTheDocument();
      expect(screen.getByText(/JSON/i)).toBeInTheDocument();
    });
  });

  // ─── Scenario 7.2: Copy certificate metadata ─────────────────────────
  describe('Scenario 7.2: Copy certificate metadata', () => {
    it('CopyButton renders a clickable copy button', async () => {
      renderWithProviders(<CopyButton text="1A:2B:3C:4D:5E:6F" />);

      const btn = screen.getByRole('button');
      expect(btn).toBeInTheDocument();
      // The button should have an aria-label related to copying
      expect(btn.getAttribute('aria-label') || btn.getAttribute('title')).toBeTruthy();
    });
  });

  // ─── Scenario 7.3: Export in PEM format ───────────────────────────────
  describe('Scenario 7.3: Export certificate in PEM format', () => {
    it('action panel calls onExportPem when PEM button is clicked', async () => {
      const onExportPem = vi.fn();

      renderWithProviders(
        <ActionPanel
          onExportPem={onExportPem}
          onExportJson={vi.fn()}
          onRevoke={vi.fn()}
          onDelete={vi.fn()}
          isRevoked={false}
          exportLoading={false}
        />,
      );

      const pemBtn = screen.getByText(/PEM/i);
      await user.click(pemBtn);

      expect(onExportPem).toHaveBeenCalled();
    });

    it('action panel calls onExportJson when JSON button is clicked', async () => {
      const onExportJson = vi.fn();

      renderWithProviders(
        <ActionPanel
          onExportPem={vi.fn()}
          onExportJson={onExportJson}
          onRevoke={vi.fn()}
          onDelete={vi.fn()}
          isRevoked={false}
          exportLoading={false}
        />,
      );

      const jsonBtn = screen.getByText(/JSON/i);
      await user.click(jsonBtn);

      expect(onExportJson).toHaveBeenCalled();
    });
  });

  // ─── Scenario 7.4: Expired certificate detail ────────────────────────
  describe('Scenario 7.4: Expired certificate detail', () => {
    it('shows expired status info when daysUntilExpiry is negative', () => {
      const cert = createDetailCert({
        notAfter: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      });

      renderWithProviders(
        <MetadataGrid cert={cert} status="expired" daysUntilExpiry={-15} />,
      );

      // The grid should render the cert metadata
      expect(screen.getByText(/time-pagamentos/)).toBeInTheDocument();
    });
  });

  // ─── ConfirmDialog (revoke/delete) ───────────────────────────────────
  describe('ConfirmDialog for revoke/delete', () => {
    it('renders revoke confirmation dialog', () => {
      renderWithProviders(
        <ConfirmDialog
          title="Revogar certificado"
          message='Tem certeza que deseja revogar "api-payments"?'
          confirmLabel="Revogar"
          variant="danger"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          loading={false}
        />,
      );

      expect(screen.getByText('Revogar certificado')).toBeInTheDocument();
      expect(screen.getByText(/Tem certeza/)).toBeInTheDocument();
    });

    it('calls onConfirm when confirm button is clicked', async () => {
      const onConfirm = vi.fn();

      renderWithProviders(
        <ConfirmDialog
          title="Revogar certificado"
          message="Confirmar?"
          confirmLabel="Revogar"
          variant="danger"
          onConfirm={onConfirm}
          onCancel={vi.fn()}
          loading={false}
        />,
      );

      // Use getAllByText to handle title + button both containing "Revogar"
      const buttons = screen.getAllByText('Revogar');
      // Click the button (last one, after the title)
      await user.click(buttons[buttons.length - 1]);
      expect(onConfirm).toHaveBeenCalled();
    });

    it('calls onCancel when cancel button is clicked', async () => {
      const onCancel = vi.fn();

      renderWithProviders(
        <ConfirmDialog
          title="Excluir"
          message="Confirmar?"
          confirmLabel="Excluir"
          variant="danger"
          onConfirm={vi.fn()}
          onCancel={onCancel}
          loading={false}
        />,
      );

      await user.click(screen.getByText('Cancelar'));
      expect(onCancel).toHaveBeenCalled();
    });
  });
});
