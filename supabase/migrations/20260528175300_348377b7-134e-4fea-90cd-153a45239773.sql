REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, uuid, uuid, text, timestamptz, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_supervisors(text, text, text, uuid, uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_ticket_assignment() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_client_message() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_inbound_event_status() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_internal_mentions() FROM PUBLIC, anon;