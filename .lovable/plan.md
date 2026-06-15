# Refatorar macros + sugestão de resposta por IA

## Objetivo
1. Ligar cada macro a **categorias/subcategorias obrigatórias** e **tags opcionais**, filtrando automaticamente as sugestões no ticket.
2. Adicionar **botão "Sugerir resposta IA"** que analisa toda a conversa, documentos da empresa (T&C) e — sob pedido — fotos anexadas, devolvendo uma resposta formal editável.

---

## Parte 1 — Macros contextuais

### Base de dados
Migração que adiciona à tabela `macros`:
- `category_ids text[]` (obrigatório ao criar — pelo menos 1)
- `subcategory_ids text[]` (obrigatório ao criar — pelo menos 1)
- `tag_ids text[]` (opcional, default `{}`)
- `is_active boolean default true`

Índices GIN nos três arrays para filtragem rápida.

### UI — `src/pages/Macros.tsx`
No editor/criador adicionar:
- Multi-select de **Categorias** (obrigatório)
- Multi-select de **Subcategorias** (filtra pelas categorias selecionadas, obrigatório)
- Multi-select de **Tags** (opcional)
- Switch "Ativa"

Lista mostra chips coloridos das categorias/subcategorias/tags ligadas + filtro por categoria/subcategoria.

### UI — `src/components/ticket/MacroSelector.tsx`
Substituir o motor de "sugeridas" atual por filtragem direta:
- **Compatíveis** (topo): macros cujo `category_ids` inclui a categoria do ticket **E** `subcategory_ids` inclui a subcategoria. Boost extra se alguma tag do ticket bater com `tag_ids`.
- **Outras** (recolhidas): restantes macros ativas.
Manter pesquisa e preenchimento de placeholders.

---

## Parte 2 — Sugestão de resposta por IA

### Documento T&C (Definições)
Novo separador **"Documentos da Empresa"** em `SettingsPage`:
- Upload de PDF/DOCX/TXT para bucket privado `company-documents` (supervisor only).
- Tabela `company_documents` com `id, title, file_path, file_type, extracted_text, is_active, uploaded_by, created_at`.
- Ao fazer upload, edge function `extract-document-text` lê o ficheiro, extrai texto (PDF via `pdf-parse`, DOCX via `mammoth`, TXT direto) e guarda em `extracted_text`.
- Lista permite ativar/desativar e remover.

### Edge function `suggest-ai-reply`
Input: `{ ticket_id: uuid, include_images?: boolean }`

Fluxo:
1. Validar JWT do agente (RLS via `is_authenticated_agent`).
2. Carregar ticket (cliente, categoria, subcategoria, tags, encomenda, descrição).
3. Carregar **toda** a `ticket_messages` ordenada cronologicamente (cliente + agente).
4. Carregar texto dos `company_documents` ativos (concatenado, truncado a ~30k chars).
5. Se `include_images`, listar `ticket_attachments` do tipo `image/*` e obter URLs assinadas (60s) para enviar como input multimodal.
6. Chamar **Lovable AI Gateway** (`https://ai.gateway.lovable.dev/v1/chat/completions`) com:
   - Modelo: `google/gemini-2.5-pro` se imagens, `google/gemini-3-flash-preview` caso contrário.
   - System prompt: persona formal de apoio UP Móveis, sempre em PT-PT, baseada nos T&C fornecidos, evitar promessas não suportadas, assinar com nome do agente.
   - User content: contexto estruturado + histórico da conversa + (opcional) imagens.
7. Tratar 429/402 com erros amigáveis.
8. Devolver `{ suggestion: string, model: string, used_images: boolean, doc_count: number }`.

### UI no ticket
Novo botão **"Sugerir resposta IA"** ✨ junto ao botão Macros em `TicketTimeline.tsx`:
- Abre dialog com:
  - Toggle "Incluir análise de fotos" (off por defeito).
  - Botão "Gerar sugestão" → loading → mostra resposta em `Textarea` editável.
  - Botões "Regenerar", "Inserir na resposta" (preenche a caixa de resposta), "Copiar".
  - Rodapé indica modelo usado e nº de documentos T&C considerados.
- Toasts para erros (sem T&C ativos avisa supervisor para fazer upload).

---

## Detalhes técnicos

- Migração: ALTER macros + nova tabela `company_documents` + bucket privado + RLS (select/insert agente, write supervisor) + GRANTs.
- Backfill: macros existentes recebem `is_active=true` e arrays vazios; UI mostra aviso "macro sem categoria — não aparecerá nas sugestões" até serem editadas.
- Edge functions novas: `extract-document-text`, `suggest-ai-reply` (ambas com `verify_jwt=false`, validação manual via `is_authenticated_agent`).
- Lovable AI key (`LOVABLE_API_KEY`) já existe — sem novos secrets.
- Imagens enviadas como `image_url` data-URL ou URL assinada, conforme suportado pelo modelo.
- Limite: máx 40 mensagens mais recentes + truncar mensagens >2k chars para controlar tokens.
- Sem alterações ao motor de decisões existente (continua a operar em paralelo).

## Ficheiros afetados (estimativa)
- `supabase/migrations/<new>.sql`
- `supabase/functions/extract-document-text/index.ts` (novo)
- `supabase/functions/suggest-ai-reply/index.ts` (novo)
- `src/pages/Macros.tsx`
- `src/components/ticket/MacroSelector.tsx`
- `src/components/settings/CompanyDocumentsTab.tsx` (novo)
- `src/pages/SettingsPage.tsx` (registar separador)
- `src/components/ticket/TicketTimeline.tsx` (botão + dialog)
- `src/components/ticket/AiSuggestionDialog.tsx` (novo)
