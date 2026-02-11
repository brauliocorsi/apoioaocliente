
-- 1. Create client_users table
CREATE TABLE public.client_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_users_select_own" ON public.client_users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "client_users_update_own" ON public.client_users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "client_users_select_agents" ON public.client_users FOR SELECT USING (public.is_authenticated_agent());
CREATE POLICY "client_users_insert_service" ON public.client_users FOR INSERT WITH CHECK (true);

-- 2. Add client_user_id to tickets
ALTER TABLE public.tickets ADD COLUMN client_user_id uuid REFERENCES public.client_users(id);

-- 3. Clients can see their own tickets
CREATE POLICY "tickets_select_clients" ON public.tickets FOR SELECT USING (client_user_id = auth.uid());

-- 4. Create ticket_messages table
CREATE TABLE public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  sender_type text NOT NULL CHECK (sender_type IN ('client', 'agent')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_messages_select_agents" ON public.ticket_messages FOR SELECT USING (public.is_authenticated_agent());
CREATE POLICY "ticket_messages_insert_agents" ON public.ticket_messages FOR INSERT WITH CHECK (public.is_authenticated_agent());
CREATE POLICY "ticket_messages_select_clients" ON public.ticket_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_messages.ticket_id AND t.client_user_id = auth.uid())
);
CREATE POLICY "ticket_messages_insert_clients" ON public.ticket_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND sender_type = 'client'
  AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_messages.ticket_id AND t.client_user_id = auth.uid())
);

-- 5. Create email_templates table
CREATE TABLE public.email_templates (
  id text PRIMARY KEY,
  subject text NOT NULL,
  body_html text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_templates_select" ON public.email_templates FOR SELECT USING (true);
CREATE POLICY "email_templates_insert" ON public.email_templates FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'supervisor'));
CREATE POLICY "email_templates_update" ON public.email_templates FOR UPDATE USING (public.has_role(auth.uid(), 'supervisor'));
CREATE POLICY "email_templates_delete" ON public.email_templates FOR DELETE USING (public.has_role(auth.uid(), 'supervisor'));

-- 6. Create faq_items table
CREATE TABLE public.faq_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.faq_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "faq_items_select" ON public.faq_items FOR SELECT USING (true);
CREATE POLICY "faq_items_insert" ON public.faq_items FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'supervisor'));
CREATE POLICY "faq_items_update" ON public.faq_items FOR UPDATE USING (public.has_role(auth.uid(), 'supervisor'));
CREATE POLICY "faq_items_delete" ON public.faq_items FOR DELETE USING (public.has_role(auth.uid(), 'supervisor'));

-- 7. Seed default email templates
INSERT INTO public.email_templates (id, subject, body_html, description) VALUES
('welcome', 'Bem-vindo ao Portal de Apoio ao Cliente', '<h2>Olá {nome_cliente},</h2><p>A sua conta foi criada com sucesso.</p><p><strong>Email:</strong> {email}</p><p><strong>Password:</strong> {password}</p><p>Aceda ao portal: <a href="{portal_url}">{portal_url}</a></p><p>Cumprimentos,<br/>Equipa de Apoio</p>', 'Email de boas-vindas com credenciais'),
('ticket_created', 'Ticket #{numero_ticket} criado: {assunto}', '<h2>Olá {nome_cliente},</h2><p>O seu ticket foi criado.</p><p><strong>Nº:</strong> #{numero_ticket}</p><p><strong>Assunto:</strong> {assunto}</p><p><strong>Estado:</strong> {estado}</p><p>Acompanhe em: <a href="{ticket_url}">{ticket_url}</a></p><p>Cumprimentos,<br/>Equipa de Apoio</p>', 'Notificação de ticket criado'),
('status_changed', 'Ticket #{numero_ticket} - Estado: {estado}', '<h2>Olá {nome_cliente},</h2><p>Estado atualizado.</p><p><strong>Nº:</strong> #{numero_ticket}</p><p><strong>Assunto:</strong> {assunto}</p><p><strong>Novo Estado:</strong> {estado}</p><p>Responda em: <a href="{ticket_url}">{ticket_url}</a></p><p>Cumprimentos,<br/>Equipa de Apoio</p>', 'Notificação de mudança de estado');

-- 8. Enable realtime for ticket_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;
