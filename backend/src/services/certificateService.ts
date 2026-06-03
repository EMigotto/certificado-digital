import type { Certificate as PrismaCert } from '@prisma/client';
import type { Certificate, CertStatus, PaginatedResponse } from '@certificado-digital/shared';
import {
  CertificateRepository,
  type CertificateFilters,
  type SortParams,
  type CertificateCreateInput,
  type CertificateUpdateInput,
} from '../repositories/certificateRepo.js';
import { parsePaginationParams, buildPaginatedResponse } from '../utils/pagination.js';

// ─── Query param types ───────────────────────────────────────────────────────

export interface ListCertificatesQuery {
  q?: string;
  page?: string;
  pageSize?: string;
  /** Existing sort field */
  sort?: string;
  sortDir?: string;
  expiresIn?: string;
  environment?: string;
  ca?: string;
  status?: string;
  tags?: string;
  owner?: string;
  algorithm?: string;
  /** PRD-style bracket filters */
  'filter[status]'?: string;
  'filter[environment]'?: string;
  /** Alias for pageSize */
  limit?: string;
}

// ─── Create / Update payload types ──────────────────────────────────────────

/** Valid environments for API input */
const VALID_ENVIRONMENTS = ['DEV', 'HML', 'PRD'] as const;

/** Fields that cannot be changed via PATCH */
const IMMUTABLE_FIELDS = [
  'commonName',
  'serialNumber',
  'fingerprintSha256',
  'fingerprintSha1',
  'notBefore',
  'notAfter',
  'signatureAlgorithm',
  'id',
  'createdAt',
  'updatedAt',
  'importSource',
] as const;

export interface CertificateCreatePayload {
  commonName: string;
  subjectDn?: string | null;
  issuerDn?: string | null;
  sans?: string[];
  serialNumber: string;
  notBefore: string; // ISO-8601
  notAfter: string; // ISO-8601
  signatureAlgorithm: string;
  keySize?: number | null;
  fingerprintSha256: string;
  fingerprintSha1?: string | null;
  owner: string;
  team?: string | null;
  application: string;
  environment: string;
  zone?: string | null;
  caName?: string;
  caProvider?: string | null;
  tags?: Record<string, string>;
  customFields?: Record<string, string>;
  description?: string | null;
  pemData?: string | null;
}

export interface CertificateUpdatePayload {
  owner?: string;
  team?: string | null;
  application?: string;
  environment?: string;
  zone?: string | null;
  caName?: string;
  caProvider?: string | null;
  tags?: Record<string, string>;
  customFields?: Record<string, string>;
  description?: string | null;
  [key: string]: unknown;
}

// ─── Custom error classes ───────────────────────────────────────────────────

export class CertificateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CertificateValidationError';
  }
}

export class CertificateDuplicateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CertificateDuplicateError';
  }
}

export class CertificateNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CertificateNotFoundError';
  }
}

export class CertificateImmutableFieldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CertificateImmutableFieldError';
  }
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
    // Lifecycle fields (may not exist on all Prisma rows — default to null)
    csrSource: (cert as Record<string, unknown>).csrSource as Certificate['csrSource'] ?? null,
    validityDays: (cert as Record<string, unknown>).validityDays as number | null ?? null,
    renewalParentId: (cert as Record<string, unknown>).renewalParentId as string | null ?? null,
    renewalChildId: (cert as Record<string, unknown>).renewalChildId as string | null ?? null,
    revocationReasonCode: (cert as Record<string, unknown>).revocationReasonCode as Certificate['revocationReasonCode'] ?? null,
    revocationJustification: (cert as Record<string, unknown>).revocationJustification as string | null ?? null,
    revokedBy: (cert as Record<string, unknown>).revokedBy as string | null ?? null,
    keyAlgorithm: (cert as Record<string, unknown>).keyAlgorithm as Certificate['keyAlgorithm'] ?? null,
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
   *
   * Supports:
   * - PRD-style bracket syntax: `filter[status]=VALID`, `filter[environment]=PRD`
   * - `sort` with `-` prefix for descending: `sort=-notAfter`
   * - `limit` as alias for `pageSize`
   */
  async listCertificates(
    query: ListCertificatesQuery,
  ): Promise<PaginatedResponse<Certificate & { daysUntilExpiry: number }>> {
    // Parse pagination — `limit` is an alias for `pageSize`
    const pagination = parsePaginationParams({
      page: query.page,
      pageSize: query.limit ?? query.pageSize,
    });

    // Parse sort — support `-field` prefix for descending
    let sortField = query.sort || 'notAfter';
    let sortDir: 'asc' | 'desc' = query.sortDir === 'desc' ? 'desc' : 'asc';
    if (sortField.startsWith('-')) {
      sortField = sortField.slice(1);
      sortDir = 'desc';
    }
    const sort: SortParams = { sort: sortField, sortDir };

    // Merge bracket-syntax filters with existing query params
    const statusRaw = query['filter[status]'] ?? query.status;
    const envRaw = query['filter[environment]'] ?? query.environment;

    // Parse filters
    const filters: CertificateFilters = {
      q: query.q,
      expiresIn: query.expiresIn,
      environment: envRaw ? envRaw.split(',').map((s) => s.trim()) : undefined,
      ca: query.ca ? query.ca.split(',').map((s) => s.trim()) : undefined,
      status: statusRaw ? statusRaw.split(',').map((s) => s.trim()) : undefined,
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

  /**
   * Create a new certificate from JSON metadata.
   * Sets importSource to API_SYNC, validates required fields, checks for duplicate fingerprints.
   */
  async createCertificate(
    payload: CertificateCreatePayload,
    actor: string = 'system',
  ): Promise<Certificate & { daysUntilExpiry: number }> {
    // ── Validate required fields ──────────────────────────────────────────────
    const errors: string[] = [];
    if (!payload.commonName || !payload.commonName.trim()) {
      errors.push('commonName is required');
    }
    if (!payload.serialNumber || !payload.serialNumber.trim()) {
      errors.push('serialNumber is required');
    }
    if (!payload.fingerprintSha256 || !payload.fingerprintSha256.trim()) {
      errors.push('fingerprintSha256 is required');
    }
    if (!payload.signatureAlgorithm || !payload.signatureAlgorithm.trim()) {
      errors.push('signatureAlgorithm is required');
    }
    if (!payload.owner || !payload.owner.trim()) {
      errors.push('owner is required');
    }
    if (!payload.application || !payload.application.trim()) {
      errors.push('application is required');
    }

    // Validate environment enum
    const env = (payload.environment ?? '').toUpperCase();
    if (!VALID_ENVIRONMENTS.includes(env as (typeof VALID_ENVIRONMENTS)[number])) {
      errors.push(
        `environment must be one of: ${VALID_ENVIRONMENTS.join(', ')}. Got: "${payload.environment}"`,
      );
    }

    // Validate dates
    const notBefore = new Date(payload.notBefore);
    const notAfter = new Date(payload.notAfter);
    if (!payload.notBefore || isNaN(notBefore.getTime())) {
      errors.push('notBefore must be a valid ISO-8601 date');
    }
    if (!payload.notAfter || isNaN(notAfter.getTime())) {
      errors.push('notAfter must be a valid ISO-8601 date');
    }
    if (!isNaN(notBefore.getTime()) && !isNaN(notAfter.getTime()) && notAfter <= notBefore) {
      errors.push('notAfter must be after notBefore');
    }

    if (errors.length > 0) {
      throw new CertificateValidationError(errors.join('; '));
    }

    // ── Check for duplicate fingerprint ───────────────────────────────────────
    const existing = await this.repo.findByFingerprint(payload.fingerprintSha256);
    if (existing) {
      throw new CertificateDuplicateError(
        `Certificate with fingerprint "${payload.fingerprintSha256}" already exists (id: ${existing.id})`,
      );
    }

    // ── Create the certificate ────────────────────────────────────────────────
    const createInput: CertificateCreateInput = {
      commonName: payload.commonName.trim(),
      subjectDn: payload.subjectDn ?? null,
      issuerDn: payload.issuerDn ?? null,
      sans: payload.sans ?? [],
      serialNumber: payload.serialNumber.trim(),
      notBefore,
      notAfter,
      signatureAlgorithm: payload.signatureAlgorithm.trim(),
      keySize: payload.keySize ?? null,
      fingerprintSha256: payload.fingerprintSha256.trim(),
      fingerprintSha1: payload.fingerprintSha1 ?? null,
      owner: payload.owner.trim(),
      team: payload.team ?? null,
      application: payload.application.trim(),
      environment: env as CertificateCreateInput['environment'],
      zone: payload.zone ?? null,
      caName: (payload.caName ?? 'Unknown').trim(),
      caProvider: payload.caProvider ?? null,
      importSource: 'API_SYNC',
      sourceFile: null,
      tags: payload.tags ?? {},
      customFields: payload.customFields ?? {},
      description: payload.description ?? null,
      pemData: payload.pemData ?? null,
    };

    const created = await this.repo.create(createInput);

    // ── Create audit entry ────────────────────────────────────────────────────
    await this.repo.createAuditEntry({
      certificateId: created.id,
      certCn: created.commonName,
      action: 'CREATE',
      actor,
      result: 'SUCCESS',
      detail: `Certificate ${created.commonName} (${created.serialNumber}) created via API`,
    });

    return mapToApiCertificate(created);
  }

  /**
   * Update certificate metadata (mutable fields only).
   * Creates an audit entry with field-level diff.
   */
  async updateCertificate(
    id: string,
    payload: CertificateUpdatePayload,
    actor: string = 'system',
  ): Promise<Certificate & { daysUntilExpiry: number }> {
    // ── Check that certificate exists ─────────────────────────────────────────
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new CertificateNotFoundError(`Certificate with id "${id}" not found`);
    }

    // ── Reject immutable field changes ────────────────────────────────────────
    const immutableAttempts = IMMUTABLE_FIELDS.filter((f) => payload[f] !== undefined);
    if (immutableAttempts.length > 0) {
      throw new CertificateImmutableFieldError(
        `Cannot update immutable fields: ${immutableAttempts.join(', ')}`,
      );
    }

    // ── Validate environment if provided ──────────────────────────────────────
    if (payload.environment !== undefined) {
      const env = payload.environment.toUpperCase();
      if (!VALID_ENVIRONMENTS.includes(env as (typeof VALID_ENVIRONMENTS)[number])) {
        throw new CertificateValidationError(
          `environment must be one of: ${VALID_ENVIRONMENTS.join(', ')}. Got: "${payload.environment}"`,
        );
      }
      payload.environment = env;
    }

    // ── Build update data (only mutable fields) ──────────────────────────────
    const updateInput: CertificateUpdateInput = {};
    const changes: Record<string, { old: unknown; new: unknown }> = {};

    if (payload.owner !== undefined) {
      updateInput.owner = payload.owner;
      if (payload.owner !== existing.owner) {
        changes.owner = { old: existing.owner, new: payload.owner };
      }
    }
    if (payload.team !== undefined) {
      updateInput.team = payload.team;
      if (payload.team !== existing.team) {
        changes.team = { old: existing.team, new: payload.team };
      }
    }
    if (payload.application !== undefined) {
      updateInput.application = payload.application;
      if (payload.application !== existing.application) {
        changes.application = { old: existing.application, new: payload.application };
      }
    }
    if (payload.environment !== undefined) {
      updateInput.environment = payload.environment as CertificateUpdateInput['environment'];
      if (payload.environment !== existing.environment) {
        changes.environment = { old: existing.environment, new: payload.environment };
      }
    }
    if (payload.zone !== undefined) {
      updateInput.zone = payload.zone;
      if (payload.zone !== existing.zone) {
        changes.zone = { old: existing.zone, new: payload.zone };
      }
    }
    if (payload.caName !== undefined) {
      updateInput.caName = payload.caName;
      if (payload.caName !== existing.caName) {
        changes.caName = { old: existing.caName, new: payload.caName };
      }
    }
    if (payload.caProvider !== undefined) {
      updateInput.caProvider = payload.caProvider;
      if (payload.caProvider !== existing.caProvider) {
        changes.caProvider = { old: existing.caProvider, new: payload.caProvider };
      }
    }
    if (payload.tags !== undefined) {
      updateInput.tags = payload.tags;
      const oldTags = (existing.tags ?? {}) as Record<string, string>;
      if (JSON.stringify(oldTags) !== JSON.stringify(payload.tags)) {
        changes.tags = { old: oldTags, new: payload.tags };
      }
    }
    if (payload.customFields !== undefined) {
      updateInput.customFields = payload.customFields;
      const oldCustom = (existing.customFields ?? {}) as Record<string, string>;
      if (JSON.stringify(oldCustom) !== JSON.stringify(payload.customFields)) {
        changes.customFields = { old: oldCustom, new: payload.customFields };
      }
    }
    if (payload.description !== undefined) {
      updateInput.description = payload.description;
      if (payload.description !== existing.description) {
        changes.description = { old: existing.description, new: payload.description };
      }
    }

    const updated = await this.repo.update(id, updateInput);

    // ── Create audit entry with diff ──────────────────────────────────────────
    const changedFields = Object.keys(changes);
    await this.repo.createAuditEntry({
      certificateId: id,
      certCn: updated.commonName,
      action: 'UPDATE',
      actor,
      result: 'SUCCESS',
      detail: changedFields.length > 0
        ? `Updated fields: ${changedFields.join(', ')}`
        : 'No fields changed',
      changes: changedFields.length > 0 ? changes : undefined,
    });

    return mapToApiCertificate(updated);
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
