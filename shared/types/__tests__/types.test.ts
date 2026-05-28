import { describe, it, expectTypeOf } from 'vitest';
import type {
  Certificate,
  CertificateCreate,
  CertificateUpdate,
  CertStatus,
  Environment,
  ImportSource,
  AuditEntry,
  AuditAction,
  AuditResult,
  AuditChange,
  FilterParams,
  SortParams,
  SortDirection,
  CertSortField,
  PaginationParams,
  CertificateQueryParams,
  PaginatedResponse,
  ApiError,
  ApiSuccess,
  BulkOperationResult,
} from '../index.js';

/**
 * Compile-time type tests for the shared types package.
 * These ensure the interfaces are correctly defined and exported.
 */
describe('shared types', () => {
  describe('certificate types', () => {
    it('Certificate should have expected shape', () => {
      expectTypeOf<Certificate>().toHaveProperty('id');
      expectTypeOf<Certificate>().toHaveProperty('commonName');
      expectTypeOf<Certificate>().toHaveProperty('sans');
      expectTypeOf<Certificate>().toHaveProperty('serialNumber');
      expectTypeOf<Certificate>().toHaveProperty('notBefore');
      expectTypeOf<Certificate>().toHaveProperty('notAfter');
      expectTypeOf<Certificate>().toHaveProperty('status');
      expectTypeOf<Certificate>().toHaveProperty('fingerprintSha256');
      expectTypeOf<Certificate>().toHaveProperty('owner');
      expectTypeOf<Certificate>().toHaveProperty('environment');
      expectTypeOf<Certificate>().toHaveProperty('caName');
      expectTypeOf<Certificate>().toHaveProperty('revoked');
      expectTypeOf<Certificate>().toHaveProperty('tags');
      expectTypeOf<Certificate>().toHaveProperty('createdAt');
      expectTypeOf<Certificate>().toHaveProperty('updatedAt');
    });

    it('CertStatus should be a valid string union', () => {
      expectTypeOf<'VALID'>().toMatchTypeOf<CertStatus>();
      expectTypeOf<'EXPIRING_SOON'>().toMatchTypeOf<CertStatus>();
      expectTypeOf<'EXPIRED'>().toMatchTypeOf<CertStatus>();
      expectTypeOf<'REVOKED'>().toMatchTypeOf<CertStatus>();
    });

    it('Environment should be a valid string union', () => {
      expectTypeOf<'DEV'>().toMatchTypeOf<Environment>();
      expectTypeOf<'HML'>().toMatchTypeOf<Environment>();
      expectTypeOf<'PRD'>().toMatchTypeOf<Environment>();
    });

    it('ImportSource should be a valid string union', () => {
      expectTypeOf<'MANUAL'>().toMatchTypeOf<ImportSource>();
      expectTypeOf<'CSV_IMPORT'>().toMatchTypeOf<ImportSource>();
      expectTypeOf<'API_SYNC'>().toMatchTypeOf<ImportSource>();
      expectTypeOf<'CERTIFICATE_FILE'>().toMatchTypeOf<ImportSource>();
    });

    it('CertificateCreate should omit system fields', () => {
      expectTypeOf<CertificateCreate>().not.toHaveProperty('id');
      expectTypeOf<CertificateCreate>().not.toHaveProperty('createdAt');
      expectTypeOf<CertificateCreate>().not.toHaveProperty('updatedAt');
      expectTypeOf<CertificateCreate>().toHaveProperty('commonName');
    });

    it('CertificateUpdate should have optional fields', () => {
      expectTypeOf<CertificateUpdate>().toMatchTypeOf<Partial<CertificateCreate>>();
    });
  });

  describe('audit types', () => {
    it('AuditEntry should have expected shape', () => {
      expectTypeOf<AuditEntry>().toHaveProperty('id');
      expectTypeOf<AuditEntry>().toHaveProperty('certificateId');
      expectTypeOf<AuditEntry>().toHaveProperty('certCn');
      expectTypeOf<AuditEntry>().toHaveProperty('action');
      expectTypeOf<AuditEntry>().toHaveProperty('actor');
      expectTypeOf<AuditEntry>().toHaveProperty('result');
      expectTypeOf<AuditEntry>().toHaveProperty('changes');
      expectTypeOf<AuditEntry>().toHaveProperty('timestamp');
    });

    it('AuditAction should include all expected values', () => {
      expectTypeOf<'CREATE'>().toMatchTypeOf<AuditAction>();
      expectTypeOf<'UPDATE'>().toMatchTypeOf<AuditAction>();
      expectTypeOf<'DELETE'>().toMatchTypeOf<AuditAction>();
      expectTypeOf<'REVOKE'>().toMatchTypeOf<AuditAction>();
      expectTypeOf<'IMPORT'>().toMatchTypeOf<AuditAction>();
      expectTypeOf<'EXPORT'>().toMatchTypeOf<AuditAction>();
    });

    it('AuditResult should be SUCCESS or FAILURE', () => {
      expectTypeOf<'SUCCESS'>().toMatchTypeOf<AuditResult>();
      expectTypeOf<'FAILURE'>().toMatchTypeOf<AuditResult>();
    });

    it('AuditChange should describe a field change', () => {
      expectTypeOf<AuditChange>().toHaveProperty('field');
      expectTypeOf<AuditChange>().toHaveProperty('oldValue');
      expectTypeOf<AuditChange>().toHaveProperty('newValue');
    });
  });

  describe('filter types', () => {
    it('FilterParams should have expected optional fields', () => {
      expectTypeOf<FilterParams>().toHaveProperty('search');
      expectTypeOf<FilterParams>().toHaveProperty('status');
      expectTypeOf<FilterParams>().toHaveProperty('environment');
      expectTypeOf<FilterParams>().toHaveProperty('owner');
      expectTypeOf<FilterParams>().toHaveProperty('revoked');
    });

    it('SortParams should have field and direction', () => {
      expectTypeOf<SortParams>().toHaveProperty('field');
      expectTypeOf<SortParams>().toHaveProperty('direction');
    });

    it('SortDirection should be asc or desc', () => {
      expectTypeOf<'asc'>().toMatchTypeOf<SortDirection>();
      expectTypeOf<'desc'>().toMatchTypeOf<SortDirection>();
    });

    it('CertSortField should include key sort fields', () => {
      expectTypeOf<'commonName'>().toMatchTypeOf<CertSortField>();
      expectTypeOf<'notAfter'>().toMatchTypeOf<CertSortField>();
      expectTypeOf<'status'>().toMatchTypeOf<CertSortField>();
      expectTypeOf<'owner'>().toMatchTypeOf<CertSortField>();
    });

    it('PaginationParams should have page and pageSize', () => {
      expectTypeOf<PaginationParams>().toHaveProperty('page');
      expectTypeOf<PaginationParams>().toHaveProperty('pageSize');
    });

    it('CertificateQueryParams should combine filters, sort, pagination', () => {
      expectTypeOf<CertificateQueryParams>().toHaveProperty('filters');
      expectTypeOf<CertificateQueryParams>().toHaveProperty('sort');
      expectTypeOf<CertificateQueryParams>().toHaveProperty('pagination');
    });
  });

  describe('api types', () => {
    it('PaginatedResponse should be generic', () => {
      type Resp = PaginatedResponse<{ id: string }>;
      expectTypeOf<Resp>().toHaveProperty('data');
      expectTypeOf<Resp>().toHaveProperty('total');
      expectTypeOf<Resp>().toHaveProperty('page');
      expectTypeOf<Resp>().toHaveProperty('pageSize');
      expectTypeOf<Resp>().toHaveProperty('totalPages');
    });

    it('ApiError should have standard error fields', () => {
      expectTypeOf<ApiError>().toHaveProperty('statusCode');
      expectTypeOf<ApiError>().toHaveProperty('error');
      expectTypeOf<ApiError>().toHaveProperty('message');
    });

    it('ApiSuccess should wrap data', () => {
      type Resp = ApiSuccess<{ id: string }>;
      expectTypeOf<Resp>().toHaveProperty('data');
    });

    it('BulkOperationResult should have counts and errors', () => {
      expectTypeOf<BulkOperationResult>().toHaveProperty('total');
      expectTypeOf<BulkOperationResult>().toHaveProperty('succeeded');
      expectTypeOf<BulkOperationResult>().toHaveProperty('failed');
      expectTypeOf<BulkOperationResult>().toHaveProperty('errors');
    });
  });
});
