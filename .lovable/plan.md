

## Plano: Tornar envio de email na mudança de estado configurável

### Problema actual
Quando um ticket é movido no Kanban (ou o estado é alterado no detalhe do ticket), o sistema envia automaticamente um email ao cliente. O utilizador quer que isto seja **opcional e controlável via Configurações**.

### Abordagem

**1. Nova configuração na base de dados (`system_settings`)**
- Adicionar uma entrada `notify_status_change_email` com valor `"false"` por defeito (desactivado)
- Usar a tabela `system_settings` já existente, sem necessidade de migração de schema

**2. Verificar a configuração antes de enviar email**

Nos 3 locais onde o email `status_changed` é disparado:
- `src/components/KanbanBoard.tsx` (linha 348-354) — Kanban de tickets
- `src/pages/TicketDetail.tsx` (linha 275-284) — Detalhe do ticket
- Manter `ResolutionCard.tsx` inalterado (usa template `resolution_decision`, não `status_changed`)

Lógica: antes de invocar `send-ticket-email`, consultar `system_settings` para verificar se `notify_status_change_email` está activo. Se não estiver, não envia.

**3. UI nas Configurações — novo toggle no tab SMTP/Email**
- Adicionar um Switch/toggle no `SmtpSettingsTab.tsx` com label: **"Enviar email ao cliente quando o estado do ticket muda"**
- Lê e grava na `system_settings` com key `notify_status_change_email`
- Por defeito: desactivado

### Ficheiros a alterar

| Ficheiro | Alteração |
|---|---|
| `src/components/KanbanBoard.tsx` | Verificar setting antes de enviar email |
| `src/pages/TicketDetail.tsx` | Verificar setting antes de enviar email |
| `src/components/settings/SmtpSettingsTab.tsx` | Adicionar toggle de configuração |

### Detalhes técnicos

- Criar helper reutilizável que verifica a setting:
```typescript
const { data } = await supabase
  .from("system_settings")
  .select("value")
  .eq("key", "notify_status_change_email")
  .single();
const shouldNotify = data?.value === "true";
```
- Inserir o valor inicial via migração SQL: `INSERT INTO system_settings (key, value) VALUES ('notify_status_change_email', 'false') ON CONFLICT (key) DO NOTHING;`

