/**
 * Audit log domain types.
 *
 * AuditEntry records are immutable — once created they cannot be modified or deleted.
 */

/** Audit log action types */
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'REVOKE' | 'IMPORT' | 'EXPORT';

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

  /** JSON diff of changed fields (null for CREATE / DELETE) */
  changes: AuditChange[] | null;

  /** When the action occurred (ISO-8601) */
  timestamp: string;
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
