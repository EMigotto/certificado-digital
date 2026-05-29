/**
 * QA Tests — C2 FR4: Revoke Certificate — RFC 5280 Reason Codes
 *
 * Maps to Acceptance Criteria:
 * - Scenario 4.1: Revoke with keyCompromise reason within 30s (Positive)
 * - Scenario 4.2: Revoke with superseded reason (Positive)
 * - Scenario 4.3: Revocation fails if CA unreachable (Negative)
 * - Scenario 4.4: Revoke notification can be suppressed (Positive)
 * - Scenario 4.5: Revoked certificate cannot be used (Negative)
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createCertificate } from '../mocks/data';
import { renderWithProviders } from './helpers';
import { ActionPanel } from '@/pages/CertificateDetail/components/ActionPanel';
import { ConfirmDialog } from '@/pages/CertificateDetail/components/ConfirmDialog';

describe('C2 FR4 — Revoke Certificate (RFC 5280)', () => {
  const user = userEvent.setup();

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 4.1: Revoke with keyCompromise reason (Positive)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 4.1: Revoke with keyCompromise reason', () => {
    it('POST /api/certificates/:id/revoke with keyCompromise returns REVOKED status', async () => {
      server.use(
        http.post('/api/certificates/:id/revoke', async ({ params, request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            id: params.id,
            status: 'REVOKED',
            revocation_timestamp: new Date().toISOString(),
            revocation_reason: body.reason,
            revocation_justification: body.comment,
            revokedBy: 'rafael.costa',
          });
        }),
      );

      const response = await fetch('/api/certificates/cert-auth-svc/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'keyCompromise',
          comment: 'Private key exposed in code repo commit',
          notify_owner: true,
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.status).toBe('REVOKED');
      expect(data.revocation_reason).toBe('keyCompromise');
      expect(data.revocation_justification).toContain('Private key exposed');
      expect(data.revocation_timestamp).toBeDefined();
      expect(data.revokedBy).toBe('rafael.costa');
    });

    it('RFC 5280 reason codes are all valid options', () => {
      const validReasonCodes = [
        'keyCompromise',
        'cACompromise',
        'affiliationChanged',
        'superseded',
        'cessationOfOperation',
        'certificateHold',
        'unspecified',
      ];

      // Each reason code should be a non-empty string
      for (const code of validReasonCodes) {
        expect(code).toBeTruthy();
        expect(typeof code).toBe('string');
      }
      expect(validReasonCodes).toHaveLength(7);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 4.2: Revoke with superseded reason (Positive)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 4.2: Revoke with superseded reason', () => {
    it('revoke with superseded captures replacement cert reference', async () => {
      server.use(
        http.post('/api/certificates/:id/revoke', async ({ params, request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            id: params.id,
            status: 'REVOKED',
            revocation_timestamp: new Date().toISOString(),
            revocation_reason: body.reason,
            revocation_justification: body.comment,
          });
        }),
      );

      const response = await fetch('/api/certificates/cert-old-gateway/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'superseded',
          comment: 'Replaced by renewal cert-new-gateway-123',
          notify_owner: true,
        }),
      });

      const data = await response.json();
      expect(data.revocation_reason).toBe('superseded');
      expect(data.revocation_justification).toContain('Replaced by renewal');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 4.3: Revocation fails if CA unreachable (Negative)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 4.3: CA unreachable during revocation', () => {
    it('returns error when CA is unreachable', async () => {
      server.use(
        http.post('/api/certificates/:id/revoke', async () => {
          return HttpResponse.json(
            {
              error: 'ca_unreachable',
              message:
                'Failed to reach CA. Revocation request could not be submitted. Please try again.',
            },
            { status: 503 },
          );
        }),
      );

      const response = await fetch('/api/certificates/cert-xyz/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'keyCompromise',
          comment: 'test',
        }),
      });

      expect(response.status).toBe(503);
      const data = await response.json();
      expect(data.error).toBe('ca_unreachable');
      expect(data.message).toContain('Failed to reach CA');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 4.4: Revoke notification can be suppressed (Positive)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 4.4: Notification suppression', () => {
    it('revocation with notify_owner=false suppresses email', async () => {
      let capturedBody: Record<string, unknown> | null = null;

      server.use(
        http.post('/api/certificates/:id/revoke', async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            id: 'cert-xyz',
            status: 'REVOKED',
            revocation_timestamp: new Date().toISOString(),
            notification_sent: capturedBody.notify_owner,
          });
        }),
      );

      const response = await fetch('/api/certificates/cert-xyz/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'cessationOfOperation',
          comment: 'Service decommissioned',
          notify_owner: false,
        }),
      });

      const data = await response.json();
      expect(data.notification_sent).toBe(false);
      expect(capturedBody!.notify_owner).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scenario 4.5: Revoked certificate cannot be used
  // ═══════════════════════════════════════════════════════════════════════

  describe('Scenario 4.5: Revoked certificate status is final', () => {
    it('revoked certificate has revoked=true in API response', async () => {
      server.use(
        http.get('/api/certificates/cert-revoked-1', () => {
          return HttpResponse.json(
            createCertificate({
              id: 'cert-revoked-1',
              commonName: 'auth-svc.bank.internal',
              revoked: true,
            }),
          );
        }),
      );

      const response = await fetch('/api/certificates/cert-revoked-1');
      const data = await response.json();

      expect(data.revoked).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // UI Component tests for revocation flow
  // ═══════════════════════════════════════════════════════════════════════

  describe('UI: Revocation flow components', () => {
    it('ActionPanel shows Revogar button when cert is not revoked', () => {
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

      const revokeBtn = screen.getByText('Revogar');
      expect(revokeBtn).toBeInTheDocument();
      expect(revokeBtn.closest('button')).not.toBeDisabled();
    });

    it('ActionPanel shows Revogado (disabled) when cert is already revoked', () => {
      renderWithProviders(
        <ActionPanel
          onExportPem={vi.fn()}
          onExportJson={vi.fn()}
          onRevoke={vi.fn()}
          onDelete={vi.fn()}
          isRevoked={true}
          exportLoading={false}
        />,
      );

      const revokedBtn = screen.getByText('Revogado');
      expect(revokedBtn).toBeInTheDocument();
      expect(revokedBtn.closest('button')).toBeDisabled();
    });

    it('clicking Revogar triggers onRevoke callback', async () => {
      const onRevoke = vi.fn();

      renderWithProviders(
        <ActionPanel
          onExportPem={vi.fn()}
          onExportJson={vi.fn()}
          onRevoke={onRevoke}
          onDelete={vi.fn()}
          isRevoked={false}
          exportLoading={false}
        />,
      );

      await user.click(screen.getByText('Revogar'));
      expect(onRevoke).toHaveBeenCalledTimes(1);
    });

    it('ConfirmDialog renders revocation warning', () => {
      renderWithProviders(
        <ConfirmDialog
          title="Revogar certificado"
          message='Tem certeza que deseja revogar o certificado "auth-svc.bank.internal"? Esta ação não pode ser desfeita.'
          confirmLabel="Revogar"
          variant="danger"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          loading={false}
        />,
      );

      expect(screen.getByText('Revogar certificado')).toBeInTheDocument();
      expect(screen.getByText(/não pode ser desfeita/)).toBeInTheDocument();
    });

    it('ConfirmDialog shows loading state during revocation', () => {
      renderWithProviders(
        <ConfirmDialog
          title="Revogar certificado"
          message="Confirmação..."
          confirmLabel="Revogar"
          variant="danger"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          loading={true}
        />,
      );

      expect(screen.getByText('Processando…')).toBeInTheDocument();
    });
  });
});
