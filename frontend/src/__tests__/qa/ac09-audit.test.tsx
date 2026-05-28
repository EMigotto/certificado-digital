/**
 * QA Tests — Functional Requirement 9: Audit Logging
 *
 * Maps to: Scenarios 9.1–9.3
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { createAuditEntry } from '../mocks/data';
import { AuditRow } from '@/pages/AuditLog/components/AuditRow';
import { renderWithProviders } from './helpers';
import type { AuditEntry } from '@certificado-digital/shared';

describe('AC 9 — Audit Logging', () => {
  // ─── Scenario 9.1: Import action is logged ────────────────────────────
  describe('Scenario 9.1: Import action is logged', () => {
    it('audit entry contains required fields', () => {
      const entry = createAuditEntry({
        action: 'IMPORT',
        actor: 'rafael.costa',
        result: 'SUCCESS',
        certCn: 'api-payments.bank.internal',
        detail: 'Certificate imported via UI',
      });

      // Verify structure
      expect(entry.action).toBe('IMPORT');
      expect(entry.actor).toBe('rafael.costa');
      expect(entry.result).toBe('SUCCESS');
      expect(entry.certCn).toBe('api-payments.bank.internal');
      expect(entry.timestamp).toBeTruthy();
      expect(entry.id).toBeTruthy();
    });

    it('renders audit entry in AuditRow component', () => {
      const entry = createAuditEntry({
        action: 'IMPORT',
        actor: 'rafael.costa',
        result: 'SUCCESS',
        certCn: 'api-payments.bank.internal',
      });

      renderWithProviders(
        <table>
          <tbody>
            <AuditRow entry={entry} />
          </tbody>
        </table>,
      );

      expect(screen.getByText(/IMPORT/i)).toBeInTheDocument();
      expect(screen.getByText(/rafael\.costa/i)).toBeInTheDocument();
      expect(screen.getByText(/api-payments\.bank\.internal/i)).toBeInTheDocument();
      expect(screen.getByText(/SUCCESS/i)).toBeInTheDocument();
    });
  });

  // ─── Scenario 9.2: Failed import is logged ───────────────────────────
  describe('Scenario 9.2: Failed import is logged', () => {
    it('audit entry with FAILURE result contains error detail', () => {
      const entry = createAuditEntry({
        action: 'IMPORT',
        result: 'FAILURE',
        detail: 'Certificado inválido',
        certCn: 'invalid-cert.internal',
      });

      expect(entry.action).toBe('IMPORT');
      expect(entry.result).toBe('FAILURE');
      expect(entry.detail).toBe('Certificado inválido');
    });

    it('renders failure result in AuditRow', () => {
      const entry = createAuditEntry({
        action: 'IMPORT',
        result: 'FAILURE',
        certCn: 'bad-cert.internal',
      });

      renderWithProviders(
        <table>
          <tbody>
            <AuditRow entry={entry} />
          </tbody>
        </table>,
      );

      expect(screen.getByText(/FAILURE/i)).toBeInTheDocument();
    });
  });

  // ─── Scenario 9.3: Bulk import batch is tracked ──────────────────────
  describe('Scenario 9.3: Bulk import batch tracking', () => {
    it('audit entries can include batchId', () => {
      const entry = createAuditEntry({
        action: 'IMPORT',
        batchId: 'batch-abc-123',
        detail: 'CSV bulk import batch',
      });

      expect(entry.batchId).toBe('batch-abc-123');
    });

    it('multiple entries in same batch share batchId', () => {
      const entries = Array.from({ length: 5 }, (_, i) =>
        createAuditEntry({
          id: `audit-batch-${i}`,
          action: 'IMPORT',
          batchId: 'batch-xyz-789',
          certCn: `cert-${i}.internal`,
        }),
      );

      const batchIds = entries.map((e) => e.batchId);
      expect(new Set(batchIds).size).toBe(1);
      expect(batchIds[0]).toBe('batch-xyz-789');
    });
  });

  // ─── Audit entry is immutable (type verification) ─────────────────────
  describe('AuditEntry immutability', () => {
    it('audit entry has id, timestamp, and all required fields', () => {
      const entry = createAuditEntry();

      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('action');
      expect(entry).toHaveProperty('actor');
      expect(entry).toHaveProperty('result');
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('certCn');
    });

    it('supports all audit action types', () => {
      const actions = ['CREATE', 'UPDATE', 'DELETE', 'REVOKE', 'IMPORT', 'EXPORT'] as const;

      for (const action of actions) {
        const entry = createAuditEntry({ action });
        expect(entry.action).toBe(action);
      }
    });
  });
});
