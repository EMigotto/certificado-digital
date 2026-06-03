/**
 * Audit log domain types.
 *
 * AuditEntry records are immutable — once created they cannot be modified or deleted.
 */

/** Audit log action types (includes lifecycle events and key operations) */
export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'REVOKE'
  | 'IMPORT'
  | 'EXPORT'
  | 'ISSUE'
  | 'RENEW'
  | 'KEY_ROTATED'
  | 'NOTIFICATION_SENT'
  | 'KEY_STORE'
  | 'KEY_RETRIEVE'
  | 'KEY_ROTATE'
  | 'KEY_DELETE';

/** Outcome of the audited operation */
export type AuditResult = 'SUCCESS' | 'FAILURE';

/** Describes a single field-level change inside an audit entry */
export interface AuditChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

/** Immutable audit log entry */
export interface AuditEntry {
  id: string;

  /** Related certificate ID (null if cert was deleted) */
  certificateId: string | null;

  /** Common name snapshot — preserved even after certificate deletion */
  certCn: string;

  action: AuditAction;
  actor: string;
  result: AuditResult;
  detail: string | null;

  /** Batch ID for bulk operations (null for single ops) */
  batchId: string | null;

  /** JSON diff of changed fields (null for CREATE / DELETE) */
  changes: AuditChange[] | null;

  /** When the action occurred (ISO-8601) */
  timestamp: string;
}

/**
 * Frontend-friendly audit log entry — uses simplified field names.
 * Maps to AuditEntry at the API boundary.
 */
export interface AuditLogEntry {
  id: string;
  certId: string | null;
  certCn: string;
  action: AuditAction;
  actor: string;
  result: AuditResult;
  detail: string | null;
  batchId: string | null;
  timestamp: string;
  /** Lifecycle-specific metadata (present for ISSUE, RENEW, REVOKE, KEY_ROTATED, NOTIFICATION_SENT) */
  lifecycleDetails?: LifecycleAuditDetails | null;
}

/** Lifecycle-specific details attached to audit log entries */
export interface LifecycleAuditDetails {
  /** ISSUE: CA name used for issuance */
  caName?: string;
  /** ISSUE: Algorithm (e.g. RSA 2048, ECDSA P-256) */
  algorithm?: string;
  /** ISSUE: Common Name of the issued cert */
  cn?: string;
  /** RENEW: ID of the old certificate being renewed */
  oldCertId?: string;
  /** RENEW: ID of the newly issued certificate */
  newCertId?: string;
  /** RENEW: Whether the key was rotated during renewal */
  rotateKey?: boolean;
  /** REVOKE: CRL reason code */
  reasonCode?: string;
  /** REVOKE: Human-readable justification */
  justification?: string;
  /** KEY_ROTATED: Previous algorithm */
  oldAlgorithm?: string;
  /** KEY_ROTATED: New algorithm */
  newAlgorithm?: string;
  /** NOTIFICATION_SENT: Recipient (email, Slack channel, etc.) */
  recipient?: string;
  /** NOTIFICATION_SENT: Notification subject */
  subject?: string;
}

/** Query parameters for filtering audit log entries */
export interface AuditFilterParams {
  page?: string;
  pageSize?: string;
  action?: string;
  actor?: string;
  certificateId?: string;
  batchId?: string;
  dateFrom?: string;
  dateTo?: string;
  result?: string;
}

// ─── Timeline types ─────────────────────────────────────────────────────────

/** Actions that appear on the certificate timeline */
export type TimelineAction =
  | 'CREATED'
  | 'ISSUED'
  | 'RENEWED'
  | 'REVOKED'
  | 'KEY_ROTATED'
  | 'NOTIFICATION_SENT';

/** A single event on the certificate timeline */
export interface TimelineEvent {
  id: string;
  certificateId: string;
  action: TimelineAction;
  actor: string;
  timestamp: string; // ISO-8601
  details: Record<string, unknown>;
  /** ID of a related certificate (e.g. renewal parent/child) */
  relatedCertId?: string | null;
  result: AuditResult;
}
