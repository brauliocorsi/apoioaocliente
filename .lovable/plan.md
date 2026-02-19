
# Correcção: Eventos, SLA e Timeline para tickets criados pelo portal

## Problema Raiz

Existem 3 problemas distintos mas relacionados:

**1. Sem eventos na timeline**
O `PortalNewTicket.tsx` NÃO insere eventos `ticket_events` ao criar um ticket.
A RLS de `ticket_events_insert` só permite agentes (`is_authenticated_agent()`), por isso um cliente nunca consegue inserir directamente.
Resultado: tickets criados pelo portal ficam sem histórico.

**2. Sem SLA**
O portal não passa `category_id` nem calcula `sla_first_response_at` / `sla_resolution_at`.
Resultado: ticket 8 tem `sla_first_response_at = NULL`.

**3. Notas internas da timeline do agente**
A timeline interna do `TicketDetail.tsx` também usa `ticket_events`. Como o ticket 8 não tem eventos, aparece vazio.

## Solução: Triggers automáticos na base de dados

Em vez de depender do frontend para inserir eventos (frágil e inconsistente), vamos criar triggers `SECURITY DEFINER` que disparam automaticamente:

### Trigger 1 — Auto evento "created" ao inserir ticket
Quando qualquer ticket é inserido (por agente OU por cliente), regista automaticamente um evento `created` em `ticket_events`. Isto resolve a timeline para sempre.

### Trigger 2 — Auto evento "status_change" ao mudar status
Quando o campo `status` de um ticket é alterado, regista automaticamente o evento `status_change`. Actualmente isto é feito manualmente no `TicketDetail.tsx` mas pode falhar em actualizações indirectas.

### Trigger 3 — Auto cálculo SLA ao inserir/actualizar ticket
Quando um ticket é inserido e tem `category_id` e `priority`, ou quando a `category_id` é actualizada depois, calcula automaticamente `sla_first_response_at` e `sla_resolution_at` a partir da tabela `sla_config`. Isto resolve o SLA do ticket 8 (quando o agente atribuir uma categoria) e de todos os futuros tickets do portal.

### Correcção retroactiva para ticket 8
A migração também insere os eventos em falta no ticket 8 que já existe (evento `created` e evento `status_change` para `em_analise`).

## Ficheiros a alterar

| Ficheiro | Alteração |
|---|---|
| Migração SQL nova | Criar os 3 triggers + corrigir ticket 8 retroactivamente |

## Porquê triggers em vez de código no frontend?

- Funcionam independentemente de quem cria o ticket (agente, cliente, API)
- Não dependem de permissões RLS para o utilizador que cria
- Garantem consistência em 100% dos casos
- A RLS de `ticket_events_select_clients` já filtra o que o cliente vê (exclui `note`, `approval_*`)

## Detalhes técnicos

```text
-- Trigger 1: Auto-criar evento "created"
CREATE OR REPLACE FUNCTION auto_create_ticket_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO ticket_events (ticket_id, event_type, content, metadata)
  VALUES (NEW.id, 'created', 'Ticket criado', '{}');
  RETURN NEW;
END;
$$;

-- Trigger 2: Auto-criar evento "status_change"
CREATE OR REPLACE FUNCTION auto_status_change_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO ticket_events (ticket_id, event_type, content, metadata)
    VALUES (
      NEW.id,
      'status_change',
      'Estado alterado: ' || OLD.status || ' → ' || NEW.status,
      jsonb_build_object('from', OLD.status, 'to', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger 3: Auto-calcular SLA
CREATE OR REPLACE FUNCTION auto_calculate_sla()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_sla record;
BEGIN
  IF NEW.category_id IS NOT NULL AND (
    OLD IS NULL OR OLD.category_id IS DISTINCT FROM NEW.category_id OR OLD.priority IS DISTINCT FROM NEW.priority
  ) THEN
    SELECT first_response_minutes, resolution_minutes
    INTO v_sla
    FROM sla_config
    WHERE category_id = NEW.category_id AND priority = NEW.priority::ticket_priority
    LIMIT 1;
    IF FOUND THEN
      NEW.sla_first_response_at := NEW.created_at + (v_sla.first_response_minutes * interval '1 minute');
      NEW.sla_resolution_at     := NEW.created_at + (v_sla.resolution_minutes     * interval '1 minute');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
```

Depois, correcção retroactiva para o ticket 8:
- Inserir evento `created` com a data de criação do ticket
- Inserir evento `status_change` (novo → em_analise) com a data de `updated_at`
