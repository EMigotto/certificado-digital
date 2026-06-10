# PRD: C6. Trilha de Auditoria

## Declaração do Problema

A aplicação Certificado Digital gerencia ciclos de vida de certificados mTLS críticos para infraestrutura. Regulações como PCI-DSS, ISO 27001 e SOX exigem rastreabilidade completa de ações: quem fez o quê, quando, sobre qual recurso e qual foi o resultado. Sem um sistema de auditoria imutável, não é possível cumprir requisitos regulatórios de não-repudiação, investigação de incidentes ou conformidade.

## Usuários & JTBD (Jobs to Be Done)

### 1. Auditor Interno
**JTBD**: Investigar alterações em certificados críticos e validar conformidade regulatória.
- Precisa responder perguntas como: "Quem aprovou o certificado X e quando foi emitido?"
- Precisa gerar relatórios de atividades por usuário, recurso ou período.
- Precisa acessar logs imutáveis de forma confiável e rápida.

### 2. Inspetor Regulatório (PCI-DSS, ISO 27001, SOX)
**JTBD**: Validar que a organização mantém auditoria completa de ações sensíveis.
- Precisa confirmar que logs não podem ser alterados ou deletados.
- Precisa verificar retenção conforme período mínimo (1 ano).
- Precisa confirmar que dados são exportáveis para sistemas SIEM corporativos.

### 3. Engenheiro de Segurança
**JTBD**: Monitorar eventos de segurança em tempo real e responder a incidentes.
- Precisa integrar logs de auditoria com plataforma SIEM (Splunk, ELK).
- Precisa receber alertas sobre eventos críticos (revogações, downloads de chaves).
- Precisa correlacionar ações com resultados (sucesso vs. falha).

### 4. Administrador do Sistema
**JTBD**: Gerenciar políticas de retenção e exportação de logs.
- Precisa configurar períodos de retenção sem alterar código.
- Precisa controlar qual eventos exportar e para quais destinos.
- Precisa monitorar saúde do sistema de auditoria.

## Escopo Funcional

### 1. Captura de Eventos Imutável (Append-Only)
- O sistema deve registrar TODO evento de forma imutável em banco de dados dedicado.
- Cada registro de auditoria deve conter campos obrigatórios:
  - **timestamp**: ISO 8601 UTC (gerado pelo servidor)
  - **user_id**: ID do usuário autenticado (ou "system" para ações automáticas)
  - **user_email**: Email do usuário para rastreabilidade sem depender de FK dinâmica
  - **action**: Tipo de evento (enum: login, logout, request, approval, emission, renewal, revocation, key_download, policy_change, deployment, admin_action)
  - **resource_type**: Tipo de recurso afetado (certificate, user, policy, deployment, key, approval)
  - **resource_id**: ID do recurso (nullable para ações no escopo da aplicação)
  - **resource_name**: Nome legível do recurso (ex: "cert-api.example.com")
  - **status**: Resultado da ação (success, failure)
  - **details**: JSON flexível com contexto adicional (ex: {"old_value": "...", "new_value": "...", "reason": "..."})
  - **ip_address**: IP do cliente (para rastreamento de origem)
  - **user_agent**: User-Agent do navegador/cliente (para auditoria de origem)
  - **request_id**: ID único da requisição (para correlacionar multi-step workflows)
  
- Nenhum campo deve ser atualizável ou deletável após criação (append-only).
- Índices devem existir em: timestamp, user_id, resource_type, resource_id, action, status.

### 2. Eventos Cobertos
Cada tipo de evento deve ser capturado automaticamente:

#### Autenticação & Sessão
- **login**: Tentativa de login (sucesso/falha com motivo)
- **logout**: Logout explícito ou expiração de sessão

#### Operações de Certificado
- **certificate_requested**: Requisição de novo certificado (por usuário, com CSR metadata)
- **certificate_approved**: Aprovação de requisição (por aprovador, com justificativa)
- **certificate_issued**: Emissão bem-sucedida (com serial number, fingerprint, validity period)
- **certificate_renewed**: Renovação de certificado existente
- **certificate_revoked**: Revogação de certificado (com motivo)
- **certificate_downloaded**: Download de chave/certificado (arquivo, IP, timestamp)
- **certificate_exported**: Exportação em lote (formato, quantidade)

#### Gerenciamento de Politicas
- **policy_created**: Nova política de retenção/validação criada
- **policy_modified**: Alteração de política (old/new values)
- **policy_deleted**: Exclusão de política

#### Deployment & Infraestrutura
- **deployment_initiated**: Deploy de certificado para ambiente (target, version)
- **deployment_completed**: Resultado de deploy (success/failure, target)
- **deployment_failed**: Falha em deploy (com erro)

#### Administração
- **user_created**: Novo usuário adicionado (role atribuído)
- **user_role_changed**: Mudança de papel de usuário
- **user_disabled**: Desativação de usuário
- **admin_config_changed**: Alteração de configuração de sistema (campo, old/new value)

#### Integrações
- **siem_export_started**: Início de exportação para SIEM
- **siem_export_completed**: Conclusão de exportação (quantidade de records)
- **siem_export_failed**: Falha de exportação (erro)
- **webhook_sent**: Webhook enviado para integração (endpoint, status)

### 3. Endpoints de Consulta de Auditoria
- **GET /api/audit/events** - Listar eventos com paginação e filtros:
  - `?user_id=<id>` - Eventos de usuário específico
  - `?resource_type=<type>` - Eventos de tipo de recurso
  - `?resource_id=<id>` - Eventos de recurso específico
  - `?action=<action>` - Filtro por tipo de ação
  - `?status=<success|failure>` - Filtro por resultado
  - `?from_date=<ISO8601>` - Data inicial (inclusive)
  - `?to_date=<ISO8601>` - Data final (inclusive)
  - `?sort=<timestamp|user_id|action>` - Campo para ordenação
  - `?order=<asc|desc>` - Ordem (descendente por padrão)
  - `?limit=<1-1000>` - Registros por página (padrão 50)
  - `?offset=<n>` - Deslocamento para paginação
  
- **GET /api/audit/events/:id** - Detalhes de um evento específico

- **POST /api/audit/export** - Exportar eventos para arquivo:
  - Parâmetros de filtro idênticos ao GET /api/audit/events
  - Formatos suportados: CSV, JSON, SYSLOG
  - Gera arquivo para download ou envia para webhook configurado
  - Retorna summary: total de registros exportados

- **GET /api/audit/report** - Relatório de auditoria pré-formatado:
  - `?report_type=<user_activity|resource_changes|compliance_summary>`
  - Retorna JSON estruturado pronto para apresentação/impressão

### 4. Retenção de Dados
- Período mínimo configurável: variável de ambiente `AUDIT_RETENTION_DAYS` (padrão: 365 dias = 1 ano)
- Job automático diário que:
  - Identifica eventos mais antigos que o período configurado
  - **NÃO deleta**: cria dump comprimido e assinado (para arquivo legal)
  - Move para storage de arquivo (S3, filesystem, etc.)
  - Registra próprio evento de auditoria ("audit_archived")
  - Mantém índice de dumps para recuperação se necessário

### 5. Exportação para SIEM
- Suporte a dois mecanismos:

#### 5.1 Syslog (RFC 5424)
- **Configuração**: Variáveis de ambiente
  - `SIEM_SYSLOG_ENABLED=true|false`
  - `SIEM_SYSLOG_HOST=<host>`
  - `SIEM_SYSLOG_PORT=<port, padrão 514>`
  - `SIEM_SYSLOG_FACILITY=<facility, padrão 16 (local0)>`
  
- Formato: RFC 5424 com estrutura JSON no campo "msg"
- Um linha syslog por evento de auditoria
- Reconexão automática em falhas
- Buffer de retry (persistência local temporária de mensagens)

#### 5.2 Webhook
- **Configuração**: Variáveis de ambiente
  - `SIEM_WEBHOOK_ENABLED=true|false`
  - `SIEM_WEBHOOK_URL=<endpoint>`
  - `SIEM_WEBHOOK_SECRET=<HMAC secret>`
  - `SIEM_WEBHOOK_BATCH_SIZE=<quantos eventos por POST, padrão 10>`
  - `SIEM_WEBHOOK_TIMEOUT_MS=<timeout, padrão 10000>`
  
- POST para endpoint com payload JSON:
  ```json
  {
    "batch_id": "uuid",
    "timestamp": "ISO8601",
    "event_count": 10,
    "events": [ {...}, {...} ]
  }
  ```
- HMAC-SHA256 signature no header `X-Audit-Signature`
- Retry exponencial (max 5 tentativas) com backoff
- Logging de sucesso/falha em auditoria própria

### 6. Interface de Consulta (Frontend)
- **Página: Auditoria**
  - Tabela de eventos com colunas: timestamp, usuário, ação, recurso, status, detalhes
  - Filtros em barra lateral: intervalo de datas, usuário, tipo de ação, tipo de recurso, status
  - Busca por texto livre (user_email, resource_name)
  - Ordenação por clique em cabeçalho
  - Paginação (50 itens/página)
  - Botão "Exportar" (CSV/JSON)
  - Botão "Detalhes" abre modal com todos os campos incluindo "details" formatado
  - Ícone de sucesso/falha com tooltip explicativo

- **Permissões**:
  - Apenas usuários com role `auditor` ou `admin` podem acessar
  - `auditor`: visualiza todos os eventos (leitura)
  - `admin`: visualiza e pode gerenciar retenção/exportação

### 7. Administração de Auditoria (Backend Config)
- **GET /api/admin/audit/config** - Retorna configuração atual:
  ```json
  {
    "retention_days": 365,
    "retention_policy": "archive_and_delete",
    "syslog": {
      "enabled": true,
      "host": "siem.example.com",
      "port": 514,
      "facility": 16,
      "connected": true,
      "last_heartbeat": "ISO8601"
    },
    "webhook": {
      "enabled": true,
      "url": "https://siem.example.com/ingest",
      "batch_size": 10,
      "timeout_ms": 10000,
      "last_success": "ISO8601",
      "failure_count": 0
    }
  }
  ```

- **PATCH /api/admin/audit/config** - Atualizar configuração (apenas admin):
  - `retention_days`: int >= 365
  - `syslog.enabled`: bool
  - `syslog.host`: string
  - `syslog.port`: int (1-65535)
  - `webhook.enabled`: bool
  - `webhook.url`: URL válida
  - `webhook.batch_size`: int (1-100)
  - Registra mudanças como eventos de auditoria

- **POST /api/admin/audit/test-siem** - Teste de conectividade:
  - Envia evento de teste para SIEM
  - Retorna success/failure com detalhes
  - Útil para validar configuração antes de produção

## Fora do Escopo

1. **Alteração de logs já criados**: Não é permitida modificação, deleção ou rollback de eventos de auditoria após criação. Isso é por design.

2. **Criptografia de logs em repouso**: Não é escopo desta versão. Presume-se que acesso ao banco de dados já é controlado por políticas de infraestrutura.

3. **Assinatura criptográfica de eventos individuais**: Não é implementada nesta versão. Se necessário em futuro, pode ser adicionado com signing key management.

4. **Análise de ameaças em tempo real / ML**: Detecção de anomalias fica para fase futura.

5. **Replicação de auditoria entre ambientes**: Logs são locais ao ambiente. Cada ambiente (Dev, Homologacao, Prod) tem sua própria trilha.

6. **Backup/restore específico de auditoria**: Segue política geral de backup do banco de dados.

## Riscos & Premissas

### Riscos
1. **Performance em larga escala**: Milhões de eventos podem impactar query time se índices não forem bem planejados. *Mitigação*: Índices compostos, paginação obrigatória, arquivamento automático.

2. **Armazenamento crescente**: 1 ano de retenção pode gerar tabelas muito grandes. *Mitigação*: Compressão de dumps arquivados, particionamento por data (Postgres) se necessário.

3. **Falha de conectividade SIEM**: Se webhook/syslog falhar, eventos locais seguem sendo capturados (não há perda), mas integração fica atrasada. *Mitigação*: Buffer de retry, alertas de falha de exportação.

4. **Vazamento de dados sensíveis em detalhes**: Campo "details" pode conter valores antigos de campos sensíveis (ex: CSR, chave privada parcial). *Mitigação*: Validação rigorosa do que entra em "details", redação de valores sensíveis em logs antes de exportação para SIEM.

### Premissas
1. PostgreSQL está disponível e é a fonte de verdade de dados.
2. Tokens JWT são a forma de autenticação; "user_id" pode ser extraído de token.
3. SIEM (Splunk, ELK) será disponibilizado fora do escopo desta aplicação.
4. Logs de auditoria não são críticos para operação imediata (eventual consistency é aceitável).
5. Role "auditor" e "admin" já existem no sistema de usuários.

## Critérios de Aceitação

Veja `acceptance-criteria.md` para cenários Gherkin detalhados.

**Resumo**:
- Auditor consegue consultar eventos de certificado específico (filtrando por resource_id) e ver quem aprovou e quando foi emitido em < 1 segundo.
- Eventos de auditoria são imutáveis (tentativa de UPDATE/DELETE retorna erro).
- Retenção automática arquiva eventos antigos sem perda de dados legal.
- Webhook envia eventos para SIEM com sucesso e retry automático em falhas.
- Relatório de auditoria mostra atividade por usuário, período e recurso.

## Histórico de Versão

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0    | 2026-06-10 | PM (AI) | Inicial |
