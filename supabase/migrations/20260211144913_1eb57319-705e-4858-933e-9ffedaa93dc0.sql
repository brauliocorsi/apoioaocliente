
-- =============================================
-- UP Móveis Support System - Complete Schema
-- =============================================

-- 1. ENUMS
CREATE TYPE public.app_role AS ENUM ('agent', 'supervisor');
CREATE TYPE public.ticket_status AS ENUM ('novo', 'em_analise', 'aguarda_cliente', 'aguarda_logistica', 'aguarda_tecnico', 'resolvido', 'encerrado');
CREATE TYPE public.ticket_priority AS ENUM ('P1', 'P2', 'P3');
CREATE TYPE public.tag_group AS ENUM ('prazo', 'produto', 'entrega', 'pagamentos', 'reclamacao', 'gestao_interna');
CREATE TYPE public.macro_category AS ENUM ('entrega', 'reclamacao', 'garantia', 'devolucao', 'pagamento', 'exposicao', 'geral');

-- 2. PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. USER ROLES (separate table for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'agent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. HELPER FUNCTIONS (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_authenticated_agent()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
  )
$$;

-- 5. CATEGORIES
CREATE TABLE public.categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- 6. SUBCATEGORIES
CREATE TABLE public.subcategories (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);
ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;

-- 7. TAGS
CREATE TABLE public.tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tag_group tag_group NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

-- 8. CLAUSES
CREATE TABLE public.clauses (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL
);
ALTER TABLE public.clauses ENABLE ROW LEVEL SECURITY;

-- 9. CATEGORY_CLAUSES (which clauses apply to which category)
CREATE TABLE public.category_clauses (
  category_id TEXT NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  clause_id TEXT NOT NULL REFERENCES public.clauses(id) ON DELETE CASCADE,
  PRIMARY KEY (category_id, clause_id)
);
ALTER TABLE public.category_clauses ENABLE ROW LEVEL SECURITY;

-- 10. MACROS
CREATE TABLE public.macros (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  macro_category macro_category NOT NULL,
  variables TEXT[] DEFAULT '{}',
  sort_order INT NOT NULL DEFAULT 0
);
ALTER TABLE public.macros ENABLE ROW LEVEL SECURITY;

-- 11. TICKETS
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number SERIAL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  order_number TEXT,
  subject TEXT NOT NULL,
  description TEXT,
  category_id TEXT REFERENCES public.categories(id),
  subcategory_id TEXT REFERENCES public.subcategories(id),
  priority ticket_priority NOT NULL DEFAULT 'P2',
  status ticket_status NOT NULL DEFAULT 'novo',
  delivery_date DATE,
  purchase_date DATE,
  is_assembled BOOLEAN DEFAULT false,
  is_personalized BOOLEAN DEFAULT false,
  is_exhibition BOOLEAN DEFAULT false,
  payment_method TEXT,
  needs_tpa BOOLEAN,
  has_original_packaging BOOLEAN,
  sla_first_response_at TIMESTAMPTZ,
  sla_resolution_at TIMESTAMPTZ,
  first_responded_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  sla_paused_at TIMESTAMPTZ,
  sla_paused_total_seconds INT DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  assigned_to UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- 12. TICKET_TAGS
CREATE TABLE public.ticket_tags (
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (ticket_id, tag_id)
);
ALTER TABLE public.ticket_tags ENABLE ROW LEVEL SECURITY;

-- 13. TICKET_CLAUSES
CREATE TABLE public.ticket_clauses (
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  clause_id TEXT NOT NULL REFERENCES public.clauses(id) ON DELETE CASCADE,
  PRIMARY KEY (ticket_id, clause_id)
);
ALTER TABLE public.ticket_clauses ENABLE ROW LEVEL SECURITY;

-- 14. TICKET_EVENTS (timeline)
CREATE TABLE public.ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  event_type TEXT NOT NULL,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;

-- 15. SLA CONFIG TABLE
CREATE TABLE public.sla_config (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES public.categories(id),
  priority ticket_priority NOT NULL,
  first_response_minutes INT NOT NULL,
  resolution_minutes INT NOT NULL,
  UNIQUE(category_id, priority)
);
ALTER TABLE public.sla_config ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES
-- =============================================

-- Profiles: all authenticated can read, own can update
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- User roles: only supervisors can manage, all authenticated can read own
CREATE POLICY "roles_select" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'supervisor'));
CREATE POLICY "roles_insert" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'supervisor'));
CREATE POLICY "roles_update" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'supervisor'));
CREATE POLICY "roles_delete" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'supervisor'));

-- Reference tables: all authenticated can read
CREATE POLICY "categories_select" ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "subcategories_select" ON public.subcategories FOR SELECT TO authenticated USING (true);
CREATE POLICY "tags_select" ON public.tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "clauses_select" ON public.clauses FOR SELECT TO authenticated USING (true);
CREATE POLICY "category_clauses_select" ON public.category_clauses FOR SELECT TO authenticated USING (true);
CREATE POLICY "macros_select" ON public.macros FOR SELECT TO authenticated USING (true);
CREATE POLICY "sla_config_select" ON public.sla_config FOR SELECT TO authenticated USING (true);

-- Supervisor-only write on reference tables
CREATE POLICY "categories_insert" ON public.categories FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'supervisor'));
CREATE POLICY "subcategories_insert" ON public.subcategories FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'supervisor'));
CREATE POLICY "tags_insert" ON public.tags FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'supervisor'));
CREATE POLICY "clauses_insert" ON public.clauses FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'supervisor'));
CREATE POLICY "macros_insert" ON public.macros FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'supervisor'));

-- Tickets: all authenticated agents can CRUD
CREATE POLICY "tickets_select" ON public.tickets FOR SELECT TO authenticated USING (public.is_authenticated_agent());
CREATE POLICY "tickets_insert" ON public.tickets FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_agent() AND created_by = auth.uid());
CREATE POLICY "tickets_update" ON public.tickets FOR UPDATE TO authenticated USING (public.is_authenticated_agent());
CREATE POLICY "tickets_delete" ON public.tickets FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'supervisor'));

-- Ticket tags/clauses: all authenticated agents
CREATE POLICY "ticket_tags_select" ON public.ticket_tags FOR SELECT TO authenticated USING (public.is_authenticated_agent());
CREATE POLICY "ticket_tags_insert" ON public.ticket_tags FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_agent());
CREATE POLICY "ticket_tags_delete" ON public.ticket_tags FOR DELETE TO authenticated USING (public.is_authenticated_agent());
CREATE POLICY "ticket_clauses_select" ON public.ticket_clauses FOR SELECT TO authenticated USING (public.is_authenticated_agent());
CREATE POLICY "ticket_clauses_insert" ON public.ticket_clauses FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_agent());
CREATE POLICY "ticket_clauses_delete" ON public.ticket_clauses FOR DELETE TO authenticated USING (public.is_authenticated_agent());

-- Ticket events: all authenticated agents can read/create
CREATE POLICY "ticket_events_select" ON public.ticket_events FOR SELECT TO authenticated USING (public.is_authenticated_agent());
CREATE POLICY "ticket_events_insert" ON public.ticket_events FOR INSERT TO authenticated WITH CHECK (public.is_authenticated_agent());

-- =============================================
-- TRIGGERS
-- =============================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, COALESCE(NEW.email, ''), COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  -- Auto-assign agent role
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'agent');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- SEED DATA: Categories
-- =============================================
INSERT INTO public.categories (id, name, description, sort_order) VALUES
  ('A', 'Entrega e Montagem', 'Agendamento, atrasos, acessos, montagem', 1),
  ('B', 'Reclamação pós-entrega (48h)', 'Danos, faltas, não conformidades', 2),
  ('C', 'Garantia (3 anos)', 'Defeitos, assistência técnica', 3),
  ('D', 'Devolução / Troca (15 dias)', 'Arrependimento, troca, recolha', 4),
  ('E', 'Produto personalizado / Cancelamento 72h', 'Cancelamentos, ajustes especiais', 5),
  ('F', 'Pagamentos', 'Métodos de pagamento, transferências', 6),
  ('G', 'Artigos de exposição', 'Pré e pós-compra de exposição', 7),
  ('H', 'Uso e manutenção', 'Limpeza, exposição solar, manuseio', 8);

-- SEED DATA: Subcategories
INSERT INTO public.subcategories (id, category_id, name, sort_order) VALUES
  ('A1', 'A', 'Agendamento / Reagendamento', 1),
  ('A2', 'A', 'Atraso / Previsão de entrega', 2),
  ('A3', 'A', 'Ausência do cliente no local', 3),
  ('A4', 'A', 'Acessos difíceis / Não passa / Escadas / Elevador', 4),
  ('A5', 'A', 'Montagem impossível por falta de espaço', 5),
  ('A6', 'A', 'Pagamento na entrega (pré-condições)', 6),
  ('A7', 'A', 'Entrega em kit / Montagem pelo cliente', 7),
  ('A8', 'A', 'Segurança (crianças/animais)', 8),
  ('B1', 'B', 'Dano visível na entrega', 1),
  ('B2', 'B', 'Falta de peças / quantidade', 2),
  ('B3', 'B', 'Produto diferente do pedido', 3),
  ('B4', 'B', 'Montagem não conforme', 4),
  ('C1', 'C', 'Defeito estrutural / fabrico', 1),
  ('C2', 'C', 'Ferragens / mecanismos', 2),
  ('C3', 'C', 'Tecido/estofos (avaliação)', 3),
  ('C4', 'C', 'Assistência técnica / visita', 4),
  ('D1', 'D', 'Devolução por arrependimento', 1),
  ('D2', 'D', 'Troca por outro artigo', 2),
  ('D3', 'D', 'Condições da embalagem / integridade', 3),
  ('D4', 'D', 'Logística de recolha / custos', 4),
  ('E1', 'E', 'Cancelamento dentro 72h', 1),
  ('E2', 'E', 'Cancelamento após produção iniciada', 2),
  ('E3', 'E', 'Ajustes especiais / medidas especiais', 3),
  ('F1', 'F', 'Pagamento na entrega (numerário/multibanco)', 1),
  ('F2', 'F', 'Transferência antecipada', 2),
  ('F3', 'F', 'seQura (informação)', 3),
  ('G1', 'G', 'Informação pré-compra', 1),
  ('G2', 'G', 'Reclamação pós-compra (estado do artigo)', 2),
  ('H1', 'H', 'Limpeza inadequada', 1),
  ('H2', 'H', 'Exposição solar/calor', 2),
  ('H3', 'H', 'Mau manuseio (arrastar cama, impactos)', 3);

-- SEED DATA: Tags (50)
INSERT INTO public.tags (id, name, tag_group, sort_order) VALUES
  ('48h_ok', '48h OK', 'prazo', 1),
  ('48h_fora', '48h Fora', 'prazo', 2),
  ('15d_ok', '15 dias OK', 'prazo', 3),
  ('15d_fora', '15 dias Fora', 'prazo', 4),
  ('72h_ok', '72h OK', 'prazo', 5),
  ('72h_fora', '72h Fora', 'prazo', 6),
  ('garantia_ok', 'Garantia OK', 'prazo', 7),
  ('garantia_fora', 'Garantia Fora', 'prazo', 8),
  ('personalizado', 'Personalizado', 'produto', 9),
  ('standard', 'Standard', 'produto', 10),
  ('exposicao', 'Exposição', 'produto', 11),
  ('higiene_colchao', 'Higiene/Colchão', 'produto', 12),
  ('kit_sem_montagem', 'Kit sem montagem', 'produto', 13),
  ('montagem_upmoveis', 'Montagem UP', 'produto', 14),
  ('agendar', 'Agendar', 'entrega', 15),
  ('reagendar_48h_ok', 'Reagendar 48h OK', 'entrega', 16),
  ('reagendar_48h_fora', 'Reagendar 48h Fora', 'entrega', 17),
  ('cliente_ausente', 'Cliente ausente', 'entrega', 18),
  ('acesso_dificil', 'Acesso difícil', 'entrega', 19),
  ('nao_passa_porta', 'Não passa porta', 'entrega', 20),
  ('sem_espaco_montagem', 'Sem espaço montagem', 'entrega', 21),
  ('risco_danos', 'Risco de danos', 'entrega', 22),
  ('termo_responsabilidade', 'Termo responsabilidade', 'entrega', 23),
  ('taxa_nova_entrega', 'Taxa nova entrega', 'entrega', 24),
  ('taxa_nova_montagem', 'Taxa nova montagem', 'entrega', 25),
  ('seguranca_criancas_animais', 'Segurança crianças/animais', 'entrega', 26),
  ('pagamento_entrega', 'Pagamento na entrega', 'pagamentos', 27),
  ('tpa_solicitado', 'TPA solicitado', 'pagamentos', 28),
  ('sem_cobertura_rede', 'Sem cobertura rede', 'pagamentos', 29),
  ('transferencia_antecipada', 'Transferência antecipada', 'pagamentos', 30),
  ('comprovativo_pendente', 'Comprovativo pendente', 'pagamentos', 31),
  ('sequra_info', 'seQura info', 'pagamentos', 32),
  ('dano_transporte', 'Dano transporte', 'reclamacao', 33),
  ('falta_pecas', 'Falta de peças', 'reclamacao', 34),
  ('produto_diferente', 'Produto diferente', 'reclamacao', 35),
  ('montagem_inconforme', 'Montagem inconforme', 'reclamacao', 36),
  ('defeito_fabrico_suspeito', 'Defeito fabrico suspeito', 'reclamacao', 37),
  ('mau_uso_suspeito', 'Mau uso suspeito', 'reclamacao', 38),
  ('humidade', 'Humidade', 'reclamacao', 39),
  ('manchas', 'Manchas', 'reclamacao', 40),
  ('impacto', 'Impacto', 'reclamacao', 41),
  ('limpeza_inadequada', 'Limpeza inadequada', 'reclamacao', 42),
  ('desgaste_normal', 'Desgaste normal', 'reclamacao', 43),
  ('aguarda_fotos', 'Aguarda fotos', 'gestao_interna', 44),
  ('aguarda_cliente', 'Aguarda cliente', 'gestao_interna', 45),
  ('aguarda_logistica', 'Aguarda logística', 'gestao_interna', 46),
  ('aguarda_tecnico', 'Aguarda técnico', 'gestao_interna', 47),
  ('urgente', 'Urgente', 'gestao_interna', 48),
  ('cliente_sensivel', 'Cliente sensível', 'gestao_interna', 49),
  ('cliente_recorrente', 'Cliente recorrente', 'gestao_interna', 50);

-- SEED DATA: Clauses
INSERT INTO public.clauses (id, code, description) VALUES
  ('I-a', 'I-a', 'Medidas e acessos: responsabilidade do cliente'),
  ('I-b', 'I-b', 'Vendedor não mede/verifica espaço'),
  ('I-c', 'I-c', 'Variação de cor/tonalidade'),
  ('I-d', 'I-d', 'Personalizados: pagamento antecipado + cancelamento 72h'),
  ('II-a', 'II-a', 'Pagamento na entrega: numerário/MB + aviso prévio para MB'),
  ('II-b', 'II-b', 'Pagamento antecipado para sob medida'),
  ('II-c', 'II-c', 'Transferência: não na entrega; agenda só após confirmação'),
  ('II-d', 'II-d', 'seQura: informação do método'),
  ('III-a', 'III-a', 'Preço não inclui meios especiais (grua/escadas externas/obras)'),
  ('III-b', 'III-b', 'Preço válido entre encomenda e entrega'),
  ('IV-a', 'IV-a', 'Datas são estimativas (fatores produção/logística)'),
  ('IV-b', 'IV-b', 'Reserva 15 dias após disponibilidade'),
  ('V-a', 'V-a', 'Sem marcação horária; entregas 8–20; seg–sáb'),
  ('V-b', 'V-b', 'Montagem não inclui desmontagem/recolha antigos'),
  ('V-c', 'V-c', 'Pagamento antes de descarregar/desembalar/montar'),
  ('V-d', 'V-d', 'Técnicos podem desaconselhar; termo se insistir'),
  ('V-e', 'V-e', 'Verificação imediata; registo de anomalias com evidência'),
  ('V-f', 'V-f', 'Reclamações até 48h com fotos/vídeos'),
  ('V-g', 'V-g', 'Segurança: crianças/animais afastados'),
  ('VI-a', 'VI-a', 'Garantia 3 anos: defeito fabrico'),
  ('VI-b', 'VI-b', 'Kit/levantamento: montagem e danos posteriores responsabilidade cliente'),
  ('VI-c', 'VI-c', 'Exclusões: mau uso, desgaste, manchas, humidade, limpeza, impacto'),
  ('VI-d', 'VI-d', 'Não coberto: cliente paga deslocação + reparação'),
  ('VII-a', 'VII-a', 'Troca/devolução 15 dias (não montado/usado; embalagem origem)'),
  ('VII-b', 'VII-b', 'Sem devolução para personalizados'),
  ('VII-c', 'VII-c', 'Sem troca para exposição'),
  ('VII-d', 'VII-d', 'Higiene: colchões/almofadas só com embalagem fechada'),
  ('VIII-a', 'VIII-a', 'Exposição: estado inspecionado'),
  ('VIII-b', 'VIII-b', 'Exposição: inspeção em loja'),
  ('VIII-c', 'VIII-c', 'Exposição: sem devolução'),
  ('VIII-d', 'VIII-d', 'Exposição: desconto compensa marcas'),
  ('IX-a', 'IX-a', 'Devolução: embalagem original'),
  ('IX-b', 'IX-b', 'Devolução: não montado'),
  ('IX-c', 'IX-c', 'Devolução: integridade'),
  ('IX-d', 'IX-d', 'Devolução: transporte por conta do cliente'),
  ('IX-e', 'IX-e', 'Devolução: exceção defeito'),
  ('IX-f', 'IX-f', 'Devolução: condição f'),
  ('IX-g', 'IX-g', 'Devolução: condição g'),
  ('IX-h', 'IX-h', 'Devolução: condição h'),
  ('IX-i', 'IX-i', 'Devolução: condição i'),
  ('X-a', 'X-a', 'Reembolso até 5 dias úteis após validação'),
  ('XI-a', 'XI-a', 'Recomendações de uso'),
  ('XI-b', 'XI-b', 'Recomendações de manutenção'),
  ('XI-c', 'XI-c', 'Recomendações de limpeza'),
  ('XI-d', 'XI-d', 'Recomendações de ambiente'),
  ('XI-e', 'XI-e', 'Recomendações gerais');

-- SEED DATA: Category-Clause mappings
INSERT INTO public.category_clauses (category_id, clause_id) VALUES
  ('A', 'V-a'), ('A', 'V-b'), ('A', 'V-c'), ('A', 'V-d'), ('A', 'V-e'), ('A', 'V-f'), ('A', 'V-g'),
  ('B', 'V-e'), ('B', 'V-f'),
  ('C', 'VI-a'), ('C', 'VI-b'), ('C', 'VI-c'), ('C', 'VI-d'),
  ('D', 'VII-a'), ('D', 'VII-b'), ('D', 'VII-c'), ('D', 'VII-d'), ('D', 'IX-a'), ('D', 'IX-b'), ('D', 'IX-c'), ('D', 'IX-d'), ('D', 'IX-e'), ('D', 'X-a'),
  ('E', 'I-d'), ('E', 'II-b'),
  ('F', 'II-a'), ('F', 'II-b'), ('F', 'II-c'), ('F', 'II-d'),
  ('G', 'VIII-a'), ('G', 'VIII-b'), ('G', 'VIII-c'), ('G', 'VIII-d'),
  ('H', 'XI-a'), ('H', 'XI-b'), ('H', 'XI-c'), ('H', 'XI-d'), ('H', 'XI-e'), ('H', 'VI-c');

-- SEED DATA: Macros (18)
INSERT INTO public.macros (id, title, content, macro_category, variables, sort_order) VALUES
  ('M01', 'Direcionar para canal oficial', 'Olá, {nome_cliente}. Para darmos seguimento de forma correta, pedimos que envie por favor um e-mail para {email_suporte} com: Nº de encomenda ({n_encomenda}) e fotos/vídeos do ocorrido. Assim conseguimos analisar formalmente e responder com base no procedimento aplicável.', 'geral', '{nome_cliente,n_encomenda,email_suporte}', 1),
  ('M02', 'Reclamação dentro das 48h', 'Recebemos o seu contacto. Para análise, pedimos fotos/vídeos e uma descrição objetiva do ponto a verificar. Conforme procedimento, a comunicação deve ser efetuada até 48h após a entrega para validação da ocorrência. {clausulas}', 'reclamacao', '{clausulas}', 2),
  ('M03', 'Reclamação fora das 48h', 'Registámos o seu pedido. Informamos que, após a entrega, a verificação e comunicação de não conformidades deve ocorrer no prazo máximo de 48h, com evidência visual. Reclamações fora desse procedimento podem não ser consideradas válidas. Ainda assim, podemos avaliar o caso tecnicamente mediante envio de fotos/vídeos. {clausulas}', 'reclamacao', '{clausulas}', 3),
  ('M04', 'Acesso/medidas', 'Para viabilizar a entrega/montagem, a verificação de medidas e acessos (portas, escadas, elevadores) é da responsabilidade do cliente. Se no local houver limitação que impeça a execução, poderá ser necessário reagendamento e/ou alternativas logísticas. {clausulas}', 'entrega', '{clausulas}', 4),
  ('M05', 'Risco de danos (termo)', 'A nossa equipa poderá desaconselhar a execução caso identifique risco sério de danos no artigo ou no imóvel. Se o cliente optar por prosseguir, será necessário assinar termo de responsabilidade no local. {clausulas}', 'entrega', '{clausulas}', 5),
  ('M06', 'Falta de espaço montagem', 'Para a correta montagem, é necessária área livre frontal e lateral além das dimensões do móvel. A ausência de espaço adequado pode condicionar ou impossibilitar o serviço no local, podendo implicar reagendamento. {clausulas}', 'entrega', '{clausulas}', 6),
  ('M07', 'Pagamento na entrega', 'Em modalidade "pagamento na entrega", o pagamento deve ser efetuado antes do produto ser retirado do camião, desembalado e montado. {clausulas}', 'pagamento', '{clausulas}', 7),
  ('M08', 'Multibanco na entrega', 'Para pagamento por multibanco na entrega, é necessário aviso prévio, pois depende de equipamento disponível e cobertura de rede no local. {clausulas}', 'pagamento', '{clausulas}', 8),
  ('M09', 'Transferência bancária', 'Informamos que não aceitamos transferências bancárias no momento da entrega. Se pretender pagar por transferência, deve informar com antecedência para envio de IBAN, e o agendamento ocorre após confirmação do pagamento. {clausulas}', 'pagamento', '{clausulas}', 9),
  ('M10', 'Atraso de entrega', 'As datas de entrega são estimativas e podem sofrer alterações por fatores logísticos e/ou de produção. Mantemos comunicação proativa e atualizaremos assim que houver nova previsão. {clausulas}', 'entrega', '{clausulas}', 10),
  ('M11', 'Reserva 15 dias', 'Informamos que, após disponibilidade, os artigos ficam reservados por até 15 dias. Se não for possível receber/levantar nesse período, a UP Móveis pode realocar o artigo para venda. {clausulas}', 'entrega', '{clausulas}', 11),
  ('M12', 'Devolução elegível', 'Para devolução/troca dentro de 15 dias, o produto deve estar sem montagem/uso e devidamente acondicionado na embalagem original. Os custos de recolha/transporte são do cliente, salvo defeito confirmado. {clausulas}', 'devolucao', '{clausulas}', 12),
  ('M13', 'Devolução recusada (montagem)', 'Verificámos que o produto teve montagem iniciada/foi montado. Nessas condições, não se enquadra nos critérios de devolução. {clausulas}', 'devolucao', '{clausulas}', 13),
  ('M14', 'Devolução recusada (personalizado)', 'Produtos fabricados sob medida/especificações únicas não são elegíveis para devolução/troca, exceto por defeito ou dano de transporte. {clausulas}', 'devolucao', '{clausulas}', 14),
  ('M15', 'Artigo de exposição', 'Artigos de exposição são adquiridos no estado em que se encontram, com redução de preço associada, não sendo aceites trocas ou devoluções após compra. {clausulas}', 'exposicao', '{clausulas}', 15),
  ('M16', 'Garantia (abertura)', 'Para abertura de garantia, pedimos: nº encomenda, data de entrega, fotos/vídeos e descrição do comportamento do produto. A equipa técnica analisará e informará o próximo passo. {clausulas}', 'garantia', '{clausulas}', 16),
  ('M17', 'Garantia não coberta', 'Após análise, o caso indica situação não abrangida pela garantia (ex.: desgaste normal/mau uso/limpeza inadequada/impacto/humidade). Se pretender visita técnica/reparação, aplicam-se custos de deslocação e, se necessário, mão de obra e materiais. {clausulas}', 'garantia', '{clausulas}', 17),
  ('M18', 'Reembolso (prazo)', 'Assim que o produto devolvido for rececionado e validado como conforme para devolução, o reembolso será processado por transferência bancária em até 5 dias úteis. {clausulas}', 'devolucao', '{clausulas}', 18);

-- SEED DATA: SLA Config
INSERT INTO public.sla_config (id, category_id, priority, first_response_minutes, resolution_minutes) VALUES
  ('A-P1', 'A', 'P1', 30, 240),
  ('A-P2', 'A', 'P2', 120, 1440),
  ('A-P3', 'A', 'P3', 480, 2880),
  ('B-P1', 'B', 'P1', 120, 2880),
  ('B-P2', 'B', 'P2', 480, 4320),
  ('B-P3', 'B', 'P3', 1440, 6000),
  ('C-P1', 'C', 'P1', 480, 6000),
  ('C-P2', 'C', 'P2', 1440, 8400),
  ('C-P3', 'C', 'P3', 2880, 12000),
  ('D-P1', 'D', 'P1', 480, 4320),
  ('D-P2', 'D', 'P2', 1440, 6000),
  ('D-P3', 'D', 'P3', 2880, 8400),
  ('E-P1', 'E', 'P1', 120, 1440),
  ('E-P2', 'E', 'P2', 480, 2880),
  ('E-P3', 'E', 'P3', 1440, 6000),
  ('F-P1', 'F', 'P1', 120, 1440),
  ('F-P2', 'F', 'P2', 480, 2880),
  ('F-P3', 'F', 'P3', 1440, 6000),
  ('G-P1', 'G', 'P1', 480, 4320),
  ('G-P2', 'G', 'P2', 1440, 6000),
  ('G-P3', 'G', 'P3', 2880, 8400),
  ('H-P1', 'H', 'P1', 480, 6000),
  ('H-P2', 'H', 'P2', 1440, 8400),
  ('H-P3', 'H', 'P3', 2880, 12000);
