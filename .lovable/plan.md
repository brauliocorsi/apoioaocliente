

# Melhorias ao Sistema de Tickets - Fase 2

## 1. Etiquetas dinamicas com cores

A tabela `tags` atualmente tem apenas `id`, `name`, `tag_group` e `sort_order`. Vamos adicionar uma coluna `color` (TEXT) para que cada etiqueta tenha uma cor personalizada. Os supervisores poderao escolher cores ao criar/editar etiquetas.

**Alteracoes:**
- Migracao: adicionar coluna `color TEXT DEFAULT '#6b7280'` a tabela `tags`
- Adicionar RLS de UPDATE e DELETE para supervisores na tabela `tags`
- Atualizar `TagSelector.tsx` para mostrar as badges com a cor da etiqueta (usando `style={{ backgroundColor: tag.color }}`)
- Criar pagina de gestao de etiquetas (`src/pages/TagsPage.tsx`) onde supervisores podem criar, editar cores e eliminar tags
- Adicionar rota e link na sidebar

## 2. Regras SLA visiveis no ticket

O SLA ja e calculado na criacao do ticket (`sla_first_response_at`, `sla_resolution_at`), mas nao e mostrado no detalhe. Vamos adicionar um card de SLA no ticket com:
- Prazo de primeira resposta e tempo restante (ou se ja expirou)
- Prazo de resolucao e tempo restante
- Barra de progresso visual (verde/amarelo/vermelho)
- Indicacao se o SLA esta pausado (estado "Aguarda cliente")
- Calculo que desconta o tempo pausado (`sla_paused_total_seconds`)

**Alteracoes:**
- Criar componente `src/components/ticket/SlaIndicator.tsx`
- Integrar no `TicketDetail.tsx` entre o cabecalho e a descricao

## 3. Tipo de entrega (Entregue vs Levantamento)

Adicionar campo para distinguir se a encomenda foi entregue ao cliente ou se o cliente fez levantamento, com a data correspondente.

**Alteracoes:**
- Migracao: adicionar colunas `delivery_type TEXT` (valores: 'entrega', 'levantamento') e `pickup_date DATE` na tabela `tickets`
- Atualizar formulario de criacao (`TicketNew.tsx`) com selecao do tipo e campo de data de levantamento
- Atualizar `TicketSidebar.tsx` para mostrar e editar estes campos

## 4. Prioridade com flag colorida

Atualmente a prioridade aparece como badge com cor. Vamos melhorar com um icone de flag colorido mais visivel:
- P1: flag vermelha
- P2: flag amarela/laranja
- P3: flag cinza

**Alteracoes:**
- Atualizar `TicketDetail.tsx` para usar icone `Flag` do lucide-react com cor inline
- Atualizar lista em `Tickets.tsx` e cards no `KanbanBoard.tsx` com o mesmo icone
- Criar componente reutilizavel `src/components/ticket/PriorityFlag.tsx`

## 5. Integracao de email para abertura automatica de tickets

Criar uma edge function que recebe emails via webhook (compativel com servicos como SendGrid Inbound Parse, Mailgun, etc.) e cria tickets automaticamente.

**Alteracoes:**
- Criar edge function `supabase/functions/inbound-email/index.ts` que:
  - Recebe POST com dados do email (from, subject, body, attachments)
  - Cria um ticket com `client_name` e `client_email` extraidos do remetente
  - Regista o corpo do email como descricao
  - Cria evento inicial "Ticket criado via email"
- Configurar `verify_jwt = false` no config.toml para esta funcao (webhook externo)
- Adicionar na pagina de Settings instrucoes de como configurar o webhook no servico de email

**Nota:** A configuracao do servico de email externo (SendGrid, Mailgun, etc.) tera de ser feita pelo utilizador no painel do servico, apontando o webhook para o URL da edge function.

---

## Detalhes Tecnicos

### Migracoes SQL
```sql
-- Cores nas tags
ALTER TABLE tags ADD COLUMN color TEXT DEFAULT '#6b7280';

-- Tipo de entrega
ALTER TABLE tickets ADD COLUMN delivery_type TEXT;
ALTER TABLE tickets ADD COLUMN pickup_date DATE;

-- RLS para tags (update/delete por supervisores)
CREATE POLICY "tags_update" ON tags FOR UPDATE USING (has_role(auth.uid(), 'supervisor'));
CREATE POLICY "tags_delete" ON tags FOR DELETE USING (has_role(auth.uid(), 'supervisor'));
```

### Ficheiros a criar
- `src/components/ticket/SlaIndicator.tsx` - Card de SLA com barras de progresso e contagem regressiva
- `src/components/ticket/PriorityFlag.tsx` - Componente de flag colorida reutilizavel
- `src/pages/TagsPage.tsx` - Gestao de etiquetas com color picker
- `supabase/functions/inbound-email/index.ts` - Webhook para receber emails

### Ficheiros a modificar
- `src/components/ticket/TagSelector.tsx` - Usar cores das tags nos badges
- `src/components/ticket/TicketSidebar.tsx` - Campos de tipo de entrega e data de levantamento
- `src/pages/TicketDetail.tsx` - Integrar SlaIndicator e PriorityFlag
- `src/pages/TicketNew.tsx` - Campos de tipo de entrega e levantamento
- `src/pages/Tickets.tsx` - PriorityFlag na listagem
- `src/components/KanbanBoard.tsx` - PriorityFlag nos cards
- `src/App.tsx` - Rota para pagina de tags
- `src/components/AppSidebar.tsx` - Link para gestao de tags
- `supabase/config.toml` - Configuracao da edge function inbound-email

