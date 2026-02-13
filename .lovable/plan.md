

# Envio de Emails via SMTP (sem Resend)

## Resumo
Substituir o serviço Resend pelo envio direto via SMTP, usando uma biblioteca SMTP compatível com Deno nas funções do backend. Isto permite enviar emails diretamente a partir do teu servidor de email (ex: o SMTP do teu hosting para `upmoveis.pt`).

## O que vais precisar
Antes de implementar, vais precisar dos dados SMTP do teu provedor de email:
- **Host SMTP** (ex: `smtp.upmoveis.pt`, `mail.upmoveis.pt`, ou do teu hosting)
- **Porta** (normalmente 465 para SSL ou 587 para TLS)
- **Utilizador** (ex: `noreply@upmoveis.pt`)
- **Password** do email

## Alteracoes Tecnicas

### 1. Configurar segredos (secrets)
Guardar de forma segura as credenciais SMTP:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`

### 2. Atualizar `send-ticket-email/index.ts`
- Remover a chamada ao Resend API
- Usar a biblioteca `denomailer` (compativel com Deno) para enviar via SMTP
- Usar as credenciais SMTP dos secrets

### 3. Atualizar `create-client-account/index.ts`
- Mesma alteracao: substituir Resend por SMTP com `denomailer`

### 4. Atualizar `inbound-email/index.ts` (se aplicavel)
- Verificar se esta funcao tambem usa Resend e atualizar

### 5. Remover dependencia do Resend
- O secret `RESEND_API_KEY` deixa de ser necessario

## Exemplo de codigo SMTP (denomailer)
```text
import { SmtpClient } from "https://deno.land/x/denomailer/mod.ts";

const client = new SmtpClient();
await client.connectTLS({
  hostname: Deno.env.get("SMTP_HOST"),
  port: Number(Deno.env.get("SMTP_PORT")),
  username: Deno.env.get("SMTP_USER"),
  password: Deno.env.get("SMTP_PASS"),
});

await client.send({
  from: "Apoio ao Cliente <noreply@upmoveis.pt>",
  to: clientEmail,
  subject: subject,
  content: body,    // texto simples
  html: body,       // HTML
});

await client.close();
```

## Sequencia
1. Pedir-te os dados SMTP e guardar como secrets
2. Atualizar as duas funcoes (`send-ticket-email` e `create-client-account`)
3. Testar o envio de email

