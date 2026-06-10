# Ordem de Implementação: C6 — Trilha de Auditoria

**Feature**: c6-trilha-de-auditoria  
**Data**: 2026-06-10  
**Total de Chunks**: 12

---

## Pré-requisito: Aprovação de Infraestrutura

Antes de iniciar qualquer chunk backend, a tabela `audit_events` precisa de confirmação humana.  
Veja: `docs/features/c6-trilha-de-auditoria/infrastructure.md`

**Tabela `audit_events`** → bloqueante para chunks 1-8, 12  
**Tabelas `audit_archive_index`, `siem_webhook_queue`, `audit_config`** → opcionais (fallbacks disponíveis)

---

## Fase 1 — Fundação (Modelo + Serviço Core)

### 1️⃣ Chunk 1: [backend] Tipos compartilhados e modelo de dados audit_events — Issue #77
- **Escopo**: Tipos TypeScript expandidos em `shared/types/audit.ts`, modelo Prisma, migração SQL com constraints de imutabilidade e índices
- **Bloqueios**: ⚠️ Aguarda aprovação de infraestrutura (tabela `audit_events`)
- **Saída**: Tabela `audit_events` pronta, tipos compartilhados disponíveis

### 2️⃣ Chunk 2: [backend] Serviço de captura de eventos e middleware Fastify — Issue #78
- **Escopo**: Plugin Fastify `auditContext`, `AuditEventService`, `AuditEventRepo`
- **Depende de**: Chunk 1
- **Saída**: Capacidade de registrar eventos de auditoria programaticamente

---

## Fase 2 — Endpoints de Consulta e Instrumentação

### 3️⃣ Chunk 3: [backend] Instrumentação de eventos nas rotas existentes — Issue #79
- **Escopo**: Adicionar chamadas de auditoria em todas as rotas existentes (certificates, import)
- **Depende de**: Chunk 2
- **Saída**: Todas as operações de certificado geram eventos de auditoria automaticamente

### 4️⃣ Chunk 4: [backend] API de consulta de eventos de auditoria — Issue #80
- **Escopo**: `GET /api/audit/events`, `GET /api/audit/events/:id`, middleware de autorização
- **Depende de**: Chunk 1, Chunk 2
- **Pode ser paralelo a**: Chunk 3
- **Saída**: API REST completa de consulta com filtros, paginação, busca e ordenação

---

## Fase 3 — Exportação, Relatórios e Frontend Principal

### 5️⃣ Chunk 5: [backend] API de exportação e relatórios — Issue #81
- **Escopo**: `POST /api/audit/export` (CSV/JSON), `GET /api/audit/report` (3 tipos)
- **Depende de**: Chunk 4
- **Saída**: Exportação funcional e relatórios pré-formatados

### 6️⃣ Chunk 9: [frontend] Página de trilha de auditoria expandida — Issue #85
- **Escopo**: Refatorar AuditLogPage com sidebar, tabela 6 colunas, filtros avançados
- **Depende de**: Chunk 1 (tipos); integração real depende de Chunk 4
- **Pode ser paralelo a**: Chunks 3-5 (usando mocks/MSW)
- **Saída**: Página de auditoria funcional conforme protótipo

### 7️⃣ Chunk 10: [frontend] Modal de detalhes e exportação — Issue #86
- **Escopo**: `AuditDetailModal`, `ExportDropdown`
- **Depende de**: Chunk 9 (frontend page)
- **Backend**: Chunk 4 (detail) + Chunk 5 (export)
- **Saída**: Modal de detalhes e dropdown de exportação funcionais

---

## Fase 4 — Integrações e Infraestrutura Avançada

### 8️⃣ Chunk 7: [backend] Integração SIEM (Syslog + Webhook) — Issue #83
- **Escopo**: SiemDispatcher, SyslogAdapter (RFC 5424), WebhookAdapter (HMAC-SHA256, retry)
- **Depende de**: Chunk 2 (EventEmitter)
- **Pode ser paralelo a**: Chunks 4-6 (frontend)
- **Saída**: Envio em tempo real para SIEM

### 9️⃣ Chunk 6: [backend] Retenção de dados e arquivamento — Issue #82
- **Escopo**: Job cron diário, compressão gzip, assinatura HMAC, filesystem local
- **Depende de**: Chunk 2
- **Pode ser paralelo a**: Chunk 7 (SIEM)
- **Saída**: Arquivamento automático de eventos antigos

### 🔟 Chunk 8: [backend] API de administração de auditoria — Issue #84
- **Escopo**: `GET/PATCH /api/admin/audit/config`, `POST /api/admin/audit/test-siem`
- **Depende de**: Chunk 7 (SIEM adapters para test-siem)
- **Saída**: API admin completa para gerenciamento runtime

---

## Fase 5 — Frontend Admin e Testes Finais

### 1️⃣1️⃣ Chunk 11: [frontend] Página de administração de auditoria — Issue #87
- **Escopo**: Nova página /admin/auditoria com formulários de configuração, teste SIEM
- **Depende de**: Chunk 9 (consistência visual), Backend Chunk 8 (API admin)
- **Saída**: Interface de administração completa

### 1️⃣2️⃣ Chunk 12: [backend] Testes de integração e QA — Issue #88
- **Escopo**: Testes unitários, integração e QA para todo o fluxo
- **Depende de**: Todos os chunks anteriores
- **Saída**: Cobertura de testes para conformidade e validação de todos os critérios de aceite

---

## Diagrama de Dependências

```
                    ┌──────────────────┐
                    │ Infra Approval   │
                    │ (audit_events)   │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  #77 Chunk 1     │
                    │  Tipos + Modelo  │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  #78 Chunk 2     │
                    │  Serviço + Plugin│
                    └───┬────┬────┬────┘
                        │    │    │
           ┌────────────┘    │    └────────────┐
           │                 │                 │
  ┌────────▼─────┐  ┌───────▼──────┐  ┌───────▼──────┐
  │ #79 Chunk 3  │  │ #80 Chunk 4  │  │ #83 Chunk 7  │
  │ Instrument.  │  │ API Consulta │  │ SIEM Integr. │
  └──────────────┘  └───────┬──────┘  └───────┬──────┘
                            │                 │
                    ┌───────▼──────┐  ┌───────▼──────┐
                    │ #81 Chunk 5  │  │ #82 Chunk 6  │  (paralelo)
                    │ Export/Report│  │ Retenção     │
                    └───────┬──────┘  └──────────────┘
                            │                 │
                    ┌───────▼─────────────────▼──┐
                    │       #84 Chunk 8          │
                    │     API Admin              │
                    └────────────┬───────────────┘
                                 │
  ┌──────────────┐               │
  │ #85 Chunk 9  │←── Chunk 1   │
  │ FE Auditoria │  (tipos)     │
  └──────┬───────┘               │
         │                       │
  ┌──────▼───────┐               │
  │ #86 Chunk 10 │               │
  │ FE Modal/Exp │               │
  └──────┬───────┘               │
         │              ┌────────▼───────┐
         └──────────────► #87 Chunk 11   │
                        │ FE Admin       │
                        └────────┬───────┘
                                 │
                        ┌────────▼───────┐
                        │ #88 Chunk 12   │
                        │ Testes / QA    │
                        └────────────────┘
```

---

## Paralelismo Recomendado

| Fase | Chunks em Paralelo | Observação |
|---|---|---|
| Fase 1 | #77 → #78 (sequencial) | Fundação, não paralelizável |
| Fase 2 | #79 ‖ #80 | Instrumentação e API consulta podem rodar juntos |
| Fase 3 | #81 ‖ #85 ‖ #83 | Export, frontend e SIEM podem rodar em paralelo |
| Fase 3b | #86 (após #85) ‖ #82 (após #78) | Modal frontend após página; retenção após serviço |
| Fase 4 | #84 (após #83) ‖ #87 (após #85) | Admin API e frontend admin em paralelo |
| Fase 5 | #88 (após todos) | Testes finais sequenciais |

---

## Resumo de Issues

| # | Issue | Skill | Fase |
|---|---|---|---|
| 1 | #77 — Tipos compartilhados e modelo de dados | backend | 1 |
| 2 | #78 — Serviço de captura e middleware Fastify | backend | 1 |
| 3 | #79 — Instrumentação de eventos nas rotas | backend | 2 |
| 4 | #80 — API de consulta de eventos | backend | 2 |
| 5 | #81 — API de exportação e relatórios | backend | 3 |
| 6 | #82 — Retenção de dados e arquivamento | backend | 4 |
| 7 | #83 — Integração SIEM (Syslog + Webhook) | backend | 4 |
| 8 | #84 — API de administração | backend | 4 |
| 9 | #85 — Página de auditoria expandida | frontend | 3 |
| 10 | #86 — Modal de detalhes e exportação | frontend | 3 |
| 11 | #87 — Página de administração | frontend | 5 |
| 12 | #88 — Testes de integração e QA | backend | 5 |
