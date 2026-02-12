

# Resolucao Formal e Cancelamento no Ticket

## Objetivo
Adicionar um campo oficial de **Resolucao / Decisao** no detalhe do ticket (lado do agente), onde se regista formalmente a decisao tomada (resolucao ou cancelamento), com o motivo/justificacao. Este campo serve como resposta oficial ao cliente.

## Alteracoes na Base de Dados

Adicionar 3 novas colunas na tabela `tickets`:

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| `resolution_type` | `text` (nullable) | Tipo de decisao: `resolved`, `cancelled`, ou `null` (sem decisao) |
| `resolution_reason` | `text` (nullable) | Motivo/justificacao formal da decisao |
| `resolution_at` | `timestamptz` (nullable) | Data/hora em que a decisao foi registada |
| `resolution_by` | `uuid` (nullable) | Agente que registou a decisao |

Nao e necessario criar nova tabela nem alterar RLS -- a tabela `tickets` ja tem politicas de UPDATE para agentes autenticados.

## Alteracoes no Frontend

### 1. Novo componente: `ResolutionCard.tsx`
Card dedicado no detalhe do ticket com:
- **Modo de visualizacao**: mostra o tipo de decisao (Resolvido / Cancelado), o motivo, quem decidiu e quando
- **Modo de edicao** (botao "Registar Decisao"): 
  - Select para escolher entre "Resolucao" ou "Cancelamento"
  - Textarea para o motivo/justificacao (obrigatorio)
  - Botao de confirmar
- Destaque visual: fundo verde para resolucao, fundo vermelho para cancelamento
- Possibilidade de editar a decisao ja registada

### 2. Integracao no `TicketDetail.tsx`
- Colocar o `ResolutionCard` na coluna principal (entre o SLA e a descricao), visivel com destaque
- Ao registar a decisao, criar tambem um evento na timeline (`ticket_events`) para historico

### 3. Visibilidade no Portal do Cliente (`PortalTicketDetail.tsx`)
- Mostrar a decisao formal ao cliente (apenas leitura) quando existir, com o motivo

## Secao Tecnica

```text
tickets table (alteracoes):
+--------------------+-------------+----------+
| resolution_type    | text        | nullable |
| resolution_reason  | text        | nullable |
| resolution_at      | timestamptz | nullable |
| resolution_by      | uuid        | nullable |
+--------------------+-------------+----------+
```

Migration SQL:
- `ALTER TABLE public.tickets ADD COLUMN resolution_type text;`
- `ALTER TABLE public.tickets ADD COLUMN resolution_reason text;`
- `ALTER TABLE public.tickets ADD COLUMN resolution_at timestamptz;`
- `ALTER TABLE public.tickets ADD COLUMN resolution_by uuid;`

Ficheiros a criar/editar:
- **Criar**: `src/components/ticket/ResolutionCard.tsx`
- **Editar**: `src/pages/TicketDetail.tsx` (adicionar ResolutionCard)
- **Editar**: `src/pages/portal/PortalTicketDetail.tsx` (mostrar decisao ao cliente)
- **Migration**: nova migracao para as 4 colunas

