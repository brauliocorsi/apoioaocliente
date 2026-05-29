# Fase 10 — Painel de ligações MicroSIP/Let's Call

Indicadores operacionais por ramal, reconciliação CDR ↔ sistema, e integração na timeline do ticket. Tudo aditivo, sem perda de dados.

## 1. Base de dados (migração aditiva)

- `phone_calls`: adicionar coluna `extension TEXT` (derivada de `queueAgent`/`dst`/`src` no sync).
- Nova tabela `monitored_extensions`:
  - `extension INT PRIMARY KEY`, `label TEXT`, `assigned_profile_id UUID NULL`, `is_active BOOLEAN DEFAULT true`.
  - Seed: 200, 201, 202.
  - RLS: `SELECT` para agentes, `INSERT/UPDATE/DELETE` apenas supervisor.
- Nova tabela `microsip_extension_status`:
  - `extension INT PK`, `last_call_at TIMESTAMPTZ`, `last_direction TEXT`, `last_attended BOOLEAN`, `last_seen_source TEXT`, `updated_at`.
  - Atualizada pelo `letscall-sync-cdr` (upsert).
  - RLS: `SELECT` agentes; escrita só via service-role.
- Nova VIEW `phone_calls_reconciliation`:
  - Compara `phone_calls` (sistema) com chamadas vindas do CDR (`source = 'letscall'`) através de telefone normalizado + janela ±15 min.
  - Estados: `confirmed`, `not_found_in_microsip`, `not_registered_in_system`.
  - Acessível a agentes (security_invoker).

GRANTs explícitos em todas as tabelas novas (anon nunca, authenticated/service_role conforme política).

## 2. Edge function `letscall-sync-cdr` (reuso)

- Estender o parser de CDR para extrair `extension` (preferência: `queueAgent` → `dst` quando outbound interno → `src` quando inbound atendido por ramal).
- Após inserir/atualizar `phone_calls`, fazer `upsert` em `microsip_extension_status` com a chamada mais recente por ramal.
- Sem alterar o agendamento existente.

## 3. UI — Painel operacional (Alessandra)

Em `src/components/OperationalDashboard.tsx`, adicionar nova secção **"Ligações / Ramais"** (lazy, abaixo das secções atuais):

- KPIs (últimas 24h e 7 dias, com seletor):
  - Total de chamadas, Atendidas, Não atendidas, Outbound, Inbound.
- Tabela por ramal (200, 201, 202):
  - Ramal | Agente associado | Última chamada | Atendidas/Não atendidas | Atividade (badge "Ativo <5min" / "Inativo").
  - Nota: status DND/Online real não existe na API Let's Call → derivado por atividade recente (documentado na UI com tooltip).
- Listas acionáveis (collapsibles):
  - **Chamadas sem registo no sistema** (CDR sem `phone_calls` correspondente).
  - **Registos sem chamada confirmada** (`phone_calls` manuais sem CDR no intervalo).

## 4. Módulo Ligações

Em `src/components/phone/PhoneCalls.tsx` + `PhoneCallDetailDialog.tsx`:

- Badge "MicroSIP confirmado" / "Sem CDR" usando a view de reconciliação.
- Mostrar `extension` na linha/detalhe quando existir.

## 5. Timeline do ticket

Em `TicketDetail` (timeline existente), adicionar entradas para chamadas associadas (`phone_calls.ticket_id = ticket.id`) com: direção, ramal, duração, atendida/não atendida, link para o detalhe da chamada. Sem mexer no resto da timeline.

## 6. Segurança e privacidade

- Sem expor credenciais Let's Call no cliente (mantém-se em secrets).
- RLS restringe tudo a agentes/supervisores.
- Nenhum DROP/DELETE em migrações — apenas `ADD COLUMN`, `CREATE TABLE`, `CREATE VIEW`.

## Critérios de aceitação

- Painel mostra ramais 200/201/202 com atendidas/não atendidas.
- Atividade por ramal visível (proxy de online/DND, documentado).
- Reconciliação lista os dois lados (sistema vs MicroSIP).
- Módulo Ligações mostra badge de confirmação.
- Timeline do ticket mostra chamadas relacionadas.
- Nenhum dado existente perdido.

## Detalhes técnicos

```text
CDR (letscall-sync-cdr) ──► phone_calls (+ extension)
                       └──► microsip_extension_status (upsert)

phone_calls_reconciliation (VIEW):
  confirmed                 ← match telefone + |Δt| ≤ 15min
  not_registered_in_system  ← CDR sem phone_calls
  not_found_in_microsip     ← phone_calls (manual) sem CDR
```

Posso avançar para build mode e implementar?
