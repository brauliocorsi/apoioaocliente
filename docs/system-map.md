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

## Observações importantes
- **Nada foi apagado nem renomeado.**
- Adicionados nesta fase 2.1: edge function `handle-inbound-email-event-action`, coluna aditiva `inbound_email_events.action_metadata`, índices não-únicos em `status` / `received_at`, ações operacionais no UI da Caixa de Entrada.
- Anteriormente adicionados: `src/pages/InboundEmailEvents.tsx`, rota `/inbound-events`, item de menu "Caixa de Entrada".
- Backend `fetch-inbound-emails` **não foi tocado** nesta fase.

