
-- Add RLS policies for sla_config so supervisors can manage SLA configuration
CREATE POLICY "sla_config_insert" ON public.sla_config
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "sla_config_update" ON public.sla_config
  FOR UPDATE USING (has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "sla_config_delete" ON public.sla_config
  FOR DELETE USING (has_role(auth.uid(), 'supervisor'::app_role));
