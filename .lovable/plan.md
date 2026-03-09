

## Plan: Integrar Resend como opção de envio de emails

### O que muda para o utilizador
Uma nova secção "Resend (Opcional)" aparece nas configurações de Email SMTP, com um toggle para ativar/desativar. Quando ativado, todos os emails do sistema passam a ser enviados pela API do Resend em vez do SMTP direto. O `RESEND_API_KEY` já está configurado como secret.

### Alterações

**1. UI - SmtpSettingsTab.tsx**
- Adicionar um card "Resend" com:
  - Switch para ativar/desativar (salva `resend_enabled = "true"/"false"` em `system_settings`)
  - Campo para o email remetente Resend (`resend_from_email`, ex: `noreply@upmoveis.pt`)
- Carregar/guardar as novas keys `resend_enabled` e `resend_from_email` junto com as restantes settings

**2. Edge Functions - Criar helper partilhado de envio**
Nas 3 edge functions que enviam email (`send-ticket-email`, `reply-email-ticket`, `create-client-account`), adicionar lógica:
- Ler `resend_enabled` e `resend_from_email` de `system_settings`
- Se `resend_enabled === "true"`, enviar via `fetch("https://api.resend.com/emails", ...)` usando o secret `RESEND_API_KEY`
- Se não, manter o fluxo SMTP actual com `denomailer`

**3. Edge Function `test-smtp`**
- Quando Resend está ativo, o teste de envio de email usa a API Resend em vez do SMTP

### Detalhes técnicos

Envio via Resend (em cada edge function):
```typescript
async function sendViaResend(from: string, to: string, subject: string, text: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!res.ok) throw new Error(await res.text());
}
```

Settings lidas de `system_settings`:
- `resend_enabled` (default `"false"`)
- `resend_from_email` (default `"noreply@upmoveis.pt"`)

Não é necessária migração de base de dados -- os valores são inseridos via upsert no `system_settings` existente.

