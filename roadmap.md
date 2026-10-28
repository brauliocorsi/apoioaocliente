# Roadmap

- [x] Simplificar navegação com foco no atendimento; retirar ligações da experiência principal preservando histórico
- [x] Adaptar navegação, filtros, lista/Kanban e área do cliente para Mobile First
- [ ] Verificar fluxo autenticado em computador/telemóvel — bloqueado: serviço de base de dados não permite criar sessão de teste
- [ ] Confirmar consulta real de encomendas/OS e agendamento de alertas de SLA — bloqueado: ligação administrativa da base de dados indisponível
- [ ] Ativar API autenticada e idempotente por IA — validação pronta; migração e testes transacionais bloqueados pela ligação da base de dados

- [x] Corrigir apresentação de mensagens/e-mails (parágrafos, listas e textos longos), sem alterar conteúdo guardado

- [x] Eliminar agentes/clientes sem erro, preservando histórico
- [x] Remover aviso duplicado de mensagem do cliente
- [x] Primeiros testes automáticos (nº de encomenda)
- [x] Registo de quem eliminou utilizadores
- [x] Menu agrupado (Visão Geral, Atendimento, Operação, Gestão, Administração)
- [ ] Integração WMS ativa — bloqueado: segredo partilhado, URL de fotos e endpoint no Contagem
- [ ] Dividir importação de e-mails em módulos — depende de testes de regressão com fontes de e-mail isoladas
- [ ] Separar TicketDetail em componentes menores — depende da verificação autenticada do fluxo atual
- Painel Operacional: armazém, fábrica, logística, loja — retirado do escopo pelo novo foco de atendimento
