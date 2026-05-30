# Fase 10.2 — Auditoria real de chamadas

Objetivo: dar à Alessandra evidência operacional sobre chamadas atendidas/não atendidas, reconciliação Reg. Ligações ↔ MicroSIP, e acesso ao CDR detalhado — sem perder dados nem julgar funcionários.

## 1. Migration aditiva (sem destruição)

Nova migration `2026053xxxx_phase_10_2_call_audit.sql`:

- `ALTER TABLE phone_calls ADD COLUMN IF NOT EXISTS call_status TEXT` — valores normalizados: `answered | missed | no_answer | busy | failed | cancelled | unknown`. Default NULL (histórico preservado).
- `ALTER TABLE phone_calls ADD COLUMN IF NOT EXISTS cdr_raw JSONB` — payload bruto do CDR (apenas para chamadas `letscall`). Apenas supervisor lê via RLS na UI.
- `ALTER TABLE phone_calls ADD COLUMN IF NOT EXISTS cdr_answered_at TIMESTAMPTZ`, `cdr_ended_at TIMESTAMPTZ`, `cdr_src TEXT`, `cdr_dst TEXT`.
- Substituir `phone_calls_reconciliation` (CREATE OR REPLACE VIEW) para acrescentar:
  - `match_count INTEGER` (quantos candidatos no MicroSIP);
  - status `ambiguous` quando `match_count > 1`;
  - `matched_call_id UUID` (id do candidato único, se houver).
- Sem DROP, sem DELETE, sem TRUNCATE. Tudo `IF NOT EXISTS` / `OR REPLACE`.

## 2. Edge function `letscall-sync-cdr`

- Mapear `cdr.disposition` (ou equivalente) → `call_status` normalizado.
- Gravar `cdr_raw` (JSON completo), `cdr_answered_at`, `cdr_ended_at`, `cdr_src`, `cdr_dst`.
- Manter `attended` (booleano) para retrocompatibilidade.
- Nenhuma alteração ao header `x-cron-secret` já existente.

## 3. Painel Operacional — `CallsPanel.tsx`

Acrescentar à secção "Ligações / Ramais":

- Cards globais: Totais, Atendidas, Não atendidas, Feitas, Recebidas, Taxa de atendimento, Duração média.
- Por ramal (200/201/202 já mapeados para 400/401/402): contadores próprios + última chamada + chamadas sem registo + registos sem CDR.
- Duas listas colapsáveis:
  - "Chamadas MicroSIP sem registo no sistema" (linhas de `phone_calls_reconciliation` com `reconciliation_status='not_registered_in_system'`).
  - "Registos sem chamada MicroSIP" (`not_found_in_microsip`).
- Ramal sem atividade → mostra zero, não quebra.
- Status `unknown` ≠ offline (texto literal "Estado desconhecido").

## 4. Reg. Ligações — `PhoneCallList.tsx` / `PhoneCalls.tsx`

- Em cada linha, badge de reconciliação: `Confirmada no MicroSIP` / `Sem chamada encontrada` / `Chamada ambígua` / `Não sincronizada` (chamadas `letscall` próprias).
- Botão "Ver CDR MicroSIP" abre modal novo `CdrDetailDialog`.

## 5. `CdrDetailDialog.tsx` (novo)

- Se houver match único: mostra campos do CDR (ramal, direção, origem, destino, telefone normalizado, início, atendimento, fim, duração, status, agente).
- Raw payload JSON em `<Collapsible>` visível **apenas para supervisor** (`has_role`).
- Se sem match: mensagem clara.
- Se ambíguo: lista candidatos, sem auto-escolher.

## 6. Ticket Timeline — `TicketTimeline.tsx`

- Para `phone_calls` ligadas ao ticket, etiqueta extra: "Confirmada no MicroSIP" / "Sem CDR MicroSIP" conforme view.
- Chamadas não relacionadas ao ticket continuam fora.
- Portal cliente continua sem ver CDR.

## 7. Segurança

- Token Let's Call permanece só em secrets (já está).
- `cdr_raw` lido apenas pela UI quando `useAuth().isSupervisor`.
- RLS atual de `phone_calls` (apenas `is_authenticated_agent()`) cobre o acesso; portal cliente já bloqueado.
- Falha de API: painel continua a abrir (try/catch + fallback "sem dados").

## 8. Documentação

- Atualizar `docs/system-map.md` com secção "Fase 10.2 — Auditoria real de chamadas": regras de atendida/não atendida, janela ±15min, comportamento do botão CDR, limitações (DND/online não suportados pela API), como interpretar os indicadores.

## Fora deste plano (próxima fase)

- Gravação/áudio, discador, ações destrutivas, score automático de funcionário, criação backend "Registar ligação" a partir do painel (deixa apenas contexto/linha).

## Validação

Checagem manual pós-deploy dos 12 cenários listados; nenhuma migration destrutiva.

## Detalhes técnicos

```text
phone_calls (adições)
├── call_status TEXT
├── cdr_raw JSONB
├── cdr_answered_at TIMESTAMPTZ
├── cdr_ended_at TIMESTAMPTZ
├── cdr_src TEXT
└── cdr_dst TEXT

phone_calls_reconciliation (replace)
├── + match_count INTEGER
├── + matched_call_id UUID
└── status: confirmed | ambiguous | not_found_in_microsip | not_registered_in_system
```

Após aprovação, executo migration + edits em ~7 ficheiros.
