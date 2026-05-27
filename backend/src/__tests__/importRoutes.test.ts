import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import forge from 'node-forge';

// ─── Mock Prisma client ─────────────────────────────────────────────────────

const { mockCertCreate, mockCertCreateMany, mockCertFindFirst, mockAuditCreate, mockTransaction } = vi.hoisted(() => ({
  mockCertCreate: vi.fn(),
  mockCertCreateMany: vi.fn(),
  mockCertFindFirst: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('../prismaClient.js', () => ({
  default: {
    certificate: {
      create: mockCertCreate,
      createMany: mockCertCreateMany,
      findFirst: mockCertFindFirst,
    },
    auditLog: {
      create: mockAuditCreate,
    },
    $transaction: mockTransaction,
  },
}));

import { importRoutes } from '../routes/import.js';

// ─── Test helpers ───────────────────────────────────────────────────────────

function generateTestPem(cn: string = 'test.example.com'): string {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = 'AABBCCDD01';
  cert.validity.notBefore = new Date('2024-01-01');
  cert.validity.notAfter = new Date('2025-12-31');
  cert.setSubject([{ shortName: 'CN', value: cn }]);
  cert.setIssuer([{ shortName: 'CN', value: 'Test CA' }]);
  cert.setExtensions([{ name: 'subjectAltName', altNames: [{ type: 2, value: cn }] }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
}

/**
 * Build a multipart/form-data payload with the given fields.
 */
function buildMultipartPayload(
  fields: Array<{ name: string; value: string | Buffer; filename?: string; contentType?: string }>,
): { body: Buffer; boundary: string } {
  const boundary = '----TestBoundary' + Date.now();
  const parts: Buffer[] = [];

  for (const field of fields) {
    let header = `--${boundary}\r\n`;
    if (field.filename) {
      header += `Content-Disposition: form-data; name="${field.name}"; filename="${field.filename}"\r\n`;
      header += `Content-Type: ${field.contentType ?? 'application/octet-stream'}\r\n`;
    } else {
      header += `Content-Disposition: form-data; name="${field.name}"\r\n`;
    }
    header += '\r\n';

    parts.push(Buffer.from(header));
    parts.push(typeof field.value === 'string' ? Buffer.from(field.value) : field.value);
    parts.push(Buffer.from('\r\n'));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  return { body: Buffer.concat(parts), boundary };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Import Routes', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = Fastify();
    await server.register(importRoutes);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  // ── POST /api/certificates/import ─────────────────────────────────────────

  describe('POST /api/certificates/import', () => {
    it('should import a valid PEM certificate', async () => {
      const pem = generateTestPem('upload.example.com');

      mockCertFindFirst.mockResolvedValue(null);
      mockCertCreate.mockResolvedValue({
        id: 'new-cert-id',
        commonName: 'upload.example.com',
        serial: 'AABBCCDD01',
        issuer: 'CN=Test CA',
      });
      mockAuditCreate.mockResolvedValue({ id: 'audit-1' });

      const { body, boundary } = buildMultipartPayload([
        { name: 'file', value: pem, filename: 'cert.pem', contentType: 'application/x-pem-file' },
        { name: 'owner', value: 'teamA' },
        { name: 'environment', value: 'prd' },
      ]);

      const response = await server.inject({
        method: 'POST',
        url: '/api/certificates/import',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(201);
      const respBody = JSON.parse(response.payload);
      expect(respBody.certificate.commonName).toBe('upload.example.com');
      expect(respBody.auditId).toBe('audit-1');
    });

    it('should return 409 for duplicate certificate', async () => {
      const pem = generateTestPem('dup.example.com');

      mockCertFindFirst.mockResolvedValueOnce({
        id: 'existing-id',
        commonName: 'dup.example.com',
        issuer: 'CN=Test CA',
        fingerprintSha256: 'AB:CD:EF',
      });

      const { body, boundary } = buildMultipartPayload([
        { name: 'file', value: pem, filename: 'cert.pem', contentType: 'application/x-pem-file' },
      ]);

      const response = await server.inject({
        method: 'POST',
        url: '/api/certificates/import',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(409);
      const respBody = JSON.parse(response.payload);
      expect(respBody.error).toBe('Conflict');
      expect(respBody.duplicate).toBeDefined();
      expect(respBody.duplicate.existingId).toBe('existing-id');
    });

    it('should return 422 for invalid certificate', async () => {
      mockAuditCreate.mockResolvedValue({ id: 'audit-fail' });

      const { body, boundary } = buildMultipartPayload([
        {
          name: 'file',
          value: '-----BEGIN CERTIFICATE-----\nINVALID\n-----END CERTIFICATE-----',
          filename: 'bad.pem',
          contentType: 'application/x-pem-file',
        },
      ]);

      const response = await server.inject({
        method: 'POST',
        url: '/api/certificates/import',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(422);
      const respBody = JSON.parse(response.payload);
      expect(respBody.error).toBe('Unprocessable Entity');
    });

    it('should return 415 for unsupported format', async () => {
      mockAuditCreate.mockResolvedValue({ id: 'audit-fail' });

      const { body, boundary } = buildMultipartPayload([
        {
          name: 'file',
          value: 'This is just a text file, not a certificate',
          filename: 'readme.txt',
          contentType: 'text/plain',
        },
      ]);

      const response = await server.inject({
        method: 'POST',
        url: '/api/certificates/import',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(415);
      const respBody = JSON.parse(response.payload);
      expect(respBody.supportedFormats).toBeDefined();
    });

    it('should return 400 when no file is provided', async () => {
      const { body, boundary } = buildMultipartPayload([{ name: 'owner', value: 'teamA' }]);

      const response = await server.inject({
        method: 'POST',
        url: '/api/certificates/import',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ── POST /api/certificates/import/csv ─────────────────────────────────────

  describe('POST /api/certificates/import/csv', () => {
    it('should return preview for valid CSV', async () => {
      mockCertFindFirst.mockResolvedValue(null);

      const csv = [
        'cn,issuer,owner,environment',
        'api.example.com,CN=Test CA,teamA,prd',
        'web.example.com,CN=Test CA,teamB,dev',
      ].join('\n');

      const { body, boundary } = buildMultipartPayload([
        { name: 'file', value: csv, filename: 'certs.csv', contentType: 'text/csv' },
      ]);

      const response = await server.inject({
        method: 'POST',
        url: '/api/certificates/import/csv',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(200);
      const respBody = JSON.parse(response.payload);
      expect(respBody.validCount).toBe(2);
      expect(respBody.errorCount).toBe(0);
      expect(respBody.rows).toHaveLength(2);
    });

    it('should execute import when confirm=true', async () => {
      mockCertFindFirst.mockResolvedValue(null);
      mockCertCreateMany.mockResolvedValue({ count: 1 });
      mockAuditCreate.mockResolvedValue({ id: 'audit-summary' });

      const csv = ['cn,issuer,owner,environment', 'api.example.com,CN=Test CA,teamA,prd'].join(
        '\n',
      );

      const { body, boundary } = buildMultipartPayload([
        { name: 'file', value: csv, filename: 'certs.csv', contentType: 'text/csv' },
        { name: 'confirm', value: 'true' },
      ]);

      const response = await server.inject({
        method: 'POST',
        url: '/api/certificates/import/csv',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(200);
      const respBody = JSON.parse(response.payload);
      expect(respBody.imported).toBe(1);
      expect(respBody.batchId).toBeTruthy();
    });

    it('should execute import when confirm=true via query string', async () => {
      mockCertFindFirst.mockResolvedValue(null);
      mockCertCreateMany.mockResolvedValue({ count: 1 });
      mockAuditCreate.mockResolvedValue({ id: 'audit-summary' });

      const csv = ['cn,issuer,owner,environment', 'api.example.com,CN=Test CA,teamA,prd'].join(
        '\n',
      );

      const { body, boundary } = buildMultipartPayload([
        { name: 'file', value: csv, filename: 'certs.csv', contentType: 'text/csv' },
      ]);

      const response = await server.inject({
        method: 'POST',
        url: '/api/certificates/import/csv?confirm=true',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(200);
      const respBody = JSON.parse(response.payload);
      expect(respBody.imported).toBeDefined();
    });

    it('should return 422 for CSV with missing headers', async () => {
      const csv = ['sans,serial', 'foo,bar'].join('\n');

      const { body, boundary } = buildMultipartPayload([
        { name: 'file', value: csv, filename: 'bad.csv', contentType: 'text/csv' },
      ]);

      const response = await server.inject({
        method: 'POST',
        url: '/api/certificates/import/csv',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(422);
      const respBody = JSON.parse(response.payload);
      expect(respBody.headerErrors).toBeDefined();
      expect(respBody.headerErrors.length).toBeGreaterThan(0);
    });

    it('should return 400 when no file is provided', async () => {
      const { body, boundary } = buildMultipartPayload([{ name: 'confirm', value: 'true' }]);

      const response = await server.inject({
        method: 'POST',
        url: '/api/certificates/import/csv',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ── GET /api/certificates/import/csv/template ─────────────────────────────

  describe('GET /api/certificates/import/csv/template', () => {
    it('should return a CSV template with correct headers', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/certificates/import/csv/template',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('certificate_import_template.csv');

      const body = response.payload;
      const firstLine = body.split('\n')[0];
      expect(firstLine).toContain('cn');
      expect(firstLine).toContain('issuer');
      expect(firstLine).toContain('owner');
      expect(firstLine).toContain('environment');
    });

    it('should include example data rows', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/certificates/import/csv/template',
      });

      const lines = response.payload.split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });
  });
});
