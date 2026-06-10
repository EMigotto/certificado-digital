# Infrastructure: C6. Trilha de Auditoria

Este documento descreve recursos de infraestrutura persistente necessários para implementar a feature "Trilha de Auditoria".

## PostgreSQL Table: audit_events

- **Status**: NEEDS_HUMAN_CONFIRMATION
- **Reason**: Sistema de auditoria imutável (append-only) requer tabela dedicada com constraints que impeçam UPDATE/DELETE. Logs devem ser persistidos para cumprir requisitos regulatórios de rastreabilidade.
- **Proposed**: PostgreSQL 16 (já disponível no docker-compose.yml), schema "public", tabela "audit_events" com:
  - Colunas: id (PK), timestamp, user_id, user_email, action, resource_type, resource_id, resource_name, status, details (JSONB), ip_address, user_agent, request_id, created_at
  - Constraint: ON DELETE DO NOTHING (impede deleção)
  - Constraint: ON UPDATE DO NOTHING (impede atualização)
  - Índices: (timestamp, user_id), (resource_type, resource_id), (action, status), (user_id)
  - Trigger: Antes de CREATE, valida que action é enum válido e status é 'success' ou 'failure'
  - Particionamento (opcional): Por mês em timestamp para otimizar retenção e limpeza

- **Alternative-existing**: Não existe tabela de auditoria prévia. Se desejo reutilizar infraestrutura de logging geral, confirmar em interface de resposta.

- **Migration script (planned)**: `backend/prisma/migrations/202406XX_create_audit_events_table.sql`

---

## PostgreSQL Table: audit_archive_index

- **Status**: NEEDS_HUMAN_CONFIRMATION
- **Reason**: Quando eventos antigos são arquivados (comprimidos, assinados), precisamos manter índice de quais dumps existem para recuperação futura. Tabela separada evita poluir audit_events principal.
- **Proposed**: PostgreSQL 16, schema "public", tabela "audit_archive_index" com:
  - Colunas: id (PK), archive_name, from_date, to_date, created_at, compressed_size_bytes, checksum_sha256, storage_location (S3 key ou filesystem path), archive_signed=true
  - Índice: (from_date, to_date) para range queries rápidas
  - Constraint: ON DELETE SET NULL para audit_events se necessário (ou DELETE CASCADE se arquivo for removido)

- **Alternative-existing**: Nenhuma

- **Migration script (planned)**: `backend/prisma/migrations/202406XX_create_audit_archive_index_table.sql`

---

## PostgreSQL Table: siem_webhook_queue

- **Status**: NEEDS_HUMAN_CONFIRMATION
- **Reason**: Se webhook falhar, eventos devem ser enfileirados para retry. Tabela de fila garante que eventos não sejam perdidos e respeita batching (SIEM_WEBHOOK_BATCH_SIZE).
- **Proposed**: PostgreSQL 16, schema "public", tabela "siem_webhook_queue" com:
  - Colunas: id (PK), event_id (FK para audit_events), queued_at, attempt_count, next_retry_at, status (pending, sent, failed, abandoned), error_message
  - Índice: (status, next_retry_at) para polling eficiente
  - Constraint: ON DELETE CASCADE quando evento de auditoria é deletado (ou ON DELETE SET NULL se manter referência)
  - Auto-cleanup: rows abandonadas (attempt_count >= 5) deletadas após 7 dias

- **Alternative-existing**: Nenhuma

- **Migration script (planned)**: `backend/prisma/migrations/202406XX_create_siem_webhook_queue_table.sql`

---

## PostgreSQL Table: audit_config

- **Status**: NEEDS_HUMAN_CONFIRMATION
- **Reason**: Configurações de auditoria (retenção, syslog, webhook) precisam ser persistidas e alteráveis em runtime sem restart.
- **Proposed**: PostgreSQL 16, schema "public", tabela "audit_config" com:
  - Colunas: key (PK, text), value (text/JSONB), updated_at, updated_by (user_id)
  - Rows: 
    - `retention_days` → "365"
    - `syslog_enabled` → "true|false"
    - `syslog_host` → "siem.example.com"
    - `syslog_port` → "514"
    - `syslog_facility` → "16"
    - `webhook_enabled` → "true|false"
    - `webhook_url` → "https://siem.example.com/ingest"
    - `webhook_secret` → "***" (secret armazenado em variável de ambiente ou vault, não em plain text na BD)
    - `webhook_batch_size` → "10"
    - `webhook_timeout_ms` → "10000"
  - Índice: none (tabela pequena, apenas chave primária)
  - Constraint: Valor é validado conforme tipo (ex: port é 1-65535, retention_days >= 365)

- **Alternative-existing**: Nenhuma

- **Migration script (planned)**: `backend/prisma/migrations/202406XX_create_audit_config_table.sql`

---

## S3 Bucket (Optional): Audit Archive Storage

- **Status**: NEEDS_HUMAN_CONFIRMATION
- **Reason**: Se retenção exigir arquivamento (dump comprimido + assinado de eventos > 1 ano), bucket S3 pode armazenar arquivos. Se filesystem for suficiente, pode ser adiado.
- **Proposed**: AWS S3 (ou equivalente MinIO/compatible), bucket "certificado-digital-audit-archive" com:
  - Versionamento: desabilitado (archives são imutáveis)
  - Ciclo de vida: Mover para Glacier após 30 dias (opcional para custo)
  - Acesso: via IAM role (backend assume role com permissão de PUT/GET)
  - Encriptação: SSE-S3 (AWS managed) ou SSE-KMS (customer managed)
  - Pasta structure: `s3://certificado-digital-audit-archive/2026/06/audit_2026-06-01_to_2026-06-30.tar.gz.sig`
  - Cada arquivo acompanhado de arquivo `.sig` (HMAC-SHA256 signature)

- **Alternative-existing**: Se aplicação roda em VM com filesystem, usar `/var/lib/audit-archives/` local. Confirmar em resposta.

- **Migration script (planned)**: Terraform/CloudFormation para criar bucket (não SQL)

---

## Syslog Server (Optional): SIEM Integration

- **Status**: NEEDS_HUMAN_CONFIRMATION
- **Reason**: Se Splunk/ELK já estiver disponível com endpoint syslog, não é necessário criar. Backend apenas envia logs para servidor remoto existente.
- **Proposed**: Usar servidor SIEM existente (Splunk, ELK, Graylog, etc.) que expõe endpoint syslog (UDP/TCP port 514 ou custom).
  - Backend configura: `SIEM_SYSLOG_HOST`, `SIEM_SYSLOG_PORT`, `SIEM_SYSLOG_FACILITY` via variáveis de ambiente
  - Não é necessário criar nova infraestrutura se SIEM já está operacional
  - Alternativa: If SIEM não disponível, documentar como fazer setup de Syslog mock (nc -u -l localhost 514) para testes

- **Alternative-existing**: Perguntar ao time se Splunk/ELK/Graylog já está disponível. Se sim, usar o existente.

- **Migration script (planned)**: Nenhum (configuração apenas, não recursos)

---

## Webhook Endpoint (Optional): SIEM Ingest

- **Status**: NEEDS_HUMAN_CONFIRMATION
- **Reason**: Se SIEM tiver endpoint HTTP/HTTPS para ingerir eventos, backend envia via webhook. Se não disponível, usar syslog.
- **Proposed**: SIEM expõe endpoint POST `https://siem.example.com/ingest` que aceita:
  ```json
  {
    "batch_id": "uuid",
    "timestamp": "ISO8601",
    "event_count": N,
    "events": [...]
  }
  ```
  Com validação de HMAC-SHA256 no header `X-Audit-Signature`.

- **Alternative-existing**: Se Splunk HTTP Event Collector (HEC) estiver disponível, usar como webhook. URL: `https://splunk-host:8088/services/collector`

- **Migration script (planned)**: Nenhum (configuração apenas)

---

## Prisma Schema Updates

- **Status**: NEEDS_HUMAN_CONFIRMATION
- **Reason**: Modelos Prisma devem ser atualizados para refletir novas tabelas.
- **Proposed**: Adicionar em `backend/prisma/schema.prisma`:
  ```prisma
  model AuditEvent {
    id String @id @default(cuid())
    timestamp DateTime @default(now()) @db.Timestamptz()
    userId String @map("user_id")
    userEmail String @map("user_email")
    action String // enum: login, logout, certificate_requested, etc.
    resourceType String? @map("resource_type")
    resourceId String? @map("resource_id")
    resourceName String? @map("resource_name")
    status String // enum: success, failure
    details Json @default("{}")
    ipAddress String? @map("ip_address")
    userAgent String? @map("user_agent")
    requestId String? @map("request_id")
    createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()

    @@index([timestamp, userId])
    @@index([resourceType, resourceId])
    @@index([action, status])
    @@map("audit_events")
  }

  // Similar para AuditArchiveIndex, SiemWebhookQueue, AuditConfig
  ```

- **Alternative-existing**: Nenhum

- **Migration script (planned)**: `backend/prisma/migrations/202406XX_prisma_audit_models.sql`

---

## Summary of Infrastructure Approvals Required

| Resource | Type | Status | Decision Needed |
|----------|------|--------|-----------------|
| audit_events table | PostgreSQL | NEEDS_HUMAN_CONFIRMATION | Approve to proceed with migration |
| audit_archive_index table | PostgreSQL | NEEDS_HUMAN_CONFIRMATION | Approve or use existing logging infrastructure |
| siem_webhook_queue table | PostgreSQL | NEEDS_HUMAN_CONFIRMATION | Approve for retry queue, or simplify without queue |
| audit_config table | PostgreSQL | NEEDS_HUMAN_CONFIRMATION | Approve for runtime config, or use env vars only |
| S3 audit archive bucket | AWS S3 | NEEDS_HUMAN_CONFIRMATION | Approve, defer to Phase 2, or use filesystem |
| Syslog endpoint | External (SIEM) | NEEDS_HUMAN_CONFIRMATION | Confirm existing SIEM availability |
| Webhook endpoint | External (SIEM) | NEEDS_HUMAN_CONFIRMATION | Confirm SIEM supports webhook ingestion |

## Next Steps

1. Human reviews this file and responds with one of:
   - `approved` → proceed to create all resources
   - `use existing <resource-name>` → point to existing resource details
   - `redesign: <new spec>` → modify proposal
   - `defer <resource> to Phase 2` → skip resource for now

2. Once approved, development team creates migrations and commits to branch.

3. Migrations are run in Homologacao environment for testing.
