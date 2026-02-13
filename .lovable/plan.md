

# Enviar Email ao Mudar Estado no Kanban

## Problema
Ao arrastar um ticket no Kanban, o estado e atualizado na base de dados mas a funcao `send-ticket-email` nao e chamada. O email de notificacao so e enviado quando o estado muda pela pagina de detalhe do ticket.

## Solucao
Adicionar a chamada a `send-ticket-email` no `handleDragEnd` do `KanbanBoard.tsx`, replicando a mesma logica do `TicketDetail.tsx`.

## Detalhes tecnicos

### Ficheiro: `src/components/KanbanBoard.tsx`

Na funcao `handleDragEnd`, apos a atualizacao bem-sucedida do estado, adicionar:

1. Verificar se o ticket tem `client_user_id` ou `client_email` (para garantir que ha destinatario)
2. Chamar `supabase.functions.invoke("send-ticket-email", { body: { ticket_id, template_id: "status_changed" } })`
3. Nao bloquear o fluxo principal — o envio sera feito em background (sem `await` no fluxo critico, ou com try/catch silencioso)

A alteracao e apenas adicionar ~5 linhas dentro do bloco `else` (sucesso) do `handleDragEnd`, antes de `onTicketMoved?.()`.

