

# Corrigir Teste de Conexão SMTP

## Problema
A função `test-smtp` cria um `SMTPClient` e chama `client.close()` imediatamente para testar a conexão. Mas o `denomailer` só estabelece a conexão TCP quando se envia um email (`client.send()`). Como nunca houve conexão real, `close()` falha com `"Cannot read properties of undefined (reading 'close')"`.

## Dados SMTP do utilizador (da imagem)
- Host: `mail.upmoveis.pt`
- Porta: `465` (SSL)
- Utilizador: `encomendas@upmoveis.pt`
- Password: fornecida

## Solucao

### Ficheiro: `supabase/functions/test-smtp/index.ts`

Substituir o teste de conexao que usa `client.close()` por um teste real usando `Deno.connect()` com TLS nativo do Deno para verificar se o servidor SMTP responde. Isto valida:
1. Que o hostname resolve corretamente
2. Que a porta esta aberta e aceita conexoes TLS
3. Que o servidor responde com um banner SMTP (codigo 220)

Fluxo do teste de conexao (sem envio):
```text
+-------------------+     +------------------+     +----------------+
| Deno.connectTls() | --> | Ler banner SMTP  | --> | Verificar 220  |
| host:465 (SSL)    |     | (resposta server)|     | = Conexao OK   |
+-------------------+     +------------------+     +----------------+
```

Para porta 587 (STARTTLS), usar `Deno.connect()` sem TLS para ler o banner.

O fluxo de envio de email de teste (com `send_to`) continua a usar o `denomailer` normalmente, pois ai a conexao e estabelecida pelo `send()`. Adicionar try/catch robusto no `client.close()` para evitar crashes.

### Alteracoes especificas

1. **Teste de conexao** (quando nao ha `send_to`):
   - Usar `Deno.connectTls()` (porta 465) ou `Deno.connect()` (porta 587/25) para abrir uma conexao TCP ao servidor
   - Ler os primeiros bytes da resposta e verificar se comeca com "220" (banner SMTP padrao)
   - Fechar a conexao e retornar sucesso/falha
   - Timeout de 10 segundos para evitar bloqueio

2. **Envio de email de teste** (quando ha `send_to`):
   - Manter a logica atual com `denomailer`
   - Envolver `client.close()` em try/catch para evitar crash se a conexao falhar

3. **Tratamento de erros melhorado**:
   - Mensagens em portugues mais descritivas (timeout, hostname nao encontrado, autenticacao falhada)
