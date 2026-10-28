# Criação de tickets por dados extraídos de e-mail

## Estado

Preparação de código, ainda não funcional: a ligação de administração da base de dados recusou consultas, criação de sessão de teste e a migração. Nenhuma tabela ou função da nova receção foi aplicada. A função HTTP não foi publicada neste trabalho. Não afirmar disponibilidade, idempotência validada na base de dados ou criação concluída.

Foi escolhida uma API HTTP autenticada, em vez de MCP, como primeiro transporte. Nenhum serviço de IA, OAuth ou novo fornecedor de autenticação foi ativado.

## Contrato

Função `create-ticket-from-email`, POST JSON. Autenticação por sessão de funcionário ativo, permissões `agent`/`supervisor` verificadas no servidor. Nunca fornecer chaves privilegiadas à IA. Consumidores externos precisam de um fluxo seguro de autenticação; não copiar tokens de sessões do navegador para configuração permanente.

Campos obrigatórios: `schema_version: 1`, `idempotency_key`, `client_name`, `order_number`, `subject`, `description`. Opcionais: `client_email`, `client_phone`, `category_id`, `priority` (P1/P2/P3; padrão P2), `source_message_id`. Campos desconhecidos são recusados. Limite de pedido 100 KB; descrição 60.000 caracteres. Sem anexos neste contrato, sem busca de URLs externas.

RPC planeado: `create_ticket_from_email_data(p_key text,p_payload jsonb)`. Uma transação guarda o pedido por funcionário e chave, bloqueia a linha, compara o JSON normalizado, cria o ticket com numeração e triggers existentes e regista a origem na timeline. Retry igual devolve os mesmos identificadores; dados divergentes devolvem conflito 409. Chave de ticket removido não permite recriação silenciosa.

Não reativar indiscriminadamente importação automática da caixa de entrada. Não criar contas, inventar contactos, enviar confirmações ou executar notificações externas.

## Para concluir quando a ligação estiver disponível

1. Ler esquema/triggers atuais de tickets, perfis e SLA; confirmar ausência de comunicação externa na inserção.
2. Aplicar migração aditiva da tabela de pedidos com grants/RLS e RPC. Manter autoria do funcionário, estado inicial oficial e regras atuais de SLA/atribuição.
3. Em base verdadeiramente isolada, testar auth, inatividade, retry concorrente, conteúdo divergente, número obrigatório, rollback e ticket removido; não criar/apagar tickets sintéticos na base real.
4. Publicar função após os testes. Validar recusa de acesso e leituras com autorização; só então documentar endereço acessível para consumidores.

## Verificação executada

Seis testes locais de validação de entrada aprovados. Não equivalem a testes de transação, autorização ou comunicação externa. Agendamento real dos alertas SLA e consulta real de vendas/OS permanecem por verificar devido à mesma indisponibilidade de acesso administrativo.