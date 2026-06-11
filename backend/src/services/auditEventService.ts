/**
 * Serviço de captura de eventos de auditoria (C6 — Trilha de Auditoria Expandida).
 *
 * Responsabilidades:
 * - logEvent(): valida, sanitiza e persiste evento na tabela audit_events
 * - sanitizeDetails(): remove dados sensíveis do campo details/metadata
 * - Emite evento interno via EventEmitter para SIEM dispatcher (fire-and-forget)
 *
 * Regras:
 * - Senha NUNCA armazenada em details (F1.2)
 * - Todos os campos obrigatórios preenchidos (F1.5)
 * - Erros no EventEmitter não propagam para o caller
 */

import { EventEmitter } from 'node:events';
import type { AuditEvent as PrismaAuditEvent } from '@prisma/client';
import type {
  AuditEvent,
  AuditEventCreate,
  AuditEventFilters,
  AuditEventAction,
  AuditResourceType,
  AuditEventStatus,
  AuditChange,
  PaginatedResponse,
} from '@certificado-digital/shared';
import { AuditEventRepository } from '../repositories/auditEventRepo.js';
import { parsePaginationParams, buildPaginatedResponse } from '../utils/pagination.js';

// ─── EventEmitter para SIEM ─────────────────────────────────────────────────

/**
 * Emitter global para integração com SIEM/log aggregator.
 * Eventos emitidos: 'audit:event' com payload do AuditEvent criado.
 * Fire-and-forget — erros nos listeners não propagam.
 */
export const auditEventEmitter = new EventEmitter();

// Limita listeners para evitar memory leak warnings em ambientes com muitos consumidores
auditEventEmitter.setMaxListeners(20);

// ─── Campos sensíveis ───────────────────────────────────────────────────────

/**
 * Nomes de campo que NUNCA devem aparecer em logs de auditoria.
 * Extensão do sanitizeForAudit() existente para cobrir mais cenários C6.
 */
const SENSITIVE_FIELDS = new Set([
  // Credenciais
  'password',
  'senha',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'apiKey',
  'api_key',
  // Chaves e certificados (dados brutos)
  'privateKey',
  'private_key',
  'pemData',
  'pem_data',
  'keyData',
  'key_data',
  'encryptedKey',
  'encrypted_key',
  // Dados pessoais sensíveis
  'cpf',
  'ssn',
  'creditCard',
  'credit_card',
]);

// ─── Tipos de parâmetros ────────────────────────────────────────────────────

/** Parâmetros para criação de evento via serviço */
export interface LogEventParams {
  /** Ação realizada */
  action: AuditEventAction;

  /** Tipo de recurso afetado */
  resourceType: AuditResourceType;

  /** ID do recurso afetado */
  resourceId: string;

  /** ID do usuário/serviço (pode vir do auditContext) */
  userId: string;

  /** User-Agent (pode vir do auditContext) */
  userAgent?: string | null;

  /** IP do cliente (pode vir do auditContext) */
  ipAddress?: string | null;

  /** Resultado da operação */
  status: AuditEventStatus;

  /** Descrição legível do evento */
  detail?: string | null;

  /** Metadados adicionais (serão sanitizados) */
  metadata?: Record<string, unknown> | null;

  /** Diff de alterações */
  changes?: AuditChange[] | null;

  /** ID de correlação para agrupar operações */
  correlationId?: string | null;

  /** Duração da operação em ms */
  durationMs?: number | null;
}

/** Parâmetros de consulta recebidos da rota */
export interface AuditEventQueryParams {
  page?: string | number;
  pageSize?: string | number;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  userId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  correlationId?: string;
  search?: string;
  sortBy?: string;
  sortDirection?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Remove recursivamente campos sensíveis de um objeto.
 * Campos sensíveis são substituídos por '[REDACTED]'.
 * Funciona em objetos aninhados e arrays.
 *
 * Nunca armazena: senhas, chaves privadas, tokens, CPF, etc.
 */
export function sanitizeDetails(
  obj: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!obj) return null;

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          return sanitizeDetails(item as Record<string, unknown>);
        }
        return item;
      });
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeDetails(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Mapeia um registro Prisma AuditEvent para o tipo compartilhado AuditEvent.
 * Converte Date para ISO-8601 string e garante tipagem correta.
 */
export function mapToApiAuditEvent(event: PrismaAuditEvent): AuditEvent {
  return {
    id: event.id,
    action: event.action as AuditEventAction,
    resourceType: event.resourceType as AuditResourceType,
    resourceId: event.resourceId,
    userId: event.userId,
    userAgent: event.userAgent,
    ipAddress: event.ipAddress,
    timestamp: event.timestamp.toISOString(),
    status: event.status as AuditEventStatus,
    detail: event.detail,
    metadata: event.metadata as Record<string, unknown> | null,
    changes: event.changes as AuditChange[] | null,
    correlationId: event.correlationId,
    durationMs: event.durationMs,
  };
}

// ─── Ações e tipos de recurso válidos ───────────────────────────────────────

const VALID_ACTIONS = new Set<string>([
  'CERT_CREATE', 'CERT_UPDATE', 'CERT_DELETE', 'CERT_IMPORT', 'CERT_EXPORT',
  'CERT_REVOKE', 'CERT_RENEW', 'CERT_ISSUE',
  'KEY_STORE', 'KEY_RETRIEVE', 'KEY_ROTATE', 'KEY_DELETE',
  'POLICY_CREATE', 'POLICY_UPDATE', 'POLICY_DELETE',
  'TOKEN_CREATE', 'TOKEN_REVOKE',
  'ZONE_CREATE', 'ZONE_UPDATE', 'ZONE_DELETE',
  'ALERT_CREATE', 'ALERT_ACKNOWLEDGE',
  'NOTIFICATION_SENT',
  'CONFIG_UPDATE',
  'AUTH_LOGIN', 'AUTH_LOGOUT', 'AUTH_FAILED',
]);

const VALID_RESOURCE_TYPES = new Set<string>([
  'CERTIFICATE', 'PRIVATE_KEY', 'POLICY', 'TOKEN', 'ZONE',
  'ALERT', 'NOTIFICATION', 'CONFIG', 'USER',
]);

const VALID_STATUSES = new Set<string>(['SUCCESS', 'FAILURE']);

// ─── Classe do Serviço ──────────────────────────────────────────────────────

export class AuditEventService {
  constructor(private readonly repo: AuditEventRepository) {}

  /**
   * Registra um evento de auditoria.
   *
   * Fluxo:
   * 1. Valida campos obrigatórios e valores permitidos
   * 2. Sanitiza metadata para remover dados sensíveis
   * 3. Persiste no banco via repositório
   * 4. Emite evento para SIEM dispatcher (fire-and-forget)
   *
   * Critérios cobertos:
   * - F1.1: Registro com todos os campos obrigatórios
   * - F1.2: Registro de falha com details (sem senha)
   * - F1.5: Validação de campos obrigatórios
   * - F2.1–F2.8: Suporte a todos os tipos de evento
   */
  async logEvent(params: LogEventParams): Promise<AuditEvent> {
    // Validação de campos obrigatórios
    if (!params.action || !VALID_ACTIONS.has(params.action)) {
      throw new Error(`Ação de auditoria inválida: ${params.action}`);
    }
    if (!params.resourceType || !VALID_RESOURCE_TYPES.has(params.resourceType)) {
      throw new Error(`Tipo de recurso inválido: ${params.resourceType}`);
    }
    if (!params.resourceId?.trim()) {
      throw new Error('resourceId é obrigatório');
    }
    if (!params.userId?.trim()) {
      throw new Error('userId é obrigatório');
    }
    if (!params.status || !VALID_STATUSES.has(params.status)) {
      throw new Error(`Status inválido: ${params.status}`);
    }

    // Sanitiza metadata removendo dados sensíveis
    const sanitizedMetadata = sanitizeDetails(params.metadata ?? null);

    // Monta payload para persistência
    const eventData: AuditEventCreate = {
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId.trim(),
      userId: params.userId.trim(),
      userAgent: params.userAgent ?? null,
      ipAddress: params.ipAddress ?? null,
      status: params.status,
      detail: params.detail ?? null,
      metadata: sanitizedMetadata,
      changes: params.changes ?? null,
      correlationId: params.correlationId ?? null,
      durationMs: params.durationMs ?? null,
    };

    // Persiste no banco
    const created = await this.repo.create(eventData);
    const mapped = mapToApiAuditEvent(created);

    // Emite evento para SIEM — fire-and-forget, erros não propagam
    try {
      auditEventEmitter.emit('audit:event', mapped);
    } catch {
      // Silencioso — integração SIEM não deve afetar a operação principal
    }

    return mapped;
  }

  /**
   * Consulta paginada de eventos de auditoria com filtros.
   *
   * Recebe query params brutos da rota e normaliza para o formato
   * esperado pelo repositório.
   */
  async getEvents(query: AuditEventQueryParams): Promise<PaginatedResponse<AuditEvent>> {
    const pagination = parsePaginationParams({
      page: query.page,
      pageSize: query.pageSize,
    });

    // Monta filtros tipados
    const filters: Partial<AuditEventFilters> = {};

    if (query.action) {
      const actions = query.action.split(',').filter(Boolean) as AuditEventAction[];
      filters.action = actions.length === 1 ? actions[0] : actions;
    }

    if (query.resourceType) {
      const types = query.resourceType.split(',').filter(Boolean) as AuditResourceType[];
      filters.resourceType = types.length === 1 ? types[0] : types;
    }

    if (query.resourceId) filters.resourceId = query.resourceId;
    if (query.userId) filters.userId = query.userId;
    if (query.status) filters.status = query.status as AuditEventStatus;
    if (query.dateFrom) filters.dateFrom = query.dateFrom;
    if (query.dateTo) filters.dateTo = query.dateTo;
    if (query.correlationId) filters.correlationId = query.correlationId;
    if (query.search) filters.search = query.search;
    if (query.sortBy) filters.sortBy = query.sortBy as AuditEventFilters['sortBy'];
    if (query.sortDirection) {
      filters.sortDirection = query.sortDirection as 'asc' | 'desc';
    }

    const { data, total } = await this.repo.findMany(filters, {
      skip: pagination.skip,
      take: pagination.take,
    });

    const mapped = data.map(mapToApiAuditEvent);
    return buildPaginatedResponse(mapped, total, pagination.page, pagination.pageSize);
  }

  /**
   * Busca detalhes de um evento de auditoria pelo ID.
   * Retorna null se não encontrado.
   */
  async getEventById(id: string): Promise<AuditEvent | null> {
    const event = await this.repo.findById(id);
    if (!event) return null;
    return mapToApiAuditEvent(event);
  }
}
