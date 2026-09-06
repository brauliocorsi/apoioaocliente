
REVOKE EXECUTE ON FUNCTION public.wms_upsert_assistance(text, uuid, text, jsonb, uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.wms_upsert_assistance(text, uuid, text, jsonb, uuid) TO service_role;
