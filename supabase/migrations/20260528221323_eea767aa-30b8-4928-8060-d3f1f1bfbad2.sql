
-- 1) Gerar segredo de dispatch (idempotente)
INSERT INTO public.system_settings (key, value)
VALUES ('client_notification_dispatch_secret', gen_random_uuid()::text)
ON CONFLICT (key) DO NOTHING;

-- 2) Atualizar dispatcher para incluir o segredo no header
CREATE OR REPLACE FUNCTION public.dispatch_client_notification_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_url text;
  v_secret text;
  v_email text;
BEGIN
  v_email := COALESCE(NEW.metadata->>'client_email', '');
  IF v_email = '' OR v_email IS NULL THEN
    IF NEW.client_user_id IS NOT NULL THEN
      SELECT email INTO v_email FROM public.client_users WHERE id = NEW.client_user_id;
    END IF;
  END IF;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN NEW;
  END IF;

  IF v_email ~* '^(noreply|no-reply|mailer-daemon|postmaster|donotreply)@' THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_secret FROM public.system_settings
    WHERE key = 'client_notification_dispatch_secret';

  v_url := 'https://ijxxjtiqitlyazwdqgwv.supabase.co/functions/v1/send-client-notification';

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatch-secret', COALESCE(v_secret, '')
    ),
    body := jsonb_build_object('notification_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $function$;

-- 3) Restringir colunas que o cliente do portal pode alterar
CREATE OR REPLACE FUNCTION public.restrict_client_notification_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_agent boolean := public.is_authenticated_agent();
BEGIN
  -- Agentes/supervisores e service-role podem alterar tudo.
  IF v_is_agent OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Cliente: só pode mexer em is_read e read_at da própria notificação.
  IF NEW.client_user_id IS DISTINCT FROM OLD.client_user_id
     OR NEW.ticket_id        IS DISTINCT FROM OLD.ticket_id
     OR NEW.type              IS DISTINCT FROM OLD.type
     OR NEW.title             IS DISTINCT FROM OLD.title
     OR NEW.message           IS DISTINCT FROM OLD.message
     OR NEW.email_sent        IS DISTINCT FROM OLD.email_sent
     OR NEW.email_sent_at     IS DISTINCT FROM OLD.email_sent_at
     OR NEW.email_error       IS DISTINCT FROM OLD.email_error
     OR NEW.metadata          IS DISTINCT FROM OLD.metadata
     OR NEW.created_at        IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Clientes só podem marcar notificações como lidas.';
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_restrict_client_notification_updates ON public.client_notifications;
CREATE TRIGGER trg_restrict_client_notification_updates
BEFORE UPDATE ON public.client_notifications
FOR EACH ROW EXECUTE FUNCTION public.restrict_client_notification_updates();
