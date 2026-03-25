ALTER TABLE public.post_delivery_confirmations 
  ADD COLUMN call_status text DEFAULT NULL,
  ADD COLUMN assembly_status text DEFAULT NULL;