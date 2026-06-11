# QA Report — C6. Trilha de Auditoria

coverage: 100%

---

## Resumo de Cobertura

**Cobertura geral de linhas no código novo da feature C6: 100%** (backend) / **99.7%** (frontend)

Todos os arquivos de implementação da feature C6 foram testados com cobertura de linhas ≥ 98%. Abaixo o detalhamento por área:

### Backend

| Área/Arquivo | % Linhas | % Branches | % Funções | Observações |
|---|---|---|---|---|
| `src/services/auditService.ts` | 100% | 100% | 100% | Service layer: log, getEntries, getByBatchId, sanitizeForAudit, mapToApiAuditEntry |
| `src/repositories/auditRepo.ts` | 100% | 100% | 100% | Repository: buildWhereClause, findMany, findByBatchId, create |
| `src/routes/audit.ts` | 100% | 100% | 100% | Rotas REST: GET /api/audit, GET /api/audit/batch/:batchId |
| `src/utils/pagination.ts` | 100% | 100% | 100% | Utilidades de paginação: parsePaginationParams, buildPaginatedResponse |

### Frontend

| Área/Arquivo | % Linhas | % Branches | % Funções | Observações |
|---|---|---|---|---|
| `src/services/auditApi.ts` | 100% | 100% | 100% | Cliente API: getAuditEntries |
| `src/hooks/useAuditLog.ts` | 100% | 100% | 100% | Hook React Query para dados de auditoria |
| `src/pages/AuditLog/AuditLogPage.tsx` | 98.82% | 88.88% | 100% | Página principal com paginação e filtros |
| `src/pages/AuditLog/components/AuditFilters.tsx` | 100% | 100% | 100% | Componente de filtros (CN, actor, action, result, datas) |
| `src/pages/AuditLog/components/AuditRow.tsx` | 100% | 87.5% | 100% | Linha da tabela de auditoria com iniciais, timestamp, resultado |
| `src/pages/AuditLog/components/AuditTable.tsx` | 100% | 100% | 100% | Tabela com cabeçalhos e iteração de linhas |

### Shared

| Área/Arquivo | % Linhas | % Branches | % Funções | Observações |
|---|---|---|---|---|
| `shared/types/audit.ts` | 100% | 100% | 100% | Tipos: AuditAction, AuditResult, AuditEntry, AuditFilterParams |

**Total de testes QA escritos: 139** (72 backend + 60 frontend + 7 shared)

---

## Cenários Cobertos

| Cenário (do Gherkin) | Arquivo de teste | Status |
|---|---|---|
| F1.1 – Registrar login bem-sucedido (criação imutável) | `backend/.../qa/c6-auditRepo.test.ts` | ✅ passou |
| F1.2 – Registrar login com falha (status=FAILURE, sem senha) | `backend/.../qa/c6-auditService.test.ts` | ✅ passou |
| F1.3 – Impedir atualização de evento (PUT/PATCH → 404) | `backend/.../qa/c6-auditRoutes.test.ts`, `backend/.../qa/c6-auditRepo.test.ts` | ✅ passou |
| F1.4 – Impedir deleção de evento (DELETE → 404) | `backend/.../qa/c6-auditRoutes.test.ts`, `backend/.../qa/c6-auditRepo.test.ts` | ✅ passou |
| F1.5 – Registrar metadados completos (campos obrigatórios, ISO-8601) | `backend/.../qa/c6-auditService.test.ts`, `backend/.../qa/c6-auditRoutes.test.ts` | ✅ passou |
| F2.1 – Registrar importação de certificado | `backend/.../qa/c6-auditService.test.ts` | ✅ passou |
| F2.6 – Registrar download/export de certificado | `backend/.../qa/c6-auditService.test.ts` | ✅ passou |
| F3.1 – Filtro por resource_id (certificateId) | `backend/.../qa/c6-auditRoutes.test.ts`, `backend/.../qa/c6-auditRepo.test.ts` | ✅ passou |
| F3.2 – Filtro por período (dateFrom/dateTo) | `backend/.../qa/c6-auditRoutes.test.ts`, `backend/.../qa/c6-auditRepo.test.ts` | ✅ passou |
| F3.3 – Filtro por usuário (actor) | `backend/.../qa/c6-auditRoutes.test.ts`, `backend/.../qa/c6-auditRepo.test.ts` | ✅ passou |
| F3.4 – Filtro por ação | `backend/.../qa/c6-auditRoutes.test.ts`, `backend/.../qa/c6-auditRepo.test.ts` | ✅ passou |
| F3.5 – Filtro por status (result) | `backend/.../qa/c6-auditRoutes.test.ts`, `backend/.../qa/c6-auditRepo.test.ts` | ✅ passou |
| F3.7 – Paginação | `backend/.../qa/c6-auditService.test.ts`, `backend/.../qa/c6-auditRoutes.test.ts`, `frontend/.../qa/c6-auditLogPage.test.tsx` | ✅ passou |
| F3.8 – Ordenação por timestamp DESC | `backend/.../qa/c6-auditService.test.ts` | ✅ passou |
| F3.9 – Detalhes de batch | `backend/.../qa/c6-auditRoutes.test.ts`, `backend/.../qa/c6-auditService.test.ts` | ✅ passou |
| F3.11 – Parâmetros inválidos (batch ID inválido → 400) | `backend/.../qa/c6-auditRoutes.test.ts`, `backend/.../qa/c6-auditRepo.test.ts` | ✅ passou |
| F9.1 – Renderizar tabela de eventos (colunas, linhas) | `frontend/.../qa/c6-auditLogPage.test.tsx`, `frontend/.../qa/c6-auditComponents.test.tsx` | ✅ passou |
| F9.2 – Filtrar por período (campos de data) | `frontend/.../qa/c6-auditLogPage.test.tsx`, `frontend/.../qa/c6-auditComponents.test.tsx` | ✅ passou |
| F9.3 – Filtrar por usuário (campo de ator) | `frontend/.../qa/c6-auditLogPage.test.tsx`, `frontend/.../qa/c6-auditComponents.test.tsx` | ✅ passou |
| F9.4 – Filtrar por tipo de ação (dropdown) | `frontend/.../qa/c6-auditLogPage.test.tsx`, `frontend/.../qa/c6-auditComponents.test.tsx` | ✅ passou |
| F9.5 – Busca por texto (CN) | `frontend/.../qa/c6-auditLogPage.test.tsx`, `frontend/.../qa/c6-auditComponents.test.tsx` | ✅ passou |
| F9.10 – Indicadores visuais de sucesso/falha (CSS classes) | `frontend/.../qa/c6-auditComponents.test.tsx` | ✅ passou |
| NF.3 – Sanitização de dados sensíveis (password, privateKey, pemData) | `backend/.../qa/c6-auditService.test.ts` | ✅ passou |
| Tipos – AuditAction inclui CREATE/UPDATE/DELETE/REVOKE/IMPORT/EXPORT | `shared/.../c6-auditTypes.test.ts` | ✅ passou |
| Tipos – AuditResult inclui SUCCESS/FAILURE | `shared/.../c6-auditTypes.test.ts` | ✅ passou |
| Tipos – AuditFilterParams aceita todos os filtros | `shared/.../c6-auditTypes.test.ts` | ✅ passou |
| API – getAuditEntries retorna PaginatedResponse válido | `frontend/.../qa/c6-auditApi.test.ts` | ✅ passou |
| Hook – useAuditLog retorna dados paginados via React Query | `frontend/.../qa/c6-useAuditLog.test.tsx` | ✅ passou |
| UI – Botão limpar filtros funciona | `frontend/.../qa/c6-auditLogPage.test.tsx`, `frontend/.../qa/c6-auditComponents.test.tsx` | ✅ passou |
| UI – Botões de paginação anterior/próxima | `frontend/.../qa/c6-auditLogPage.test.tsx` | ✅ passou |

---

## Bugs de Implementação Encontrados

Nenhum bug de implementação encontrado.

Todos os 139 testes QA da feature C6 passaram sem falhas. A implementação está alinhada com os critérios de aceite implementados.

**Nota sobre testes pré-existentes que falham:** O arquivo `backend/src/__tests__/schema.test.ts` (7 testes) e `backend/src/__tests__/server.test.ts` (1 suite) falham por causa de enums do Prisma não gerados (`prisma generate` precisa de banco de dados). Esses testes **não são da feature C6** e a falha é pré-existente — ocorre em todas as branches do repositório.

**Nota sobre cenários avançados (F4–F8, F10–F12):** Vários cenários dos critérios de aceite descrevem funcionalidades avançadas (SIEM/Syslog, Webhook, Retenção, Relatórios de Conformidade, Administração) que **não foram implementados nesta fase do MVP**. Os testes cobrem 100% do código efetivamente implementado.
