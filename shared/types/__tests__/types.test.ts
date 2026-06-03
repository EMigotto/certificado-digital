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
  // Expiration alert types
  AlertStatus,
  NotificationChannel,
  NotificationStatus,
  ExpirationAlert,
  NotificationRecord,
  ExpirationAlertCreate,
  ExpirationAlertListParams,
  // Expiration policy types
  ThresholdConfig,
  ThresholdsMap,
  ExpirationPolicy,
  ExpirationWebhook,
  PolicyCreate,
  PolicyUpdate,
  // C7 certificate policy types
  CertificatePolicy,
  CertificatePolicyCreate,
  CertificatePolicyUpdate,
  // Service token types (C7)
  TokenScope,
  ServiceToken,
  ServiceTokenCreate,
  ServiceTokenCreateResponse,
  ServiceTokenRevoke,
  // Zone types (C7)
  Zone,
  ZoneCreate,
  ZoneUpdate,
  // Dashboard types
  TrendDirection,
  KpiTrend,
  KpiData,
  HeatmapData,
  AlertSeverity,
  CriticalAlert,
  DashboardSnapshot,
  // Private key storage types (C5)
  KeyStatus,
  KeyAuditAction,
  PrivateKeyMetadata,
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

    it('AuditAction should include all expected values including lifecycle and key actions', () => {
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
      // C5 key storage audit actions
      expectTypeOf<'KEY_STORE'>().toMatchTypeOf<AuditAction>();
      expectTypeOf<'KEY_RETRIEVE'>().toMatchTypeOf<AuditAction>();
      expectTypeOf<'KEY_ROTATE'>().toMatchTypeOf<AuditAction>();
      expectTypeOf<'KEY_DELETE'>().toMatchTypeOf<AuditAction>();
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

  // ─── Expiration Alert Types ────────────────────────────────────────────────

  describe('expiration alert types', () => {
    it('AlertStatus should include all lifecycle values', () => {
      expectTypeOf<'PENDING'>().toMatchTypeOf<AlertStatus>();
      expectTypeOf<'NOTIFIED'>().toMatchTypeOf<AlertStatus>();
      expectTypeOf<'FAILED'>().toMatchTypeOf<AlertStatus>();
      expectTypeOf<'ACKNOWLEDGED'>().toMatchTypeOf<AlertStatus>();
    });

    it('NotificationChannel should be email or webhook', () => {
      expectTypeOf<'email'>().toMatchTypeOf<NotificationChannel>();
      expectTypeOf<'webhook'>().toMatchTypeOf<NotificationChannel>();
    });

    it('NotificationStatus should include all delivery outcomes', () => {
      expectTypeOf<'SUCCESS'>().toMatchTypeOf<NotificationStatus>();
      expectTypeOf<'FAILED'>().toMatchTypeOf<NotificationStatus>();
      expectTypeOf<'SKIPPED'>().toMatchTypeOf<NotificationStatus>();
    });

    it('ExpirationAlert should have expected shape', () => {
      expectTypeOf<ExpirationAlert>().toHaveProperty('id');
      expectTypeOf<ExpirationAlert>().toHaveProperty('certificateId');
      expectTypeOf<ExpirationAlert>().toHaveProperty('threshold');
      expectTypeOf<ExpirationAlert>().toHaveProperty('triggeredAt');
      expectTypeOf<ExpirationAlert>().toHaveProperty('status');
      expectTypeOf<ExpirationAlert>().toHaveProperty('certificateCn');
      expectTypeOf<ExpirationAlert>().toHaveProperty('certificateSans');
      expectTypeOf<ExpirationAlert>().toHaveProperty('daysUntilExpiryAtAlert');
      expectTypeOf<ExpirationAlert>().toHaveProperty('caName');
      expectTypeOf<ExpirationAlert>().toHaveProperty('owner');
      expectTypeOf<ExpirationAlert>().toHaveProperty('zone');
      expectTypeOf<ExpirationAlert>().toHaveProperty('environment');
      expectTypeOf<ExpirationAlert>().toHaveProperty('acknowledgedAt');
      expectTypeOf<ExpirationAlert>().toHaveProperty('acknowledgedBy');
      expectTypeOf<ExpirationAlert>().toHaveProperty('createdAt');
      expectTypeOf<ExpirationAlert>().toHaveProperty('updatedAt');
    });

    it('ExpirationAlert.status should be AlertStatus', () => {
      expectTypeOf<ExpirationAlert['status']>().toEqualTypeOf<AlertStatus>();
    });

    it('NotificationRecord should have expected shape', () => {
      expectTypeOf<NotificationRecord>().toHaveProperty('id');
      expectTypeOf<NotificationRecord>().toHaveProperty('alertId');
      expectTypeOf<NotificationRecord>().toHaveProperty('channel');
      expectTypeOf<NotificationRecord>().toHaveProperty('sentAt');
      expectTypeOf<NotificationRecord>().toHaveProperty('status');
      expectTypeOf<NotificationRecord>().toHaveProperty('errorMessage');
      expectTypeOf<NotificationRecord>().toHaveProperty('webhookId');
      expectTypeOf<NotificationRecord>().toHaveProperty('attemptNumber');
    });

    it('NotificationRecord.channel should be NotificationChannel', () => {
      expectTypeOf<NotificationRecord['channel']>().toEqualTypeOf<NotificationChannel>();
    });

    it('NotificationRecord.status should be NotificationStatus', () => {
      expectTypeOf<NotificationRecord['status']>().toEqualTypeOf<NotificationStatus>();
    });

    it('ExpirationAlertCreate should omit system fields', () => {
      expectTypeOf<ExpirationAlertCreate>().not.toHaveProperty('id');
      expectTypeOf<ExpirationAlertCreate>().not.toHaveProperty('status');
      expectTypeOf<ExpirationAlertCreate>().not.toHaveProperty('acknowledgedAt');
      expectTypeOf<ExpirationAlertCreate>().not.toHaveProperty('acknowledgedBy');
      expectTypeOf<ExpirationAlertCreate>().not.toHaveProperty('createdAt');
      expectTypeOf<ExpirationAlertCreate>().not.toHaveProperty('updatedAt');
      expectTypeOf<ExpirationAlertCreate>().toHaveProperty('certificateId');
      expectTypeOf<ExpirationAlertCreate>().toHaveProperty('threshold');
    });

    it('ExpirationAlertListParams should have optional filter fields', () => {
      expectTypeOf<ExpirationAlertListParams>().toHaveProperty('page');
      expectTypeOf<ExpirationAlertListParams>().toHaveProperty('pageSize');
      expectTypeOf<ExpirationAlertListParams>().toHaveProperty('status');
      expectTypeOf<ExpirationAlertListParams>().toHaveProperty('threshold');
      expectTypeOf<ExpirationAlertListParams>().toHaveProperty('certificateId');
    });
  });

  // ─── Expiration Policy Types ───────────────────────────────────────────────

  describe('expiration policy types', () => {
    it('ThresholdConfig should have enabled and channels', () => {
      expectTypeOf<ThresholdConfig>().toHaveProperty('enabled');
      expectTypeOf<ThresholdConfig>().toHaveProperty('channels');
    });

    it('ThresholdConfig.channels should be NotificationChannel[]', () => {
      expectTypeOf<ThresholdConfig['channels']>().toEqualTypeOf<NotificationChannel[]>();
    });

    it('ThresholdsMap should have all four threshold tiers', () => {
      expectTypeOf<ThresholdsMap>().toHaveProperty('days_90');
      expectTypeOf<ThresholdsMap>().toHaveProperty('days_30');
      expectTypeOf<ThresholdsMap>().toHaveProperty('days_7');
      expectTypeOf<ThresholdsMap>().toHaveProperty('days_1');
    });

    it('ThresholdsMap tiers should be ThresholdConfig', () => {
      expectTypeOf<ThresholdsMap['days_90']>().toEqualTypeOf<ThresholdConfig>();
      expectTypeOf<ThresholdsMap['days_30']>().toEqualTypeOf<ThresholdConfig>();
      expectTypeOf<ThresholdsMap['days_7']>().toEqualTypeOf<ThresholdConfig>();
      expectTypeOf<ThresholdsMap['days_1']>().toEqualTypeOf<ThresholdConfig>();
    });

    it('ExpirationPolicy should have expected shape', () => {
      expectTypeOf<ExpirationPolicy>().toHaveProperty('id');
      expectTypeOf<ExpirationPolicy>().toHaveProperty('name');
      expectTypeOf<ExpirationPolicy>().toHaveProperty('description');
      expectTypeOf<ExpirationPolicy>().toHaveProperty('zoneId');
      expectTypeOf<ExpirationPolicy>().toHaveProperty('isDefault');
      expectTypeOf<ExpirationPolicy>().toHaveProperty('thresholds');
      expectTypeOf<ExpirationPolicy>().toHaveProperty('emailEnabled');
      expectTypeOf<ExpirationPolicy>().toHaveProperty('emailRecipientsAdditional');
      expectTypeOf<ExpirationPolicy>().toHaveProperty('emailSubjectPrefix');
      expectTypeOf<ExpirationPolicy>().toHaveProperty('createdBy');
      expectTypeOf<ExpirationPolicy>().toHaveProperty('updatedBy');
      expectTypeOf<ExpirationPolicy>().toHaveProperty('createdAt');
      expectTypeOf<ExpirationPolicy>().toHaveProperty('updatedAt');
    });

    it('ExpirationPolicy.thresholds should be ThresholdsMap', () => {
      expectTypeOf<ExpirationPolicy['thresholds']>().toEqualTypeOf<ThresholdsMap>();
    });

    it('ExpirationWebhook should have expected shape', () => {
      expectTypeOf<ExpirationWebhook>().toHaveProperty('id');
      expectTypeOf<ExpirationWebhook>().toHaveProperty('policyId');
      expectTypeOf<ExpirationWebhook>().toHaveProperty('url');
      expectTypeOf<ExpirationWebhook>().toHaveProperty('headers');
      expectTypeOf<ExpirationWebhook>().toHaveProperty('retryStrategy');
      expectTypeOf<ExpirationWebhook>().toHaveProperty('maxRetries');
      expectTypeOf<ExpirationWebhook>().toHaveProperty('timeoutSeconds');
      expectTypeOf<ExpirationWebhook>().toHaveProperty('isActive');
      expectTypeOf<ExpirationWebhook>().toHaveProperty('testResult');
      expectTypeOf<ExpirationWebhook>().toHaveProperty('lastTestAt');
      expectTypeOf<ExpirationWebhook>().toHaveProperty('createdAt');
      expectTypeOf<ExpirationWebhook>().toHaveProperty('updatedAt');
    });

    it('PolicyCreate should omit system fields', () => {
      expectTypeOf<PolicyCreate>().not.toHaveProperty('id');
      expectTypeOf<PolicyCreate>().not.toHaveProperty('updatedBy');
      expectTypeOf<PolicyCreate>().not.toHaveProperty('createdAt');
      expectTypeOf<PolicyCreate>().not.toHaveProperty('updatedAt');
      expectTypeOf<PolicyCreate>().toHaveProperty('name');
      expectTypeOf<PolicyCreate>().toHaveProperty('createdBy');
    });

    it('PolicyUpdate should have all optional fields and omit createdBy', () => {
      expectTypeOf<PolicyUpdate>().not.toHaveProperty('createdBy');
      // PolicyUpdate fields are optional — verify that undefined is assignable
      expectTypeOf<undefined>().toMatchTypeOf<PolicyUpdate['name']>();
      expectTypeOf<undefined>().toMatchTypeOf<PolicyUpdate['thresholds']>();
    });
  });

  // ─── C7 Certificate Policy Types ────────────────────────────────────────

  describe('certificate policy types (C7)', () => {
    it('CertificatePolicy should have expected shape', () => {
      expectTypeOf<CertificatePolicy>().toHaveProperty('id');
      expectTypeOf<CertificatePolicy>().toHaveProperty('name');
      expectTypeOf<CertificatePolicy>().toHaveProperty('description');
      expectTypeOf<CertificatePolicy>().toHaveProperty('environment');
      expectTypeOf<CertificatePolicy>().toHaveProperty('minKeySize');
      expectTypeOf<CertificatePolicy>().toHaveProperty('maxValidityDays');
      expectTypeOf<CertificatePolicy>().toHaveProperty('allowedKeyTypes');
      expectTypeOf<CertificatePolicy>().toHaveProperty('allowedOrgNames');
      expectTypeOf<CertificatePolicy>().toHaveProperty('requiredFields');
      expectTypeOf<CertificatePolicy>().toHaveProperty('rules');
      expectTypeOf<CertificatePolicy>().toHaveProperty('createdAt');
      expectTypeOf<CertificatePolicy>().toHaveProperty('updatedAt');
    });

    it('CertificatePolicyCreate should omit system fields', () => {
      expectTypeOf<CertificatePolicyCreate>().not.toHaveProperty('id');
      expectTypeOf<CertificatePolicyCreate>().not.toHaveProperty('createdAt');
      expectTypeOf<CertificatePolicyCreate>().not.toHaveProperty('updatedAt');
      expectTypeOf<CertificatePolicyCreate>().toHaveProperty('name');
      expectTypeOf<CertificatePolicyCreate>().toHaveProperty('environment');
      expectTypeOf<CertificatePolicyCreate>().toHaveProperty('minKeySize');
    });

    it('CertificatePolicyUpdate should have all optional fields', () => {
      expectTypeOf<undefined>().toMatchTypeOf<CertificatePolicyUpdate['name']>();
      expectTypeOf<undefined>().toMatchTypeOf<CertificatePolicyUpdate['minKeySize']>();
      expectTypeOf<undefined>().toMatchTypeOf<CertificatePolicyUpdate['environment']>();
    });
  });

  // ─── Service Token Types (C7) ────────────────────────────────────────────

  describe('service token types (C7)', () => {
    it('TokenScope should include all expected scope values', () => {
      expectTypeOf<'certificates:read'>().toMatchTypeOf<TokenScope>();
      expectTypeOf<'certificates:write'>().toMatchTypeOf<TokenScope>();
      expectTypeOf<'certificates:delete'>().toMatchTypeOf<TokenScope>();
      expectTypeOf<'policies:read'>().toMatchTypeOf<TokenScope>();
      expectTypeOf<'policies:write'>().toMatchTypeOf<TokenScope>();
      expectTypeOf<'zones:read'>().toMatchTypeOf<TokenScope>();
      expectTypeOf<'zones:write'>().toMatchTypeOf<TokenScope>();
      expectTypeOf<'tokens:read'>().toMatchTypeOf<TokenScope>();
      expectTypeOf<'tokens:write'>().toMatchTypeOf<TokenScope>();
      expectTypeOf<'audit:read'>().toMatchTypeOf<TokenScope>();
      expectTypeOf<'admin'>().toMatchTypeOf<TokenScope>();
    });

    it('ServiceToken should have expected shape', () => {
      expectTypeOf<ServiceToken>().toHaveProperty('id');
      expectTypeOf<ServiceToken>().toHaveProperty('name');
      expectTypeOf<ServiceToken>().toHaveProperty('tokenPreview');
      expectTypeOf<ServiceToken>().toHaveProperty('scopes');
      expectTypeOf<ServiceToken>().toHaveProperty('createdAt');
      expectTypeOf<ServiceToken>().toHaveProperty('expiresAt');
      expectTypeOf<ServiceToken>().toHaveProperty('revokedAt');
      expectTypeOf<ServiceToken>().toHaveProperty('revocationReason');
      expectTypeOf<ServiceToken>().toHaveProperty('lastUsedAt');
      expectTypeOf<ServiceToken>().toHaveProperty('createdBy');
    });

    it('ServiceTokenCreate should have name, scopes, and optional expiresAt', () => {
      expectTypeOf<ServiceTokenCreate>().toHaveProperty('name');
      expectTypeOf<ServiceTokenCreate>().toHaveProperty('scopes');
      expectTypeOf<ServiceTokenCreate>().toHaveProperty('expiresAt');
    });

    it('ServiceTokenCreateResponse should expose plainToken and token', () => {
      expectTypeOf<ServiceTokenCreateResponse>().toHaveProperty('token');
      expectTypeOf<ServiceTokenCreateResponse>().toHaveProperty('plainToken');
    });

    it('ServiceTokenRevoke should have revocationReason', () => {
      expectTypeOf<ServiceTokenRevoke>().toHaveProperty('revocationReason');
    });
  });

  // ─── Zone Types (C7) ────────────────────────────────────────────────────

  describe('zone types (C7)', () => {
    it('Zone should have expected shape', () => {
      expectTypeOf<Zone>().toHaveProperty('id');
      expectTypeOf<Zone>().toHaveProperty('name');
      expectTypeOf<Zone>().toHaveProperty('description');
      expectTypeOf<Zone>().toHaveProperty('region');
      expectTypeOf<Zone>().toHaveProperty('metadata');
      expectTypeOf<Zone>().toHaveProperty('createdAt');
      expectTypeOf<Zone>().toHaveProperty('updatedAt');
    });

    it('ZoneCreate should omit system fields', () => {
      expectTypeOf<ZoneCreate>().not.toHaveProperty('id');
      expectTypeOf<ZoneCreate>().not.toHaveProperty('createdAt');
      expectTypeOf<ZoneCreate>().not.toHaveProperty('updatedAt');
      expectTypeOf<ZoneCreate>().toHaveProperty('name');
      expectTypeOf<ZoneCreate>().toHaveProperty('region');
    });

    it('ZoneUpdate should have all optional fields', () => {
      expectTypeOf<undefined>().toMatchTypeOf<ZoneUpdate['name']>();
      expectTypeOf<undefined>().toMatchTypeOf<ZoneUpdate['description']>();
      expectTypeOf<undefined>().toMatchTypeOf<ZoneUpdate['region']>();
    });
  });

  // ─── Dashboard Types ──────────────────────────────────────────────────────

  describe('dashboard types', () => {
    it('TrendDirection should be up, down, or stable', () => {
      expectTypeOf<'up'>().toMatchTypeOf<TrendDirection>();
      expectTypeOf<'down'>().toMatchTypeOf<TrendDirection>();
      expectTypeOf<'stable'>().toMatchTypeOf<TrendDirection>();
    });

    it('KpiTrend should have direction and delta', () => {
      expectTypeOf<KpiTrend>().toHaveProperty('direction');
      expectTypeOf<KpiTrend>().toHaveProperty('delta');
    });

    it('KpiData should have expected metrics and trends', () => {
      expectTypeOf<KpiData>().toHaveProperty('totalManaged');
      expectTypeOf<KpiData>().toHaveProperty('validCount');
      expectTypeOf<KpiData>().toHaveProperty('expiringLessThan30d');
      expectTypeOf<KpiData>().toHaveProperty('expiredOrRevoked');
      expectTypeOf<KpiData>().toHaveProperty('trends');
    });

    it('KpiData.trends should have all four metric trends', () => {
      expectTypeOf<KpiData['trends']>().toHaveProperty('totalManaged');
      expectTypeOf<KpiData['trends']>().toHaveProperty('validCount');
      expectTypeOf<KpiData['trends']>().toHaveProperty('expiringLessThan30d');
      expectTypeOf<KpiData['trends']>().toHaveProperty('expiredOrRevoked');
    });

    it('HeatmapData should be Record<number, number>', () => {
      expectTypeOf<HeatmapData>().toEqualTypeOf<Record<number, number>>();
    });

    it('AlertSeverity should include all levels', () => {
      expectTypeOf<'critical'>().toMatchTypeOf<AlertSeverity>();
      expectTypeOf<'warning'>().toMatchTypeOf<AlertSeverity>();
      expectTypeOf<'info'>().toMatchTypeOf<AlertSeverity>();
    });

    it('CriticalAlert should have expected display fields', () => {
      expectTypeOf<CriticalAlert>().toHaveProperty('cn');
      expectTypeOf<CriticalAlert>().toHaveProperty('owner');
      expectTypeOf<CriticalAlert>().toHaveProperty('env');
      expectTypeOf<CriticalAlert>().toHaveProperty('daysLeft');
      expectTypeOf<CriticalAlert>().toHaveProperty('severity');
    });

    it('CriticalAlert.severity should be AlertSeverity', () => {
      expectTypeOf<CriticalAlert['severity']>().toEqualTypeOf<AlertSeverity>();
    });

    it('DashboardSnapshot should combine all dashboard data', () => {
      expectTypeOf<DashboardSnapshot>().toHaveProperty('kpis');
      expectTypeOf<DashboardSnapshot>().toHaveProperty('heatmap');
      expectTypeOf<DashboardSnapshot>().toHaveProperty('alerts');
      expectTypeOf<DashboardSnapshot>().toHaveProperty('generatedAt');
    });

    it('DashboardSnapshot.kpis should be KpiData', () => {
      expectTypeOf<DashboardSnapshot['kpis']>().toEqualTypeOf<KpiData>();
    });

    it('DashboardSnapshot.heatmap should be HeatmapData', () => {
      expectTypeOf<DashboardSnapshot['heatmap']>().toEqualTypeOf<HeatmapData>();
    });

    it('DashboardSnapshot.alerts should be CriticalAlert[]', () => {
      expectTypeOf<DashboardSnapshot['alerts']>().toEqualTypeOf<CriticalAlert[]>();
    });
  });

  // ─── Private Key Storage Types (C5) ──────────────────────────────────────

  describe('private key storage types (C5)', () => {
    it('KeyStatus should include all lifecycle values', () => {
      expectTypeOf<'ACTIVE'>().toMatchTypeOf<KeyStatus>();
      expectTypeOf<'ROTATED'>().toMatchTypeOf<KeyStatus>();
      expectTypeOf<'DELETED'>().toMatchTypeOf<KeyStatus>();
    });

    it('KeyAuditAction should include all key operation values', () => {
      expectTypeOf<'KEY_STORE'>().toMatchTypeOf<KeyAuditAction>();
      expectTypeOf<'KEY_RETRIEVE'>().toMatchTypeOf<KeyAuditAction>();
      expectTypeOf<'KEY_ROTATE'>().toMatchTypeOf<KeyAuditAction>();
      expectTypeOf<'KEY_DELETE'>().toMatchTypeOf<KeyAuditAction>();
    });

    it('PrivateKeyMetadata should have expected shape', () => {
      expectTypeOf<PrivateKeyMetadata>().toHaveProperty('id');
      expectTypeOf<PrivateKeyMetadata>().toHaveProperty('certificateId');
      expectTypeOf<PrivateKeyMetadata>().toHaveProperty('algorithm');
      expectTypeOf<PrivateKeyMetadata>().toHaveProperty('fingerprint');
      expectTypeOf<PrivateKeyMetadata>().toHaveProperty('status');
      expectTypeOf<PrivateKeyMetadata>().toHaveProperty('encAlgorithm');
      expectTypeOf<PrivateKeyMetadata>().toHaveProperty('previousKeyId');
      expectTypeOf<PrivateKeyMetadata>().toHaveProperty('createdAt');
      expectTypeOf<PrivateKeyMetadata>().toHaveProperty('updatedAt');
    });

    it('PrivateKeyMetadata.status should be KeyStatus', () => {
      expectTypeOf<PrivateKeyMetadata['status']>().toEqualTypeOf<KeyStatus>();
    });

    it('PrivateKeyMetadata.previousKeyId should be nullable', () => {
      expectTypeOf<null>().toMatchTypeOf<PrivateKeyMetadata['previousKeyId']>();
      expectTypeOf<string>().toMatchTypeOf<PrivateKeyMetadata['previousKeyId']>();
    });
  });
});
