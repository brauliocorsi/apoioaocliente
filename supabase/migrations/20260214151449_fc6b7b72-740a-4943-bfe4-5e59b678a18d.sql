
CREATE OR REPLACE FUNCTION public.notify_agent_on_client_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

CREATE TRIGGER on_client_message_notify
AFTER INSERT ON public.ticket_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_agent_on_client_message();
