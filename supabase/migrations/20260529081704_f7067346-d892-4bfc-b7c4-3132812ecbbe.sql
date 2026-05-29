
-- 1) Gerar segredo aleatório para o cron do letscall-sync-cdr (se ainda não existir)
INSERT INTO public.system_settings (key, value)
SELECT 'letscall_sync_cron_secret', encode(extensions.gen_random_bytes(32), 'hex')
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'letscall_sync_cron_secret');

-- 2) Reagendar o cron job para enviar o header x-cron-secret
DO $$
DECLARE
  v_secret text;
BEGIN
  SELECT value INTO v_secret FROM public.system_settings WHERE key = 'letscall_sync_cron_secret';

  PERFORM cron.unschedule('letscall-sync-cdr-every-5min');

  PERFORM cron.schedule(
    'letscall-sync-cdr-every-5min',
    '*/5 * * * *',
    format($job$
      SELECT net.http_post(
        url := 'https://ijxxjtiqitlyazwdqgwv.supabase.co/functions/v1/letscall-sync-cdr',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqeHhqdGlxaXRseWF6d2RxZ3d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MjAyMzQsImV4cCI6MjA4NjM5NjIzNH0.n8zXOoXOKd9YNMwLn42CfofGRMGfQTqOJnUOQl8JIGM',
          'x-cron-secret', %L
        ),
        body := jsonb_build_object('source','cron')
      ) AS request_id;
    $job$, v_secret)
  );
END $$;
