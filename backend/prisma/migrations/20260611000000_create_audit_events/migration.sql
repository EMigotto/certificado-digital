-- C6 Trilha de Auditoria — Tabela audit_events
-- Registros imutáveis de auditoria para todos os recursos do sistema.
-- ATENÇÃO: Esta migration requer aprovação de infraestrutura antes de ser executada.
-- Consulte: docs/features/c6-trilha-de-auditoria/infrastructure.md

-- ---------------------------------------------------------------------------
-- 1. Criar tabela audit_events (14 colunas)
-- ---------------------------------------------------------------------------
CREATE TABLE "audit_events" (
    "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
    "action"          VARCHAR(50)   NOT NULL,
    "resource_type"   VARCHAR(50)   NOT NULL,
    "resource_id"     VARCHAR(255)  NOT NULL,
    "user_id"         VARCHAR(255)  NOT NULL,
    "user_agent"      TEXT,
    "ip_address"      VARCHAR(45),
    "timestamp"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "status"          VARCHAR(10)   NOT NULL DEFAULT 'SUCCESS',
    "detail"          TEXT,
    "metadata"        JSONB,
    "changes"         JSONB,
    "correlation_id"  UUID,
    "duration_ms"     INTEGER,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 2. CHECK constraints — validação de valores permitidos
-- ---------------------------------------------------------------------------

-- Valida que action é uma das ações conhecidas do sistema
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_action_check"
CHECK ("action" IN (
    'CERT_CREATE', 'CERT_UPDATE', 'CERT_DELETE',
    'CERT_IMPORT', 'CERT_EXPORT',
    'CERT_REVOKE', 'CERT_RENEW', 'CERT_ISSUE',
    'KEY_STORE', 'KEY_RETRIEVE', 'KEY_ROTATE', 'KEY_DELETE',
    'POLICY_CREATE', 'POLICY_UPDATE', 'POLICY_DELETE',
    'TOKEN_CREATE', 'TOKEN_REVOKE',
    'ZONE_CREATE', 'ZONE_UPDATE', 'ZONE_DELETE',
    'ALERT_CREATE', 'ALERT_ACKNOWLEDGE',
    'NOTIFICATION_SENT',
    'CONFIG_UPDATE',
    'AUTH_LOGIN', 'AUTH_LOGOUT', 'AUTH_FAILED'
));

-- Valida que resource_type é um dos tipos conhecidos
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_resource_type_check"
CHECK ("resource_type" IN (
    'CERTIFICATE', 'PRIVATE_KEY', 'POLICY', 'TOKEN',
    'ZONE', 'ALERT', 'NOTIFICATION', 'CONFIG', 'USER'
));

-- Valida que status é SUCCESS ou FAILURE
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_status_check"
CHECK ("status" IN ('SUCCESS', 'FAILURE'));

-- ---------------------------------------------------------------------------
-- 3. RULES de imutabilidade — impede UPDATE e DELETE
-- ---------------------------------------------------------------------------

-- Impede qualquer UPDATE nos registros de auditoria
CREATE RULE "audit_events_no_update" AS
    ON UPDATE TO "audit_events"
    DO INSTEAD NOTHING;

-- Impede qualquer DELETE nos registros de auditoria
CREATE RULE "audit_events_no_delete" AS
    ON DELETE TO "audit_events"
    DO INSTEAD NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Índices para performance < 1s em 100K+ registros
-- ---------------------------------------------------------------------------

-- Índice no timestamp para consultas de período
CREATE INDEX "idx_audit_event_timestamp" ON "audit_events" ("timestamp");

-- Índice no user_id para filtragem por usuário
CREATE INDEX "idx_audit_event_user_id" ON "audit_events" ("user_id");

-- Índice composto (resource_type, resource_id) para busca por recurso específico
CREATE INDEX "idx_audit_event_resource" ON "audit_events" ("resource_type", "resource_id");

-- Índice composto (action, status) para filtragem por ação e resultado
CREATE INDEX "idx_audit_event_action_status" ON "audit_events" ("action", "status");

-- Índice GIN full-text search no campo detail para busca textual
CREATE INDEX "idx_audit_event_detail_fts" ON "audit_events"
    USING GIN (to_tsvector('portuguese', COALESCE("detail", '')));

-- Índice no correlation_id para agrupar operações correlacionadas
CREATE INDEX "idx_audit_event_correlation" ON "audit_events" ("correlation_id")
    WHERE "correlation_id" IS NOT NULL;
