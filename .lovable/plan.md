# Confirmação real de entrega dos e-mails do ticket

## Situação atual

Ao responder por e-mail num ticket, o sistema grava um registo em `email_logs` com `delivery_status`.
Mas hoje esse estado só diz que o **provedor aceitou** o pedido de envio (resposta OK da API Resend
ou do servidor SMTP). Se o e-mail devolver mais tarde (caixa inexistente, cheia, marcado como spam),
nada atualiza o registo — o ticket continua a mostrar "Entregue".

Ou seja: sabemos se o envio *partiu*, não sabemos se *chegou*.

## O que vai ser feito

### 1. Guardar o identificador do envio
Cada e-mail enviado passa a guardar o ID que o Resend devolve. É esse ID que permite ligar
os eventos posteriores (entregue, devolvido, reclamação) ao e-mail certo do ticket.

### 2. Receber os eventos de entrega do Resend (webhook)
Nova função pública que recebe as notificações do Resend e atualiza o registo do e-mail:

- `email.sent` → Enviado
- `email.delivered` → Entregue (confirmado pelo servidor do destinatário)
- `email.bounced` → Devolvido (com o motivo)
- `email.complained` → Marcado como spam
- `email.delivery_delayed` → Atraso na entrega

O URL do webhook é registado no painel do Resend (indico o endereço exato depois de criado).

### 3. Mostrar o estado dentro do ticket
- Cada resposta enviada na timeline do ticket ganha um selo de estado:
  *A enviar · Enviado · Entregue · Devolvido · Falhou*, com o motivo em tooltip nos casos de erro.
- Aviso destacado no topo do ticket quando existe um e-mail devolvido ou falhado, com botão
  para reenviar imediatamente.

### 4. Painel de e-mails (Definições → Logs de E-mail)
- Filtro "Problemas" passa a incluir devolvidos e reclamações confirmados pelo webhook.
- Coluna de estado mostra a hora do último evento (ex.: entregue às 14:32).

### 5. Fallback para envios por SMTP
Quando o envio é por SMTP (não Resend), não existe confirmação de entrega. Nesse caso o estado
mostra "Aceite pelo servidor" e explica na tooltip que não há confirmação de entrega disponível —
sem fingir que foi entregue.

## Detalhes técnicos

- Migração em `email_logs`: colunas `provider`, `provider_message_id` (indexada),
  `last_event_at`, `events` (jsonb com histórico). Sem alteração de RLS existente.
- `reply-email-ticket`, `send-ticket-email`, `send-ticket-created-confirmation`,
  `send-client-notification`: gravar `provider_message_id` retornado pela API Resend e
  `provider = 'resend' | 'smtp'`; estado inicial `sent` (em vez de `delivered`) no caso Resend.
- Nova Edge Function `resend-webhook` (`verify_jwt = false`), valida a assinatura Svix
  com o segredo do webhook, faz update por `provider_message_id` e acrescenta o evento a `events`.
- É necessário um segredo novo: `RESEND_WEBHOOK_SECRET` (fornecido pelo painel do Resend ao
  criar o webhook) — peço-o na altura da implementação.
- UI: `src/components/ticket/TicketTimeline.tsx` (selo por mensagem, cruzando `email_logs` por
  `ticket_id` + proximidade temporal), `src/pages/TicketDetail.tsx` (banner de falha + reenviar),
  `src/components/settings/EmailLogsTab.tsx` (novos estados e hora do evento).
- Realtime na tabela `email_logs` para o selo atualizar sozinho quando o evento chega.
