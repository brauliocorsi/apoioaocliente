

# Modulo de Controle de Ligacoes Telefonicas

## Visao geral

Criar um modulo completo para registrar, acompanhar e gerir ligacoes telefonicas recebidas, com controle de status, prioridades e sistema de lembretes para retorno ao cliente. O modulo seguira os mesmos padroes visuais e tecnicos ja utilizados no projeto (cards, badges, filtros, toasts, prioridades P1/P2/P3).

---

## Estrutura da solucao

### Fase 1 -- Base de dados (2 tabelas + RLS + trigger)

**Tabela `phone_calls`**

| Coluna | Tipo | Default | Descricao |
|---|---|---|---|
| id | uuid PK | gen_random_uuid() | Identificador unico |
| client_name | text NOT NULL | -- | Nome do cliente |
| client_phone | text NOT NULL | -- | Contato telefonico |
| invoice_number | text | NULL | Numero da nota |
| subject | text NOT NULL | -- | Assunto da ligacao |
| notes | text | NULL | Observacoes livres |
| status | text NOT NULL | 'pendente' | pendente / em_andamento / concluido / cancelado |
| priority | text NOT NULL | 'P2' | P1 / P2 / P3 |
| created_by | uuid NOT NULL | auth.uid() | Agente que registrou |
| assigned_to | uuid | NULL | Agente responsavel |
| ticket_id | uuid | NULL | Vincular a ticket existente (opcional) |
| created_at | timestamptz | now() | Data de criacao |
| updated_at | timestamptz | now() | Ultima atualizacao (via trigger) |

**Tabela `phone_call_reminders`**

| Coluna | Tipo | Default | Descricao |
|---|---|---|---|
| id | uuid PK | gen_random_uuid() | Identificador unico |
| phone_call_id | uuid NOT NULL FK | -- | Referencia a ligacao |
| remind_at | timestamptz NOT NULL | -- | Data/hora do lembrete |
| message | text NOT NULL | -- | Descricao do lembrete |
| is_completed | boolean | false | Lembrete concluido? |
| created_by | uuid NOT NULL | auth.uid() | Quem criou |
| created_at | timestamptz | now() | Data de criacao |

**RLS**: Ambas as tabelas acessiveis apenas por agentes autenticados (usando `is_authenticated_agent()`), com SELECT, INSERT, UPDATE e DELETE.

**Trigger**: Reutilizar `update_updated_at()` na tabela `phone_calls` para atualizar `updated_at` automaticamente.

---

### Fase 2 -- Pagina principal `/phone-calls`

Uma pagina com 3 secoes principais:

**2.1 -- Barra de resumo (topo)**
4 cards com contadores:
- Total de ligacoes (hoje)
- Pendentes
- Em andamento
- Concluidas

**2.2 -- Formulario de registo rapido**
Formulario inline (card expansivel) com os campos:
- Nome do Cliente (obrigatorio)
- Contato/Telefone (obrigatorio)
- Numero da Nota (opcional)
- Assunto (obrigatorio)
- Prioridade (select: P1/P2/P3, default P2)

Ao submeter, a ligacao e criada com status "pendente" e aparece na lista.

**2.3 -- Lista de ligacoes com filtros**
Tabela/lista com:
- Filtros por status (Todos / Pendente / Em andamento / Concluido / Cancelado)
- Filtro por prioridade (Todas / P1 / P2 / P3)
- Campo de pesquisa (nome, telefone, nota, assunto)
- Cada linha mostra: nome, contato, nota, assunto, prioridade (badge colorido), status (badge), indicador de lembretes pendentes (icone de sino com contador), data de criacao
- Clicar numa linha abre o dialog de detalhes

**2.4 -- Dialog de detalhes da ligacao**
Ao clicar numa ligacao, abre um dialog com:
- Dados completos da ligacao (editaveis: status, prioridade, notas)
- Secao de lembretes:
  - Formulario para adicionar lembrete (data/hora + mensagem)
  - Lista de lembretes existentes ordenados por data
  - Botao para marcar como concluido (checkbox)
  - Lembretes proximos (menos de 1 hora) destacados em amarelo
  - Lembretes concluidos com opacidade reduzida e riscado
- Botao para vincular a um ticket existente (opcional)

---

### Fase 3 -- Indicador de lembretes no Dashboard

Adicionar ao Dashboard um pequeno card "Lembretes Proximos" que mostra os lembretes pendentes com `remind_at` na proxima hora, com link direto para a ligacao.

---

### Fase 4 -- Navegacao

- Adicionar "Ligacoes" ao sidebar com icone `Phone` (entre Tickets e Macros)
- Registar rota `/phone-calls` no `App.tsx` dentro do layout autenticado

---

## Ficheiros a criar e editar

| Ficheiro | Acao | Descricao |
|---|---|---|
| Migracao SQL | Criar | Tabelas, RLS, trigger |
| `src/pages/PhoneCalls.tsx` | Criar | Pagina principal com resumo, formulario, lista |
| `src/components/phone/PhoneCallForm.tsx` | Criar | Formulario de registo rapido |
| `src/components/phone/PhoneCallList.tsx` | Criar | Lista filtrada de ligacoes |
| `src/components/phone/PhoneCallDetailDialog.tsx` | Criar | Dialog com detalhes + lembretes |
| `src/components/phone/ReminderForm.tsx` | Criar | Formulario de lembrete (data/hora + mensagem) |
| `src/components/phone/ReminderList.tsx` | Criar | Lista de lembretes com toggle concluido |
| `src/components/AppSidebar.tsx` | Editar | Adicionar item "Ligacoes" ao menu |
| `src/App.tsx` | Editar | Adicionar rota /phone-calls |
| `src/pages/Dashboard.tsx` | Editar | Adicionar card "Lembretes Proximos" |

---

## Detalhes tecnicos

### Estados das ligacoes
- `pendente` -- Registada, aguarda tratamento
- `em_andamento` -- Em curso
- `concluido` -- Resolvida/retorno feito
- `cancelado` -- Cancelada

### Prioridades
Reutilizar o componente `PriorityFlag` ja existente (P1 vermelho, P2 amarelo, P3 cinza).

### Lembretes -- logica de destaque
- `remind_at` dentro de 1 hora e `is_completed = false` --> badge amarelo de aviso
- `remind_at` ja passou e `is_completed = false` --> badge vermelho (atrasado)
- `is_completed = true` --> texto riscado, opacidade 50%

### Consulta de lembretes proximos (Dashboard)
```text
SELECT r.*, pc.client_name, pc.client_phone, pc.subject
FROM phone_call_reminders r
JOIN phone_calls pc ON pc.id = r.phone_call_id
WHERE r.is_completed = false
  AND r.remind_at <= now() + interval '1 hour'
ORDER BY r.remind_at ASC
LIMIT 5
```

### Padrao de dados
Seguir o mesmo padrao do projeto: queries diretas com `supabase.from()`, estados locais com `useState`, sem React Query para manter consistencia com as paginas existentes (Tickets, Dashboard).

