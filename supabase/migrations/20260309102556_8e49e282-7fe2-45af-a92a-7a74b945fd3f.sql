
-- Table for blocked senders/domains
CREATE TABLE public.email_blocked_senders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL,
  pattern_type text NOT NULL DEFAULT 'email' CHECK (pattern_type IN ('email', 'domain', 'keyword_subject')),
  reason text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_blocked_senders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocked_senders_select" ON public.email_blocked_senders FOR SELECT TO authenticated USING (is_authenticated_agent());
CREATE POLICY "blocked_senders_insert" ON public.email_blocked_senders FOR INSERT TO authenticated WITH CHECK (is_authenticated_agent());
CREATE POLICY "blocked_senders_delete" ON public.email_blocked_senders FOR DELETE TO authenticated USING (is_authenticated_agent());

-- Table for pending emails (review queue)
CREATE TABLE public.pending_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_address text NOT NULL,
  from_name text,
  subject text NOT NULL,
  body_text text,
  body_html text,
  message_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'blocked')),
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  ticket_id uuid REFERENCES public.tickets(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  attachments_meta jsonb DEFAULT '[]'::jsonb
);

ALTER TABLE public.pending_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pending_emails_select" ON public.pending_emails FOR SELECT TO authenticated USING (is_authenticated_agent());
CREATE POLICY "pending_emails_insert" ON public.pending_emails FOR INSERT TO authenticated WITH CHECK (is_authenticated_agent());
CREATE POLICY "pending_emails_update" ON public.pending_emails FOR UPDATE TO authenticated USING (is_authenticated_agent());
CREATE POLICY "pending_emails_delete" ON public.pending_emails FOR DELETE TO authenticated USING (is_authenticated_agent());
