

# Melhorias ao Sistema de Tickets — UP Moveis

## Resumo das Alteracoes

### 1. Macros integradas nas respostas dos tickets
Atualmente as macros estao numa pagina separada. Vamos adicionar um seletor de macros diretamente na area de resposta do ticket, permitindo inserir um modelo pre-escrito, preencher as variaveis automaticamente com os dados do ticket (nome, encomenda, data entrega) e enviar como nota/resposta.

### 2. Campo de Numero de Assistencia (OS)
Adicionar um novo campo `service_number` (texto) na tabela `tickets` para registar o numero de Ordem de Servico / Assistencia tecnica vinculada. Este campo sera editavel diretamente no detalhe do ticket.

### 3. Edicao de campos do ticket
Permitir editar campos do ticket diretamente na pagina de detalhe: categoria, subcategoria, prioridade, dados do cliente, datas, e o novo campo de assistencia. Atualmente so o estado e editavel.

### 4. Etiquetas (Tags) editaveis nos tickets
As tags ja existem na base de dados (50 tags predefinidas), mas nao ha forma de as adicionar/remover no detalhe do ticket. Vamos adicionar um seletor de tags com as 50 etiquetas organizadas por grupo.

### 5. Atribuicao de tickets a agentes
Adicionar um seletor de agente no ticket para atribuir a um membro da equipa. O campo `assigned_to` ja existe na tabela.

### 6. Mostrar nomes das categorias em vez de codigos
Atualmente mostra "A" em vez de "Entrega e Montagem". Corrigir na listagem e no detalhe para mostrar o nome completo.

### 7. Estados dinamicos (nota)
A criacao de estados dinamicos requer uma mudanca significativa na arquitetura (o estado atual e um enum fixo na base de dados). Proponho implementar isto numa fase posterior, pois envolve recriar o enum como tabela, atualizar o Kanban, os filtros e toda a logica de SLA.

### 8. Integracao com email (nota)
A ligacao ao email da empresa para importar emails de clientes automaticamente e uma funcionalidade complexa que requer configuracao de um servidor de email (IMAP/SMTP) ou integracao com um servico como Gmail API / Microsoft Graph. Proponho implementar isto como passo seguinte apos estas melhorias base.

---

## Detalhes Tecnicos

### Alteracoes na Base de Dados
- Adicionar coluna `service_number TEXT` a tabela `tickets`

### Ficheiros a Criar/Modificar

**`src/pages/TicketDetail.tsx`** (modificar significativamente):
- Adicionar modo de edicao inline para campos: categoria, subcategoria, prioridade, cliente, datas, numero de assistencia
- Adicionar seletor de macros na area de resposta (dropdown que insere o conteudo da macro no campo de nota, com variaveis preenchidas)
- Adicionar seletor de tags (multi-select com as 50 tags agrupadas)
- Adicionar seletor de agente atribuido (dropdown com lista de agentes)
- Mostrar nomes de categorias em vez de codigos

**`src/pages/Tickets.tsx`** (modificar):
- Mostrar nome da categoria em vez do codigo na listagem
- Mostrar agente atribuido

**`src/components/KanbanBoard.tsx`** (modificar):
- Mostrar nome da categoria em vez do codigo nos cards

**`src/pages/TicketNew.tsx`** (modificar):
- Adicionar campo de numero de assistencia

### Logica de preenchimento de macros
Ao selecionar uma macro, o sistema substitui automaticamente:
- `{nome_cliente}` pelo nome do cliente do ticket
- `{n_encomenda}` pelo numero de encomenda
- `{data_entrega}` pela data de entrega
- Outras variaveis conforme disponivel no ticket

