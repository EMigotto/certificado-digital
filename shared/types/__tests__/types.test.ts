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
  CsrSource,
  RevocationReasonCode,
  KeyAlgorithm,
  CaConfig,
  IssueCertificateRequest,
  IssueCertificateResponse,
  RenewCertificateRequest,
  RenewCertificateResponse,
  RevokeCertificateRequest,
  RevokeCertificateResponse,
  TimelineEventType,
  TimelineEvent,
  CertificateTimeline,
  RenewalOptions,
  RevocationReasonOption,
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

    it('Certificate should have lifecycle fields', () => {
      expectTypeOf<Certificate>().toHaveProperty('csrSource');
      expectTypeOf<Certificate>().toHaveProperty('validityDays');
      expectTypeOf<Certificate>().toHaveProperty('renewalParentId');
      expectTypeOf<Certificate>().toHaveProperty('renewalChildId');
      expectTypeOf<Certificate>().toHaveProperty('revocationReasonCode');
      expectTypeOf<Certificate>().toHaveProperty('revocationJustification');
      expectTypeOf<Certificate>().toHaveProperty('revokedBy');
      expectTypeOf<Certificate>().toHaveProperty('keyAlgorithm');
    });

    it('CertStatus should be a valid string union including lifecycle statuses', () => {
      expectTypeOf<'VALID'>().toMatchTypeOf<CertStatus>();
      expectTypeOf<'EXPIRING_SOON'>().toMatchTypeOf<CertStatus>();
      expectTypeOf<'EXPIRED'>().toMatchTypeOf<CertStatus>();
      expectTypeOf<'REVOKED'>().toMatchTypeOf<CertStatus>();
      expectTypeOf<'PENDING'>().toMatchTypeOf<CertStatus>();
      expectTypeOf<'ISSUED'>().toMatchTypeOf<CertStatus>();
      expectTypeOf<'ACTIVE'>().toMatchTypeOf<CertStatus>();
      expectTypeOf<'RENEWED'>().toMatchTypeOf<CertStatus>();
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

    it('CsrSource should be generate or upload', () => {
      expectTypeOf<'generate'>().toMatchTypeOf<CsrSource>();
      expectTypeOf<'upload'>().toMatchTypeOf<CsrSource>();
    });

    it('RevocationReasonCode should include RFC 5280 codes', () => {
      expectTypeOf<'unspecified'>().toMatchTypeOf<RevocationReasonCode>();
      expectTypeOf<'keyCompromise'>().toMatchTypeOf<RevocationReasonCode>();
      expectTypeOf<'cACompromise'>().toMatchTypeOf<RevocationReasonCode>();
      expectTypeOf<'affiliationChanged'>().toMatchTypeOf<RevocationReasonCode>();
      expectTypeOf<'superseded'>().toMatchTypeOf<RevocationReasonCode>();
      expectTypeOf<'cessationOfOperation'>().toMatchTypeOf<RevocationReasonCode>();
      expectTypeOf<'certificateHold'>().toMatchTypeOf<RevocationReasonCode>();
      expectTypeOf<'removeFromCRL'>().toMatchTypeOf<RevocationReasonCode>();
      expectTypeOf<'privilegeWithdrawn'>().toMatchTypeOf<RevocationReasonCode>();
      expectTypeOf<'aACompromise'>().toMatchTypeOf<RevocationReasonCode>();
    });

    it('KeyAlgorithm should include supported algorithms', () => {
      expectTypeOf<'RSA-2048'>().toMatchTypeOf<KeyAlgorithm>();
      expectTypeOf<'RSA-4096'>().toMatchTypeOf<KeyAlgorithm>();
      expectTypeOf<'ECDSA-P256'>().toMatchTypeOf<KeyAlgorithm>();
      expectTypeOf<'ECDSA-P384'>().toMatchTypeOf<KeyAlgorithm>();
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

  describe('CA config types', () => {
    it('CaConfig should have expected shape', () => {
      expectTypeOf<CaConfig>().toHaveProperty('id');
      expectTypeOf<CaConfig>().toHaveProperty('name');
      expectTypeOf<CaConfig>().toHaveProperty('provider');
      expectTypeOf<CaConfig>().toHaveProperty('endpoint');
      expectTypeOf<CaConfig>().toHaveProperty('supportedAlgorithms');
      expectTypeOf<CaConfig>().toHaveProperty('maxValidityDays');
      expectTypeOf<CaConfig>().toHaveProperty('isDefault');
      expectTypeOf<CaConfig>().toHaveProperty('healthy');
      expectTypeOf<CaConfig>().toHaveProperty('lastHealthCheck');
    });
  });

  describe('lifecycle request/response types', () => {
    it('IssueCertificateRequest should have expected shape', () => {
      expectTypeOf<IssueCertificateRequest>().toHaveProperty('commonName');
      expectTypeOf<IssueCertificateRequest>().toHaveProperty('sans');
      expectTypeOf<IssueCertificateRequest>().toHaveProperty('keyAlgorithm');
      expectTypeOf<IssueCertificateRequest>().toHaveProperty('csrSource');
      expectTypeOf<IssueCertificateRequest>().toHaveProperty('caId');
      expectTypeOf<IssueCertificateRequest>().toHaveProperty('owner');
      expectTypeOf<IssueCertificateRequest>().toHaveProperty('validityDays');
    });

    it('IssueCertificateResponse should wrap certificate and auditId', () => {
      expectTypeOf<IssueCertificateResponse>().toHaveProperty('certificate');
      expectTypeOf<IssueCertificateResponse>().toHaveProperty('auditId');
    });

    it('RenewCertificateRequest should have expected shape', () => {
      expectTypeOf<RenewCertificateRequest>().toHaveProperty('validityDays');
      expectTypeOf<RenewCertificateRequest>().toHaveProperty('rotateKey');
      expectTypeOf<RenewCertificateRequest>().toHaveProperty('keyAlgorithm');
    });

    it('RenewCertificateResponse should include previous cert id', () => {
      expectTypeOf<RenewCertificateResponse>().toHaveProperty('certificate');
      expectTypeOf<RenewCertificateResponse>().toHaveProperty('previousCertificateId');
      expectTypeOf<RenewCertificateResponse>().toHaveProperty('auditId');
    });

    it('RevokeCertificateRequest should have reason code and justification', () => {
      expectTypeOf<RevokeCertificateRequest>().toHaveProperty('reasonCode');
      expectTypeOf<RevokeCertificateRequest>().toHaveProperty('justification');
    });

    it('RevokeCertificateResponse should wrap certificate and auditId', () => {
      expectTypeOf<RevokeCertificateResponse>().toHaveProperty('certificate');
      expectTypeOf<RevokeCertificateResponse>().toHaveProperty('auditId');
    });
  });

  describe('timeline types', () => {
    it('TimelineEventType should include all lifecycle event types', () => {
      expectTypeOf<'ISSUED'>().toMatchTypeOf<TimelineEventType>();
      expectTypeOf<'ACTIVATED'>().toMatchTypeOf<TimelineEventType>();
      expectTypeOf<'RENEWED'>().toMatchTypeOf<TimelineEventType>();
      expectTypeOf<'REVOKED'>().toMatchTypeOf<TimelineEventType>();
      expectTypeOf<'EXPIRED'>().toMatchTypeOf<TimelineEventType>();
      expectTypeOf<'KEY_ROTATED'>().toMatchTypeOf<TimelineEventType>();
      expectTypeOf<'NOTIFICATION_SENT'>().toMatchTypeOf<TimelineEventType>();
    });

    it('TimelineEvent should have expected shape', () => {
      expectTypeOf<TimelineEvent>().toHaveProperty('id');
      expectTypeOf<TimelineEvent>().toHaveProperty('type');
      expectTypeOf<TimelineEvent>().toHaveProperty('timestamp');
      expectTypeOf<TimelineEvent>().toHaveProperty('actor');
      expectTypeOf<TimelineEvent>().toHaveProperty('detail');
      expectTypeOf<TimelineEvent>().toHaveProperty('relatedCertificateId');
    });

    it('CertificateTimeline should wrap events for a certificate', () => {
      expectTypeOf<CertificateTimeline>().toHaveProperty('certificateId');
      expectTypeOf<CertificateTimeline>().toHaveProperty('events');
    });
  });

  describe('renewal options types', () => {
    it('RenewalOptions should have expected shape', () => {
      expectTypeOf<RenewalOptions>().toHaveProperty('eligible');
      expectTypeOf<RenewalOptions>().toHaveProperty('reason');
      expectTypeOf<RenewalOptions>().toHaveProperty('suggestedValidityDays');
      expectTypeOf<RenewalOptions>().toHaveProperty('maxValidityDays');
      expectTypeOf<RenewalOptions>().toHaveProperty('canRotateKey');
      expectTypeOf<RenewalOptions>().toHaveProperty('currentAlgorithm');
      expectTypeOf<RenewalOptions>().toHaveProperty('availableAlgorithms');
    });
  });

  describe('revocation reason types', () => {
    it('RevocationReasonOption should have code, label and description', () => {
      expectTypeOf<RevocationReasonOption>().toHaveProperty('code');
      expectTypeOf<RevocationReasonOption>().toHaveProperty('label');
      expectTypeOf<RevocationReasonOption>().toHaveProperty('description');
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

    it('AuditAction should include all expected values including lifecycle actions', () => {
      expectTypeOf<'CREATE'>().toMatchTypeOf<AuditAction>();
      expectTypeOf<'UPDATE'>().toMatchTypeOf<AuditAction>();
      expectTypeOf<'DELETE'>().toMatchTypeOf<AuditAction>();
      expectTypeOf<'REVOKE'>().toMatchTypeOf<AuditAction>();
      expectTypeOf<'IMPORT'>().toMatchTypeOf<AuditAction>();
      expectTypeOf<'EXPORT'>().toMatchTypeOf<AuditAction>();
      expectTypeOf<'ISSUE'>().toMatchTypeOf<AuditAction>();
      expectTypeOf<'RENEW'>().toMatchTypeOf<AuditAction>();
      expectTypeOf<'KEY_ROTATED'>().toMatchTypeOf<AuditAction>();
      expectTypeOf<'NOTIFICATION_SENT'>().toMatchTypeOf<AuditAction>();
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
