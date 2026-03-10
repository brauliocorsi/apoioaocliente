

# Melhorar formatação dos emails — Profissional e leve

## Situação actual

- **reply-email-ticket**: Envia texto puro simples com `\n\n--\nUP Móveis - Apoio ao Cliente`
- **send-ticket-email**: Envia o `body_html` do template como plain text (strip HTML), sem assinatura adicional
- Ambas as funções passam o mesmo conteúdo tanto em `content` como em `html`, ou seja, não há formatação HTML real

## O que vai mudar

Adicionar um HTML **leve e minimalista** (sem CSS complexo, sem imagens, sem tabelas elaboradas) que:
- Mantém boa entregabilidade (evita filtros de spam)
- Apresenta o conteúdo de forma limpa e profissional
- Inclui assinatura da empresa no final com separador visual

### Formato do email (HTML leve)

```text
┌─────────────────────────────────┐
│                                 │
│  Olá [Nome],                    │
│                                 │
│  [Conteúdo da mensagem]         │
│                                 │
│  ─────────────────────────────  │
│                                 │
│  UP Móveis                      │
│  Apoio ao Cliente               │
│  📧 apoioaocliente@upmoveis.pt  │
│  🌐 www.upmoveis.pt             │
│                                 │
│  Para responder, basta          │
│  responder a este email.        │
│                                 │
└─────────────────────────────────┘
```

## Alterações técnicas

### 1. reply-email-ticket/index.ts
- Criar função `buildEmailHtml(clientName, content)` que gera HTML leve com:
  - Inline styles mínimos (font-family, line-height, color)
  - Separador `<hr>` simples antes da assinatura
  - Assinatura com nome da empresa, departamento, email e website
- Manter `plainText` como fallback (campo `content`)
- Passar HTML formatado no campo `html`

### 2. send-ticket-email/index.ts
- Criar função similar `wrapEmailHtml(body)` que envolve o corpo do template numa estrutura leve com a mesma assinatura
- Enviar o HTML no campo `html` e manter o plain text no campo `content`

### 3. Detalhes do HTML
- Sem tabelas complexas, sem CSS externo, sem `<style>` blocks
- Apenas inline styles básicos: `font-family: Arial, sans-serif; font-size: 14px; color: #333;`
- Assinatura com cor mais suave (`#666`)
- `<hr>` simples como separador
- Compatível com todos os clientes de email

