-- Fase 5B.1: Auditoria — não notificar sobre resposta de cliente
-- quando o ticket já está fechado ou resolvido (ruído desnecessário;
-- esses casos já criam ticket de continuação noutro fluxo).
-- Aditivo: apenas substitui a função do trigger, mantém o trigger e estrutura.

CREATE OR REPLACE FUNCTION public.notify_client_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_assigned uuid;
  v_number integer;
  v_subject text;
  v_status text;
  v_is_closed boolean;
  v_is_resolved boolean;
BEGIN
  IF NEW.sender_type <> 'client' THEN RETURN NEW; END IF;

  SELECT t.assigned_to, t.ticket_number, t.subject, t.status,
         COALESCE(s.is_closed, false), COALESCE(s.is_resolved, false)
    INTO v_assigned, v_number, v_subject, v_status, v_is_closed, v_is_resolved
  FROM public.tickets t
  LEFT JOIN public.ticket_statuses s ON s.id = t.status
  WHERE t.id = NEW.ticket_id;

  -- Skip noise: ticket closed/resolved — continuation flow handles this.
  IF v_is_closed OR v_is_resolved THEN
    RETURN NEW;
  END IF;

  IF v_assigned IS NOT NULL THEN
    PERFORM public.create_notification(
      v_assigned, 'ticket_reply_received',
      'Cliente respondeu: #' || v_number,
      COALESCE(v_subject, ''), NEW.ticket_id, NULL, 'high', NULL, 'trigger', '{}'::jsonb
    );
  ELSE
    PERFORM public.notify_supervisors(
      'ticket_customer_waiting',
      'Cliente aguarda resposta: #' || v_number,
      COALESCE(v_subject, ''), NEW.ticket_id, NULL, 'high', '{}'::jsonb
    );
  END IF;

  RETURN NEW;
END;
$$;