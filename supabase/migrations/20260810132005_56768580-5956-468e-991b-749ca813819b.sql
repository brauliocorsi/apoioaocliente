CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_client boolean;
BEGIN
  v_is_client := COALESCE(NEW.raw_user_meta_data->>'account_type', '') = 'client';

  IF v_is_client THEN
    INSERT INTO public.client_users (id, email, full_name, phone)
    VALUES (NEW.id, COALESCE(NEW.email, ''),
            COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
            NULLIF(NEW.raw_user_meta_data->>'phone', ''))
    ON CONFLICT (id) DO NOTHING;

    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client');
    END IF;

    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, COALESCE(NEW.email, ''), COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'agent');
  END IF;

  RETURN NEW;
END;
$function$;