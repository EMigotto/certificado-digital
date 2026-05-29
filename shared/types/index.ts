/**
 * Shared types for certificado-digital monorepo.
 *
 * Re-exports all domain types consumed by both frontend and backend.
 */

// Certificate domain types
export type {
  CertStatus,
  CertificateStatus,
  Environment,
  EnvironmentLike,
  ImportSource,
  Certificate,
  CertificateCreate,
  CertificateUpdate,
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
} from './certificate.js';

// Audit log types
export type {
  AuditAction,
  AuditResult,
  AuditChange,
  AuditEntry,
  AuditLogEntry,
  LifecycleAuditDetails,
  AuditFilterParams,
  TimelineAction,
} from './audit.js';

// Filter / sort / pagination types
export type {
  CertSortField,
  SortDirection,
  SortParams,
  FilterParams,
  PaginationParams,
  CertificateQueryParams,
} from './filters.js';

// API envelope types
export type {
  PaginatedResponse,
  ApiError,
  ApiSuccess,
  BulkOperationResult,
} from './api.js';

// Expiration alert types
export type {
  AlertStatus,
  NotificationChannel,
  NotificationStatus,
  ExpirationAlert,
  NotificationRecord,
  ExpirationAlertCreate,
  ExpirationAlertListParams,
} from './alert.js';

// Expiration policy types
export type {
  ThresholdConfig,
  ThresholdsMap,
  ExpirationPolicy,
  ExpirationWebhook,
  PolicyCreate,
  PolicyUpdate,
} from './policy.js';

// Dashboard types
export type {
  TrendDirection,
  KpiTrend,
  KpiData,
  HeatmapData,
  AlertSeverity,
  CriticalAlert,
  DashboardSnapshot,
} from './dashboard.js';
