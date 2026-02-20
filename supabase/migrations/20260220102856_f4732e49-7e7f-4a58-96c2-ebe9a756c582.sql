
CREATE TABLE public.decision_rules (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  condition_type text NOT NULL,
  condition_value text,
  condition_extra jsonb DEFAULT '{}',
  suggested_tag_ids text[] DEFAULT '{}',
  suggested_clause_ids text[] DEFAULT '{}',
  suggested_macro_id text,
  message text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE public.decision_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rules_select" ON public.decision_rules FOR SELECT USING (true);
CREATE POLICY "rules_insert" ON public.decision_rules FOR INSERT WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role));
CREATE POLICY "rules_update" ON public.decision_rules FOR UPDATE USING (has_role(auth.uid(), 'supervisor'::app_role));
CREATE POLICY "rules_delete" ON public.decision_rules FOR DELETE USING (has_role(auth.uid(), 'supervisor'::app_role));
