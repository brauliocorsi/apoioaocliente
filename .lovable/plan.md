

# Status Dinamicos e Categorias Dinamicas

## Resumo

Atualmente os estados dos tickets sao um ENUM fixo no Postgres (`ticket_status`) e as categorias existem numa tabela mas sem interface de gestao. Este plano transforma ambos em entidades totalmente dinamicas e personalizaveis pelos supervisores.

---

## 1. Status Dinamicos

### Problema atual
Os 7 estados estao codificados como ENUM Postgres (`novo`, `em_analise`, `aguarda_cliente`, etc.) e repetidos em pelo menos 4 ficheiros frontend como objetos `statusLabels` hardcoded.

### Solucao: Tabela `ticket_statuses`

Criar uma tabela para gerir estados dinamicamente:

```text
ticket_statuses
-----------------------------------------
id              TEXT  (PK, ex: "novo")
name            TEXT  (ex: "Novo")
color           TEXT  (ex: "#3b82f6")
sort_order      INT   (ordem no Kanban)
pauses_sla      BOOL  (pausa cronometro SLA)
is_resolved     BOOL  (marca ticket como resolvido)
is_closed       BOOL  (marca ticket como encerrado)
default_assign  UUID  (agente atribuido automaticamente, opcional)
sla_minutes     INT   (SLA especifico para este estagio, opcional)
```

### Migracao SQL

1. Criar tabela `ticket_statuses` com RLS (select para todos, insert/update/delete para supervisores)
2. Popular com os 7 estados atuais, mapeando as propriedades existentes
3. Alterar coluna `tickets.status` de ENUM para TEXT com foreign key para `ticket_statuses.id`
4. Remover o ENUM `ticket_status` (apos migracao)

### Impacto no Frontend

Ficheiros que tem `statusLabels` hardcoded e precisam ser atualizados para carregar da base de dados:
- `src/pages/Tickets.tsx` - filtros e lista
- `src/pages/TicketDetail.tsx` - selector de estado
- `src/components/KanbanBoard.tsx` - colunas do Kanban
- `src/pages/TicketNew.tsx` (status inicial = primeiro por sort_order)

### Pagina de Gestao de Status

Criar `src/pages/StatusPage.tsx` (acesso supervisor) com:
- Lista de todos os estados com drag-and-drop para reordenar
- Formulario para criar novo estado (nome, cor, opcoes SLA)
- Edicao inline: nome, cor, pausa SLA, resolucao, encerramento
- Campo opcional de atribuicao automatica (dropdown de agentes)
- Campo opcional de SLA por estagio (minutos)
- Eliminacao (apenas se nenhum ticket usar o estado)

---

## 2. Categorias Dinamicas com Gestao

### Problema atual
As categorias e subcategorias existem na base de dados mas nao ha interface para as gerir. Tambem nao tem campo de atribuicao automatica.

### Alteracoes na Base de Dados

```text
categories (adicionar colunas)
-----------------------------------------
default_assign  UUID  (agente atribuido automaticamente, opcional)

subcategories (adicionar colunas)
-----------------------------------------
description     TEXT  (descricao opcional)
default_assign  UUID  (override de atribuicao, opcional)
```

Adicionar RLS de UPDATE e DELETE na tabela `categories` e `subcategories` para supervisores.

### Pagina de Gestao de Categorias

Criar `src/pages/CategoriesPage.tsx` (acesso supervisor) com:
- Lista de categorias com subcategorias expandiveis (accordion)
- Criar/editar/eliminar categorias (nome, descricao, atribuicao)
- Criar/editar/eliminar subcategorias dentro de cada categoria
- Campo de atribuicao automatica por categoria e subcategoria
- Gestao de SLA por categoria ja existe na tabela `sla_config` -- adicionar edicao inline dos tempos de SLA

---

## 3. Logica de Atribuicao Automatica

Quando um ticket muda de estado ou e criado:
1. Verificar se o **novo estado** tem `default_assign` -- se sim, atribuir
2. Senao, verificar se a **subcategoria** tem `default_assign`
3. Senao, verificar se a **categoria** tem `default_assign`
4. Senao, manter atribuicao atual

Esta logica sera aplicada em `TicketDetail.tsx` (ao mudar estado) e `TicketNew.tsx` (ao criar).

---

## 4. Logica de SLA por Estagio

Quando um ticket entra num estado com `sla_minutes` definido:
- Registar `sla_stage_deadline` no ticket (ou num evento) para controlo do tempo nesse estagio
- Mostrar no `SlaIndicator` um indicador adicional de "Tempo no estagio atual"

Adicionar coluna ao tickets:
```text
tickets (adicionar colunas)
-----------------------------------------
sla_stage_deadline_at  TIMESTAMPTZ  (prazo do estagio atual, opcional)
status_changed_at      TIMESTAMPTZ  (quando o estado foi alterado pela ultima vez)
```

---

## Detalhes Tecnicos

### Migracoes SQL (sequencia)

**Migracao 1 -- Tabela de status:**
```sql
CREATE TABLE ticket_statuses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6b7280',
  sort_order INT NOT NULL DEFAULT 0,
  pauses_sla BOOLEAN DEFAULT false,
  is_resolved BOOLEAN DEFAULT false,
  is_closed BOOLEAN DEFAULT false,
  default_assign UUID,
  sla_minutes INT
);

ALTER TABLE ticket_statuses ENABLE ROW LEVEL SECURITY;
-- RLS: select all, CUD supervisor only

INSERT INTO ticket_statuses VALUES
  ('novo', 'Novo', '#3b82f6', 1, false, false, false, null, null),
  ('em_analise', 'Em analise', '#8b5cf6', 2, false, false, false, null, null),
  ('aguarda_cliente', 'Aguarda cliente', '#f59e0b', 3, true, false, false, null, null),
  ('aguarda_logistica', 'Aguarda logistica', '#f97316', 4, false, false, false, null, null),
  ('aguarda_tecnico', 'Aguarda tecnico', '#a855f7', 5, false, false, false, null, null),
  ('resolvido', 'Resolvido', '#22c55e', 6, false, true, false, null, null),
  ('encerrado', 'Encerrado', '#6b7280', 7, false, false, true, null, null);

-- Converter status de ENUM para TEXT
ALTER TABLE tickets ALTER COLUMN status DROP DEFAULT;
ALTER TABLE tickets ALTER COLUMN status TYPE TEXT USING status::TEXT;
ALTER TABLE tickets ALTER COLUMN status SET DEFAULT 'novo';
ALTER TABLE tickets ADD CONSTRAINT tickets_status_fk 
  FOREIGN KEY (status) REFERENCES ticket_statuses(id);

DROP TYPE IF EXISTS ticket_status;
```

**Migracao 2 -- Colunas adicionais:**
```sql
ALTER TABLE categories ADD COLUMN default_assign UUID;
ALTER TABLE subcategories ADD COLUMN description TEXT;
ALTER TABLE subcategories ADD COLUMN default_assign UUID;
ALTER TABLE tickets ADD COLUMN sla_stage_deadline_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN status_changed_at TIMESTAMPTZ DEFAULT now();

-- RLS update/delete para categories e subcategories
CREATE POLICY "categories_update" ON categories FOR UPDATE 
  USING (has_role(auth.uid(), 'supervisor'));
CREATE POLICY "categories_delete" ON categories FOR DELETE 
  USING (has_role(auth.uid(), 'supervisor'));
CREATE POLICY "subcategories_update" ON subcategories FOR UPDATE 
  USING (has_role(auth.uid(), 'supervisor'));
CREATE POLICY "subcategories_delete" ON subcategories FOR DELETE 
  USING (has_role(auth.uid(), 'supervisor'));
```

### Ficheiros a criar
- `src/pages/StatusPage.tsx` -- Gestao de estados (CRUD + reordenacao)
- `src/pages/CategoriesPage.tsx` -- Gestao de categorias e subcategorias

### Ficheiros a modificar
- `src/pages/Tickets.tsx` -- Carregar estados da BD em vez de hardcoded
- `src/pages/TicketDetail.tsx` -- Carregar estados da BD, logica de atribuicao e SLA por estagio
- `src/components/KanbanBoard.tsx` -- Colunas dinamicas da BD com cores
- `src/pages/TicketNew.tsx` -- Atribuicao automatica na criacao
- `src/components/ticket/TicketSidebar.tsx` -- Mostrar info de estagio SLA
- `src/components/ticket/SlaIndicator.tsx` -- Indicador de SLA por estagio
- `src/App.tsx` -- Rotas para StatusPage e CategoriesPage
- `src/components/AppSidebar.tsx` -- Links na sidebar

### Ordem de implementacao
1. Migracoes SQL (tabela status + colunas)
2. Substituir statusLabels hardcoded em todos os ficheiros por dados da BD
3. Criar pagina de gestao de status
4. Criar pagina de gestao de categorias
5. Implementar logica de atribuicao automatica
6. Implementar SLA por estagio
7. Atualizar sidebar e rotas

