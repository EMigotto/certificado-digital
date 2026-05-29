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
  TimelineEvent,
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
