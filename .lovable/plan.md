

# Diagnóstico: Emails não importados

## Problema identificado

O sistema usa o comando IMAP `SEARCH UNSEEN` quando se clica em "Novos e-mails". Isto significa que **apenas emails não lidos** no servidor de email são importados. Se os emails do Luis Magro (ou outros) já foram abertos/lidos no cliente de email (webmail, Outlook, etc.), o IMAP marca-os como "Seen" e o sistema ignora-os.

Há também um segundo problema: o `max_emails` para o modo normal está limitado a 20 por lote, e para `fetch_recent` está limitado a 50, mas o `maxEmails` no servidor está capped a 10 (`Math.min(Number(body.max_emails), 10)`), o que significa que mesmo que o frontend peça 20 ou 50, o servidor só processa 10 de cada vez.

## Plano de correção

### 1. Aumentar o limite de batch no servidor
No `fetch-inbound-emails/index.ts`, linha ~899, o cap de `maxEmails` está em 10. Aumentar para 50 para permitir lotes maiores e processar mais emails por ciclo.

### 2. Adicionar busca por data como fallback
Quando `SEARCH UNSEEN` não retorna resultados, adicionar um fallback com `SEARCH SINCE <data>` (últimos 7 dias) para capturar emails que já foram lidos mas ainda não foram processados pelo sistema. O sistema já tem a lógica de deduplicação (fingerprint + content comparison), por isso emails já processados serão ignorados automaticamente.

### 3. Melhorar o método `searchUnseen` com fallback
Na classe `ImapClient`, adicionar um método `searchSince(date)` e usá-lo como fallback quando `searchUnseen` retorna vazio.

### Alterações técnicas

**Ficheiro**: `supabase/functions/fetch-inbound-emails/index.ts`

1. Adicionar método `searchSince(daysAgo)` à classe `ImapClient` que executa `SEARCH SINCE <date>`.
2. Na função `processEmails`, quando `fetchRecent = false` e `searchUnseen()` retorna vazio, fazer fallback para `searchSince(7)` (últimos 7 dias).
3. Aumentar o cap de `maxEmails` de 10 para 50.

Estas alterações garantem que emails já lidos no webmail mas não processados pelo sistema serão encontrados e importados, sem duplicar os que já existem graças à deduplicação existente.

