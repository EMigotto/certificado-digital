# ADR: C6 — Trilha de Auditoria

**Feature ID**: C6  
**Slug**: `c6-trilha-de-auditoria`  
**Status**: Proposta  
**Data**: 2026-06-10  
**Decisores**: Tech Lead  
**Issue Pai**: #0

---

## 1. Contexto

A aplicação Certificado Digital possui um sistema básico de auditoria (`AuditEntry`) que registra apenas operações em certificados (CREATE, UPDATE, DELETE, REVOKE, IMPORT, EXPORT). Para atender requisitos regulatórios (PCI-DSS, ISO 27001, SOX), é necessário um sistema de auditoria **imutável e abrangente** que cubra autenticação, políticas, deployments, administração e integrações SIEM.

### Estado Atual

| Componente | Estado Atual | Lacuna |
|---|---|---|
| Modelo `AuditEntry` | 9 campos, FK para Certificate, actions limitadas a operações de certificado | Faltam: ip_address, user_agent, request_id, user_email, resource_type genérico, details JSON |
| Tabela `audit_entries` | Sem constraints de imutabilidade (UPDATE/DELETE são possíveis via Prisma) | Precisa de triggers/rules PostgreSQL para impedir UPDATE/DELETE |
| Backend Routes | `GET /api/audit` (paginação, filtros básicos) | Faltam: `/api/audit/events/:id`, `POST /api/audit/export`, `GET /api/audit/report`, admin endpoints |
| Frontend | Tabela simples com 4 colunas, filtros básicos | Precisa de: sidebar de filtros, 6 colunas, modal detalhes, exportação, busca textual, ordenação por coluna |
| Tipos Shared | `AuditAction` com 6 values, `AuditEntry` centrado em certificado | Precisa de types expandidos: 20+ action types, resource_type enum, event detail types |
| SIEM | Inexistente | Precisa de Syslog (RFC 5424), Webhook com HMAC-SHA256, retry |
| Retenção | Inexistente | Precisa de job diário de arquivamento, período configurável (mín. 365 dias) |
| Admin Config | Inexistente | Precisa de endpoints para gerenciar retenção, syslog, webhook |

### Entradas & Restrições

| Entrada | Detalhe |
|---|---|
| PRD | `docs/features/c6-trilha-de-auditoria/prd.md` — 7 escopos funcionais |
| Critérios de Aceite | `docs/features/c6-trilha-de-auditoria/acceptance-criteria.md` — 12 funcionais + 2 integração |
| Protótipo | `docs/features/c6-trilha-de-auditoria/prototype.html` — layout com sidebar filtros, tabela 6 colunas, modal detalhes |
| Infraestrutura | `docs/features/c6-trilha-de-auditoria/infrastructure.md` — 4 tabelas + S3 + SIEM pendentes de confirmação humana |
| CLAUDE.md | Stack: React 19, Vite, Fastify 5, Prisma, PostgreSQL 16, npm workspaces |
| DB existente | PostgreSQL 16, tabelas `certificates` e `audit_entries` |

### O Que Já Existe (Reutilizável)

- **`AuditService`** (`backend/src/services/auditService.ts`): log(), getEntries(), getByBatchId(), sanitizeForAudit()
- **`AuditRepository`** (`backend/src/repositories/auditRepo.ts`): findMany(), findByBatchId(), create(), buildWhereClause()
- **`AuditLogPage`** (`frontend/src/pages/AuditLog/`): componentes AuditFilters, AuditTable, AuditRow
- **`useAuditLog`** hook + `auditApi.ts`: integração TanStack Query
- **`pagination.ts`** utils: parsePaginationParams(), buildPaginatedResponse()
- **Sidebar**: já possui link "Audit Log" na seção Governança (`/audit`)
- **`api.ts`** com retry interceptor (exponential backoff em 5xx)

---

## 2. Motivadores de Decisão

1. **Conformidade regulatória**: PCI-DSS, ISO 27001, SOX exigem trilha imutável e rastreável
2. **Não-repudiação**: Cada ação deve conter identidade, timestamp, IP e resultado
3. **Compatibilidade reversa**: O modelo `AuditEntry` existente é usado por features anteriores (C1-C5) e não pode ser removido sem migração gradual
4. **Performance**: Consultas em tabelas com milhões de registros devem ser < 1s
5. **Integração SIEM**: Logs devem ser exportáveis para Splunk/ELK via Syslog e Webhook
6. **Operação independente**: Sistema de auditoria não pode afetar disponibilidade das operações normais

---

## 3. Decisão: Arquitetura Escolhida

### 3.1 Nova Tabela `audit_events` (Coexistência com `audit_entries`)

**Decisão**: Criar uma **nova tabela `audit_events`** com todos os campos do PRD, mantendo a tabela `audit_entries` existente intacta durante a transição.

**Justificativa**:
- O modelo `AuditEntry` atual é fortemente acoplado a `Certificate` (FK `certificateId`, campo `certCn`)
- O novo modelo precisa ser genérico: `resource_type` + `resource_id` em vez de `certificateId`
- Alterar a tabela existente quebraria queries, serviços e testes das features C1-C5
- Coexistência permite migração gradual: novos eventos vão para `audit_events`, antigos permanecem em `audit_entries`
- Após migração completa (fase futura), `audit_entries` pode ser depreciada

**Estrutura da tabela `audit_events`**:

```sql
CREATE TABLE audit_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id       TEXT NOT NULL,
  user_email    TEXT NOT NULL,
  action        TEXT NOT NULL,          -- enum validado via CHECK constraint
  resource_type TEXT,                   -- 'certificate', 'user', 'policy', etc.
  resource_id   TEXT,
  resource_name TEXT,
  status        TEXT NOT NULL DEFAULT 'success',  -- 'success' | 'failure'
  details       JSONB NOT NULL DEFAULT '{}',
  ip_address    TEXT,
  user_agent    TEXT,
  request_id    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Imutabilidade: regras PostgreSQL para bloquear UPDATE e DELETE
CREATE RULE audit_events_no_update AS ON UPDATE TO audit_events DO INSTEAD NOTHING;
CREATE RULE audit_events_no_delete AS ON DELETE TO audit_events DO INSTEAD NOTHING;

-- Índices para performance (< 1s em 100K+ registros)
CREATE INDEX idx_ae_timestamp ON audit_events (timestamp DESC);
CREATE INDEX idx_ae_user_id ON audit_events (user_id);
CREATE INDEX idx_ae_resource ON audit_events (resource_type, resource_id);
CREATE INDEX idx_ae_action_status ON audit_events (action, status);
CREATE INDEX idx_ae_search ON audit_events USING gin (to_tsvector('simple', coalesce(user_email,'') || ' ' || coalesce(resource_name,'')));
```

### 3.2 Middleware Fastify para Captura Automática de Contexto

**Decisão**: Criar um plugin Fastify que injeta automaticamente `ip_address`, `user_agent`, `request_id` e dados do JWT no contexto de cada requisição.

**Implementação**:
```
backend/src/plugins/auditContext.ts  — Fastify plugin (decorateRequest + onRequest hook)
```

- `onRequest` hook: gera `request_id` (UUID v4), extrai IP/User-Agent, decodifica JWT
- `decorateRequest`: adiciona propriedade `auditContext` ao objeto request do Fastify
- Serviços de negócio recebem `request.auditContext` e passam para o AuditEventService

**Justificativa**: Evita código repetitivo em cada route handler; garante que todo request tem contexto rastreável.

### 3.3 AuditEventService — Serviço de Captura Expandido

**Decisão**: Criar novo `AuditEventService` que convive com o `AuditService` existente.

```
backend/src/services/auditEventService.ts  — novo serviço
backend/src/repositories/auditEventRepo.ts — novo repositório
```

**Responsabilidades**:
- `logEvent(params)` — INSERT na tabela `audit_events`
- Sanitização de dados sensíveis (herda `sanitizeForAudit()` existente)
- Disparo assíncrono para filas SIEM (syslog + webhook) — fire-and-forget para não impactar latência

**Justificativa**: Separar do `AuditService` existente evita regressão e permite coexistência durante transição.

### 3.4 API de Consulta Expandida

**Decisão**: Novos endpoints sob prefixo `/api/audit/events` para não conflitar com `/api/audit` existente.

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/audit/events` | GET | Listar eventos com filtros (user_id, resource_type, resource_id, action, status, from_date, to_date, search, sort, order, limit, offset) |
| `/api/audit/events/:id` | GET | Detalhes de evento único |
| `/api/audit/export` | POST | Exportar para CSV/JSON/SYSLOG |
| `/api/audit/report` | GET | Relatórios pré-formatados (user_activity, resource_changes, compliance_summary) |

**Paginação**: Usa `limit/offset` (PRD) em vez de `page/pageSize` (sistema atual). Helper `parseLimitOffset()` novo coexiste com `parsePaginationParams()` existente.

**Autorização**: Middleware que verifica role `auditor` ou `admin` no JWT. Como o sistema de auth JWT ainda não está implementado neste MVP, usaremos header `X-User-Id` / `X-User-Email` / `X-User-Role` como mecanismo intermediário, com TODO para migrar para JWT completo.

### 3.5 Integração SIEM — Arquitetura de Plugins

**Decisão**: SIEM integrations como módulos independentes (Strategy Pattern):

```
backend/src/siem/
  ├── SiemDispatcher.ts     — orquestra envio para adapters ativos
  ├── SyslogAdapter.ts      — RFC 5424, reconexão automática, buffer
  └── WebhookAdapter.ts     — HMAC-SHA256, batching, retry exponencial
```

**Fluxo**:
1. `AuditEventService.logEvent()` insere no banco
2. Após INSERT, emite evento interno (EventEmitter do Node.js)
3. `SiemDispatcher` escuta eventos e delega para adapters habilitados
4. Adapters operam de forma assíncrona — falhas não afetam o INSERT principal

**Buffer/Retry**:
- **Syslog**: buffer em memória (array circular, max 10K mensagens). Quando reconecta, drena buffer.
- **Webhook**: tabela `siem_webhook_queue` para persistir eventos pendentes. Job periódico (5s) verifica fila e envia batches.

**Justificativa**: Desacoplamento via EventEmitter garante que falha de SIEM não impacta operação core. Strategy Pattern permite adicionar novos adapters (ex: Kafka) sem alterar o dispatcher.

### 3.6 Retenção de Dados — Job Agendado

**Decisão**: Usar `node-cron` para job diário de arquivamento.

```
backend/src/jobs/auditRetention.ts — job de retenção/arquivamento
```

**Fluxo**:
1. Identifica eventos com `timestamp < NOW() - AUDIT_RETENTION_DAYS`
2. Exporta para arquivo JSON comprimido (gzip) no filesystem local (`./audit-archives/`)
3. Gera HMAC-SHA256 do arquivo para integridade
4. Registra no `audit_archive_index` (ou apenas no log se tabela não aprovada)
5. Remove eventos arquivados da tabela principal (via bypass da rule de DELETE, usando raw SQL com sessão admin)
6. Registra evento `audit_archived` na trilha

**Storage**: Filesystem local inicialmente (caminho configurável via `AUDIT_ARCHIVE_PATH`). S3 como opção futura se aprovado na infraestrutura.

**Justificativa**: `node-cron` é leve, já usado em projetos similares, não requer infraestrutura adicional. Filesystem local é suficiente para Homologacao; S3 pode ser habilitado em Prod.

### 3.7 Configuração de Auditoria em Runtime

**Decisão**: Usar tabela `audit_config` para configurações mutáveis, com fallback para variáveis de ambiente.

**Hierarquia de config**:
1. `audit_config` table (se aprovada) — maior prioridade
2. Variáveis de ambiente (`AUDIT_RETENTION_DAYS`, `SIEM_*`) — fallback
3. Valores default hardcoded — último fallback

```
backend/src/services/auditConfigService.ts — CRUD de config
backend/src/routes/auditAdmin.ts           — endpoints /api/admin/audit/*
```

**Justificativa**: Permite alteração sem restart; variáveis de ambiente servem como default seguro para deploy inicial.

### 3.8 Frontend — Expansão da Página de Auditoria

**Decisão**: Refatorar componentes existentes em `frontend/src/pages/AuditLog/` e adicionar novos.

**Componentes novos/modificados**:

```
frontend/src/pages/AuditLog/
  ├── AuditLogPage.tsx          — REFATORAR: layout sidebar + content conforme protótipo
  ├── components/
  │   ├── AuditFilters.tsx      — REFATORAR: sidebar com todos filtros do PRD
  │   ├── AuditTable.tsx        — REFATORAR: 6 colunas, ordenação por click
  │   ├── AuditRow.tsx          — REFATORAR: novo layout com resource_type, ícones status
  │   ├── AuditDetailModal.tsx  — NOVO: modal com todos campos + JSON formatado
  │   └── ExportDropdown.tsx    — NOVO: dropdown CSV/JSON com chamada API
  │
frontend/src/pages/AuditAdmin/
  ├── AuditAdminPage.tsx        — NOVO: página /admin/auditoria
  ├── components/
  │   ├── RetentionConfig.tsx   — NOVO: formulário de retenção
  │   ├── SyslogConfig.tsx      — NOVO: formulário de syslog
  │   ├── WebhookConfig.tsx     — NOVO: formulário de webhook
  │   └── TestSiemButton.tsx    — NOVO: botão teste conectividade

frontend/src/services/auditApi.ts   — EXPANDIR: novos endpoints
frontend/src/hooks/useAuditLog.ts   — EXPANDIR: novos hooks
```

**Decisão de UX**: Seguir protótipo — sidebar fixa à esquerda com filtros, tabela principal com 6 colunas (Timestamp, Usuário, Ação, Recurso, Status, Detalhes), botões de exportação no toolbar.

### 3.9 Tipos Compartilhados Expandidos

**Decisão**: Expandir `shared/types/audit.ts` com novos tipos, mantendo os existentes por compatibilidade.

```typescript
// Novos tipos (coexistem com AuditEntry/AuditAction existentes)
export type AuditEventAction = 'login' | 'logout' | 'certificate_requested' | ... ;
export type AuditResourceType = 'certificate' | 'user' | 'policy' | 'deployment' | 'key' | 'approval';
export type AuditEventStatus = 'success' | 'failure';

export interface AuditEvent {
  id: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  action: AuditEventAction;
  resourceType: AuditResourceType | null;
  resourceId: string | null;
  resourceName: string | null;
  status: AuditEventStatus;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}
```

---

## 4. Alternativas Consideradas

### 4.1 Expandir Tabela `audit_entries` Existente (Rejeitada)

**Prós**: Uma tabela só, sem duplicação  
**Contras**:
- Requer migração de schema com ALTER TABLE (risco em tabelas com dados)
- Quebraria FK `certificateId` → `Certificate` que features C1-C5 dependem
- Enum `AuditAction` do Prisma é difícil de expandir sem migration destrutiva
- Testes existentes quebrariam

**Decisão**: Rejeitada. Custo de migração e risco de regressão superam benefício de tabela única.

### 4.2 Event Sourcing Completo (Rejeitada)

**Prós**: Máxima rastreabilidade, replay de eventos  
**Contras**:
- Complexidade arquitetural desproporcional para MVP
- Requer infraestrutura de event store (Kafka/EventStore)
- Latência adicional em todas operações

**Decisão**: Rejeitada. Append-only table com PostgreSQL atende 100% dos requisitos sem complexidade adicional.

### 4.3 Auditoria Apenas via Logs de Aplicação (Rejeitada)

**Prós**: Zero infraestrutura adicional  
**Contras**:
- Logs não são consultáveis por API
- Logs são efêmeros (rotação destrói dados)
- Não atende requisito de imutabilidade regulatória

**Decisão**: Rejeitada. Logs complementam, mas não substituem trail persistente.

### 4.4 SIEM via Kafka em Vez de Syslog/Webhook (Adiada)

**Prós**: Throughput maior, desacoplamento total  
**Contras**:
- Requer broker Kafka (infra adicional pesada)
- Overkill para volume inicial

**Decisão**: Adiada para fase futura. Strategy Pattern no dispatcher permite adicionar KafkaAdapter depois.

---

## 5. Consequências

### Positivas
- **Conformidade**: Atende PCI-DSS, ISO 27001, SOX com trail imutável
- **Zero regressão**: Coexistência com `audit_entries` preserva funcionalidade existente
- **Flexibilidade SIEM**: Adapters plugáveis permitem integrar com qualquer plataforma
- **Performance**: Índices compostos + paginação obrigatória garantem < 1s
- **Operação**: Falhas de SIEM não afetam operação core (fire-and-forget)

### Negativas
- **Duplicação temporária**: Duas tabelas de auditoria coexistem até migração
- **Complexidade incremental**: 4 novas tabelas PostgreSQL, 3 novos serviços backend, 2 novos módulos frontend
- **Dependência de infra**: Tabelas precisam de aprovação humana antes de criação (Infrastructure Gate)

### Riscos Mitigados
- **Performance em larga escala**: Índices GIN para busca textual, índices compostos para filtros combinados
- **Perda de dados SIEM**: Webhook queue persistida no banco garante retry
- **Vazamento de dados sensíveis**: `sanitizeForAudit()` existente será reutilizada e expandida

---

## 6. Dependência de Infraestrutura

As seguintes tabelas/recursos estão com status **NEEDS_HUMAN_CONFIRMATION** em `infrastructure.md`:

| Recurso | Chunks Dependentes | Pode Iniciar Sem? |
|---|---|---|
| `audit_events` table | Todos os chunks backend | ❌ Bloqueante |
| `audit_archive_index` table | Chunk de Retenção | ✅ Pode usar log simples |
| `siem_webhook_queue` table | Chunk de Webhook | ✅ Pode usar fila em memória |
| `audit_config` table | Chunk de Admin Config | ✅ Pode usar env vars |
| S3 Bucket | Chunk de Retenção | ✅ Filesystem local |
| Syslog Server | Chunk de Syslog | ✅ Mock/log local |
| Webhook Endpoint | Chunk de Webhook | ✅ Mock endpoint |

**Nota**: A tabela `audit_events` é bloqueante para início do desenvolvimento. Chunks de frontend e tipos shared podem avançar em paralelo.

---

## 7. Mapeamento de Critérios de Aceite → Chunks

| Critério | Cenários | Chunk |
|---|---|---|
| F1: Captura Imutável | 1.1–1.5 | Chunk 1 (modelo) + Chunk 2 (serviço) |
| F2: Cobertura de Eventos | 2.1–2.8 | Chunk 2 (serviço) + Chunk 3 (instrumentação) |
| F3: Consulta API | 3.1–3.11 | Chunk 4 (endpoints consulta) |
| F4: Exportação | 4.1–4.5 | Chunk 5 (exportação) |
| F5: Relatórios | 5.1–5.3 | Chunk 5 (exportação e relatórios) |
| F6: Retenção | 6.1–6.4 | Chunk 6 (retenção) |
| F7: SIEM Syslog | 7.1–7.4 | Chunk 7 (SIEM) |
| F8: SIEM Webhook | 8.1–8.5 | Chunk 7 (SIEM) |
| F9: Interface Frontend | 9.1–9.10 | Chunk 8 (frontend auditoria) + Chunk 9 (modal/export) |
| F10: Administração | 10.1–10.5 | Chunk 10 (frontend admin) + Chunk 6 (retenção backend) |
| F11: Segurança | 11.1–11.3 | Chunk 4 (middleware auth) |
| F12: Performance | 12.1–12.3 | Chunk 1 (índices) + Chunk 4 (paginação) |
| I.1: Integração completa | I.1 | Chunk 11 (testes integração) |
| I.2: Auditoria de falhas | I.2 | Chunk 11 (testes integração) |

---

## 8. Estrutura de Arquivos Planejada

```
backend/src/
  ├── plugins/
  │   └── auditContext.ts              — NOVO: Fastify plugin (req context)
  ├── repositories/
  │   ├── auditRepo.ts                 — EXISTENTE (mantido)
  │   └── auditEventRepo.ts           — NOVO: repositório audit_events
  ├── services/
  │   ├── auditService.ts             — EXISTENTE (mantido)
  │   ├── auditEventService.ts        — NOVO: serviço audit_events
  │   └── auditConfigService.ts       — NOVO: CRUD de config
  ├── routes/
  │   ├── audit.ts                     — EXISTENTE (mantido)
  │   ├── auditEvents.ts              — NOVO: endpoints /api/audit/events
  │   └── auditAdmin.ts               — NOVO: endpoints /api/admin/audit
  ├── siem/
  │   ├── SiemDispatcher.ts           — NOVO: orquestrador
  │   ├── SyslogAdapter.ts            — NOVO: syslog RFC 5424
  │   └── WebhookAdapter.ts           — NOVO: webhook + HMAC
  ├── jobs/
  │   └── auditRetention.ts           — NOVO: job de retenção
  └── config.ts                        — EXPANDIR: novas env vars (AUDIT_*, SIEM_*)

backend/prisma/
  └── migrations/
      └── 2026XXXX_create_audit_events/ — NOVO: migration

shared/types/
  ├── audit.ts                         — EXPANDIR: novos tipos AuditEvent*
  └── index.ts                         — EXPANDIR: re-exportar novos tipos

frontend/src/
  ├── pages/
  │   ├── AuditLog/                    — REFATORAR todos componentes
  │   └── AuditAdmin/                  — NOVO: página admin
  ├── hooks/
  │   ├── useAuditLog.ts               — EXPANDIR: novos hooks
  │   └── useAuditAdmin.ts             — NOVO: hooks admin
  └── services/
      └── auditApi.ts                  — EXPANDIR: novos endpoints
```

---

## Histórico de Versão

| Versão | Data | Autor | Mudanças |
|---|---|---|---|
| 1.0 | 2026-06-10 | Tech Lead (IA) | Versão inicial |
