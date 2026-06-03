import { Prisma, type PrismaClient, type Certificate } from '@prisma/client';
import type { PaginationParams } from '../utils/pagination.js';

// ─── Create / Update input types ────────────────────────────────────────────

export interface CertificateCreateInput {
  commonName: string;
  subjectDn?: string | null;
  issuerDn?: string | null;
  sans?: string[];
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  signatureAlgorithm: string;
  keySize?: number | null;
  fingerprintSha256: string;
  fingerprintSha1?: string | null;
  owner: string;
  team?: string | null;
  application: string;
  environment: 'DEV' | 'HML' | 'PRD';
  zone?: string | null;
  caName: string;
  caProvider?: string | null;
  importSource: 'MANUAL' | 'CSV_IMPORT' | 'API_SYNC' | 'CERTIFICATE_FILE';
  sourceFile?: string | null;
  tags?: Record<string, string>;
  customFields?: Record<string, string>;
  description?: string | null;
  pemData?: string | null;
}

/** Fields that may be updated via PATCH — immutable fields excluded */
export interface CertificateUpdateInput {
  owner?: string;
  team?: string | null;
  application?: string;
  environment?: 'DEV' | 'HML' | 'PRD';
  zone?: string | null;
  caName?: string;
  caProvider?: string | null;
  tags?: Record<string, string>;
  customFields?: Record<string, string>;
  description?: string | null;
}

// ─── Filter types ────────────────────────────────────────────────────────────

export interface CertificateFilters {
  /** Full-text search across CN, SANs, serial, owner, application (min 2 chars) */
  q?: string;
  /** Expiration window: '<7d' | '<30d' | '<90d' | '>90d' */
  expiresIn?: string;
  /** Filter by environment(s) — OR within */
  environment?: string[];
  /** Filter by CA name(s) — OR within */
  ca?: string[];
  /** Filter by computed status(es) — OR within */
  status?: string[];
  /** Filter by tags — AND across key-value pairs */
  tags?: Record<string, string>;
  /** Filter by owner(s) — OR within */
  owner?: string[];
  /** Filter by algorithm(s) — OR within */
  algorithm?: string[];
}

export interface SortParams {
  sort: string;
  sortDir: 'asc' | 'desc';
}

// ─── Column-to-Prisma-field mapping ──────────────────────────────────────────

const SORTABLE_COLUMNS: Record<string, string> = {
  commonName: 'common_name',
  common_name: 'common_name',
  serialNumber: 'serial_number',
  serial_number: 'serial_number',
  issuerDn: 'issuer_dn',
  issuer_dn: 'issuer_dn',
  notBefore: 'not_before',
  not_before: 'not_before',
  notAfter: 'not_after',
  not_after: 'not_after',
  signatureAlgorithm: 'signature_algorithm',
  signature_algorithm: 'signature_algorithm',
  owner: 'owner',
  application: 'application',
  environment: 'environment',
  caName: 'ca_name',
  ca_name: 'ca_name',
  caProvider: 'ca_provider',
  ca_provider: 'ca_provider',
  createdAt: 'created_at',
  created_at: 'created_at',
  updatedAt: 'updated_at',
  updated_at: 'updated_at',
};

// ─── Repository class ────────────────────────────────────────────────────────

export class CertificateRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Build Prisma `where` clause from filters.
   */
  buildWhereClause(filters: CertificateFilters): Prisma.CertificateWhereInput {
    const conditions: Prisma.CertificateWhereInput[] = [];

    // Full-text search (case-insensitive contains across multiple fields)
    if (filters.q && filters.q.trim().length >= 2) {
      const q = filters.q.trim();
      conditions.push({
        OR: [
          { commonName: { contains: q, mode: 'insensitive' } },
          { serialNumber: { contains: q, mode: 'insensitive' } },
          { owner: { contains: q, mode: 'insensitive' } },
          { application: { contains: q, mode: 'insensitive' } },
          { sans: { has: q } },
          // Also search SANs with case-insensitive partial match via hasSome
          { sans: { hasSome: [q, q.toLowerCase(), q.toUpperCase()] } },
        ],
      });
    }

    // Expiration window filter
    if (filters.expiresIn) {
      const now = new Date();
      switch (filters.expiresIn) {
        case '<7d': {
          const d7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          conditions.push({
            notAfter: { gte: now, lte: d7 },
            revoked: false,
          });
          break;
        }
        case '<30d': {
          const d30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          conditions.push({
            notAfter: { gte: now, lte: d30 },
            revoked: false,
          });
          break;
        }
        case '<90d': {
          const d90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
          conditions.push({
            notAfter: { gte: now, lte: d90 },
            revoked: false,
          });
          break;
        }
        case '>90d': {
          const d90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
          conditions.push({
            notAfter: { gt: d90 },
            revoked: false,
          });
          break;
        }
      }
    }

    // Environment filter (OR within)
    if (filters.environment && filters.environment.length > 0) {
      conditions.push({
        environment: { in: filters.environment as Prisma.Enumerable<never> },
      });
    }

    // CA filter — searches both caName and caProvider (OR within)
    if (filters.ca && filters.ca.length > 0) {
      conditions.push({
        OR: [{ caName: { in: filters.ca } }, { caProvider: { in: filters.ca } }],
      });
    }

    // Status filter (computed: VALID, EXPIRING_SOON, EXPIRED, REVOKED)
    if (filters.status && filters.status.length > 0) {
      const statusConditions: Prisma.CertificateWhereInput[] = [];
      const now = new Date();
      const d30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      for (const status of filters.status) {
        switch (status) {
          case 'REVOKED':
          case 'revoked':
            statusConditions.push({ revoked: true });
            break;
          case 'EXPIRED':
          case 'expired':
            statusConditions.push({ revoked: false, notAfter: { lt: now } });
            break;
          case 'EXPIRING_SOON':
          case 'expiring':
            statusConditions.push({
              revoked: false,
              notAfter: { gte: now, lte: d30 },
            });
            break;
          case 'VALID':
          case 'active':
            statusConditions.push({
              revoked: false,
              notAfter: { gt: d30 },
            });
            break;
        }
      }
      if (statusConditions.length > 0) {
        conditions.push({ OR: statusConditions });
      }
    }

    // Owner filter (OR within)
    if (filters.owner && filters.owner.length > 0) {
      conditions.push({
        owner: { in: filters.owner },
      });
    }

    // Algorithm filter (OR within)
    if (filters.algorithm && filters.algorithm.length > 0) {
      conditions.push({
        signatureAlgorithm: { in: filters.algorithm },
      });
    }

    // Tags filter (AND across key-value pairs)
    if (filters.tags && Object.keys(filters.tags).length > 0) {
      for (const [key, value] of Object.entries(filters.tags)) {
        conditions.push({
          tags: { path: [key], equals: value },
        });
      }
    }

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { AND: conditions };
  }

  /**
   * Build Prisma orderBy from sort params.
   */
  buildOrderBy(sort: SortParams): Prisma.CertificateOrderByWithRelationInput {
    const column = SORTABLE_COLUMNS[sort.sort];
    if (!column) {
      // Default sort: notAfter ASC
      return { notAfter: 'asc' };
    }
    // Map snake_case DB column back to Prisma camelCase field
    const fieldMap: Record<string, string> = {
      common_name: 'commonName',
      serial_number: 'serialNumber',
      issuer_dn: 'issuerDn',
      not_before: 'notBefore',
      not_after: 'notAfter',
      signature_algorithm: 'signatureAlgorithm',
      ca_name: 'caName',
      ca_provider: 'caProvider',
      created_at: 'createdAt',
      updated_at: 'updatedAt',
    };
    const prismaField = fieldMap[column] ?? column;
    return { [prismaField]: sort.sortDir } as Prisma.CertificateOrderByWithRelationInput;
  }

  /**
   * Fetch paginated list of certificates with filters and sorting.
   */
  async findMany(
    filters: CertificateFilters,
    pagination: PaginationParams,
    sort: SortParams,
  ): Promise<{ data: Certificate[]; total: number }> {
    const where = this.buildWhereClause(filters);
    const orderBy = this.buildOrderBy(sort);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.certificate.findMany({
        where,
        orderBy,
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.certificate.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Fetch a single certificate by ID.
   */
  async findById(id: string): Promise<Certificate | null> {
    return this.prisma.certificate.findUnique({ where: { id } });
  }

  /**
   * Soft-delete: set revoked = true, return updated certificate.
   */
  async softDelete(id: string): Promise<Certificate> {
    return this.prisma.certificate.update({
      where: { id },
      data: { revoked: true, revokedAt: new Date(), status: 'REVOKED' },
    });
  }

  /**
   * Find a certificate by its SHA-256 fingerprint (unique column).
   */
  async findByFingerprint(fingerprintSha256: string): Promise<Certificate | null> {
    return this.prisma.certificate.findUnique({ where: { fingerprintSha256 } });
  }

  /**
   * Create a new certificate record.
   */
  async create(data: CertificateCreateInput): Promise<Certificate> {
    return this.prisma.certificate.create({
      data: {
        commonName: data.commonName,
        subjectDn: data.subjectDn ?? null,
        issuerDn: data.issuerDn ?? null,
        sans: data.sans ?? [],
        serialNumber: data.serialNumber,
        notBefore: data.notBefore,
        notAfter: data.notAfter,
        signatureAlgorithm: data.signatureAlgorithm,
        keySize: data.keySize ?? null,
        fingerprintSha256: data.fingerprintSha256,
        fingerprintSha1: data.fingerprintSha1 ?? null,
        owner: data.owner,
        team: data.team ?? null,
        application: data.application,
        environment: data.environment,
        zone: data.zone ?? null,
        caName: data.caName,
        caProvider: data.caProvider ?? null,
        importSource: data.importSource,
        sourceFile: data.sourceFile ?? null,
        tags: (data.tags ?? {}) as Prisma.InputJsonValue,
        customFields: (data.customFields ?? {}) as Prisma.InputJsonValue,
        description: data.description ?? null,
        pemData: data.pemData ?? null,
      },
    });
  }

  /**
   * Partial update of certificate metadata with optimistic locking.
   * Returns updated certificate or null if not found.
   */
  async update(id: string, data: CertificateUpdateInput): Promise<Certificate> {
    const updateData: Prisma.CertificateUpdateInput = {};

    if (data.owner !== undefined) updateData.owner = data.owner;
    if (data.team !== undefined) updateData.team = data.team;
    if (data.application !== undefined) updateData.application = data.application;
    if (data.environment !== undefined) updateData.environment = data.environment;
    if (data.zone !== undefined) updateData.zone = data.zone;
    if (data.caName !== undefined) updateData.caName = data.caName;
    if (data.caProvider !== undefined) updateData.caProvider = data.caProvider;
    if (data.tags !== undefined) updateData.tags = data.tags as Prisma.InputJsonValue;
    if (data.customFields !== undefined)
      updateData.customFields = data.customFields as Prisma.InputJsonValue;
    if (data.description !== undefined) updateData.description = data.description;

    return this.prisma.certificate.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Create an audit entry.
   */
  async createAuditEntry(entry: {
    certificateId: string | null;
    certCn: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'REVOKE';
    actor: string;
    result: 'SUCCESS' | 'FAILURE';
    detail: string;
    changes?: Record<string, { old: unknown; new: unknown }>;
  }): Promise<void> {
    await this.prisma.auditEntry.create({
      data: {
        certificateId: entry.certificateId,
        certCn: entry.certCn,
        action: entry.action,
        actor: entry.actor,
        result: entry.result,
        detail: entry.detail,
        changes: entry.changes ? (entry.changes as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  /**
   * Get distinct values for filter dropdowns.
   */
  async getDistinctCaNames(): Promise<string[]> {
    const rows = await this.prisma.certificate.findMany({
      distinct: ['caName'],
      select: { caName: true },
      orderBy: { caName: 'asc' },
    });
    return rows.map((r) => r.caName);
  }

  async getDistinctEnvironments(): Promise<string[]> {
    const rows = await this.prisma.certificate.findMany({
      distinct: ['environment'],
      select: { environment: true },
      orderBy: { environment: 'asc' },
    });
    return rows.map((r) => r.environment);
  }

  async getDistinctOwners(): Promise<string[]> {
    const rows = await this.prisma.certificate.findMany({
      distinct: ['owner'],
      select: { owner: true },
      where: { owner: { not: '' } },
      orderBy: { owner: 'asc' },
    });
    return rows.map((r) => r.owner);
  }

  async getDistinctAlgorithms(): Promise<string[]> {
    const rows = await this.prisma.certificate.findMany({
      distinct: ['signatureAlgorithm'],
      select: { signatureAlgorithm: true },
      orderBy: { signatureAlgorithm: 'asc' },
    });
    return rows.map((r) => r.signatureAlgorithm);
  }

  /**
   * Gather distinct tag keys from all certificates.
   * Tags are stored as JSON — we scan and collect unique keys.
   */
  async getDistinctTagKeys(): Promise<string[]> {
    const rows = await this.prisma.certificate.findMany({
      select: { tags: true },
    });
    const keys = new Set<string>();
    for (const row of rows) {
      if (row.tags && typeof row.tags === 'object' && !Array.isArray(row.tags)) {
        for (const key of Object.keys(row.tags as Record<string, unknown>)) {
          keys.add(key);
        }
      }
    }
    return Array.from(keys).sort();
  }
}
