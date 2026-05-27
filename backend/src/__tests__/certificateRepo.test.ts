import { describe, it, expect } from 'vitest';
import { CertificateRepository } from '../repositories/certificateRepo.js';
import type { PrismaClient } from '@prisma/client';

/**
 * Unit tests for CertificateRepository.
 * These test the WHERE clause and ORDER BY construction logic
 * without needing a real database.
 */

function makeRepo(): CertificateRepository {
  // We only test buildWhereClause and buildOrderBy — no DB calls needed.
  return new CertificateRepository({} as PrismaClient);
}

describe('CertificateRepository.buildWhereClause', () => {
  const repo = makeRepo();

  it('should return empty where for no filters', () => {
    const where = repo.buildWhereClause({});
    expect(where).toEqual({});
  });

  it('should ignore search query shorter than 2 chars', () => {
    const where = repo.buildWhereClause({ q: 'a' });
    expect(where).toEqual({});
  });

  it('should build search query with OR conditions for q >= 2 chars', () => {
    const where = repo.buildWhereClause({ q: 'test' });
    expect(where).toHaveProperty('OR');
    const orConditions = (where as { OR: unknown[] }).OR;
    expect(orConditions.length).toBeGreaterThanOrEqual(4); // CN, serial, owner, application, sans...
  });

  it('should build expiresIn filter for <7d', () => {
    const where = repo.buildWhereClause({ expiresIn: '<7d' });
    // Single condition: returned directly, not wrapped in AND
    expect(where).toHaveProperty('notAfter');
    expect(where).toHaveProperty('revoked', false);
  });

  it('should build expiresIn filter for <30d', () => {
    const where = repo.buildWhereClause({ expiresIn: '<30d' });
    // Single condition -> returned directly (not wrapped in AND)
    expect(where).toHaveProperty('notAfter');
    expect(where).toHaveProperty('revoked', false);
  });

  it('should build expiresIn filter for >90d', () => {
    const where = repo.buildWhereClause({ expiresIn: '>90d' });
    expect(where).toHaveProperty('notAfter');
    expect(where).toHaveProperty('revoked', false);
  });

  it('should build environment filter with IN clause', () => {
    const where = repo.buildWhereClause({ environment: ['dev', 'prd'] });
    expect(where).toHaveProperty('environment');
  });

  it('should build CA provider filter', () => {
    const where = repo.buildWhereClause({ ca: ['DigiCert'] });
    expect(where).toHaveProperty('caProvider');
  });

  it('should build status filter with OR for multiple statuses', () => {
    const where = repo.buildWhereClause({ status: ['active', 'expired'] });
    expect(where).toHaveProperty('OR');
  });

  it('should build owner filter', () => {
    const where = repo.buildWhereClause({ owner: ['teamA', 'teamB'] });
    expect(where).toHaveProperty('owner');
  });

  it('should build algorithm filter', () => {
    const where = repo.buildWhereClause({ algorithm: ['RSA-2048'] });
    expect(where).toHaveProperty('algorithm');
  });

  it('should compose multiple filters with AND', () => {
    const where = repo.buildWhereClause({
      q: 'test',
      environment: ['dev'],
      ca: ['DigiCert'],
    });
    expect(where).toHaveProperty('AND');
    const and = (where as { AND: unknown[] }).AND;
    expect(and.length).toBe(3); // search, environment, ca
  });

  it('should build tags filter with path queries', () => {
    const where = repo.buildWhereClause({ tags: { team: 'platform', tier: 'critical' } });
    expect(where).toHaveProperty('AND');
    const and = (where as { AND: unknown[] }).AND;
    expect(and.length).toBe(2); // one per tag key-value
  });
});

describe('CertificateRepository.buildOrderBy', () => {
  const repo = makeRepo();

  it('should return default sort for unknown column', () => {
    const orderBy = repo.buildOrderBy({ sort: 'unknown', sortDir: 'asc' });
    expect(orderBy).toEqual({ notAfter: 'asc' });
  });

  it('should sort by commonName', () => {
    const orderBy = repo.buildOrderBy({ sort: 'commonName', sortDir: 'desc' });
    expect(orderBy).toEqual({ commonName: 'desc' });
  });

  it('should sort by notAfter', () => {
    const orderBy = repo.buildOrderBy({ sort: 'notAfter', sortDir: 'asc' });
    expect(orderBy).toEqual({ notAfter: 'asc' });
  });

  it('should accept snake_case column names', () => {
    const orderBy = repo.buildOrderBy({ sort: 'not_after', sortDir: 'desc' });
    expect(orderBy).toEqual({ notAfter: 'desc' });
  });

  it('should sort by owner', () => {
    const orderBy = repo.buildOrderBy({ sort: 'owner', sortDir: 'asc' });
    expect(orderBy).toEqual({ owner: 'asc' });
  });

  it('should sort by caProvider', () => {
    const orderBy = repo.buildOrderBy({ sort: 'caProvider', sortDir: 'asc' });
    expect(orderBy).toEqual({ caProvider: 'asc' });
  });
});
