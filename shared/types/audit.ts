/**
 * Audit log domain types.
 *
 * AuditEntry records are immutable — once created they cannot be modified or deleted.
 *
 * Os tipos com prefixo `AuditEvent*` fazem parte da trilha de auditoria expandida (C6),
 * que cobre todos os recursos do sistema (certificados, policies, tokens, zones, keys).
 * Os tipos legados (`AuditEntry`, `AuditAction`, etc.) são mantidos por compatibilidade.
 */

// ─── Tipos legados (compatibilidade) ────────────────────────────────────────

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

// ═══════════════════════════════════════════════════════════════════════════════
// C6 — Trilha de Auditoria Expandida (AuditEvent*)
//
// Novos tipos que cobrem auditoria de todos os recursos do sistema.
// Usam nomenclatura AuditEvent* para evitar colisão com tipos legados.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ações de auditoria expandidas — cobrem todos os recursos do sistema.
 * Mais de 20 ações com prefixo por recurso para clareza.
 */
export type AuditEventAction =
  // Certificados
  | 'CERT_CREATE'
  | 'CERT_UPDATE'
  | 'CERT_DELETE'
  | 'CERT_IMPORT'
  | 'CERT_EXPORT'
  | 'CERT_REVOKE'
  | 'CERT_RENEW'
  | 'CERT_ISSUE'
  // Chaves privadas
  | 'KEY_STORE'
  | 'KEY_RETRIEVE'
  | 'KEY_ROTATE'
  | 'KEY_DELETE'
  // Policies de expiração
  | 'POLICY_CREATE'
  | 'POLICY_UPDATE'
  | 'POLICY_DELETE'
  // Service tokens
  | 'TOKEN_CREATE'
  | 'TOKEN_REVOKE'
  // Zonas
  | 'ZONE_CREATE'
  | 'ZONE_UPDATE'
  | 'ZONE_DELETE'
  // Alertas
  | 'ALERT_CREATE'
  | 'ALERT_ACKNOWLEDGE'
  // Notificações
  | 'NOTIFICATION_SENT'
  // Configuração do sistema
  | 'CONFIG_UPDATE'
  // Autenticação / sessão
  | 'AUTH_LOGIN'
  | 'AUTH_LOGOUT'
  | 'AUTH_FAILED';

/**
 * Tipos de recurso rastreados na trilha de auditoria.
 * Cada evento refere-se a um único tipo de recurso.
 */
export type AuditResourceType =
  | 'CERTIFICATE'
  | 'PRIVATE_KEY'
  | 'POLICY'
  | 'TOKEN'
  | 'ZONE'
  | 'ALERT'
  | 'NOTIFICATION'
  | 'CONFIG'
  | 'USER';

/** Status de um evento de auditoria */
export type AuditEventStatus = 'SUCCESS' | 'FAILURE';

/**
 * Evento de auditoria imutável — modelo principal da trilha de auditoria C6.
 *
 * Cada registro representa uma operação rastreada no sistema. Uma vez criado,
 * não pode ser alterado nem excluído (enforced por rules no PostgreSQL).
 */
export interface AuditEvent {
  /** UUID v4 — identificador único do evento */
  id: string;

  /** Ação realizada (e.g. CERT_CREATE, TOKEN_REVOKE) */
  action: AuditEventAction;

  /** Tipo de recurso afetado pela ação */
  resourceType: AuditResourceType;

  /** Identificador do recurso afetado (UUID do certificado, token, etc.) */
  resourceId: string;

  /** Identificador do usuário/serviço que realizou a ação */
  userId: string;

  /** User-Agent do cliente HTTP (capturado no request) */
  userAgent: string | null;

  /** Endereço IP do cliente (IPv4 ou IPv6, máx. 45 chars) */
  ipAddress: string | null;

  /** Momento exato da ação (ISO-8601 com timezone) */
  timestamp: string;

  /** Resultado da operação */
  status: AuditEventStatus;

  /** Descrição legível do evento (texto livre, buscável via full-text) */
  detail: string | null;

  /** Metadados adicionais estruturados (JSON livre por tipo de ação) */
  metadata: Record<string, unknown> | null;

  /** Diff de campos alterados (null para CREATE / DELETE) */
  changes: AuditChange[] | null;

  /** ID de correlação para agrupar operações relacionadas (e.g. batch import) */
  correlationId: string | null;

  /** Duração da operação em milissegundos */
  durationMs: number | null;
}

/**
 * Payload para criação de um AuditEvent.
 * Campos gerados pelo sistema (id, timestamp) são omitidos.
 */
export type AuditEventCreate = Omit<AuditEvent, 'id' | 'timestamp'>;

/**
 * Filtros para consulta de eventos de auditoria.
 * Suporta paginação obrigatória e múltiplos critérios de busca.
 */
export interface AuditEventFilters {
  /** Página (1-based). Obrigatório. */
  page: number;

  /**
   * Itens por página. Obrigatório.
   * Mínimo: 1, Máximo: 1000 (enforced pelo backend).
   */
  pageSize: number;

  /** Filtrar por ação(ões) específica(s) */
  action?: AuditEventAction | AuditEventAction[];

  /** Filtrar por tipo(s) de recurso */
  resourceType?: AuditResourceType | AuditResourceType[];

  /** Filtrar pelo ID do recurso */
  resourceId?: string;

  /** Filtrar pelo ID do usuário/serviço */
  userId?: string;

  /** Filtrar por status */
  status?: AuditEventStatus;

  /** Filtrar eventos a partir desta data (ISO-8601, inclusive) */
  dateFrom?: string;

  /** Filtrar eventos até esta data (ISO-8601, inclusive) */
  dateTo?: string;

  /** Filtrar por ID de correlação */
  correlationId?: string;

  /** Busca textual no campo detail (full-text search) */
  search?: string;

  /** Campo para ordenação */
  sortBy?: AuditEventSortField;

  /** Direção da ordenação */
  sortDirection?: 'asc' | 'desc';
}

/** Campos disponíveis para ordenação de eventos de auditoria */
export type AuditEventSortField =
  | 'timestamp'
  | 'action'
  | 'resourceType'
  | 'userId'
  | 'status';

/**
 * Parâmetros para exportação da trilha de auditoria.
 * Reutiliza os filtros de busca + formato de saída.
 */
export interface AuditExportParams {
  /** Filtros de busca (mesmos da listagem) */
  filters: Omit<AuditEventFilters, 'page' | 'pageSize'>;

  /** Formato de exportação */
  format: AuditExportFormat;

  /** Colunas a incluir na exportação (vazio = todas) */
  columns?: AuditEventColumn[];
}

/** Formatos de exportação suportados */
export type AuditExportFormat = 'csv' | 'json' | 'pdf';

/** Colunas disponíveis para exportação */
export type AuditEventColumn =
  | 'id'
  | 'action'
  | 'resourceType'
  | 'resourceId'
  | 'userId'
  | 'userAgent'
  | 'ipAddress'
  | 'timestamp'
  | 'status'
  | 'detail'
  | 'metadata'
  | 'changes'
  | 'correlationId'
  | 'durationMs';

/**
 * Parâmetros para geração de relatórios de auditoria.
 */
export interface AuditReportParams {
  /** Filtros temporais (obrigatórios para relatórios) */
  dateFrom: string;
  dateTo: string;

  /** Tipo de relatório */
  reportType: AuditReportType;

  /** Agrupar por (depende do tipo de relatório) */
  groupBy?: AuditReportGroupBy;

  /** Filtros adicionais */
  filters?: Omit<AuditEventFilters, 'page' | 'pageSize' | 'dateFrom' | 'dateTo'>;
}

/** Tipos de relatório de auditoria disponíveis */
export type AuditReportType =
  | 'summary'
  | 'detailed'
  | 'compliance'
  | 'user-activity';

/** Opções de agrupamento para relatórios */
export type AuditReportGroupBy =
  | 'action'
  | 'resourceType'
  | 'userId'
  | 'status'
  | 'day'
  | 'week'
  | 'month';

/**
 * Configuração da trilha de auditoria.
 * Define comportamento de retenção, ações rastreadas e limites.
 */
export interface AuditConfig {
  /** Dias de retenção dos eventos (0 = sem limite). Padrão: 365. */
  retentionDays: number;

  /** Ações habilitadas para rastreamento (vazio = todas) */
  enabledActions: AuditEventAction[];

  /** Tipos de recurso habilitados para rastreamento (vazio = todos) */
  enabledResourceTypes: AuditResourceType[];

  /** Limite máximo de itens por página na listagem */
  maxPageSize: number;

  /** Se deve capturar User-Agent nos eventos */
  captureUserAgent: boolean;

  /** Se deve capturar IP nos eventos */
  captureIpAddress: boolean;

  /** Se deve capturar diff de alterações nos eventos de UPDATE */
  captureChanges: boolean;

  /** Se deve capturar duração das operações */
  captureDuration: boolean;
}

/** Valores padrão para a configuração de auditoria */
export const AUDIT_CONFIG_DEFAULTS: Readonly<AuditConfig> = {
  retentionDays: 365,
  enabledActions: [],
  enabledResourceTypes: [],
  maxPageSize: 1000,
  captureUserAgent: true,
  captureIpAddress: true,
  captureChanges: true,
  captureDuration: true,
};

/**
 * Resultado resumido de relatório de auditoria.
 */
export interface AuditReportSummary {
  /** Período do relatório */
  dateFrom: string;
  dateTo: string;

  /** Total de eventos no período */
  totalEvents: number;

  /** Contagem por status */
  byStatus: Record<AuditEventStatus, number>;

  /** Contagem por tipo de recurso */
  byResourceType: Record<string, number>;

  /** Contagem por ação (top N) */
  byAction: Record<string, number>;

  /** Usuários mais ativos (top N) */
  topUsers: Array<{ userId: string; eventCount: number }>;
}
