## Objetivo

Quando chega um e-mail na Caixa de Entrada, em vez de criar sempre um ticket novo (ou pedir ao agente para escolher), o sistema deve:

1. Procurar tickets do **mesmo cliente** (match por `client_email`, case-insensitive).
2. Se existir **≥ 1 ticket aberto** (não resolvido / não fechado) → **anexar** o e-mail a esse ticket.
3. Se só existirem tickets **fechados/resolvidos** → criar **novo ticket de continuação** com `parent_ticket_id` = último ticket fechado mais recente.
4. Se **não existir** nenhum ticket desse cliente → criar ticket normal.

Aplica-se a:
- **Roteamento automático** dos e-mails novos (sem clique do agente).
- **Botão "Criar" manual** da Caixa de Entrada (mesmo fluxo, mas sempre sob clique do agente).

## Comportamento detalhado

**Múltiplos tickets abertos:**
- Escolher o ticket aberto com `updated_at` mais recente.
- Registar evento na timeline desse ticket: "E-mail anexado automaticamente (auto-routing)" com link ao `inbound_email_event_id`.

**Ticket aberto encontrado → anexar:**
- Cria `ticket_messages` (sender_type=client) com o corpo do e-mail.
- Marca o `inbound_email_events` como `processed` + `routing_action='auto_appended_to_open_ticket'` + `routed_ticket_id`.
- Marca `pending_emails` como `approved` (se aplicável).
- NÃO altera o estado do ticket — apenas adiciona mensagem; os triggers existentes tratam de SLA/notificações.

**Só fechado/resolvido → novo ticket de continuação:**
- Cria ticket novo com `parent_ticket_id` = ticket fechado mais recente, `status='novo'`, `priority='P2'`.
- Copia `client_name`, `client_email`, `email_received_at`.
- Mantém extração conservadora de `order_number` (lógica já existente).
- Marca evento como `processed` + `routing_action='auto_created_continuation'`.

**Sem tickets do cliente → novo ticket normal** (comportamento atual).

**Sempre que houver hesitação (ex: 2+ abertos com mesmo email mas categorias diferentes):**
- Para o **roteamento automático**: anexar ao mais recente (regra simples e previsível).
- Para o **botão manual**: mostrar diálogo de escolha já existente (`suggest-open-ticket-for-inbound-email`) — recomendação passa a ser `auto_append_safe` se houver 1 aberto, ou `manual_select` se 2+.

## Implementação técnica

**1. Edge function `inbound-email` (roteamento automático)**
- Após criar o `inbound_email_events`, antes de criar o ticket, consultar tickets do `from_address` com join a `ticket_statuses` (excluir `is_closed=true` e `is_resolved=true`).
- Decidir: anexar | continuação | novo. Inserir `ticket_messages` ou `tickets` em conformidade.
- Atualizar `inbound_email_events.routing_action`, `routed_ticket_id`, `routing_reason`.

**2. Edge function `handle-inbound-email-event-action` (botão Criar manual)**
- No início da ação `create_ticket`: chamar a mesma lógica de lookup.
- Se encontrar ticket aberto → fazer `append_to_ticket` automaticamente (em vez de criar) e devolver `{action_taken:'appended', ticket_id, ticket_number}`.
- Se só fechados → criar com `parent_ticket_id` preenchido e `routing_action='manual_created_continuation'`.
- Se nenhum → comportamento atual.

**3. Frontend `InboundEmailEvents.tsx`**
- Após `runActionOn(..., 'create_ticket')`, ler `action_taken` da resposta e ajustar toast:
  - `appended` → "E-mail anexado ao ticket aberto #N do cliente".
  - `continuation` → "Novo ticket de continuação #N criado (anterior #M fechado)".
  - `new` → "Ticket #N criado".

**4. Sem alterações de schema** — usamos `parent_ticket_id`, `routed_ticket_id`, `routing_action` que já existem.

## Fora de escopo
- Match por número de encomenda (foi rejeitado nas respostas).
- Reabertura de tickets fechados (foi rejeitado — sempre continuação).
- Quick Ticket de chamadas (não pedido).
