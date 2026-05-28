# Mapa do Sistema — UP Móveis Suporte

Documento de orientação. **Não altera funcionalidades.** Serve para guiar a repaginação futura sem perder dados nem fluxos existentes.

---

## 1. Módulos existentes

### Páginas (agente)
- `Dashboard` (`/`)
- `Tickets` (`/tickets`, `/tickets/:id`, `/tickets/new`)
- `EmailTickets` (`/email-tickets`, `/email-tickets/:id`)
- `InboundEmailEvents` / Caixa de Entrada (`/inbound-events`) — **novo**
- `PhoneCalls` (`/phone-calls`)
- `DeliveryConfirmations` (`/delivery-confirmations`)
- `PostDeliveryConfirmations` (`/post-delivery`)
- `DelayedOrders` (`/delayed-orders`)
- `Macros` (`/macros`)
- `SettingsPage` (`/settings`) — agentes, clientes, FAQ, SLA, SMTP, templates, regras, logs
- `CategoriesPage`, `TagsPage`, `StatusPage` (admin)

### Páginas (portal cliente)
- `PortalLogin`, `PortalTickets`, `PortalTicketDetail`, `PortalNewTicket`, `PortalFAQ`

### Edge Functions
- `fetch-inbound-emails` — IMAP + spam scoring + roteamento
- `inbound-email` — webhook de e-mail
- `reply-email-ticket` — envio de resposta (Resend/SMTP)
- `send-ticket-email`, `send-ticket-created-confirmation`
- `download-attachment`
- `create-agent`, `delete-agent`, `create-client-account`, `delete-client`, `reset-client-password`
- `check-reminders`, `sync-delayed-orders`
- `gestaoclick-proxy`
- `test-smtp`

---

## 2. CORE do sistema
Não pode ser tocado sem cuidado extremo:
- Tickets (`tickets`, `ticket_messages`, `ticket_events`, `ticket_attachments`)
- Clientes (`client_users`, `profiles`)
- Portal do cliente (login, listagem, detalhe, criação)
- E-mail inbound (`fetch-inbound-emails`, `pending_emails`, `email_threads`, `inbound_email_events`)
- Confirmação automática (`send-ticket-created-confirmation`)
- SLA (`sla_config`, campos em `tickets`)
- GestãoClick / encomendas (`delayed_orders`, `gestaoclick-proxy`)
- Anexos (`ticket-attachments` bucket + `ticket_attachments`)
- Permissões (`user_roles`, `has_role`, `is_authenticated_agent`)

## 3. Módulos auxiliares
Podem ser reorganizados/ocultados sem afetar o core:
- Macros, cláusulas (`clauses`, `category_clauses`)
- Motor de decisão (`decision_rules`, `lib/decisionEngine.ts`)
- Ligações (`phone_calls`, `phone_call_reminders`, `phone_call_statuses`)
- Pós-entrega (`post_delivery_confirmations`)
- Confirmações de entrega (`delivery_confirmations`)
- Encomendas atrasadas (visual)
- Configurações avançadas (templates, SMTP, FAQ)

## 4. Reorganização sugerida (futuro, **sem apagar**)

```
Atendimento
  ├── Dashboard
  ├── Tickets
  ├── Email Tickets
  └── Caixa de Entrada
Operações
  ├── Ligações
  ├── Reg. Ligações
  ├── Pós-Entrega
  └── Encomendas Atrasadas
Configurações
  ├── Macros
  ├── Categorias / Tags / Status
  └── SLA / Templates / SMTP / FAQ
Administração
  └── Agentes / Clientes / Logs
```

## 5. Riscos técnicos conhecidos
- **Edge functions com `verify_jwt = false`**: `fetch-inbound-emails`, `inbound-email`, `send-ticket-created-confirmation` (auditadas), `gestaoclick-proxy`, `sync-delayed-orders`, `check-reminders`. Validar cada uma quanto a autenticação manual.
- **Status textual em `tickets.status`** (coluna `text`) coexiste com `ticket_statuses` (tabela). Falta FK formal — risco de inconsistência.
- **Anexos em buckets públicos** (`ticket-attachments`, `email-assets`, `avatars`). Avaliar mover para privado com signed URLs.
- **`pending_emails` sem fluxo de UI completo** para aprovação/rejeição assistida.
- **`InboundEmailEvents` ainda sem ações** (aprovar, bloquear remetente, anexar manualmente).
- Possíveis **telas sobrepostas**: `EmailTickets` vs `InboundEmailEvents` vs `pending_emails` — clarificar papéis.
- `is_active = false` em profiles é validado no client (`useAuth`), mas RLS não bloqueia diretamente — depende de `is_authenticated_agent`.
- Falta de auditoria estruturada em deleções de clientes/agentes (apesar de funções dedicadas existirem).

## 6. Plano de repaginação futura (faseado, **não implementar agora**)

- **Fase 1 — Segurança e preservação de dados**: revisar `verify_jwt`, bloquear buckets públicos sensíveis, auditar políticas RLS, validar `is_active`.
- **Fase 2 — Caixa de Entrada e e-mails**: ações em `inbound_email_events` (aprovar, bloquear, anexar), unificar com `pending_emails`.
- **Fase 3 — Ticket como centro do sistema**: timeline única, normalizar `status` para FK em `ticket_statuses`.
- **Fase 4 — Integração com encomendas/GestãoClick**: refresh automático, ligar OS a tickets de forma estruturada.
- **Fase 5 — SLA real**: respeitar horário comercial, pausas, alertas proativos.
- **Fase 6 — Simplificação do menu**: agrupar conforme secção 4.
- **Fase 7 — IA e automações**: triagem, extração de encomenda, sugestões de macro.

---

## 7. Gerência operacional — Alessandra

**Contexto humano (Maio 2026):**
- Matheus deixou de ser gerente operacional.
- Alessandra assumiu a coordenação operacional global.
- Coordena: escritório de apoio ao cliente, armazém, fábrica, ligação com logística e ligação com loja física / vendas.
- O sistema futuro deve dar-lhe **clareza operacional em tempo real**: o que está parado, o que falhou, onde existe risco, e quem é responsável.

### Visão futura: Painel Operacional (não implementar ainda)

**Atendimento**
- tickets novos / sem responsável / sem resposta / vencidos / a vencer hoje
- tickets reabertos / continuação (`parent_ticket_id`)
- clientes a aguardar resposta

**Armazém**
- pedidos prontos / incompletos / com divergência
- pendências de separação
- pedidos não localizados

**Fábrica**
- pedidos em produção / atrasados / bloqueados por falta de material
- produção prometida para 24/48h

**Logística**
- entregas agendadas / sem rota / atrasadas / reagendadas
- clientes sem contacto confirmado

**Loja**
- promessas feitas ao cliente / vendas sem data clara
- reclamações vindas da loja / encomendas sem atualização

---

## 8. Arquitetura futura de notificações, menções e prazos

Não implementar agora. Documenta-se para servir de norte às próximas fases.

O sistema futuro precisa de:
- notificações internas para agentes/supervisores;
- menções `@nome` em notas e mensagens internas;
- notificações para o cliente (portal + e-mail);
- prazo claro por ticket (próxima ação, responsável, data-limite);
- SLA de **primeira resposta** e SLA de **resolução** distintos;
- alertas proativos de vencimento e de tickets parados.

### Tipos futuros de notificações

```
ticket_assigned
ticket_reply_received
ticket_customer_waiting
ticket_internal_mention
ticket_sla_warning
ticket_sla_breached
ticket_due_today
ticket_overdue
ticket_continuation_created
ticket_status_changed
email_failed
email_quarantined
pending_email_review
client_portal_message
```

Não criar tabelas novas agora. `agent_notifications` já existe e cobre parte (`mention`, `client_message`) e deve evoluir para suportar esta taxonomia sem migrações destrutivas.

---

## 9. Atualização do plano faseado

- **Fase 1 — Segurança e preservação de dados**: revisar `verify_jwt`, bloquear buckets públicos sensíveis, auditar RLS.
- **Fase 2 — Caixa de Entrada operacional** ✅ entregue (ações manuais via `handle-inbound-email-event-action`).
- **Fase 3 — Ticket como centro do sistema** ✅ entregue (timeline unificada, próxima ação, hardening da edge function).
- **Fase 4 — Integração com encomendas/GestãoClick**.
- **Fase 5 — SLA real** (horário comercial + alertas).
- **Fase 6 — Painel Operacional (Alessandra)** + simplificação do menu.
- **Fase 7 — Notificações estruturadas e menções** (secção 8).
- **Fase 8 — IA e automações** (triagem, extração de encomenda, sugestões de macro).

---

## 10. Fase 3 — Ticket como centro (entregue)

### O que foi adicionado
- Componente `src/components/ticket/TicketTimeline.tsx`: timeline unificada read-only sobre `ticket_messages`, `ticket_events`, `email_logs`, `inbound_email_events`, `ticket_attachments` e filhos por `parent_ticket_id`. Apenas usado em páginas de agente — clientes do portal **não** consomem este componente.
- Colunas aditivas em `tickets`: `next_action text NULL`, `next_action_due_at timestamptz NULL` + índice parcial. Editor inline na sidebar do ticket com badge "Atrasada" quando o prazo passou.
- Badge "Sem responsável" quando `assigned_to IS NULL`.
- Hardening de `handle-inbound-email-event-action`:
  - guarda server-side de estado terminal (`processed`, `duplicate`, `spam`, `ignored`, `reviewed`) para `append_to_ticket`, `mark_spam`, `ignore`, `mark_reviewed` → retorna `409 event_terminal`;
  - `create_ticket` agora usa update condicional `WHERE routed_ticket_id IS NULL` para reivindicar o evento — se outra chamada concorrente venceu a corrida, o ticket recém-criado é descartado e devolve `already_created` com o id vencedor.

### Onde os novos campos serão usados nas próximas fases
`next_action` e `next_action_due_at` são a base para:
- notificações de prazo (Fase 7);
- alertas de "vence hoje" / "atrasado" no painel da Alessandra (Fase 6);
- métricas operacionais por responsável;
- SLA operacional além do SLA por categoria/prioridade já existente (Fase 5).

---

## 11. Status e SLA — riscos atuais e plano de normalização futura

Estado atual:
- `tickets.status` é uma coluna `text` livre. Coexiste com `public.ticket_statuses` (tabela com `is_closed`, `is_resolved`, `pauses_sla`), mas **não há FK**.
- Existem partes do código que ainda comparam `status` por string fixa (ex.: `"novo"`, `"aguarda_cliente"`). Outras partes já fazem lookup em `ticket_statuses` (ex.: a edge function `handle-inbound-email-event-action` consulta `is_closed/is_resolved`).
- O risco principal de uma migração destrutiva é tickets antigos com valores de `status` que **já não existem** em `ticket_statuses` — adicionar uma FK agora rejeitaria esses registos.

Plano de normalização (não fazer agora):
1. Auditar tickets cujo `status` não está em `ticket_statuses` (`SELECT DISTINCT status FROM tickets WHERE status NOT IN (SELECT id FROM ticket_statuses)`).
2. Inserir os ids em falta em `ticket_statuses` para alinhar o histórico.
3. Substituir comparações de string fixa por lookup via hook `useTicketStatuses`.
4. Só então avaliar adicionar uma FK opcional (`ON DELETE SET NULL` / `ON DELETE RESTRICT`).
5. Nunca renomear ou apagar status existentes — apenas marcar como inativos.

Proibido nesta fase: alterar o tipo de `tickets.status`, criar FK que rejeite dados antigos, fazer UPDATE em massa em `status`.

---

## Observações importantes
- **Nada foi apagado nem renomeado** em nenhuma fase.
- Fase 3 adicionou: `tickets.next_action`, `tickets.next_action_due_at`, componente `TicketTimeline`, editor de próxima ação na sidebar, hardening da edge function da Caixa de Entrada.
- Fase 2.1 adicionou: edge function `handle-inbound-email-event-action`, `inbound_email_events.action_metadata`, índices em `status`/`received_at`, ações operacionais no UI.
- Backend `fetch-inbound-emails` **não foi tocado** desde a Fase 2.




---

## Fase 4 — Encomenda como contexto do ticket

### Objetivo
Tornar o ticket consciente da encomenda associada, sem alterar dados antigos nem criar dependências rígidas com o GestãoClick.

### Campos aditivos
- `tickets.order_lookup_status` text — `not_checked | found | not_found | multiple_matches | error | mismatch`.
- `tickets.order_lookup_at` timestamptz — última consulta.
- `tickets.order_lookup_error` text — erro técnico legível.
- `tickets.order_snapshot` jsonb — resumo da encomenda no momento da consulta (cliente, produtos, datas, situação, etc.).
- `inbound_email_events.extracted_order_number` text — número detetado no e-mail recebido.
- Index parcial em `tickets(order_number)`.

### Extração de número de encomenda
- Helper: `src/lib/orderNumberExtractor.ts` (`extractOrderNumberFromText`, `extractOrderNumberFromSources`).
- Regex conservador: aceita 3–10 dígitos precedidos de `encomenda|pedido|order|ordem de serviço|OS|nº encomenda`.
- Remove telefones portugueses (`+351` ou começados em 2/9) antes de extrair, para evitar falsos positivos.
- Se houver mais de um candidato, **nunca** preenche `order_number` automaticamente — marca `order_lookup_status = multiple_matches`.

### Onde a extração é aplicada
- `handle-inbound-email-event-action` (ação `create_ticket` na Caixa de Entrada): aplica a partir de `subject + body`; só preenche `order_number` se vazio; persiste `extracted_order_number` no evento.
- Outros fluxos de criação (fetch-inbound-emails automático, portal, criação manual de agente) **não** foram tocados nesta fase para evitar regressões — agente pode usar o card no sidebar.

### Lookup no GestãoClick
- Reutiliza a edge function existente `gestaoclick-proxy` (action `search_vendas`, parâmetro `query=<código>`).
- Auth: proxy já valida JWT do utilizador via `auth.getUser()`. Cliente do portal não tem `user_roles` válido → não consegue chamar.
- Tokens `GESTAOCLICK_ACCESS_TOKEN` / `GESTAOCLICK_SECRET_ACCESS_TOKEN` permanecem só no servidor.

### UI — card "Encomenda" no `TicketSidebar`
- Componente: `src/components/ticket/OrderContextCard.tsx`.
- Mostra: badge de estado (incl. "Possível divergência" quando `client_email` ≠ email do snapshot), input do número, botão "Procurar/Atualizar".
- Snapshot renderizado com tolerância total a campos ausentes.
- Cada consulta cria um `ticket_events` (`event_type=note`) com o resultado, alimentando a `TicketTimeline`.

### Limitações conhecidas
- A extração é deliberadamente conservadora — frases sem keyword (apenas "12345 ainda não chegou") não acionam auto-fill.
- O snapshot é um *snapshot*: não é atualizado em background. O agente deve clicar para refrescar.
- Divergência é detetada apenas para email; nome/telefone não bloqueiam.
- Falha no GestãoClick não trava nada — fica registada em `order_lookup_error`.

### Fora de âmbito desta fase
- Dashboard agregado por encomenda (visão da Alessandra).
- Resync automático / pg_cron.
- Normalização cruzada de cliente (ticket vs encomenda vs `client_users`).
- Extração avançada via IA (fatura, telefone, OS).
- Mudança no `gestaoclick-proxy` além de reutilização.

### Visão futura — operacional da Alessandra
Com os novos campos passamos a poder construir, sem refactor, queries para:
- Tickets por encomenda (`tickets.order_number`).
- Encomendas com reclamação aberta (`order_lookup_status='found' AND status NOT IN (resolvidos)`).
- Tickets sem encomenda identificada (`order_number IS NULL OR order_lookup_status IN ('not_checked','not_found','multiple_matches')`).
- Divergências (`order_lookup_status='mismatch'`).
- Cruzamento com `delayed_orders` via `order_number`.


---

## Fase 5A — Painel Operacional da Alessandra

**Ficheiros:**
- `src/pages/OperationalDashboard.tsx` (novo)
- `src/App.tsx` (rota `/operational-dashboard`)
- `src/components/AppSidebar.tsx` (item "Painel Operacional")

**Objetivo:** dar à gerência operacional (Alessandra) uma vista única de cobrança — quem está parado, o que está atrasado, o que precisa ação. **Apenas leitura, sem mutações.**

**Indicadores (cards):** clientes sem resposta · sem responsável · ações atrasadas · ações para hoje · sem próxima ação · caixa pendente · quarentena · falhas de e-mail · tickets de continuação · críticos · encomenda não verificada · encomendas com atenção.

**Listas acionáveis:** clientes sem resposta · ações atrasadas · sem responsável · sem próxima ação · caixa que precisa ação · tickets de continuação · encomendas com atenção · indicadores por responsável · indicadores por categoria.

**Regras:**
- Aberto/fechado usa `ticket_statuses.is_closed/is_resolved` (fallback: status desconhecido = aberto).
- **Clientes sem resposta** = ticket aberto cuja última `ticket_messages` é `sender_type='client'` sem `agent` posterior. *Limitação:* respostas só via e-mail sem espelho em `ticket_messages` podem não contar; refinar com `email_logs` em fase futura.
- **Encomendas com atenção** = `order_lookup_status ∈ {not_found, error, multiple_matches, mismatch}` ou `order_number` preenchido sem lookup.

**Filtros:** período (hoje/7d/30d/tudo) · responsável (inclui "sem responsável") · prioridade · categoria.

**Acesso:** apenas agentes/supervisores (rota dentro de `AppLayout` → `AuthProvider`). Portal cliente não tem acesso.

**Base para futuro:** estes indicadores serão fonte para notificações reais, menções, SLA por etapa e cobrança automatizada — não implementados nesta fase.

**Sem alterações destrutivas:** sem migrations, sem DROP/TRUNCATE/DELETE. Apenas leitura de tabelas existentes (`tickets`, `ticket_messages`, `ticket_statuses`, `profiles`, `categories`, `inbound_email_events`, `email_logs`).

---

## Fase 5B — Notificações internas, menções e prazos operacionais

**Migration aditiva:** cria `public.notifications` com índices, RLS (recipient + supervisor read; só recipient marca como lida; INSERT apenas via service_role/SECURITY DEFINER triggers).

**Helpers (SECURITY DEFINER, EXECUTE revogado de anon):**
- `create_notification(...)` — idempotente: se já existir não lida para (user, type, ticket/event) apenas atualiza `updated_at`.
- `notify_supervisors(...)` — itera supervisores ativos.

**Triggers automáticos:**
| Trigger | Fonte | Tipo gerado |
|---|---|---|
| `trg_notify_ticket_assignment` | `tickets` INSERT/UPDATE de `assigned_to` | `ticket_assigned`, `ticket_without_owner`, `ticket_continuation_created` |
| `trg_notify_client_message` | `ticket_messages` INSERT (sender_type=client) | `ticket_reply_received`, `ticket_customer_waiting` |
| `trg_notify_inbound_event_status` | `inbound_email_events` status change | `pending_email_review`, `email_quarantined`, `email_failed` |
| `trg_notify_internal_mentions` | `ticket_events` INSERT (event_type='note') | `ticket_internal_mention` |

**Menções:** regex `@([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9_-]+)`; resolve por primeiro nome / nome completo / nome sem espaços, case-insensitive. Limitação: ambiguidade entre homónimos resolve para o primeiro match e não notifica o próprio autor.

**Edge Function `generate-operational-notifications`** (manual ou agendável):
- varre tickets abertos com `next_action_due_at <= fim do dia`;
- gera `ticket_next_action_due_today` ou `ticket_next_action_overdue`;
- destinatário: `assigned_to` ou supervisores em fallback;
- idempotente via `create_notification`.
- Para agendar futuramente: pg_cron `select cron.schedule('op-notifs', '*/15 * * * *', $$ select net.http_post(...) $$);`.

**UI:** `NotificationBell` extendido com terceira secção "Operacional" — badge inclui contagem combinada; suporte realtime via channel; clique navega para ticket ou `/inbound-events`; "marcar todas como lidas" cobre ambas as tabelas.

**Acesso clientes do portal:** RLS denies — nenhuma policy concede acesso a roles sem `is_authenticated_agent()` ou supervisor.

**Fora do âmbito (preparar Fase 5C — Notificações ao cliente):**
- e-mail automático ao cliente quando agente responde / ticket resolvido / equipa pede informação;
- centro de notificações no portal;
- push browser, SMS, WhatsApp;
- SLA avançado por etapa.

**Sem alterações destrutivas:** tabela `agent_notifications` intacta; sem DROP/TRUNCATE/DELETE; sem mudança de status/SLA.

---

## Fase 5C — Notificações ao cliente

**Princípio:** separação rígida entre notificações internas (agentes/supervisores) e notificações ao cliente (apenas eventos externos relevantes).

**Tabela `client_notifications`:** `client_user_id`, `ticket_id`, `type`, `title`, `message`, `is_read`, `email_sent`, `email_error`, `metadata`, timestamps.

**Tipos implementados:**
- `ticket_agent_replied` — agente envia mensagem pública (`ticket_messages.sender_type='agent'`).
- `ticket_resolved` — status muda para `ticket_statuses.is_resolved=true`.
- `ticket_closed` — status muda para `ticket_statuses.is_closed=true`.

**Tipos previstos mas não automatizados (futuro):** `ticket_needs_customer_info` (depende de status específico de "aguarda cliente" — deixar como ação manual), `ticket_created_confirmation` (já coberto por `send-ticket-created-confirmation` por e-mail).

**Triggers SQL (SECURITY DEFINER):**
- `trg_notify_client_on_agent_message` em `ticket_messages` AFTER INSERT.
- `trg_notify_client_on_status_change` em `tickets` AFTER UPDATE OF status.
- `trg_dispatch_client_notification_email` em `client_notifications` AFTER INSERT — chama `send-client-notification` via `pg_net.http_post`.

**Idempotência:** helper `create_client_notification` aceita `dedupe_key`. Usado: `msg:<message_id>` para respostas, `status:<ticket_id>:<type>` para mudanças de estado. Reaplicar o mesmo evento não duplica.

**Notas internas NÃO geram notificação ao cliente:** notas vivem em `ticket_events` (event_type='note'), não em `ticket_messages` — trigger nunca dispara para elas. Mesma proteção para menções (`@nome` é detectado em ticket_events, não em ticket_messages).

**Edge Function `send-client-notification`** (verify_jwt=false, chamada por trigger):
- carrega notificação pelo `notification_id`;
- resolve e-mail via `metadata.client_email` → `client_users.email` → `tickets.client_email`;
- bloqueia endereços automáticos (`noreply|no-reply|mailer-daemon|postmaster|donotreply`);
- envia via Resend (se `system_settings.resend_enabled='true'`) ou SMTP;
- regista em `email_logs` (source `client_notification`);
- atualiza `client_notifications.email_sent` / `email_error`;
- falha de envio NÃO afeta a notificação no portal nem a ação principal.

**Portal cliente — `ClientNotificationBell`:** ícone no `PortalLayout` com badge de não-lidas, popover com lista, marcar como lida (individual e em massa), navegação para `/portal/tickets/:id`, realtime via `postgres_changes` filtrado por `client_user_id=auth.uid()`.

**RLS:**
- `client_notifications_select_own` — cliente lê só as suas (`client_user_id = auth.uid()`).
- `client_notifications_update_own` — cliente só altera as suas (usado para marcar lida).
- `client_notifications_select_agents` — agentes podem consultar para apoio.
- Sem policy de INSERT/DELETE — só `service_role` (triggers) escreve.

**Tickets fechados antigos:** quando cliente responde a um ticket fechado, o fluxo de continuação (Fase 1) cria novo ticket via `parent_ticket_id`. Notificações ao cliente referenciam o novo ticket via trigger de mensagem; o ticket antigo não recebe nova notificação porque o trigger de status só dispara em transições, não em estados já fechados.

**Limitações conhecidas:**
- Sem unsubscribe (cliente não tem opção de desligar e-mails).
- Sem preferências por canal.
- Sem detecção automática de "pedido de informação" — só status-change resolvido/fechado.
- Trigger pg_net é fire-and-forget: se a edge function falhar repetidamente, retry manual via re-update da row (futura melhoria).

**Fora de âmbito:** push browser, SMS, WhatsApp, preferências avançadas, IA, unsubscribe.

**Sem alterações destrutivas:** nenhuma tabela existente foi modificada; nenhum dado apagado; triggers anteriores intactos.


## Fase 6 — SLA operacional real + repaginação funcional

### SLA operacional
- Novas colunas aditivas em `tickets`: `next_customer_update_due_at`, `sla_status`, `sla_breached`, `sla_breach_reason`, `sla_paused`, `sla_paused_reason`.
- Defaults por prioridade (horas corridas — limitação assumida nesta fase): primeira resposta 2/4/24/48h, resolução 24/48/120/240h. Atualização ao cliente a cada 48h.
- Triggers aditivos:
  - `trg_tickets_init_sla` (BEFORE INSERT) preenche prazos iniciais.
  - `trg_ticket_messages_sla_marks` (AFTER INSERT em `ticket_messages`) regista `first_responded_at` e empurra `next_customer_update_due_at` quando o agente responde.
  - `trg_tickets_sla_on_status` (BEFORE UPDATE) marca `resolved_at` e atualiza `sla_status` para resolvido/fechado.
- Estados derivados na UI: `on_track`, `warning`, `breached`, `paused`, `resolved`, `closed`, `no_sla`.

### Onde aparece
- `src/components/ticket/SlaStatusCard.tsx` — card no TicketSidebar com badge de estado, primeira resposta, resolução, próxima atualização e próxima ação.
- `OperationalDashboard`: 8 KPIs novos (SLA vencido, em risco, primeira resp. vencida, resolução vencida, cliente sem atualização, SLA pausado, sem SLA) + listas `sla-breached` e `cust-update`.

### Notificações SLA (internas)
- `generate-operational-notifications` estendida com tipos: `first_response_overdue`, `resolution_overdue`, `customer_update_overdue`, `sla_warning` (janela 2h). Idempotência via `create_notification`. Marca `tickets.sla_breached=true` na primeira ocorrência. Não notifica cliente.

### Layout / menu
- `AppSidebar` reorganizado em grupos: Visão Geral, Atendimento, Operação, Gestão, Administração. Sem rotas removidas. Categorias/Etiquetas continuam acessíveis via Configurações (rotas próprias não estão registadas em `App.tsx`).

### Limitações conhecidas
- Cálculo de SLA em horas corridas; calendário laboral não implementado.
- Tickets antigos não recebem atualização em massa; apenas novos eventos preenchem os campos.
- `sla_paused` é manual (sem trigger automático por estado “Aguarda cliente”).

### Próxima fase recomendada
- Calendário laboral Mon–Sat 08–20 e pausa automática por status “Aguarda cliente”.
