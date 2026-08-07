# Bloquear duplicados sem travar a receção de clientes

## Situação atual (verificada)

- A deduplicação é feita só em memória/aplicação: a função de importação carrega os `message_id` das últimas 48h de `email_threads` e `pending_emails` e compara com a impressão digital do e-mail.
- Não existe **nenhuma restrição única** na base de dados: `inbound_email_events`, `pending_emails` e `email_threads` só têm índices normais.
- Consequência medida hoje: 300 impressões digitais repetidas em `inbound_email_events` e 16 `message_id` repetidos em `pending_emails` (106 pendentes em aberto).
- Quando o `Message-ID` do e-mail falta, a impressão digital é gerada a partir de remetente + assunto + corpo — para cabeçalhos sem corpo isso dá o mesmo valor para e-mails diferentes com o mesmo assunto, o que é arriscado como chave única.

O princípio-guia: **duplicado = mesma mensagem de e-mail**, nunca "mesmo cliente" ou "mesmo assunto". Assim nada de clientes legítimos é bloqueado.

## O que fazer

### 1. Chave forte na base de dados (a rede de segurança)

- Criar uma coluna calculada de deduplicação `dedupe_key` = `message_id` quando existe; caso contrário `email_fingerprint`.
- Índice **único** em `inbound_email_events(dedupe_key)` apenas quando o `message_id` real existe (impressões digitais geradas ficam de fora do índice único, para não bloquear e-mails distintos por engano).
- Índice único em `pending_emails(message_id)` quando não nulo e o estado ainda é `pending`.
- Nas inserções passa a usar-se "inserir ou ignorar": se a chave já existe, o e-mail é marcado como duplicado em vez de rebentar a importação.

### 2. Deduplicação por conteúdo mais fiável (sem falsos positivos)

- Alargar a janela em memória de 48h para 7 dias, mas passar a consultar `inbound_email_events` (que tem o histórico completo) em vez de só `email_threads` + `pending_emails`.
- Quando não há `Message-ID`, exigir **duas** coincidências para considerar duplicado: mesmo remetente **e** mesmo corpo normalizado (sem citações), dentro de 7 dias. Só assunto igual nunca chega.
- A comparação de conteúdo já existente ao anexar a um ticket aberto passa a comparar o corpo limpo completo (hash) em vez dos primeiros 200 caracteres, que hoje marca como duplicado respostas curtas legítimas do tipo "Obrigado, e agora?".

### 3. Proteção contra corridas na criação manual

- No botão "Criar" da caixa de entrada, envolver a criação numa trava por evento (já existe o estado `processing`) e verificar a chave de deduplicação antes de inserir, para dois cliques rápidos não gerarem dois tickets.

### 4. Visibilidade em vez de silêncio

- Duplicados nunca são apagados: ficam com estado `duplicate` e a razão registada, e continuam visíveis num filtro "Duplicados" na caixa de entrada.
- Se um duplicado for afinal legítimo, o agente pode forçar a criação a partir do detalhe do evento (ação "Criar mesmo assim"), que ignora a chave de deduplicação.

### 5. Limpeza dos duplicados existentes

- Antes de aplicar os índices únicos, marcar as 300 impressões digitais repetidas mantendo o registo mais antigo de cada grupo e passando os restantes a `duplicate`; o mesmo para os 16 pendentes repetidos, preservando o que já tem ticket associado.

## Notas técnicas

- Migração: coluna gerada `dedupe_key`, índices únicos parciais, limpeza prévia dos duplicados atuais.
- `supabase/functions/fetch-inbound-emails/index.ts`: janela de dedupe a 7 dias sobre `inbound_email_events`, regra remetente+corpo, hash de corpo em vez de prefixo de 200 caracteres, inserção tolerante a conflito.
- `supabase/functions/handle-inbound-email-event-action/index.ts`: verificação da chave + trava antes de criar; suporte a `force: true`.
- `src/pages/InboundEmailEvents.tsx`: filtro "Duplicados" e ação "Criar mesmo assim".
