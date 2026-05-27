import type { Certificate as PrismaCert } from '@prisma/client';
import type { Certificate, CertStatus, PaginatedResponse } from '@certificado-digital/shared';
import {
  CertificateRepository,
  type CertificateFilters,
  type SortParams,
} from '../repositories/certificateRepo.js';
import { parsePaginationParams, buildPaginatedResponse } from '../utils/pagination.js';

// ─── Query param types ───────────────────────────────────────────────────────

export interface ListCertificatesQuery {
  q?: string;
  page?: string;
  pageSize?: string;
  sort?: string;
  sortDir?: string;
  expiresIn?: string;
  environment?: string;
  ca?: string;
  status?: string;
  tags?: string;
  owner?: string;
  algorithm?: string;
}

export interface FilterMeta {
  environments: string[];
  caNames: string[];
  statuses: string[];
  owners: string[];
  algorithms: string[];
  tagKeys: string[];
}

export interface ExportResult {
  filename: string;
  contentType: string;
  body: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute certificate status from its fields.
 */
export function computeStatus(cert: { revoked: boolean; notAfter: Date }): CertStatus {
  if (cert.revoked) return 'REVOKED';
  const now = new Date();
  if (cert.notAfter < now) return 'EXPIRED';
  const d30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (cert.notAfter <= d30) return 'EXPIRING_SOON';
  return 'VALID';
}

/**
 * Compute days until expiry (negative if already expired).
 */
export function computeDaysUntilExpiry(notAfter: Date): number {
  const now = new Date();
  const diffMs = notAfter.getTime() - now.getTime();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

/**
 * Map Prisma Certificate to shared Certificate type (ISO strings + computed status).
 */
export function mapToApiCertificate(
  cert: PrismaCert,
): Certificate & { daysUntilExpiry: number } {
  return {
    id: cert.id,
    commonName: cert.commonName,
    subjectDn: cert.subjectDn,
    issuerDn: cert.issuerDn,
    sans: cert.sans,
    serialNumber: cert.serialNumber,
    notBefore: cert.notBefore.toISOString(),
    notAfter: cert.notAfter.toISOString(),
    status: computeStatus(cert),
    signatureAlgorithm: cert.signatureAlgorithm,
    keySize: cert.keySize,
    fingerprintSha256: cert.fingerprintSha256,
    fingerprintSha1: cert.fingerprintSha1,
    owner: cert.owner,
    team: cert.team,
    application: cert.application,
    environment: cert.environment,
    zone: cert.zone,
    caName: cert.caName,
    caProvider: cert.caProvider,
    importSource: cert.importSource,
    sourceFile: cert.sourceFile,
    revoked: cert.revoked,
    revokedAt: cert.revokedAt?.toISOString() ?? null,
    revocationReason: cert.revocationReason,
    tags: (cert.tags ?? {}) as Record<string, string>,
    customFields: (cert.customFields ?? {}) as Record<string, string>,
    description: cert.description,
    createdAt: cert.createdAt.toISOString(),
    updatedAt: cert.updatedAt.toISOString(),
    daysUntilExpiry: computeDaysUntilExpiry(cert.notAfter),
  };
}

// ─── Service class ───────────────────────────────────────────────────────────

export class CertificateService {
  constructor(private readonly repo: CertificateRepository) {}

  /**
   * List certificates with search, filter, sort, and pagination.
   */
  async listCertificates(
    query: ListCertificatesQuery,
  ): Promise<PaginatedResponse<Certificate & { daysUntilExpiry: number }>> {
    // Parse pagination
    const pagination = parsePaginationParams({
      page: query.page,
      pageSize: query.pageSize,
    });

    // Parse sort
    const sort: SortParams = {
      sort: query.sort || 'notAfter',
      sortDir: query.sortDir === 'desc' ? 'desc' : 'asc',
    };

    // Parse filters
    const filters: CertificateFilters = {
      q: query.q,
      expiresIn: query.expiresIn,
      environment: query.environment
        ? query.environment.split(',').map((s) => s.trim())
        : undefined,
      ca: query.ca ? query.ca.split(',').map((s) => s.trim()) : undefined,
      status: query.status ? query.status.split(',').map((s) => s.trim()) : undefined,
      owner: query.owner ? query.owner.split(',').map((s) => s.trim()) : undefined,
      algorithm: query.algorithm ? query.algorithm.split(',').map((s) => s.trim()) : undefined,
      tags: query.tags ? parseTags(query.tags) : undefined,
    };

    const { data, total } = await this.repo.findMany(filters, pagination, sort);
    const mapped = data.map(mapToApiCertificate);
    return buildPaginatedResponse(mapped, total, pagination.page, pagination.pageSize);
  }

  /**
   * Get a single certificate by ID with computed fields.
   */
  async getCertificate(
    id: string,
  ): Promise<(Certificate & { daysUntilExpiry: number }) | null> {
    const cert = await this.repo.findById(id);
    if (!cert) return null;
    return mapToApiCertificate(cert);
  }

  /**
   * Export a certificate in the given format.
   */
  async exportCertificate(id: string, format: string): Promise<ExportResult | null> {
    const cert = await this.repo.findById(id);
    if (!cert) return null;

    if (format === 'pem') {
      if (!cert.pemData) {
        return {
          filename: `${sanitizeFilename(cert.commonName)}.pem`,
          contentType: 'application/x-pem-file',
          body: '# No PEM data available for this certificate\n',
        };
      }
      return {
        filename: `${sanitizeFilename(cert.commonName)}.pem`,
        contentType: 'application/x-pem-file',
        body: cert.pemData,
      };
    }

    if (format === 'json') {
      const mapped = mapToApiCertificate(cert);
      return {
        filename: `${sanitizeFilename(cert.commonName)}.json`,
        contentType: 'application/json',
        body: JSON.stringify(mapped, null, 2),
      };
    }

    return null; // Unsupported format
  }

  /**
   * Soft-delete a certificate (set revoked=true) and create an audit entry.
   */
  async deleteCertificate(
    id: string,
    actor: string = 'system',
  ): Promise<(Certificate & { daysUntilExpiry: number }) | null> {
    const existing = await this.repo.findById(id);
    if (!existing) return null;

    const updated = await this.repo.softDelete(id);

    await this.repo.createAuditEntry({
      certificateId: id,
      certCn: updated.commonName,
      action: 'REVOKE',
      actor,
      result: 'SUCCESS',
      detail: `Certificate ${updated.commonName} (${updated.serialNumber}) soft-deleted / revoked`,
    });

    return mapToApiCertificate(updated);
  }

  /**
   * Get filter metadata: distinct values for dropdowns.
   */
  async getFilterMeta(): Promise<FilterMeta> {
    const [environments, caNames, owners, algorithms, tagKeys] = await Promise.all([
      this.repo.getDistinctEnvironments(),
      this.repo.getDistinctCaNames(),
      this.repo.getDistinctOwners(),
      this.repo.getDistinctAlgorithms(),
      this.repo.getDistinctTagKeys(),
    ]);

    return {
      environments,
      caNames,
      statuses: ['VALID', 'EXPIRING_SOON', 'EXPIRED', 'REVOKED'],
      owners,
      algorithms,
      tagKeys,
    };
  }
}

// ─── Private helpers ─────────────────────────────────────────────────────────

/**
 * Parse tags query string. Format: "key1:value1,key2:value2"
 */
function parseTags(tagsStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pairs = tagsStr.split(',');
  for (const pair of pairs) {
    const colonIdx = pair.indexOf(':');
    if (colonIdx > 0) {
      const key = pair.slice(0, colonIdx).trim();
      const value = pair.slice(colonIdx + 1).trim();
      if (key) result[key] = value;
    }
  }
  return result;
}

/**
 * Sanitize a string for use in a filename.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
}
