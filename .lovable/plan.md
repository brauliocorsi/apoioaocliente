
# Motor de Regras Dinâmico — Configuração Visual de Regras

## Problema Actual

As regras do Motor de Regras (R1 a R7) estão completamente **hardcoded** em `src/lib/decisionEngine.ts`. Para mudar quais cláusulas, etiquetas ou macro são sugeridas por cada regra, é necessário editar código directamente. Não existe nenhuma interface de gestão.

## Solução

Tornar as regras **completamente configuráveis** através de uma nova aba "Motor de Regras" nas Configurações, com suporte a uma tabela na base de dados.

---

## O Que Vai Ser Construído

### 1. Nova tabela na base de dados: `decision_rules`

Cada regra fica guardada como um registo com:

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | text (PK) | ex: `R1a`, `R1b`, `R7` |
| `name` | text | Nome legível da regra |
| `description` | text | Condição que a activa |
| `condition_type` | text | `category`, `subcategory`, `payment_method`, `field_bool`, `tag_exists` |
| `condition_value` | text | Valor da condição (ex: `B`, `A4`, `multibanco`) |
| `condition_extra` | jsonb | Parâmetros extra (ex: `{ "hours": 48, "field": "delivery_date", "direction": "after" }`) |
| `suggested_tag_ids` | text[] | IDs de tags a sugerir |
| `suggested_clause_ids` | text[] | IDs de cláusulas a sugerir |
| `suggested_macro_id` | text | ID da macro a sugerir |
| `message` | text | Mensagem que aparece no motor de regras |
| `is_active` | boolean | Activa/desactiva a regra |
| `sort_order` | integer | Ordem de avaliação |

As regras actuais (R1–R7) são migradas para esta tabela como dados iniciais.

### 2. Motor de Regras passa a ser avaliado no frontend a partir da base de dados

O `DecisionEngine.ts` é simplificado: em vez de ter lógica hardcoded, recebe as regras da tabela e avalia as condições dinamicamente.

A avaliação de cada `condition_type`:
- `category` — verifica `ticket.category_id === condition_value`
- `subcategory` — verifica `ticket.subcategory_id === condition_value`
- `payment_method` — verifica `ticket.payment_method === condition_value`
- `field_bool` — verifica `ticket[condition_extra.field] === true`
- `tag_exists` — verifica se alguma das tags actuais do ticket está em `condition_extra.tags`
- `delivery_hours` — verifica tempo desde `ticket.delivery_date`

### 3. Nova aba "Motor de Regras" nas Configurações

Interface CRUD completa onde supervisores podem:

**Listar regras** — tabela com nome, condição, estado (ativa/inativa), e botões de edição

**Criar/Editar regra** — formulário com:
- Nome e mensagem da regra
- Tipo de condição (dropdown) + valor da condição
- Selector multi de **Etiquetas sugeridas** (lista de tags com checkboxes)
- Selector multi de **Cláusulas sugeridas** (lista de cláusulas com checkboxes)
- Selector de **Macro sugerida** (dropdown)
- Toggle ativo/inativo

**Eliminar regra** — com confirmação

### 4. RLS da nova tabela

- `SELECT`: qualquer agente autenticado
- `INSERT/UPDATE/DELETE`: apenas supervisores

---

## Ficheiros a Criar/Alterar

| Ficheiro | Acção |
|---|---|
| Nova migração SQL | Criar tabela `decision_rules` + inserir dados das R1–R7 actuais + RLS |
| `src/lib/decisionEngine.ts` | Refactorizar para receber regras como parâmetro e avaliar dinamicamente |
| `src/components/settings/DecisionRulesTab.tsx` | Criar — nova aba de gestão de regras |
| `src/pages/SettingsPage.tsx` | Adicionar tab "Motor de Regras" |
| `src/pages/TicketDetail.tsx` | Carregar regras da base de dados antes de avaliar o motor |

---

## Detalhes Técnicos

### Migração SQL

```sql
CREATE TABLE public.decision_rules (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  condition_type text NOT NULL, -- 'category','subcategory','payment_method','field_bool','tag_exists','delivery_hours'
  condition_value text,
  condition_extra jsonb DEFAULT '{}',
  suggested_tag_ids text[] DEFAULT '{}',
  suggested_clause_ids text[] DEFAULT '{}',
  suggested_macro_id text,
  message text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

-- RLS
ALTER TABLE public.decision_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rules_select" ON public.decision_rules FOR SELECT USING (true);
CREATE POLICY "rules_insert" ON public.decision_rules FOR INSERT WITH CHECK (has_role(auth.uid(), 'supervisor'));
CREATE POLICY "rules_update" ON public.decision_rules FOR UPDATE USING (has_role(auth.uid(), 'supervisor'));
CREATE POLICY "rules_delete" ON public.decision_rules FOR DELETE USING (has_role(auth.uid(), 'supervisor'));

-- Dados iniciais (R1–R7)
INSERT INTO public.decision_rules VALUES
  ('R1a', 'Reclamação fora das 48h', 'Categoria B + data entrega > 48h', 'delivery_hours', 'B', '{"hours":48,"direction":"after","requires_field":"delivery_date"}', '{"48h_fora"}', '{"V-f"}', 'M03', 'Reclamação fora das 48h. Pode não ser considerada válida.', true, 10),
  ('R1b', 'Reclamação dentro das 48h', 'Categoria B + data entrega <= 48h', 'delivery_hours', 'B', '{"hours":48,"direction":"before","requires_field":"delivery_date"}', '{"48h_ok"}', '{"V-f","V-e"}', 'M02', 'Reclamação dentro das 48h. Procedimento normal.', true, 20),
  ('R2',  'Devolução produto montado', 'Categoria D + montagem = true', 'field_bool', 'D', '{"field":"is_assembled","category_id":"D"}', '{}', '{"IX-b","VII-a"}', 'M13', 'Produto montado. Devolução não elegível.', true, 30),
  ('R3',  'Produto personalizado', 'Categoria D + personalizado = true', 'field_bool', 'D', '{"field":"is_personalized","category_id":"D"}', '{"personalizado"}', '{"VII-b","I-d"}', 'M14', 'Produto personalizado. Devolução por arrependimento não aplicável.', true, 40),
  ('R4',  'Multibanco na entrega', 'Categoria F + pagamento multibanco', 'payment_method', 'multibanco', '{"category_id":"F"}', '{"tpa_solicitado","pagamento_entrega"}', '{"II-a"}', 'M08', 'Pagamento multibanco na entrega requer aviso prévio.', true, 50),
  ('R5',  'Transferência na entrega', 'Categoria F + pagamento transferência', 'payment_method', 'transferencia', '{"category_id":"F"}', '{"transferencia_antecipada"}', '{"II-c"}', 'M09', 'Transferência na entrega não aceite.', true, 60),
  ('R6',  'Acesso difícil', 'Subcategoria A4', 'subcategory', 'A4', '{}', '{"acesso_dificil","termo_responsabilidade"}', '{"V-d","I-a"}', 'M04', 'Acesso difícil: verificar fotos do local e possível termo de responsabilidade.', true, 70),
  ('R7',  'Garantia com exclusões', 'Categoria C + tags de exclusão presentes', 'tag_exists', 'C', '{"tags":["humidade","impacto","limpeza_inadequada"]}', '{"mau_uso_suspeito"}', '{"VI-c","VI-d"}', 'M17', 'Evidência de exclusão de garantia detetada.', true, 80);
```

### Motor de Regras Dinâmico

O `DecisionEngine.ts` passa a exportar uma função `evaluateRules(ticket, currentTags, rules)` onde `rules` vem da tabela. A lógica de avaliação de cada `condition_type` fica no próprio engine mas sem dados hardcoded.

### Interface de Gestão

A aba "Motor de Regras" nas configurações terá:
- Lista de regras com toggle rápido ativo/inativo
- Botão "Nova Regra" que abre um dialog/sheet
- No formulário, os selectores de etiquetas e cláusulas são multi-select com visual de badges
- Drag-and-drop de sort_order (usando dnd-kit já instalado)

### Carregamento no TicketDetail

Em `fetchTicket()`, adicionar query às `decision_rules` (filtrando `is_active = true`) e passar ao engine em vez da lógica hardcoded.
