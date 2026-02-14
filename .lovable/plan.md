

# Indicador de Ligacoes Vinculadas e Notificacoes de Mensagens do Cliente

## Resumo

Duas melhorias: (1) mostrar um indicador visual com o numero de ligacoes telefonicas vinculadas a cada ticket (na lista, Kanban e detalhe), e (2) criar notificacoes automaticas para agentes quando um cliente envia uma nova mensagem pelo portal.

---

## 1. Indicador visual de ligacoes vinculadas no ticket

### Onde aparece
- **Lista de tickets** (`Tickets.tsx`): icone de telefone com badge numerico ao lado do status
- **Kanban de tickets** (`KanbanBoard.tsx`): icone de telefone pequeno no card com contador
- **Detalhe do ticket** (`TicketSidebar.tsx`): nova seccao "Ligacoes" na sidebar com contagem e link para cada ligacao

### Implementacao

**Busca de dados**: Ao carregar os tickets, fazer uma query adicional para contar ligacoes por ticket:

```text
SELECT ticket_id, COUNT(*) as call_count
FROM phone_calls
WHERE ticket_id IN (lista de ticket ids)
GROUP BY ticket_id
```

- Na pagina `Tickets.tsx`: buscar contagens e passar como prop `callCounts: Record<string, number>` ao `KanbanBoard` e usar na lista
- No `KanbanBoard.tsx`: receber `callCounts` e mostrar icone `Phone` com numero no card quando > 0
- No `TicketSidebar.tsx`: buscar ligacoes vinculadas ao ticket e mostrar seccao com contagem e lista resumida

### Visual
- Icone `Phone` do lucide-react com um badge numerico pequeno (ex: telefone + "2")
- Cor neutra (muted) para nao competir com prioridade/SLA
- No detalhe, cards clicaveis que navegam para a ligacao

---

## 2. Notificacoes para agentes quando cliente responde no chat

### Comportamento
Quando um cliente envia uma mensagem pelo portal (`PortalTicketDetail.tsx`), o sistema cria automaticamente uma notificacao para o agente atribuido ao ticket.

### Implementacao

**Opcao escolhida**: Trigger no banco de dados -- e a forma mais robusta pois funciona independentemente de onde a mensagem e inserida.

Criar uma funcao e trigger no banco de dados:

```text
Quando INSERT em ticket_messages WHERE sender_type = 'client':
  1. Buscar o ticket (assigned_to)
  2. Se assigned_to existe e e diferente do sender_id:
     - INSERT em agent_notifications com:
       - recipient_id = assigned_to
       - sender_id = NEW.sender_id
       - ticket_id = NEW.ticket_id
       - type = 'client_message'
       - content = 'enviou uma nova mensagem no ticket #X'
```

### Porque um trigger
- Funciona automaticamente sem alterar codigo do portal
- Funciona mesmo que mensagens venham de outras fontes (email, API)
- O `NotificationBell.tsx` ja tem realtime configurado e vai mostrar a notificacao instantaneamente

---

## Ficheiros a modificar

| Ficheiro | Alteracao |
|---|---|
| `src/pages/Tickets.tsx` | Buscar contagem de ligacoes por ticket; mostrar icone Phone na lista; passar callCounts ao KanbanBoard |
| `src/components/KanbanBoard.tsx` | Receber prop callCounts; mostrar icone Phone no TicketCard quando > 0 |
| `src/components/ticket/TicketSidebar.tsx` | Nova seccao "Ligacoes" com contagem e lista de ligacoes vinculadas |
| Nova migracao SQL | Criar funcao e trigger `notify_agent_on_client_message` na tabela `ticket_messages` |

---

## Detalhes tecnicos

### Query de contagem de ligacoes (em Tickets.tsx)
```text
const { data: callData } = await supabase
  .from("phone_calls")
  .select("ticket_id")
  .not("ticket_id", "is", null);

// Agrupar no frontend por ticket_id para criar Record<string, number>
```

### Trigger SQL para notificacoes de mensagem do cliente
```text
CREATE FUNCTION notify_agent_on_client_message()
RETURNS trigger AS $$
DECLARE
  v_assigned uuid;
  v_ticket_number integer;
BEGIN
  IF NEW.sender_type = 'client' THEN
    SELECT assigned_to, ticket_number
    INTO v_assigned, v_ticket_number
    FROM tickets WHERE id = NEW.ticket_id;

    IF v_assigned IS NOT NULL AND v_assigned != NEW.sender_id THEN
      INSERT INTO agent_notifications (recipient_id, sender_id, ticket_id, type, content)
      VALUES (
        v_assigned,
        NEW.sender_id,
        NEW.ticket_id,
        'client_message',
        'enviou uma nova mensagem no ticket #' || v_ticket_number
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_client_message_notify
AFTER INSERT ON ticket_messages
FOR EACH ROW
EXECUTE FUNCTION notify_agent_on_client_message();
```

### Nenhuma alteracao na tabela de notificacoes
A tabela `agent_notifications` ja suporta os campos necessarios (recipient_id, sender_id, ticket_id, type, content). O `NotificationBell.tsx` ja tem realtime e vai captar as novas notificacoes automaticamente.

