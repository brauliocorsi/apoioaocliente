-- 1) Macros: ligações a categoria/subcategoria/tag + flag ativa
ALTER TABLE public.macros
  ADD COLUMN IF NOT EXISTS category_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS subcategory_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tag_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS macros_category_ids_idx ON public.macros USING gin (category_ids);
CREATE INDEX IF NOT EXISTS macros_subcategory_ids_idx ON public.macros USING gin (subcategory_ids);
CREATE INDEX IF NOT EXISTS macros_tag_ids_idx ON public.macros USING gin (tag_ids);

-- 2) Documentos da empresa (T&C, políticas) — base de conhecimento da IA
CREATE TABLE IF NOT EXISTS public.company_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  file_path text NOT NULL,
  file_type text NOT NULL,
  file_size integer,
  extracted_text text,
  is_active boolean NOT NULL DEFAULT true,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_documents TO authenticated;
GRANT ALL ON public.company_documents TO service_role;

ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_documents_select"
  ON public.company_documents FOR SELECT
  TO authenticated
  USING (public.is_authenticated_agent());

CREATE POLICY "company_documents_insert"
  ON public.company_documents FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "company_documents_update"
  ON public.company_documents FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "company_documents_delete"
  ON public.company_documents FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'::app_role));

CREATE TRIGGER tg_company_documents_updated_at
  BEFORE UPDATE ON public.company_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 3) Políticas de Storage para o bucket "company-documents" (bucket criado em separado)
CREATE POLICY "company_documents_storage_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'company-documents' AND public.is_authenticated_agent());

CREATE POLICY "company_documents_storage_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'company-documents' AND public.has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "company_documents_storage_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'company-documents' AND public.has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "company_documents_storage_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'company-documents' AND public.has_role(auth.uid(), 'supervisor'::app_role));