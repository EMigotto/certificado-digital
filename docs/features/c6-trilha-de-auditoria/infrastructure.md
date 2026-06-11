# Infraestrutura — C6 Trilha de Auditoria

## Tabela PostgreSQL: audit_events

- Status: NEEDS_HUMAN_CONFIRMATION
- Reason: A feature C6 (Trilha de Auditoria) requer uma nova tabela `audit_events` para armazenar eventos de auditoria imutáveis com 14 colunas, regras de imutabilidade (no UPDATE/DELETE) e índices otimizados para consultas de alto volume (100K+ registros).
- Proposed: PostgreSQL 16, tabela `audit_events` no schema public, com:
  - 14 colunas: id (UUID PK), action (VARCHAR 50), resource_type (VARCHAR 50), resource_id (VARCHAR 255), user_id (VARCHAR 255), user_agent (TEXT), ip_address (VARCHAR 45), timestamp (TIMESTAMPTZ), status (VARCHAR 10), detail (TEXT), metadata (JSONB), changes (JSONB), correlation_id (UUID), duration_ms (INTEGER)
  - RULE `audit_events_no_update` — impede UPDATE
  - RULE `audit_events_no_delete` — impede DELETE
  - Índices: timestamp, user_id, (resource_type, resource_id), (action, status), GIN full-text search em detail
- Alternative-existing: A tabela `audit_entries` já existe para o log de auditoria básico de certificados. A nova tabela `audit_events` é mais abrangente e cobre todos os recursos do sistema (certificados, policies, tokens, zones, keys), não apenas certificados. Ambas coexistem — a antiga mantém compatibilidade.
- Migration script (planned): `backend/prisma/migrations/20260611000000_create_audit_events/migration.sql`
