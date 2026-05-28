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
- **Fase 3 — Ticket como centro do sistema**: timeline única, normalizar `status` em FK.
- **Fase 4 — Integração com encomendas/GestãoClick**.
- **Fase 5 — SLA real** (horário comercial + alertas).
- **Fase 6 — Painel Operacional (Alessandra)** + simplificação do menu.
- **Fase 7 — Notificações estruturadas e menções** (secção 8).
- **Fase 8 — IA e automações** (triagem, extração de encomenda, sugestões de macro).

---

## Observações importantes
- **Nada foi apagado nem renomeado.**
- Adicionados nesta fase 2.1: edge function `handle-inbound-email-event-action`, coluna aditiva `inbound_email_events.action_metadata`, índices não-únicos em `status` / `received_at`, ações operacionais no UI da Caixa de Entrada.
- Anteriormente adicionados: `src/pages/InboundEmailEvents.tsx`, rota `/inbound-events`, item de menu "Caixa de Entrada".
- Backend `fetch-inbound-emails` **não foi tocado** nesta fase.

