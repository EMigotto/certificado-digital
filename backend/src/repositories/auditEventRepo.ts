/**
 * Repositório para tabela audit_events (C6 — Trilha de Auditoria Expandida).
 *
 * Operações:
 * - create(): INSERT único (append-only, imutável)
 * - findMany(): consulta paginada com filtros dinâmicos
 * - findById(): detalhes de evento único
 *
 * A tabela audit_events é protegida por RULEs do PostgreSQL que impedem
 * UPDATE e DELETE. Este repositório não expõe essas operações.
 */

import { Prisma } from '@prisma/client';
import type { PrismaClient, AuditEvent as PrismaAuditEvent } from '@prisma/client';
import type {
  AuditEventCreate,
  AuditEventFilters,
  AuditEventSortField,
} from '@certificado-digital/shared';

// ─── Tipos internos ─────────────────────────────────────────────────────────

/** Resultado paginado do repositório */
export interface AuditEventPage {
  data: PrismaAuditEvent[];
  total: number;
}

// ─── Mapeamento de campos de ordenação ──────────────────────────────────────

/** Mapeia nomes de campo da API para colunas do Prisma */
const SORT_FIELD_MAP: Record<AuditEventSortField, keyof PrismaAuditEvent> = {
  timestamp: 'timestamp',
  action: 'action',
  resourceType: 'resourceType',
  userId: 'userId',
  status: 'status',
};

// ─── Classe do Repositório ──────────────────────────────────────────────────

export class AuditEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Constrói a cláusula WHERE dinâmica a partir dos filtros recebidos.
   *
   * Suporta:
   * - action: valor único ou array
   * - resourceType: valor único ou array
   * - resourceId: match exato
   * - userId: match exato
   * - status: match exato
   * - dateFrom / dateTo: intervalo de timestamps
   * - correlationId: match exato
   * - search: busca textual no campo detail (contains, case-insensitive)
   */
  buildWhereClause(filters: Partial<AuditEventFilters>): Prisma.AuditEventWhereInput {
    const conditions: Prisma.AuditEventWhereInput[] = [];

    // Filtro por ação (string única ou array)
    if (filters.action) {
      const actions = Array.isArray(filters.action) ? filters.action : [filters.action];
      if (actions.length === 1) {
        conditions.push({ action: actions[0] });
      } else {
        conditions.push({ action: { in: actions } });
      }
    }

    // Filtro por tipo de recurso (string única ou array)
    if (filters.resourceType) {
      const types = Array.isArray(filters.resourceType)
        ? filters.resourceType
        : [filters.resourceType];
      if (types.length === 1) {
        conditions.push({ resourceType: types[0] });
      } else {
        conditions.push({ resourceType: { in: types } });
      }
    }

    // Filtro por ID do recurso (match exato)
    if (filters.resourceId?.trim()) {
      conditions.push({ resourceId: filters.resourceId.trim() });
    }

    // Filtro por ID do usuário (match exato)
    if (filters.userId?.trim()) {
      conditions.push({ userId: filters.userId.trim() });
    }

    // Filtro por status
    if (filters.status) {
      conditions.push({ status: filters.status });
    }

    // Filtro por intervalo de datas
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      if (!isNaN(from.getTime())) {
        conditions.push({ timestamp: { gte: from } });
      }
    }

    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      if (!isNaN(to.getTime())) {
        // Inclui o dia inteiro
        to.setHours(23, 59, 59, 999);
        conditions.push({ timestamp: { lte: to } });
      }
    }

    // Filtro por correlationId
    if (filters.correlationId?.trim()) {
      conditions.push({ correlationId: filters.correlationId.trim() });
    }

    // Busca textual no campo detail (case-insensitive)
    if (filters.search?.trim()) {
      conditions.push({
        detail: { contains: filters.search.trim(), mode: 'insensitive' },
      });
    }

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { AND: conditions };
  }

  /**
   * INSERT único — cria um evento de auditoria imutável.
   *
   * Campos id e timestamp são gerados automaticamente pelo banco.
   */
  async create(event: AuditEventCreate): Promise<PrismaAuditEvent> {
    return this.prisma.auditEvent.create({
      data: {
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        userId: event.userId,
        userAgent: event.userAgent ?? null,
        ipAddress: event.ipAddress ?? null,
        status: event.status,
        detail: event.detail ?? null,
        metadata: event.metadata as Prisma.InputJsonValue ?? Prisma.JsonNull,
        changes: event.changes as unknown as Prisma.InputJsonValue ?? Prisma.JsonNull,
        correlationId: event.correlationId ?? null,
        durationMs: event.durationMs ?? null,
      },
    });
  }

  /**
   * Consulta paginada com filtros dinâmicos e ordenação configurável.
   *
   * Padrão de ordenação: timestamp DESC (mais recente primeiro).
   * Paginação: skip/take calculados externamente.
   */
  async findMany(
    filters: Partial<AuditEventFilters>,
    pagination: { skip: number; take: number },
  ): Promise<AuditEventPage> {
    const where = this.buildWhereClause(filters);

    // Ordenação
    const sortField = filters.sortBy ? SORT_FIELD_MAP[filters.sortBy] : 'timestamp';
    const sortDirection = filters.sortDirection ?? 'desc';

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { [sortField]: sortDirection },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Busca um evento de auditoria pelo ID.
   * Retorna null se não encontrado.
   */
  async findById(id: string): Promise<PrismaAuditEvent | null> {
    return this.prisma.auditEvent.findUnique({ where: { id } });
  }
}
