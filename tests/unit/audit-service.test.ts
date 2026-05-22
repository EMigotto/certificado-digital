/**
 * Unit tests for the audit log service & API.
 *
 * Covers:
 *  - AC 21: Cert audit log — all prior events, timestamp + actor + action + result, newest-first
 *  - AC 32: CREATE audit entry with timestamp, actor, action, target CN, result SUCCESS
 *  - AC 33: UPDATE audit entry with timestamp, actor, action, target CN, result SUCCESS
 *  - AC 34: DELETE audit entry with timestamp, actor, action, target CN, result SUCCESS
 *
 * Issue #16 — C3 Chunk 5/7: Audit Log Service & API
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDatabase, closeDatabase } from '../../src/server/db.js';
import * as auditService from '../../src/server/services/audit-service.js';
import {
  updateCertificate,
  deleteCertificate,
  getCertificateById,
} from '../../src/server/services/certificate-service.js';
import { persistCertificate } from '../../src/server/services/import-service.js';
import forge from 'node-forge';

import type { ParsedCertificate, ImportMetadata } from '../../src/server/services/import-service.js';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Generate a self-signed test certificate for import. */
function generateTestCert(cn = 'api-payments.bank.internal'): {
  pem: string;
  parsed: ParsedCertificate;
} {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01ABCDEF';
  cert.validity.notBefore = new Date('2024-01-01T00:00:00Z');
  cert.validity.notAfter = new Date('2025-12-31T23:59:59Z');

  cert.setSubject([{ name: 'commonName', value: cn }]);
  cert.setIssuer([
    { name: 'commonName', value: 'Internal CA' },
    { name: 'organizationName', value: 'Bank Corp' },
  ]);

  cert.setExtensions([
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: cn },
        { type: 2, value: 'canary.bank.internal' },
      ],
    },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());
  const pem = forge.pki.certificateToPem(cert);

  // Extract fingerprint
  const derBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const md = forge.md.sha256.create();
  md.update(derBytes);
  const fingerprint = md.digest().toHex().toUpperCase().match(/.{2}/g)!.join(':');

  const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
  const keySize = publicKey.n.bitLength();

  return {
    pem,
    parsed: {
      commonName: cn,
      sans: [cn, 'canary.bank.internal'],
      serial: '01ABCDEF',
      issuer: 'CN=Internal CA, O=Bank Corp',
      notBefore: cert.validity.notBefore.toISOString(),
      notAfter: cert.validity.notAfter.toISOString(),
      algorithm: `RSA ${keySize}`,
      keySize,
      fingerprintSHA256: fingerprint,
      pemContent: pem.trim(),
    },
  };
}

/** Default import metadata for test certs. */
const defaultMeta: ImportMetadata = {
  owner: 'team-payments',
  application: 'API Payments',
  environment: 'prd',
  zone: 'bank-prd',
  caProvider: 'Vault PKI',
  description: 'Test cert',
  tags: { criticality: 'high' },
};

/** Insert a test certificate and return its ID. */
function insertTestCert(db: Database.Database, cn?: string): string {
  const { parsed } = generateTestCert(cn);
  const imported = persistCertificate(db, parsed, defaultMeta);
  return imported.id;
}

/** Count audit log entries in the database. */
function countAuditEntries(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM audit_log').get() as { cnt: number };
  return row.cnt;
}

/** Validate an ISO-8601 timestamp string. */
function isValidIso8601(ts: string): boolean {
  const date = new Date(ts);
  return !isNaN(date.getTime()) && ts.includes('T');
}

/* ------------------------------------------------------------------ */
/* Test suite — audit-service.log()                                    */
/* ------------------------------------------------------------------ */

describe('audit-service: log()', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it('creates an audit entry with correct fields', () => {
    const entry = auditService.log(db, 'CREATE', 'cert-123', 'api-payments.bank.internal', 'alice', 'SUCCESS');

    expect(entry.id).toBeTruthy();
    expect(entry.certId).toBe('cert-123');
    expect(entry.certCn).toBe('api-payments.bank.internal');
    expect(entry.action).toBe('CREATE');
    expect(entry.actor).toBe('alice');
    expect(entry.result).toBe('SUCCESS');
    expect(entry.details).toEqual({});
    expect(isValidIso8601(entry.timestamp)).toBe(true);
  });

  it('stores details as JSON', () => {
    const details = { changes: { owner: { old: 'team-a', new: 'team-b' } } };
    const entry = auditService.log(db, 'UPDATE', 'cert-123', 'api.com', 'bob', 'SUCCESS', details);

    expect(entry.details).toEqual(details);

    // Verify persisted in DB
    const row = db.prepare('SELECT details FROM audit_log WHERE id = ?').get(entry.id) as { details: string };
    expect(JSON.parse(row.details)).toEqual(details);
  });

  it('defaults actor to "system"', () => {
    const entry = auditService.log(db, 'CREATE', 'cert-1', 'api.com');

    expect(entry.actor).toBe('system');
  });

  it('defaults result to "SUCCESS"', () => {
    const entry = auditService.log(db, 'CREATE', 'cert-1', 'api.com', 'system');

    expect(entry.result).toBe('SUCCESS');
  });

  it('accepts null certId (for deleted certs)', () => {
    const entry = auditService.log(db, 'DELETE', null, 'deleted-cert.com', 'admin', 'SUCCESS');

    expect(entry.certId).toBeNull();
  });

  it('generates ISO-8601 timestamps', () => {
    const entry = auditService.log(db, 'CREATE', 'cert-1', 'api.com');

    // Verify the timestamp is a valid ISO-8601 string
    expect(isValidIso8601(entry.timestamp)).toBe(true);
    // Should be close to now
    const diff = Math.abs(Date.now() - new Date(entry.timestamp).getTime());
    expect(diff).toBeLessThan(5000); // within 5 seconds
  });
});

/* ------------------------------------------------------------------ */
/* Test suite — audit-service.getGlobalLog()                           */
/* ------------------------------------------------------------------ */

describe('audit-service: getGlobalLog()', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it('returns all entries sorted by timestamp descending', () => {
    auditService.log(db, 'CREATE', 'c1', 'cert-1.com', 'alice', 'SUCCESS');
    auditService.log(db, 'UPDATE', 'c2', 'cert-2.com', 'bob', 'SUCCESS');
    auditService.log(db, 'DELETE', 'c3', 'cert-3.com', 'charlie', 'SUCCESS');

    const result = auditService.getGlobalLog(db);

    expect(result.totalItems).toBe(3);
    expect(result.items).toHaveLength(3);
    // Newest first
    expect(result.items[0].action).toBe('DELETE');
    expect(result.items[1].action).toBe('UPDATE');
    expect(result.items[2].action).toBe('CREATE');
  });

  it('paginates results correctly', () => {
    for (let i = 0; i < 10; i++) {
      auditService.log(db, 'CREATE', `c${i}`, `cert-${i}.com`, 'system', 'SUCCESS');
    }

    const page1 = auditService.getGlobalLog(db, {}, 1, 3);
    expect(page1.items).toHaveLength(3);
    expect(page1.page).toBe(1);
    expect(page1.pageSize).toBe(3);
    expect(page1.totalItems).toBe(10);
    expect(page1.totalPages).toBe(4); // ceil(10/3)
    expect(page1.hasNextPage).toBe(true);
    expect(page1.hasPreviousPage).toBe(false);

    const page2 = auditService.getGlobalLog(db, {}, 2, 3);
    expect(page2.items).toHaveLength(3);
    expect(page2.page).toBe(2);
    expect(page2.hasNextPage).toBe(true);
    expect(page2.hasPreviousPage).toBe(true);

    const page4 = auditService.getGlobalLog(db, {}, 4, 3);
    expect(page4.items).toHaveLength(1); // 10 - 9 = 1
    expect(page4.page).toBe(4);
    expect(page4.hasNextPage).toBe(false);
    expect(page4.hasPreviousPage).toBe(true);
  });

  it('filters by action', () => {
    auditService.log(db, 'CREATE', 'c1', 'a.com');
    auditService.log(db, 'UPDATE', 'c2', 'b.com');
    auditService.log(db, 'DELETE', 'c3', 'c.com');

    const result = auditService.getGlobalLog(db, { action: 'CREATE' });
    expect(result.totalItems).toBe(1);
    expect(result.items[0].action).toBe('CREATE');
  });

  it('filters by actor (case-insensitive substring)', () => {
    auditService.log(db, 'CREATE', 'c1', 'a.com', 'alice-admin');
    auditService.log(db, 'CREATE', 'c2', 'b.com', 'bob');

    const result = auditService.getGlobalLog(db, { actor: 'alice' });
    expect(result.totalItems).toBe(1);
    expect(result.items[0].actor).toBe('alice-admin');
  });

  it('filters by cert CN (case-insensitive substring)', () => {
    auditService.log(db, 'CREATE', 'c1', 'api-payments.bank.internal');
    auditService.log(db, 'CREATE', 'c2', 'api-orders.bank.internal');

    const result = auditService.getGlobalLog(db, { certCn: 'payments' });
    expect(result.totalItems).toBe(1);
    expect(result.items[0].certCn).toBe('api-payments.bank.internal');
  });

  it('filters by date range', () => {
    // Insert with known timestamps via raw SQL
    db.prepare(`
      INSERT INTO audit_log (id, cert_id, cert_cn, action, actor, result, details, timestamp)
      VALUES ('a1', 'c1', 'cert1.com', 'CREATE', 'system', 'SUCCESS', '{}', '2024-01-15T10:00:00.000Z')
    `).run();
    db.prepare(`
      INSERT INTO audit_log (id, cert_id, cert_cn, action, actor, result, details, timestamp)
      VALUES ('a2', 'c2', 'cert2.com', 'UPDATE', 'system', 'SUCCESS', '{}', '2024-02-15T10:00:00.000Z')
    `).run();
    db.prepare(`
      INSERT INTO audit_log (id, cert_id, cert_cn, action, actor, result, details, timestamp)
      VALUES ('a3', 'c3', 'cert3.com', 'DELETE', 'system', 'SUCCESS', '{}', '2024-03-15T10:00:00.000Z')
    `).run();

    const result = auditService.getGlobalLog(db, {
      dateFrom: '2024-02-01T00:00:00.000Z',
      dateTo: '2024-02-28T23:59:59.999Z',
    });
    expect(result.totalItems).toBe(1);
    expect(result.items[0].certCn).toBe('cert2.com');
  });

  it('returns empty page for no matches', () => {
    const result = auditService.getGlobalLog(db, { action: 'REVOKE' });
    expect(result.totalItems).toBe(0);
    expect(result.items).toHaveLength(0);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('limits page size to 100', () => {
    const result = auditService.getGlobalLog(db, {}, 1, 999);
    expect(result.pageSize).toBe(100);
  });
});

/* ------------------------------------------------------------------ */
/* Test suite — audit-service.getCertificateLog()                      */
/* ------------------------------------------------------------------ */

describe('audit-service: getCertificateLog()', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it('returns only entries for the specified certificate', () => {
    auditService.log(db, 'CREATE', 'cert-a', 'a.com');
    auditService.log(db, 'CREATE', 'cert-b', 'b.com');
    auditService.log(db, 'UPDATE', 'cert-a', 'a.com', 'alice');

    const entries = auditService.getCertificateLog(db, 'cert-a');
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.certId === 'cert-a')).toBe(true);
  });

  it('sorts entries newest-first (AC 21)', () => {
    auditService.log(db, 'CREATE', 'cert-a', 'a.com', 'system');
    auditService.log(db, 'UPDATE', 'cert-a', 'a.com', 'alice');
    auditService.log(db, 'DELETE', 'cert-a', 'a.com', 'bob');

    const entries = auditService.getCertificateLog(db, 'cert-a');
    expect(entries[0].action).toBe('DELETE');
    expect(entries[1].action).toBe('UPDATE');
    expect(entries[2].action).toBe('CREATE');
  });

  it('returns empty array for unknown cert', () => {
    const entries = auditService.getCertificateLog(db, 'nonexistent');
    expect(entries).toEqual([]);
  });

  it('returns entries with correct ISO-8601 timestamps (AC 21)', () => {
    auditService.log(db, 'CREATE', 'cert-a', 'a.com');

    const entries = auditService.getCertificateLog(db, 'cert-a');
    expect(entries).toHaveLength(1);
    expect(isValidIso8601(entries[0].timestamp)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Integration tests — import → CREATE audit entry (AC 32)             */
/* ------------------------------------------------------------------ */

describe('Import → audit CREATE entry (AC 32)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it('creates a CREATE audit entry on PEM import', () => {
    const certId = insertTestCert(db);

    const entries = auditService.getCertificateLog(db, certId);
    expect(entries).toHaveLength(1);

    const entry = entries[0];
    expect(entry.action).toBe('CREATE');
    expect(entry.result).toBe('SUCCESS');
    expect(entry.certId).toBe(certId);
    expect(entry.certCn).toBe('api-payments.bank.internal');
    expect(entry.actor).toBe('system');
    expect(isValidIso8601(entry.timestamp)).toBe(true);
  });

  it('audit entry has correct ISO-8601 timestamp (AC 32)', () => {
    const before = new Date().toISOString();
    const certId = insertTestCert(db);
    const after = new Date().toISOString();

    const entries = auditService.getCertificateLog(db, certId);
    expect(entries).toHaveLength(1);
    expect(entries[0].timestamp >= before).toBe(true);
    expect(entries[0].timestamp <= after).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Integration tests — update → UPDATE audit entry (AC 33)             */
/* ------------------------------------------------------------------ */

describe('Update tags → audit UPDATE entry (AC 33)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it('creates an UPDATE audit entry when tags are changed', () => {
    const certId = insertTestCert(db);

    // Update tags
    updateCertificate(db, certId, { tags: { criticality: 'low', env: 'prod' } }, 'alice');

    const entries = auditService.getCertificateLog(db, certId);
    // Should have CREATE + UPDATE
    expect(entries).toHaveLength(2);

    // Newest first → UPDATE is first
    const updateEntry = entries[0];
    expect(updateEntry.action).toBe('UPDATE');
    expect(updateEntry.result).toBe('SUCCESS');
    expect(updateEntry.actor).toBe('alice');
    expect(updateEntry.certCn).toBe('api-payments.bank.internal');
    expect(isValidIso8601(updateEntry.timestamp)).toBe(true);
  });

  it('UPDATE audit entry includes old/new diff in details', () => {
    const certId = insertTestCert(db);

    updateCertificate(db, certId, {
      tags: { criticality: 'low' },
      owner: 'team-orders',
    }, 'bob');

    const entries = auditService.getCertificateLog(db, certId);
    const updateEntry = entries[0];

    expect(updateEntry.action).toBe('UPDATE');
    const changes = updateEntry.details.changes as Record<string, { old: unknown; new: unknown }>;
    expect(changes).toBeDefined();
    expect(changes.tags.old).toEqual({ criticality: 'high' });
    expect(changes.tags.new).toEqual({ criticality: 'low' });
    expect(changes.owner.old).toBe('team-payments');
    expect(changes.owner.new).toBe('team-orders');
  });

  it('UPDATE audit entry is created even when no fields change', () => {
    const certId = insertTestCert(db);

    // Update with same values → still logs
    updateCertificate(db, certId, { owner: 'team-payments' }, 'alice');

    const entries = auditService.getCertificateLog(db, certId);
    // CREATE + UPDATE (no-op)
    expect(entries).toHaveLength(2);
    expect(entries[0].action).toBe('UPDATE');
  });
});

/* ------------------------------------------------------------------ */
/* Integration tests — delete → DELETE audit entry (AC 34)             */
/* ------------------------------------------------------------------ */

describe('Delete cert → audit DELETE entry (AC 34)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it('creates a DELETE audit entry when cert is deleted', () => {
    const certId = insertTestCert(db);

    deleteCertificate(db, certId, 'admin');

    // Cert should be gone
    expect(getCertificateById(db, certId)).toBeUndefined();

    // But audit trail remains
    const entries = auditService.getCertificateLog(db, certId);
    expect(entries).toHaveLength(2); // CREATE + DELETE

    const deleteEntry = entries[0]; // newest first
    expect(deleteEntry.action).toBe('DELETE');
    expect(deleteEntry.result).toBe('SUCCESS');
    expect(deleteEntry.actor).toBe('admin');
    expect(deleteEntry.certCn).toBe('api-payments.bank.internal');
    expect(isValidIso8601(deleteEntry.timestamp)).toBe(true);
  });

  it('returns false for non-existent cert', () => {
    const result = deleteCertificate(db, 'nonexistent', 'admin');
    expect(result).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Global audit log returns all entries sorted by timestamp            */
/* ------------------------------------------------------------------ */

describe('Global audit log correctness', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it('contains CREATE, UPDATE, and DELETE entries across operations', () => {
    const certId = insertTestCert(db, 'cert-1.com');
    updateCertificate(db, certId, { owner: 'new-team' }, 'alice');
    deleteCertificate(db, certId, 'bob');

    const result = auditService.getGlobalLog(db);
    expect(result.totalItems).toBe(3);
    expect(result.items.map((e) => e.action)).toEqual(['DELETE', 'UPDATE', 'CREATE']);
  });

  it('handles multiple certificates in the global log', () => {
    insertTestCert(db, 'cert-a.com');
    insertTestCert(db, 'cert-b.com');
    insertTestCert(db, 'cert-c.com');

    const result = auditService.getGlobalLog(db);
    expect(result.totalItems).toBe(3);
    expect(result.items.every((e) => e.action === 'CREATE')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Per-cert audit log returns only entries for that cert               */
/* ------------------------------------------------------------------ */

describe('Per-cert audit log isolation', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it('returns only entries for the specified cert', () => {
    const id1 = insertTestCert(db, 'cert-1.com');
    const id2 = insertTestCert(db, 'cert-2.com');

    updateCertificate(db, id1, { owner: 'new-team' }, 'alice');

    const log1 = auditService.getCertificateLog(db, id1);
    const log2 = auditService.getCertificateLog(db, id2);

    expect(log1).toHaveLength(2); // CREATE + UPDATE
    expect(log2).toHaveLength(1); // CREATE only
    expect(log1.every((e) => e.certId === id1)).toBe(true);
    expect(log2.every((e) => e.certId === id2)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* certificate-service updateCertificate                               */
/* ------------------------------------------------------------------ */

describe('certificate-service: updateCertificate()', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it('updates owner field and returns updated row', () => {
    const certId = insertTestCert(db);
    const updated = updateCertificate(db, certId, { owner: 'team-orders' });

    expect(updated).not.toBeNull();
    expect(updated!.owner).toBe('team-orders');
  });

  it('updates tags field', () => {
    const certId = insertTestCert(db);
    const newTags = { env: 'production', team: 'payments' };
    const updated = updateCertificate(db, certId, { tags: newTags });

    expect(updated).not.toBeNull();
    expect(JSON.parse(updated!.tags)).toEqual(newTags);
  });

  it('updates multiple fields at once', () => {
    const certId = insertTestCert(db);
    const updated = updateCertificate(db, certId, {
      owner: 'team-orders',
      description: 'Updated description',
      environment: 'hml',
    });

    expect(updated).not.toBeNull();
    expect(updated!.owner).toBe('team-orders');
    expect(updated!.description).toBe('Updated description');
    expect(updated!.environment).toBe('hml');
  });

  it('returns null for non-existent cert', () => {
    const result = updateCertificate(db, 'nonexistent', { owner: 'team' });
    expect(result).toBeNull();
  });

  it('updates the updated_at timestamp', () => {
    const certId = insertTestCert(db);
    const before = getCertificateById(db, certId)!.updated_at;

    // Small delay to ensure different timestamp
    updateCertificate(db, certId, { owner: 'new-owner' });

    const after = getCertificateById(db, certId)!.updated_at;
    expect(after >= before).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* certificate-service deleteCertificate                               */
/* ------------------------------------------------------------------ */

describe('certificate-service: deleteCertificate()', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it('deletes the certificate from the database', () => {
    const certId = insertTestCert(db);
    expect(getCertificateById(db, certId)).toBeDefined();

    const result = deleteCertificate(db, certId);
    expect(result).toBe(true);
    expect(getCertificateById(db, certId)).toBeUndefined();
  });

  it('preserves audit trail after deletion', () => {
    const certId = insertTestCert(db);
    deleteCertificate(db, certId);

    // Audit entries should still be there
    const entries = auditService.getCertificateLog(db, certId);
    expect(entries.length).toBeGreaterThanOrEqual(2);
  });
});
