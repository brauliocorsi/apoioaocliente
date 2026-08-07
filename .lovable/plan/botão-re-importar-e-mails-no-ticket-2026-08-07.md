# Botão "Re-importar e-mails" no ticket

## Situação atual (verificada)

- A re-importação já existe, mas **só na página de ticket de e-mail** (`/emails/:id`): botão "Re-importar emails" que chama a ação `refetch_ticket` e depois descarrega cada anexo pela função `download-attachment`.
- A página principal do ticket (`/tickets/:id`) **não tem** esse botão, apesar de já saber se o ticket tem thread de e-mail (`hasEmailThread`) e de já listar mensagens e anexos.
- A ação `refetch_ticket` procura no IMAP todos os e-mails do `client_email` do ticket, adiciona mensagens em falta, atualiza a descrição quando está vazia e devolve a lista de anexos ainda não importados.

## O que fazer

### 1. Extrair a lógica para um sítio partilhado

Criar um hook `useTicketRefetch(ticketId, clientEmail)` que faz exatamente o que hoje está embutido na página de e-mail:
1. chama `refetch_ticket` (mensagens + conteúdo + inventário de anexos);
2. percorre os anexos em falta e descarrega cada um via `download-attachment`;
3. devolve estado de progresso e um resumo do resultado.

A página de e-mail passa a usar o hook (mesmo comportamento, sem duplicação de código).

### 2. Botão no ticket normal

No cabeçalho de `/tickets/:id`, quando o ticket tem e-mail de cliente ou thread de e-mail, mostrar o botão **"Re-importar e-mails"** com ícone de refrescar.

Durante a operação:
- botão desativado com ícone a rodar e texto de progresso ("A verificar e-mails…", "A importar anexo 2 de 5…");
- no fim, aviso com o resumo: mensagens adicionadas, anexos importados, anexos falhados, ou "nada de novo encontrado";
- a página recarrega mensagens e anexos automaticamente.

### 3. Validação do que foi recebido

Para o agente conseguir confirmar que recebeu tudo:
- o resumo final aparece também como um cartão discreto por baixo do cabeçalho enquanto estiver na página (lista dos ficheiros importados nesta execução);
- anexos que falharem são listados pelo nome com botão "Tentar novamente" individual;
- registo do evento na timeline do ticket ("Re-importação de e-mail: X mensagens, Y anexos") para ficar histórico de quem validou e quando.

### 4. Segurança e limites

- A ação continua a exigir agente autenticado (`agent_id`) e é lida do lado do servidor.
- Mantêm-se os limites atuais: anexos até 10 MB por ficheiro e download individual para não exceder o tempo de CPU da função.

## Notas técnicas

- Novo `src/hooks/useTicketRefetch.ts` com a sequência `fetch-inbound-emails` (`action: "refetch_ticket"`) → `download-attachment` por anexo, expondo `{ run, running, progress, lastResult }`.
- `src/pages/TicketDetail.tsx`: botão no cabeçalho + cartão de resumo, condicionado a `ticket.client_email || hasEmailThread`; chamar `fetchData()` no fim.
- `src/pages/EmailTicketDetail.tsx`: substituir `refetchEmails` local pelo hook.
- Inserção de um `ticket_events` do tipo nota do sistema com o resumo da re-importação.
- Sem alterações de base de dados nem nas Edge Functions existentes.
