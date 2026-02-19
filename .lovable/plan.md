
# Plano: Badge de mensagens nao lidas + Kanban como vista predefinida

## Resumo
Adicionar um badge visual nos tickets (lista e kanban) que mostra a quantidade de mensagens de clientes por responder. O badge desaparece quando o agente abre o ticket. Alem disso, a vista Kanban passa a ser a predefinida ao abrir a pagina de tickets.

## 1. Tabela de controlo de leitura

Criar uma nova tabela `ticket_read_status` para registar quando cada agente leu pela ultima vez as mensagens de um ticket:

| Coluna | Tipo | Descricao |
|---|---|---|
| ticket_id | uuid | Referencia ao ticket |
| agent_id | uuid | ID do agente |
| last_read_at | timestamptz | Ultima vez que o agente abriu o ticket |

- Chave primaria composta: (ticket_id, agent_id)
- Politicas RLS: agentes podem ler e fazer upsert nos seus proprios registos

## 2. Marcar como lido ao abrir o ticket

No `TicketDetail.tsx`, ao carregar o ticket, fazer um upsert na tabela `ticket_read_status` com o timestamp atual. Isto faz o badge desaparecer na proxima vez que a lista/kanban carregam.

## 3. Contar mensagens nao lidas

No `Tickets.tsx`, apos carregar os tickets, buscar:
- A contagem de mensagens de clientes (`sender_type = 'client'`) por ticket
- O `last_read_at` do agente atual para cada ticket

Calcular: mensagens de clientes criadas apos `last_read_at` (ou todas, se nunca lido) = contagem do badge.

## 4. Badge visual na lista e no kanban

- **Lista**: Adicionar um badge vermelho com o numero de mensagens nao lidas ao lado do ticket
- **Kanban**: Adicionar o mesmo badge no cartao do ticket (`TicketCard`)
- O badge so aparece quando ha mensagens de clientes por responder (contagem > 0)

## 5. Vista predefinida: Kanban

Alterar o estado inicial de `view` em `Tickets.tsx` de `"list"` para `"kanban"`.

## 6. Notificacoes inteligentes (ja implementado parcialmente)

O trigger `notify_agent_on_client_message` ja notifica o agente atribuido. Nao sao necessarias alteracoes - o comportamento atual ja verifica `assigned_to` e so notifica esse agente.

---

## Detalhes Tecnicos

### Migracao SQL

```text
CREATE TABLE ticket_read_status (
  ticket_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, agent_id)
);

ALTER TABLE ticket_read_status ENABLE ROW LEVEL SECURITY;

-- Agentes podem ver os seus proprios registos
CREATE POLICY "read_status_select" ON ticket_read_status
  FOR SELECT USING (is_authenticated_agent() AND agent_id = auth.uid());

-- Agentes podem inserir/atualizar os seus proprios registos
CREATE POLICY "read_status_upsert" ON ticket_read_status
  FOR INSERT WITH CHECK (is_authenticated_agent() AND agent_id = auth.uid());

CREATE POLICY "read_status_update" ON ticket_read_status
  FOR UPDATE USING (is_authenticated_agent() AND agent_id = auth.uid());
```

### Ficheiros a alterar

| Ficheiro | Alteracao |
|---|---|
| Migracao SQL | Criar tabela `ticket_read_status` |
| `src/pages/Tickets.tsx` | Buscar contagem de mensagens nao lidas; passar ao KanbanBoard e lista; mudar vista predefinida para "kanban" |
| `src/pages/TicketDetail.tsx` | Upsert em `ticket_read_status` ao abrir ticket |
| `src/components/KanbanBoard.tsx` | Aceitar e exibir badge de mensagens nao lidas no cartao |
