

## Tickets por Email -- Nova Area de Gestao

### Conceito

Criar uma nova secao **"Email Tickets"** no menu lateral, separada dos tickets existentes. Esta area funciona como um sistema de helpdesk por email:

1. **Polling IMAP** busca emails novos periodicamente
2. Se ja existe um ticket aberto com o mesmo email do remetente, a mensagem e adicionada como resposta nesse ticket
3. Se nao existe, cria um novo ticket automaticamente
4. Respostas do agente dentro do ticket sao enviadas como email via SMTP ao cliente

### Plano de Implementacao

#### 1. Base de Dados

- Adicionar campos a `system_settings` para configuracao IMAP (`imap_host`, `imap_port`, `imap_user`, `imap_pass`, `imap_folder`, `imap_enabled`)
- Criar tabela `email_threads` para mapear email do remetente ao ticket:

```text
email_threads
├── id (uuid, PK)
├── ticket_id (uuid, FK tickets)
├── email_address (text, indexed)
├── last_message_id (text) -- Message-ID do ultimo email processado
├── created_at (timestamptz)
```

- RLS: leitura/escrita para agentes autenticados

#### 2. Edge Function `fetch-inbound-emails`

- Le config IMAP de `system_settings` (service role)
- Liga ao servidor via `Deno.connectTls()` com comandos IMAP raw (LOGIN, SELECT INBOX, SEARCH UNSEEN, FETCH, STORE +FLAGS \Seen)
- Para cada email nao lido:
  - Extrai From (email), Subject, Body
  - Procura em `email_threads` se ja existe ticket aberto para esse email
  - **Se existe**: insere `ticket_messages` como mensagem do cliente nesse ticket
  - **Se nao existe**: cria novo ticket (status `novo`, prioridade `P2`) e regista em `email_threads`
  - Regista em `email_logs` com `source: 'inbound'`
- Config em `config.toml`: `verify_jwt = false`

#### 3. Edge Function `reply-email-ticket`

- Recebe `ticket_id` e `content` (texto da resposta do agente)
- Busca email do cliente via `email_threads` ou `tickets.client_email`
- Envia email via SMTP (reutiliza logica do `send-ticket-email`)
- Insere `ticket_messages` como mensagem do agente
- Regista em `email_logs`

#### 4. Agendar com pg_cron

- Cron job a cada 5 minutos chamando `fetch-inbound-emails` via `pg_net`

#### 5. UI -- Nova Pagina `EmailTickets`

- Nova rota `/email-tickets` no `App.tsx`
- Novo item no menu lateral (icone `Mail`)
- Pagina com lista de tickets originados por email (filtro por `email_threads`)
- Vista de detalhe integrada ou reutilizando `/tickets/:id` com indicador visual "via Email"
- Caixa de resposta que ao submeter chama `reply-email-ticket` (envia email) em vez de apenas guardar mensagem

#### 6. UI -- Configuracao IMAP no painel SMTP

- Nova secao em `SmtpSettingsTab.tsx` com campos IMAP (host, porta, user, pass, pasta)
- Toggle ativar/desativar recepcao
- Botao "Testar Conexao IMAP"

### Fluxo Resumido

```text
Email recebido
    │
    ▼
[fetch-inbound-emails] (cada 5 min)
    │
    ├── Email ja conhecido? ──► Adiciona mensagem ao ticket existente
    │
    └── Email novo? ──► Cria ticket + regista em email_threads
                              │
                              ▼
                    Agente ve na lista "Email Tickets"
                              │
                              ▼
                    Agente responde ──► [reply-email-ticket] ──► Email SMTP enviado ao cliente
```

### Notas Tecnicas

- IMAP raw em Deno e verboso mas viavel -- implementar parser minimo para os comandos essenciais
- O flag `\Seen` no IMAP previne reprocessamento de emails
- A tabela `email_threads` permite agrupar conversas por email do remetente
- Respostas do agente incluem `[Ticket #XXX]` no assunto para facilitar threading nos clientes de email

