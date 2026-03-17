

## Plano: Ativar Resend para todos os emails do sistema

### Contexto
- O domínio `upmoveis.pt` está verificado no Resend
- A `RESEND_API_KEY` já está configurada como secret
- O código das Edge Functions (`send-ticket-email`, `test-smtp`, `reply-email-ticket`) já suporta Resend — basta que `resend_enabled` esteja `"true"` na tabela `system_settings`
- A UI no painel de configurações SMTP já tem o toggle de Resend funcional

### O que fazer
Não é necessária nenhuma alteração de código. Basta ativar o Resend diretamente na interface:

1. Ir a **Configurações → Email SMTP**
2. Na secção **"Resend (Opcional)"**, ativar o switch **"Enviar emails via Resend"**
3. Confirmar que o email remetente é `noreply@upmoveis.pt`
4. Clicar **"Guardar Resend"**
5. Usar **"Enviar Email de Teste"** para confirmar que tudo funciona

Isto grava `resend_enabled = "true"` na tabela `system_settings`, e todas as Edge Functions já verificam este valor para rotear os envios pela API do Resend em vez do SMTP direto.

### Alternativa
Se preferir, posso ativar o valor diretamente na base de dados via migração SQL, sem precisar de ir à interface. Basta confirmar.

