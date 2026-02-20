
# SLA Dinâmico: Configuração Global, Por Status e Contador de Dias Restantes

## Situação Actual

O sistema já tem SLA configurado na tabela `sla_config` com prazos em minutos por categoria+prioridade. Contudo:

- A `sla_config` **não pode ser editada** pela UI (não existe ecrã de gestão)
- Os SLAs actuais estão em **minutos** (ex: resolução = 1440 min = 1 dia), quando o requisito é **30 dias**
- Cada status já tem `sla_minutes` configurável, mas sem feedback visual no Kanban do tempo restante nesse estágio
- Não existe contador destacado de "dias restantes para resolução total" no detalhe do ticket

## O Que Vai Ser Construído

### 1. Aba "SLA" nas Configurações (Settings → SLA)

Um novo tab dedicado em `SettingsPage.tsx` com duas secções:

**Secção A — SLA Global por Categoria + Prioridade**
Tabela editável onde supervisores definem, para cada par Categoria × Prioridade (P1/P2/P3), os prazos de:
- Primeira resposta (em dias/horas)
- Resolução total (em dias)

Os valores são guardados na tabela `sla_config` existente (em minutos, com conversão transparente).

**Secção B — SLA por Estado (Tempo Máximo no Estágio)**
Lista dos estados existentes com o campo `sla_minutes` editável (já existe na tabela, mas agora apresentado em horas com label clara). Mostra visualmente quais estados têm SLA definido e quais não têm.

### 2. Contador de Dias Restantes no Detalhe do Ticket

No componente `SlaIndicator.tsx` (que aparece no sidebar do ticket), adicionar um bloco de destaque no topo com:
- Contagem regressiva grande: **"X dias e Y horas restantes"** para resolução total
- Barra de progresso colorida (verde → amarelo → vermelho)
- Estado: se expirado, mostra "Expirado há X dias"
- Se SLA pausado, mostra "Pausado — Aguarda Cliente"

### 3. Badge de Tempo Restante no Kanban por Estágio

Em cada coluna do Kanban, abaixo do contador de tickets, mostrar discretamente quantos tickets estão com o SLA do estágio (`sla_stage_deadline_at`) expirado ou em risco nessa coluna.

Nos cartões do Kanban, o ícone SLA existente já mostra o SLA de resolução. Vamos garantir que quando `sla_stage_deadline_at` está activo, ele também é considerado no ícone.

## Ficheiros a Criar/Alterar

| Ficheiro | Acção |
|---|---|
| `src/components/settings/SlaConfigTab.tsx` | Criar — nova aba de configuração SLA |
| `src/pages/SettingsPage.tsx` | Editar — adicionar tab "SLA" |
| `src/components/ticket/SlaIndicator.tsx` | Editar — adicionar contador de dias em destaque |
| `src/components/KanbanBoard.tsx` | Editar — badge de alertas SLA por coluna |

## Detalhes Técnicos

### Nova Aba SLA — `SlaConfigTab.tsx`

Busca todas as categorias e cruza com `sla_config` para montar uma grelha editável:

```text
Categoria         | P1 - 1ªResp | P1 - Resolução | P2 - 1ªResp | P2 - Resolução | P3 - 1ªResp | P3 - Resolução
Entrega e Mont.   |   30 min    |    4 h         |   2 h       |    24 h        |   8 h       |    48 h
Garantia (3 anos) |   8 h       |    4.17 dias   |   24 h      |    8.33 dias   |   48 h      |    20 dias
...
```

Os valores são apresentados de forma legível (convertendo minutos → dias/horas). Ao guardar, convertem de volta para minutos via UPSERT na `sla_config`.

A actualização usa `UPSERT` (INSERT ... ON CONFLICT DO UPDATE) pois a tabela não tem RLS de INSERT/UPDATE habilitada para agentes — será necessária uma pequena migração para permitir que supervisores editem a `sla_config`.

### Migração Necessária

Adicionar políticas RLS à tabela `sla_config` para supervisores poderem INSERT/UPDATE:

```sql
CREATE POLICY "sla_config_insert" ON public.sla_config
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'supervisor'));

CREATE POLICY "sla_config_update" ON public.sla_config
  FOR UPDATE USING (has_role(auth.uid(), 'supervisor'));

CREATE POLICY "sla_config_delete" ON public.sla_config
  FOR DELETE USING (has_role(auth.uid(), 'supervisor'));
```

### Contador de Dias Restantes em Destaque

Em `SlaIndicator.tsx`, adicionar antes das barras existentes:

```text
┌─────────────────────────────────┐
│  ⏱ 28 dias e 14 horas           │
│  ████████████░░░░░░░ 62%         │
│  para resolução total            │
└─────────────────────────────────┘
```

Cálculo: usa a função `calcRemaining` já existente com `sla_resolution_at` + `sla_paused_total_seconds` + `sla_paused_at`.

### Kanban — Alertas por Coluna

No header de cada coluna, ao lado do badge de contagem de tickets, adicionar:
- Ícone 🔴 + número se houver tickets com SLA de estágio (`sla_stage_deadline_at`) expirado
- Ícone 🟡 + número se houver tickets em risco (< 25% do tempo restante)

Isto é calculado no frontend a partir dos dados dos tickets já carregados — sem queries adicionais.
