## Objetivo

Quando um cliente responde por e-mail a um ticket **fechado/resolvido**, `fetch-inbound-emails` atualmente anexa a mensagem ao ticket antigo. Vamos passar a **criar um novo ticket** e ligá-lo ao anterior como referência.

## Definição de "fechado"

Um ticket está fechado/resolvido quando o seu `status` aponta para um `ticket_statuses` com `is_closed = true` **ou** `is_resolved = true`.

## Fluxo correto

```text
e-mail recebido
   │
   ├─ match (In-Reply-To / References / email_threads / mesmo cliente)?
   │     ├─ sim, ticket ABERTO   → anexar mensagem (igual a hoje)
   │     ├─ sim, ticket FECHADO  → criar NOVO ticket
   │     │                          parent_ticket_id = ticket antigo
   │     │                          evento em ambos os tickets
   │     │                          email_threads aponta para o NOVO
   │     │                          confirmação automática ao cliente
   │     └─ não                   → fluxo atual (pending_emails / novo ticket)
```

## Mudanças

### 1. Base de dados (1 migração)

Adicionar à tabela `tickets`:

- `parent_ticket_id uuid NULL`
- índice em `parent_ticket_id`

Sem novas tabelas, sem alterações de RLS, sem foreign keys destrutivas.

### 2. `supabase/functions/fetch-inbound-emails/index.ts`

Ajuste cirúrgico no ponto onde decide anexar a um ticket encontrado:

- Carregar `ticket_statuses` (`is_closed`, `is_resolved`) do status do ticket candidato.
- Se **aberto**: comportamento atual (anexar mensagem + anexos + atualizar `email_received_at`).
- Se **fechado**:
  1. Criar novo ticket com:
     - `client_name`, `client_email`, `client_phone`, `order_number` herdados do ticket antigo;
     - `subject` = `[Continuação #N] <assunto original>`;
     - `description` = corpo do e-mail recebido;
     - `priority` herdada do ticket antigo (ou P2);
     - `category_id` / `subcategory_id` herdados;
     - `parent_ticket_id` = id do ticket antigo;
     - `created_by` = fallback de agente já em uso na função;
     - `email_received_at` = data do e-mail.
  2. Mover anexos do e-mail para o **novo** ticket.
  3. Inserir `ticket_events`:
     - no novo: `"Novo ticket criado por resposta de e-mail ao ticket #N (fechado)"`;
     - no antigo: `"Cliente respondeu por e-mail — novo ticket #M aberto"`.
  4. Atualizar / criar `email_threads` (mesmo `message_id` / endereço) a apontar para o **novo** ticket, para futuras respostas seguirem a nova thread.
  5. Disparar a confirmação automática ao cliente existente, referindo o novo número.

### 3. UI — indicação visual mínima

- `TicketDetail` e `EmailTicketDetail`: se `parent_ticket_id` existe → badge discreto **"Continuação do ticket #N"** com link.
- No ticket antigo: query simples por `parent_ticket_id = id` → badge **"Tem continuação no ticket #M"**.

Sem mudanças em Kanban, filtros, ou outras páginas.

## Fora de âmbito

- Sistema de spam / quarentena / `inbound_email_events`
- Extractores adicionais (n.º encomenda, fatura, telefone) do corpo
- Refactor do `decisionEngine`
- Alterações ao webhook `inbound-email` (não está em uso, IMAP é o fluxo real)
- Alterações ao `pending_emails`

## Validação

1. Resposta a ticket **aberto** → mensagem anexada como hoje.
2. Resposta a ticket **fechado** → novo ticket criado, ligado ao anterior, ambos com evento, confirmação enviada.
3. E-mail sem thread → fluxo atual inalterado (pending ou novo).
4. Segunda resposta do cliente → vai para o **novo** ticket (email_threads atualizado).

## Ficheiros tocados

- `supabase/migrations/<novo>.sql`
- `supabase/functions/fetch-inbound-emails/index.ts`
- `src/pages/TicketDetail.tsx`
- `src/pages/EmailTicketDetail.tsx`
- `src/integrations/supabase/types.ts` (regenerado)

Mudança pequena, retrocompatível, sem risco para os fluxos atuais.