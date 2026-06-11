/**
 * C6 — Trilha de Auditoria: Testes QA dos tipos de auditoria (shared)
 *
 * Mapeia cenários dos critérios de aceite:
 *   - F1.5: Campos obrigatórios da interface AuditEntry
 *   - F1.1: AuditAction deve incluir ações necessárias
 *   - F1.2: AuditResult deve incluir SUCCESS e FAILURE
 */

import { describe, it, expect } from 'vitest';
import type {
  AuditAction,
  AuditResult,
  AuditEntry,
  AuditChange,
  AuditFilterParams,
} from '../index.js';

describe('C6-F1.5: Tipos de auditoria — AuditEntry', () => {
  it('deve aceitar objeto com todos os campos obrigatórios', () => {
    const entry: AuditEntry = {
      id: 'audit-001',
      certificateId: 'cert-001',
      certCn: 'test.example.com',
      action: 'CREATE',
      actor: 'admin',
      result: 'SUCCESS',
      detail: 'Certificate imported',
      changes: null,
      timestamp: '2025-01-15T10:30:00.000Z',
    };

    expect(entry.id).toBe('audit-001');
    expect(entry.certificateId).toBe('cert-001');
    expect(entry.certCn).toBe('test.example.com');
    expect(entry.action).toBe('CREATE');
    expect(entry.actor).toBe('admin');
    expect(entry.result).toBe('SUCCESS');
    expect(entry.detail).toBe('Certificate imported');
    expect(entry.changes).toBeNull();
    expect(entry.timestamp).toBe('2025-01-15T10:30:00.000Z');
  });

  it('deve aceitar certificateId null (certificado removido)', () => {
    const entry: AuditEntry = {
      id: 'audit-002',
      certificateId: null,
      certCn: 'removed.example.com',
      action: 'DELETE',
      actor: 'admin',
      result: 'SUCCESS',
      detail: null,
      changes: null,
      timestamp: new Date().toISOString(),
    };

    expect(entry.certificateId).toBeNull();
  });

  it('deve aceitar changes com AuditChange[]', () => {
    const changes: AuditChange[] = [
      { field: 'commonName', oldValue: 'old.com', newValue: 'new.com' },
      { field: 'environment', oldValue: 'DEV', newValue: 'PRD' },
    ];

    const entry: AuditEntry = {
      id: 'audit-003',
      certificateId: 'cert-003',
      certCn: 'changed.example.com',
      action: 'UPDATE',
      actor: 'admin',
      result: 'SUCCESS',
      detail: 'Updated fields',
      changes,
      timestamp: new Date().toISOString(),
    };

    expect(entry.changes).toHaveLength(2);
    expect(entry.changes![0].field).toBe('commonName');
  });
});

describe('C6-F1.1: AuditAction — tipos de ação', () => {
  it('deve incluir todas as ações de auditoria necessárias', () => {
    const actions: AuditAction[] = [
      'CREATE',
      'UPDATE',
      'DELETE',
      'REVOKE',
      'IMPORT',
      'EXPORT',
    ];

    expect(actions).toContain('CREATE');
    expect(actions).toContain('UPDATE');
    expect(actions).toContain('DELETE');
    expect(actions).toContain('REVOKE');
    expect(actions).toContain('IMPORT');
    expect(actions).toContain('EXPORT');
    expect(actions).toHaveLength(6);
  });
});

describe('C6-F1.2: AuditResult — resultados', () => {
  it('deve incluir SUCCESS e FAILURE', () => {
    const results: AuditResult[] = ['SUCCESS', 'FAILURE'];

    expect(results).toContain('SUCCESS');
    expect(results).toContain('FAILURE');
    expect(results).toHaveLength(2);
  });
});

describe('C6-F3: AuditFilterParams — parâmetros de filtro', () => {
  it('deve aceitar todos os filtros possíveis', () => {
    const params: AuditFilterParams = {
      page: '1',
      pageSize: '25',
      action: 'CREATE',
      actor: 'admin',
      certificateId: 'cert-001',
      batchId: 'batch-abc',
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
      result: 'SUCCESS',
    };

    expect(params.page).toBe('1');
    expect(params.action).toBe('CREATE');
    expect(params.actor).toBe('admin');
    expect(params.dateFrom).toBe('2025-01-01');
    expect(params.dateTo).toBe('2025-12-31');
    expect(params.result).toBe('SUCCESS');
  });

  it('deve aceitar filtros parciais (todos opcionais)', () => {
    const params: AuditFilterParams = {};

    expect(params.page).toBeUndefined();
    expect(params.action).toBeUndefined();
  });
});
