
# Fase 1: Portal do Cliente com Login e Acompanhamento de Tickets

## Resumo
Criar um portal separado em `/portal/*` onde clientes podem fazer login, ver os seus tickets, enviar mensagens e acompanhar o progresso. Inclui registo de clientes, envio de credenciais por email via Resend, e notificacoes de mudanca de estado.

---

## 1. Base de Dados -- Novas Tabelas e Alteracoes

### 1.1 Tabela `client_users`
Perfis de clientes separados dos agentes. Liga ao `auth.users` para autenticacao.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid (PK, FK auth.users) | ID do utilizador |
| email | text NOT NULL | Email do cliente |
| full_name | text NOT NULL | Nome do cliente |
| phone | text | Telefone |
| created_at | timestamptz | Data de criacao |

RLS: Clientes so veem o seu proprio perfil.

### 1.2 Tabela `client_roles`
Para distinguir clientes de agentes no sistema de roles.

Alternativamente, expandir o ENUM `app_role` com valor `client`.

### 1.3 Tabela `ticket_messages`
Mensagens bidirecionais entre cliente e agente (separadas das notas internas que ficam em `ticket_events`).

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid (PK) | |
| ticket_id | uuid (FK tickets) | |
| sender_id | uuid (FK auth.users) | |
| sender_type | text ('client' / 'agent') | |
| content | text | Corpo da mensagem |
| created_at | timestamptz | |

RLS: Clientes so veem mensagens dos seus tickets. Agentes veem tudo.

### 1.4 Tabela `email_templates`
Templates editaveis para cada tipo de email.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | text (PK) | Ex: 'ticket_created', 'status_changed' |
| subject | text | Assunto do email (com variaveis) |
| body_html | text | Corpo HTML (com variaveis) |
| description | text | Descricao para o supervisor |
| updated_at | timestamptz | |

RLS: Supervisores podem editar, todos podem ler.

### 1.5 Tabela `faq_items`
Perguntas frequentes visiveis no portal do cliente.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid (PK) | |
| question | text | Pergunta |
| answer | text | Resposta (HTML/Markdown) |
| sort_order | integer | Ordem |
| is_active | boolean | Visivel ou nao |
| created_at | timestamptz | |

RLS: Leitura publica (sem autenticacao necessaria).

### 1.6 Coluna `client_user_id` na tabela `tickets`
Nova coluna `client_user_id uuid` (FK client_users) para ligar tickets a contas de clientes. Atualizar RLS para que clientes vejam apenas os seus tickets.

---

## 2. Edge Functions

### 2.1 `create-client-account`
- Recebe: email, nome, ticket_id (opcional)
- Cria conta no auth.users com password gerada
- Insere em `client_users`
- Insere role `client` em `user_roles`
- Envia email via Resend com credenciais

### 2.2 `send-ticket-email`
- Recebe: ticket_id, template_id (ex: 'ticket_created', 'status_changed')
- Busca o template de `email_templates`
- Substitui variaveis ({nome_cliente}, {numero_ticket}, {estado}, etc.)
- Envia via Resend ao email do cliente
- Chamada automaticamente quando o estado muda (trigger ou chamada no frontend)

### 2.3 `portal-send-message`
- Permite ao cliente enviar mensagem num ticket
- Valida que o ticket pertence ao cliente autenticado
- Insere em `ticket_messages`

---

## 3. Frontend -- Paginas do Portal

### 3.1 Rotas (`/portal/*`)
- `/portal/login` -- Login do cliente
- `/portal/register` -- Registo de novo cliente
- `/portal/tickets` -- Lista de tickets do cliente
- `/portal/tickets/:id` -- Detalhe do ticket com chat
- `/portal/faq` -- Perguntas frequentes

### 3.2 Layout do Portal (`PortalLayout.tsx`)
Layout simples e limpo, sem sidebar de agente. Header com logo UP Moveis, nome do cliente, botao de logout.

### 3.3 Pagina de Login/Registo do Cliente
- Login com email + password
- Registo com nome, email, telefone, password
- Redireciona para `/portal/tickets`

### 3.4 Lista de Tickets do Cliente
- Cards com: numero do ticket, assunto, estado (com cor), data de criacao
- Botao "Abrir Novo Ticket"
- Sem detalhes internos (sem SLA, prioridade, tags, categorias)

### 3.5 Detalhe do Ticket (Vista do Cliente)
- Assunto, estado atual (com indicador visual de progresso)
- Timeline de mensagens (chat entre cliente e agente)
- Campo para enviar nova mensagem
- Sem: notas internas, tags, SLA, categorias, atribuicao

### 3.6 Pagina de FAQs
- Accordion com perguntas e respostas
- Geridas pelos supervisores nas definicoes

### 3.7 Formulario "Novo Ticket" (Portal)
- Campos simplificados: assunto, descricao, produto (opcional), anexos
- Nome e email preenchidos automaticamente do perfil

---

## 4. Integracao no Lado do Agente

### 4.1 Timeline do Ticket (TicketDetail)
- Distinguir visualmente mensagens do cliente vs notas internas
- Mensagens do cliente aparecem com estilo diferente (ex: balao azul)
- Notas internas continuam no formato atual

### 4.2 Resposta ao Cliente
- Novo botao "Responder ao Cliente" que insere em `ticket_messages` (visivel para o cliente)
- O campo de notas existente continua para notas internas

### 4.3 Notificacao de Mudanca de Estado
- Ao mudar estado no `updateStatus`, chamar `send-ticket-email` com template correspondente

---

## 5. Gestao de Templates de Email (Settings)

### 5.1 Nova tab "Templates de Email" nas definicoes
- Lista de templates existentes
- Editor com preview das variaveis disponiveis
- Templates pre-carregados: ticket_created, status_changed, welcome

---

## 6. Integracao Resend

- Precisa de API key do Resend configurada como secret
- Usada nas edge functions para envio de emails

---

## Secao Tecnica -- Sequencia de Implementacao

1. Adicionar valor `client` ao ENUM `app_role`
2. Criar tabelas: `client_users`, `ticket_messages`, `email_templates`, `faq_items`
3. Adicionar coluna `client_user_id` a tabela `tickets`
4. Criar RLS policies com funcao `has_role` para role `client`
5. Configurar API key do Resend como secret
6. Criar edge functions: `create-client-account`, `send-ticket-email`
7. Criar `PortalLayout.tsx` e hook `useClientAuth` (separado do `useAuth` dos agentes, mas mesmo Supabase auth)
8. Criar paginas do portal: login, registo, lista de tickets, detalhe, FAQ, novo ticket
9. Atualizar `TicketDetail.tsx` para mostrar mensagens do cliente e botao de resposta
10. Criar pagina de gestao de templates nas definicoes
11. Integrar envio de email na mudanca de estado

### Decisoes Tecnicas
- Clientes e agentes partilham o mesmo `auth.users` mas sao diferenciados pelo role (`client` vs `agent`/`supervisor`)
- O `useAuth` existente precisa ser adaptado para redirecionar clientes para `/portal` e agentes para `/`
- RLS nos tickets atualizada: clientes veem apenas tickets onde `client_user_id = auth.uid()`
- `ticket_messages` e separada de `ticket_events` para que notas internas nunca sejam visiveis ao cliente
