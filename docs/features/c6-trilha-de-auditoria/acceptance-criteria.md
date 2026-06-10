# Critérios de Aceitação: C6. Trilha de Auditoria

## Funcional 1: Captura de Eventos Imutável

### Cenário 1.1 - Sucesso: Registrar login bem-sucedido
```gherkin
Dado que um usuário fornece credenciais válidas
Quando ele submete formulário de login
Então um evento de auditoria com action="login" é criado
  E o evento contém: timestamp (ISO8601), user_id, user_email, status="success", ip_address
  E o evento é imutável (INSERT ONLY) na tabela audit_events
  E um índice permite recuperar evento em < 100ms por user_id
```

### Cenário 1.2 - Sucesso: Registrar login com falha
```gherkin
Dado que um usuário fornece senha incorreta
Quando ele submete formulário de login
Então um evento de auditoria com action="login" é criado
  E o evento contém status="failure"
  E o campo details contém motivo ("invalid_credentials")
  E a senha incorreta NÃO é armazenada em detail
```

### Cenário 1.3 - Falha: Impedir atualização de evento
```gherkin
Dado que um evento de auditoria existe na tabela
Quando uma requisição tenta fazer UPDATE no evento
Então a operação retorna erro (status 500 ou constraint violation)
  E o evento permanece inalterado
  E um novo evento ("admin_unauthorized_action" ou similar) é registrado
```

### Cenário 1.4 - Falha: Impedir deleção de evento
```gherkin
Dado que um evento de auditoria existe na tabela
Quando uma requisição tenta fazer DELETE no evento
Então a operação retorna erro (constraint violation ou policy-based denial)
  E o evento permanece íntegro
```

### Cenário 1.5 - Sucesso: Registrar metadados completos
```gherkin
Dado que um usuário realiza ação no sistema
Quando a ação é capturada e persistida
Então o evento contém todos os campos obrigatórios:
  - timestamp (server-generated, UTC)
  - user_id (de token JWT)
  - user_email (de token JWT)
  - action (enum válido)
  - resource_type (enum ou null)
  - resource_id (UUID ou null)
  - resource_name (string ou null)
  - status (success|failure)
  - details (JSON válido ou empty object)
  - ip_address
  - user_agent
  - request_id (UUID, para rastreamento)
```

## Funcional 2: Cobertura de Eventos

### Cenário 2.1 - Sucesso: Registrar requisição de certificado
```gherkin
Dado que um usuário submete requisição de novo certificado
Quando o backend processa a requisição
Então um evento com action="certificate_requested" é criado
  E o evento contém resource_type="certificate", resource_id=<novo cert ID>
  E details contém metadados do CSR (domain, key_size, etc.)
  E status="success" (ou "failure" se validação falhar)
```

### Cenário 2.2 - Sucesso: Registrar aprovação de certificado
```gherkin
Dado que um aprovador clica "Aprovar" em uma requisição pendente
Quando a operação é executada
Então um evento com action="certificate_approved" é criado
  E user_id é o ID do aprovador
  E details contém justificativa ou comentário (se fornecido)
  E resource_id aponta para a requisição de certificado
```

### Cenário 2.3 - Sucesso: Registrar emissão de certificado
```gherkin
Dado que um certificado é emitido pela autoridade (CA ou rotina interna)
Quando a emissão é concluída com sucesso
Então um evento com action="certificate_issued" é criado
  E details contém serial_number, fingerprint (SHA-256), validity_start, validity_end
  E resource_type="certificate", resource_id=<cert ID>
  E status="success"
```

### Cenário 2.4 - Sucesso: Registrar renovação de certificado
```gherkin
Dado que um certificado expirando é renovado
Quando o processo de renovação conclui
Então um evento com action="certificate_renewed" é criado
  E details contém old_certificate_id, new_certificate_id
  E resource_id aponta para o certificado renovado
```

### Cenário 2.5 - Sucesso: Registrar revogação de certificado
```gherkin
Dado que um administrador revoga um certificado
Quando a revogação é confirmada
Então um evento com action="certificate_revoked" é criado
  E details contém motivo (compromised, superseded, etc.)
  E resource_id aponta para o certificado
  E um entry CRL é criado e registrado em auditoria
```

### Cenário 2.6 - Sucesso: Registrar download de chave/certificado
```gherkin
Dado que um usuário autorizado baixa um certificado ou chave
Quando o download é servido
Então um evento com action="certificate_downloaded" é criado
  E details contém formato_arquivo, arquivo_nome (sem path)
  E user_agent captura o cliente
  E ip_address captura origem
  E status="success"
```

### Cenário 2.7 - Sucesso: Registrar alteração de política
```gherkin
Dado que um administrador modifica política de validação ou retenção
Quando a alteração é salva
Então um evento com action="policy_modified" é criado
  E resource_type="policy", resource_id=<policy ID>
  E details contém old_value, new_value para cada campo alterado
  E user_id é o administrador
```

### Cenário 2.8 - Sucesso: Registrar deployment
```gherkin
Dado que um certificado é implantado em um ambiente (prod, staging, etc.)
Quando o deploy inicia
Então um evento com action="deployment_initiated" é criado
  E details contém target_environment, certificate_id, version

Quando o deploy conclui com sucesso
Então um evento com action="deployment_completed" é criado
  E details contém resultado, timestamp_fim
  E status="success"

Quando o deploy falha
Então um evento com action="deployment_failed" é criado
  E details contém erro, stack_trace (redacted)
  E status="failure"
```

## Funcional 3: Consulta de Auditoria via API

### Cenário 3.1 - Sucesso: Listar eventos com filtro por resource_id
```gherkin
Dado que eventos de auditoria existem para múltiplos certificados
Quando um auditor faz GET /api/audit/events?resource_id=<cert-id>
Então a resposta retorna apenas eventos daquele certificado
  E cada evento contém todos os campos obrigatórios
  E a resposta inclui paginação: total, offset, limit
  E response time < 1 segundo (teste de performance)
```

### Cenário 3.2 - Sucesso: Listar eventos com filtro por período
```gherkin
Dado que eventos cobrem período de 12 meses
Quando um auditor faz GET /api/audit/events?from_date=2026-01-01&to_date=2026-06-30
Então apenas eventos naquele intervalo são retornados
  E datas são tratadas como ISO8601 (inclusivas)
  E paginação respeita limite máximo (1000 registros/página)
```

### Cenário 3.3 - Sucesso: Listar eventos com filtro por usuário
```gherkin
Dado que múltiplos usuários realizaram ações
Quando um auditor faz GET /api/audit/events?user_id=<id>
Então apenas eventos daquele usuário são retornados
  E events podem ser ordenados por timestamp (desc por padrão)
```

### Cenário 3.4 - Sucesso: Listar eventos com filtro por ação
```gherkin
Dado que eventos de diferentes tipos existem
Quando um auditor faz GET /api/audit/events?action=certificate_approved
Então apenas eventos com action="certificate_approved" são retornados
```

### Cenário 3.5 - Sucesso: Listar eventos com filtro por status
```gherkin
Dado que alguns eventos têm status="success" e outros "failure"
Quando um auditor faz GET /api/audit/events?status=failure
Então apenas eventos com falha são retornados
```

### Cenário 3.6 - Sucesso: Busca por texto livre
```gherkin
Dado que múltiplos eventos contêm user_email ou resource_name
Quando um auditor faz GET /api/audit/events?search=john@example.com
Então eventos com user_email ou resource_name contendo o termo são retornados
  E a busca é case-insensitive
```

### Cenário 3.7 - Sucesso: Paginação
```gherkin
Dado que 500 eventos existem no banco
Quando um auditor faz GET /api/audit/events?limit=50&offset=0
Então exatamente 50 eventos são retornados
  E response contém total=500, limit=50, offset=0

Quando a mesma requisição é feita com offset=50
Então próximos 50 eventos são retornados (items 50-99)
```

### Cenário 3.8 - Sucesso: Ordenação por campo
```gherkin
Dado que eventos com timestamps variados existem
Quando um auditor faz GET /api/audit/events?sort=timestamp&order=asc
Então eventos são retornados em ordem crescente de timestamp
  E order=desc retorna em ordem decrescente
```

### Cenário 3.9 - Sucesso: Detalhes de evento único
```gherkin
Dado que um evento existe com ID específico
Quando um auditor faz GET /api/audit/events/<event_id>
Então a resposta retorna evento completo incluindo campo details em JSON
  E response time < 100ms
```

### Cenário 3.10 - Falha: Acesso não autorizado
```gherkin
Dado que um usuário sem role "auditor" ou "admin"
Quando ele tenta GET /api/audit/events
Então a resposta retorna status 403 Forbidden
  E um evento de "unauthorized_access_attempt" é registrado em auditoria
```

### Cenário 3.11 - Falha: Parâmetros inválidos
```gherkin
Dado que um auditor submete GET /api/audit/events?limit=0
Então a resposta retorna status 400 Bad Request
  E a mensagem de erro descreve o problema
```

## Funcional 4: Exportação de Eventos

### Cenário 4.1 - Sucesso: Exportar eventos em CSV
```gherkin
Dado que eventos de auditoria existem
Quando um auditor faz POST /api/audit/export com formato=csv
Então um arquivo CSV é gerado com colunas: timestamp, user_email, action, resource_type, resource_id, status
  E linhas incluem todos os eventos que combinam filtros
  E o arquivo pode ser baixado ou enviado para webhook
  E a resposta contém summary: total_exported=<n>
```

### Cenário 4.2 - Sucesso: Exportar eventos em JSON
```gherkin
Dado que eventos de auditoria existem
Quando um auditor faz POST /api/audit/export com formato=json
Então um arquivo JSON é gerado com array de eventos
  E cada evento contém todos os campos incluindo details
  E se enviado para webhook, o arquivo é comprimido (gzip) e assinado (HMAC-SHA256)
```

### Cenário 4.3 - Sucesso: Exportar com filtros
```gherkin
Dado que POST /api/audit/export é chamado com filtros
Quando os filtros incluem user_id, action, from_date, to_date
Então apenas eventos que combinam TODOS os filtros são exportados
  E a summary indica quantos registros foram incluídos
```

### Cenário 4.4 - Sucesso: Exportar para webhook
```gherkin
Dado que SIEM_WEBHOOK_ENABLED=true e SIEM_WEBHOOK_URL está configurado
Quando um auditor faz POST /api/audit/export com formato=json e webhook_send=true
Então o arquivo é enviado como POST para o webhook
  E headers incluem X-Audit-Signature (HMAC-SHA256)
  E a resposta contém status do envio
  E um evento de auditoria "siem_export_completed" é registrado
```

### Cenário 4.5 - Falha: Webhook indisponível
```gherkin
Dado que webhook está desconfigurado ou indisponível
Quando POST /api/audit/export é chamado com webhook_send=true
Então o sistema tenta reconectar até 5 vezes com backoff exponencial
  E após 5 tentativas, retorna status 503 Service Unavailable
  E um evento "siem_export_failed" é registrado
  E a exportação local completa mesmo assim (arquivo gerado)
```

## Funcional 5: Relatório de Auditoria

### Cenário 5.1 - Sucesso: Gerar relatório por usuário
```gherkin
Dado que múltiplos usuários realizaram ações
Quando um auditor faz GET /api/audit/report?report_type=user_activity&user_id=<id>
Então a resposta contém:
  - total_actions_by_user: número
  - actions_by_type: { login: 10, certificate_approved: 5, ... }
  - date_range: { start, end }
  - user_email, user_id
```

### Cenário 5.2 - Sucesso: Gerar relatório de alterações de recurso
```gherkin
Dado que um certificado sofreu múltiplas alterações
Quando um auditor faz GET /api/audit/report?report_type=resource_changes&resource_id=<cert-id>
Então a resposta contém timeline de mudanças:
  - resource_id, resource_name, resource_type
  - lista de eventos com timestamp, user_email, action, old_value, new_value
```

### Cenário 5.3 - Sucesso: Gerar relatório de conformidade
```gherkin
Dado que políticas de retenção e aprovação existem
Quando um auditor faz GET /api/audit/report?report_type=compliance_summary&from_date=<>&to_date=<>
Então a resposta contém:
  - total_events_period: número
  - events_by_action: distribuição
  - approval_rate: percentual de requisições aprovadas
  - revocation_count: número de revogações
  - failed_operations: lista de falhas
```

## Funcional 6: Retenção de Dados

### Cenário 6.1 - Sucesso: Arquivar eventos antigos
```gherkin
Dado que AUDIT_RETENTION_DAYS=365
E eventos mais antigos que 365 dias existem na tabela principal
Quando o job de retenção executa (diário)
Então eventos antigos são comprimidos em arquivo (gzip)
  E arquivo é assinado com HMAC-SHA256 (para integridade legal)
  E arquivo é movido para storage de arquivos (S3, filesystem, etc.)
  E um evento de auditoria "audit_archived" é criado
  E a tabela principal não contém eventos antigos (foram movidos)
```

### Cenário 6.2 - Sucesso: Recuperação de arquivo arquivado
```gherkin
Dado que um arquivo arquivado existe
Quando um auditor precisa acessar eventos antigos
Então há endpoint (ou documentação) para recuperar arquivo por período
  E arquivo é verificado contra assinatura antes de retorno
  E acesso é registrado em auditoria
```

### Cenário 6.3 - Sucesso: Configurar período de retenção
```gherkin
Dado que AUDIT_RETENTION_DAYS pode ser alterado
Quando um administrador faz PATCH /api/admin/audit/config com retention_days=730
Então a configuração é atualizada
  E um evento "admin_config_changed" é registrado
  E o novo período aplica a próximas rotinas de arquivamento
```

### Cenário 6.4 - Falha: Período de retenção menor que 1 ano
```gherkin
Dado que requisito regulatório exige mínimo 365 dias
Quando um administrador tenta PATCH /api/admin/audit/config com retention_days=180
Então a operação retorna erro (status 400)
  E a mensagem informa "Minimum retention is 365 days"
  E configuração anterior é mantida
```

## Funcional 7: Integração SIEM - Syslog

### Cenário 7.1 - Sucesso: Enviar eventos para syslog
```gherkin
Dado que SIEM_SYSLOG_ENABLED=true
E SIEM_SYSLOG_HOST=siem.example.com, SIEM_SYSLOG_PORT=514
Quando um evento de auditoria é criado
Então uma mensagem syslog (RFC 5424) é enviada para o servidor
  E formato contém: timestamp, hostname, programa, PID, estrutura JSON do evento
  E JSON no campo msg contém: timestamp, user_id, action, resource_type, resource_id, status
```

### Cenário 7.2 - Sucesso: Reconectar em falha de syslog
```gherkin
Dado que servidor syslog está temporariamente indisponível
Quando evento de auditoria é criado
Então a aplicação tenta reconectar
  E eventos são armazenados em buffer local (em memória ou BD temporária)
  E quando syslog volta online, buffer é drenado
  E eventos são enviados em ordem de criação
```

### Cenário 7.3 - Sucesso: Configurar syslog em runtime
```gherkin
Dado que SIEM_SYSLOG_HOST pode ser alterado dinamicamente
Quando um administrador faz PATCH /api/admin/audit/config com syslog.host=novo.siem.com
Então a configuração é aplicada
  E próximas mensagens syslog usam novo host
  E um evento de auditoria "admin_config_changed" é registrado
```

### Cenário 7.4 - Sucesso: Testar conectividade syslog
```gherkin
Dado que administrador quer validar configuração syslog
Quando ele faz POST /api/admin/audit/test-siem
Então um evento de teste é enviado para syslog
  E a resposta retorna success=true ou false
  E detalhes incluem timestamp, host conectado, última mensagem enviada/erro
```

## Funcional 8: Integração SIEM - Webhook

### Cenário 8.1 - Sucesso: Enviar batch de eventos para webhook
```gherkin
Dado que SIEM_WEBHOOK_ENABLED=true
E SIEM_WEBHOOK_URL=https://siem.example.com/ingest
E SIEM_WEBHOOK_BATCH_SIZE=10
Quando 10 eventos de auditoria são criados
Então um POST é enviado para webhook com payload:
  {
    "batch_id": "uuid",
    "timestamp": "ISO8601",
    "event_count": 10,
    "events": [...]
  }
  E header X-Audit-Signature contém HMAC-SHA256(payload, secret)
  E response status esperado é 200 ou 202
```

### Cenário 8.2 - Sucesso: Retry com backoff exponencial
```gherkin
Dado que webhook retorna erro (5xx ou timeout)
Quando primeiro envio falha
Então o sistema agenda retry após 1 segundo
  E segundo retry após 2 segundos
  E terceiro retry após 4 segundos
  E máximo 5 tentativas
  E após sucesso, contador de falhas reseta

Quando 5 tentativas falham
Então um evento "siem_export_failed" é registrado
  E webhook não tenta mais (até próximo batch)
```

### Cenário 8.3 - Sucesso: Assinatura HMAC do webhook
```gherkin
Dado que SIEM_WEBHOOK_SECRET=meu-secret
Quando POST é enviado para webhook
Então header X-Audit-Signature contém:
  HMAC-SHA256(body_string, secret) em hex
  E servidor SIEM valida signature antes de processar
```

### Cenário 8.4 - Sucesso: Monitorar saúde de webhook
```gherkin
Dado que webhook pode falhar
Quando um administrador faz GET /api/admin/audit/config
Então resposta contém webhook.last_success, webhook.failure_count
  E failure_count é resetado após sucesso
  E last_success = null se nunca conectou com sucesso
```

### Cenário 8.5 - Falha: URL webhook inválida
```gherkin
Dado que um administrador tenta configurar URL inválida
Quando ele faz PATCH /api/admin/audit/config com webhook.url=invalid
Então a operação retorna erro (status 400)
  E mensagem descreve: "URL must be HTTPS and valid"
```

## Funcional 9: Interface de Auditoria (Frontend)

### Cenário 9.1 - Sucesso: Renderizar tabela de eventos
```gherkin
Dado que um auditor navega para página /auditoria
Quando a página carrega
Então uma tabela é exibida com colunas:
  - Timestamp (formatado: DD/MM/YYYY HH:MM:SS)
  - Usuário (email)
  - Ação (em pt-BR: Login, Aprovação, Emissão, etc.)
  - Recurso (tipo e nome, ex: "Certificado api.example.com")
  - Status (ícone verde=sucesso, vermelho=falha)
  - Detalhes (link "Ver" que abre modal)
  E tabela mostra 50 eventos por página
  E há ícones indicando sucesso/falha
```

### Cenário 9.2 - Sucesso: Filtrar por período
```gherkin
Dado que tabela de eventos é exibida
Quando o auditor seleciona intervalo de datas no painel lateral
E clica "Aplicar"
Então a tabela é recarregada com apenas eventos no período
  E query parameters refletem filtros (?from_date=...&to_date=...)
```

### Cenário 9.3 - Sucesso: Filtrar por usuário
```gherkin
Dado que painel lateral tem filtro de usuário (dropdown ou autocomplete)
Quando o auditor seleciona um usuário
Então tabela mostra apenas eventos daquele usuário
  E contagem total atualiza
```

### Cenário 9.4 - Sucesso: Filtrar por tipo de ação
```gherkin
Dado que painel lateral tem checkbox para cada tipo de ação
Quando o auditor seleciona "Aprovação" e "Emissão"
Então tabela mostra apenas eventos com action="certificate_approved" ou "certificate_issued"
```

### Cenário 9.5 - Sucesso: Busca por texto
```gherkin
Dado que há campo de busca no topo
Quando o auditor digita "api.example.com"
Então tabela filtra para mostrar apenas eventos com resource_name ou user_email contendo o termo
```

### Cenário 9.6 - Sucesso: Ordenar por coluna
```gherkin
Dado que tabela é renderizada
Quando o auditor clica no cabeçalho "Timestamp"
Então eventos são reordenados por timestamp (descendente por padrão)
  E clique novamente inverte ordem (ascendente)
  E coluna exibe ícone indicando direção de ordenação
```

### Cenário 9.7 - Sucesso: Abrir detalhes de evento
```gherkin
Dado que um evento é exibido na tabela
Quando o auditor clica "Ver" ou no botão de detalhes
Então um modal abre mostrando:
  - Todos os campos obrigatórios formatados
  - Campo "details" exibido como JSON formatado
  - Timestamp em fuso horário local (se aplicável) com fallback UTC
  - Botão "Fechar"
```

### Cenário 9.8 - Sucesso: Exportar eventos
```gherkin
Dado que tabela contém eventos filtrados
Quando o auditor clica botão "Exportar"
Então um dropdown oferece opções: CSV, JSON
  E clique em "CSV" inicia download de arquivo .csv
  E clique em "JSON" inicia download de arquivo .json
  E arquivo contém exatamente os eventos exibidos (com filtros aplicados)
```

### Cenário 9.9 - Falha: Usuário sem permissão
```gherkin
Dado que usuário tem role "certificado_admin" (sem "auditor" ou "admin")
Quando ele tenta acessar /auditoria
Então a página exibe mensagem "Acesso negado"
  E é redirecionado para dashboard principal
  E um evento de auditoria é registrado
```

### Cenário 9.10 - Sucesso: Indicadores visuais de sucesso/falha
```gherkin
Dado que tabela de eventos inclui coluna "Status"
Quando eventos com status="success" são exibidos
Então um ícone verde (checkmark) é mostrado

Quando eventos com status="failure" são exibidos
Então um ícone vermelho (X) é mostrado
  E tooltip descreve o erro (se disponível em details)
```

## Funcional 10: Administração

### Cenário 10.1 - Sucesso: Exibir configuração atual
```gherkin
Dado que um administrador acessa /admin/auditoria (ou página de configuração)
Quando a página carrega
Então são exibidos:
  - Período de retenção atual (dias)
  - Status de Syslog (ativado/desativado, host, porta, última conexão)
  - Status de Webhook (ativado/desativado, URL, última tentativa, contador de falhas)
  - Botão "Testar SIEM"
  - Botão "Editar" para cada seção
```

### Cenário 10.2 - Sucesso: Editar período de retenção
```gherkin
Dado que administrador clica "Editar" em período de retenção
Quando um formulário é exibido com campo numérico (dias)
E o administrador insere 730 (2 anos)
E clica "Salvar"
Então a configuração é persistida (PATCH /api/admin/audit/config)
  E um evento de auditoria "admin_config_changed" é registrado
  E mensagem de sucesso é exibida
```

### Cenário 10.3 - Sucesso: Editar configuração Syslog
```gherkin
Dado que administrador clica "Editar" em Syslog
Quando um formulário é exibido com campos:
  - Toggle "Habilitado"
  - Hostname (texto)
  - Porta (número)
  - Facility (dropdown)
E o administrador altera valores e clica "Salvar"
Então a configuração é persistida
  E próximas mensagens syslog usam nova configuração
  E um evento de auditoria é registrado
```

### Cenário 10.4 - Sucesso: Testar conectividade SIEM
```gherkin
Dado que administrador está em página de configuração
Quando clica botão "Testar SIEM"
Então uma requisição POST /api/admin/audit/test-siem é enviada
  E um spinner é exibido enquanto testa
  E resposta mostra:
    - "Sucesso: Evento de teste enviado para Syslog" (se Syslog ativado)
    - "Sucesso: Evento de teste enviado para Webhook" (se Webhook ativado)
    - Ou erro com detalhes do problema
```

### Cenário 10.5 - Falha: Validar entrada em formulário
```gherkin
Dado que formulário de Syslog está aberto
Quando o administrador insere:
  - Porta=999999 (inválida)
  - Hostname="" (vazio)
Então o formulário mostra erros de validação inline
  E botão "Salvar" fica desabilitado
  E nenhuma requisição é enviada
```

## Funcional 11: Segurança & Autorização

### Cenário 11.1 - Falha: Usuário sem permissão lê auditoria
```gherkin
Dado que usuário tem role "certificado_user" (não auditor/admin)
Quando ele tenta GET /api/audit/events
Então resposta retorna 403 Forbidden
  E body contém mensagem de erro
  E um evento "unauthorized_access_attempt" é registrado
```

### Cenário 11.2 - Sucesso: Auditor lê auditoria (sem write)
```gherkin
Dado que usuário tem role "auditor"
Quando ele faz GET /api/audit/events
Então resposta retorna 200 OK com eventos
  E ele NÃO consegue fazer DELETE /api/audit/events/<id>
  E tentativa DELETE retorna 403
```

### Cenário 11.3 - Sucesso: Admin tem acesso completo
```gherkin
Dado que usuário tem role "admin"
Quando ele faz GET /api/audit/events
Então resposta retorna eventos

Quando ele faz PATCH /api/admin/audit/config
Então configuração é atualizada
```

## Funcional 12: Performance & Escalabilidade

### Cenário 12.1 - Sucesso: Query em < 1 segundo
```gherkin
Dado que 100.000 eventos estão na tabela de auditoria
Quando um auditor faz GET /api/audit/events?resource_id=<cert-id>
Então a resposta é retornada em < 1 segundo
  E índice em resource_id é usado (EXPLAIN ANALYZE verifica)
```

### Cenário 12.2 - Sucesso: Paginação obrigatória
```gherkin
Dado que aplicação permite limit máximo de 1000 registros/página
Quando um auditor tenta GET /api/audit/events?limit=10000
Então a resposta retorna no máximo 1000 registros
  E mensagem indica limitação
```

### Cenário 12.3 - Sucesso: Arquivamento não bloqueia operações
```gherkin
Dado que job de arquivamento está processando 1 milhão de eventos
Quando usuários consultam /api/audit/events durante o processo
Então consultas continuam rápidas (< 1s) sem bloqueio
  E uso de índices garante isolamento entre leitura e movimento
```

## Cenários de Integração

### Cenário I.1 - Sucesso: Fluxo completo de auditoria de certificado
```gherkin
Dado que sistema está configurado com auditoria, syslog e webhook ativados
Quando um usuário requisita novo certificado:
  1. Um evento "certificate_requested" é criado
  2. Um evento é enviado para syslog
  3. Um evento é enfileirado para webhook
E um aprovador aprova requisição:
  4. Um evento "certificate_approved" é criado
  5. Novo evento é enviado para syslog e webhook
E certificado é emitido:
  6. Um evento "certificate_issued" é criado
Então:
  - Todos os 3 eventos existem na tabela audit_events
  - Syslog recebeu 3 mensagens
  - Webhook recebeu batch de 3 eventos (ou 2 batches de 2+1, dependendo timing)
  - Auditor consegue recuperar completa timeline em /api/audit/events
  - Resposta inclui: quem requisitou, quem aprovou, quando foi emitido
```

### Cenário I.2 - Sucesso: Auditoria de falhas (compliance)
```gherkin
Dado que usuário tenta fazer login 3x com senha errada
Quando tentativas falham
Então 3 eventos "login" com status="failure" são criados
  E details contém motivo "invalid_credentials"
  E Syslog/webhook recebem os eventos de falha
E quando auditor consulta /api/audit/events?user_id=<>&action=login&status=failure
Então relatório mostra tentativas falhadas
  E compliance team consegue comprovar que falhas foram registradas
```
