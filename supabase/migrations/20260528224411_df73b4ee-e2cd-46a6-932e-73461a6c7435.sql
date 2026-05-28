-- Fase 6.1 — Auditoria: correções aditivas

-- Bug: tg_ticket_messages_sla_marks reactivava SLA em tickets resolvidos/fechados
-- quando um agente respondia. Agora respeita o estado terminal do ticket.
CREATE OR REPLACE FUNCTION public.tg_ticket_messages_sla_marks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_resolved boolean := false;
  v_is_closed boolean := false;
BEGIN
  IF NEW.sender_type = 'agent' THEN
    SELECT COALESCE(s.is_resolved,false), COALESCE(s.is_closed,false)
      INTO v_is_resolved, v_is_closed
      FROM public.tickets t
      LEFT JOIN public.ticket_statuses s ON s.id = t.status
     WHERE t.id = NEW.ticket_id;

    IF v_is_resolved OR v_is_closed THEN
      -- Apenas regista primeira resposta histórica, sem mexer em SLA/atualização.
      UPDATE public.tickets
         SET first_responded_at = COALESCE(first_responded_at, NEW.created_at)
       WHERE id = NEW.ticket_id;
    ELSE
      UPDATE public.tickets
         SET first_responded_at = COALESCE(first_responded_at, NEW.created_at),
             next_customer_update_due_at = NEW.created_at + interval '48 hours',
             sla_status = CASE WHEN sla_paused THEN 'paused' ELSE 'on_track' END
       WHERE id = NEW.ticket_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;