

# Melhorias no Modulo de Ligacoes Telefonicas

## Resumo

Tres grandes melhorias: (1) busca automatica de clientes e tickets ao preencher o formulario, (2) visual mais profissional em todo o modulo, (3) lista de ligacoes em formato Kanban com drag-and-drop.

---

## 1. Formulario inteligente com busca automatica

### Comportamento atual
O formulario exige que o utilizador pesquise manualmente um ticket para vincular.

### Novo comportamento
- Ao digitar o **Nome do Cliente**, o sistema pesquisa automaticamente:
  - Tickets abertos com `client_name` igual/semelhante
  - Ligacoes anteriores do mesmo cliente
- Ao digitar o **Numero da Nota**, o sistema pesquisa:
  - Tickets com `order_number` igual ao numero digitado
- Se encontrar tickets correspondentes, mostra uma secao "Tickets encontrados" abaixo dos campos, com os tickets abertos que correspondem
- O utilizador pode clicar num ticket para vincular automaticamente
- Se nao vincular, o registo e criado sem vinculo (como hoje)

### Fluxo

```text
Utilizador digita nome do cliente
       |
       v
Pesquisa tickets WHERE client_name ILIKE '%nome%' AND status nao fechado
       |
       v
Utilizador digita numero da nota
       |
       v
Pesquisa tickets WHERE order_number = numero_nota
       |
       v
Combina resultados e mostra "Tickets sugeridos" automaticamente
       |
       v
Utilizador clica para vincular OU ignora e submete
```

---

## 2. Lista de Ligacoes em formato Kanban

### Comportamento atual
Lista simples de ligacoes com filtros por tabs.

### Novo comportamento
- 4 colunas Kanban: **Pendente**, **Em Andamento**, **Concluido**, **Cancelado**
- Cada card mostra: nome do cliente, assunto, prioridade (badge), telefone, indicador de lembrete (sino), numero da nota se existir
- **Drag-and-drop** para mover ligacoes entre colunas (muda o status automaticamente)
- Clicar num card abre o dialog de detalhes (como hoje)
- Manter a barra de pesquisa e filtro de prioridade no topo
- Reutilizar os mesmos padroes do `KanbanBoard.tsx` existente (DndContext, useDraggable, useDroppable)
- Header de cada coluna com contador de itens e cor distintiva

### Cores das colunas
- Pendente: amarelo/warning
- Em Andamento: azul/primary
- Concluido: verde/success
- Cancelado: cinza/muted

---

## 3. Melhorias visuais e profissionais

### Dashboard (cards de resumo)
- Adicionar subtitulo em cada card (ex: "ligacoes registadas hoje")
- Adicionar variacao percentual ou indicador contextual
- Melhorar espacamento e tipografia dos numeros
- Adicionar bordas coloridas no topo de cada card (como as colunas Kanban)

### Formulario
- Layout mais limpo com secoes bem separadas
- Campos obrigatorios com asterisco estilizado
- Botao "Registar" com icone e estilo primario mais destacado
- Botao de cancelar/limpar formulario
- Secao de "Tickets Sugeridos" com cards visuais (nao so texto)

### Dialog de detalhes
- Header com badge de status colorido ao lado do nome
- Secoes com titulos mais destacados e separadores visuais
- Botoes de acao (Guardar, Vincular) mais profissionais com icones

---

## Ficheiros a editar

| Ficheiro | Descricao |
|---|---|
| `src/components/phone/PhoneCallForm.tsx` | Reescrever com busca automatica por nome/nota, sugestoes de tickets, visual melhorado |
| `src/pages/PhoneCalls.tsx` | Substituir lista por Kanban, melhorar dashboard cards |
| `src/components/phone/PhoneCallList.tsx` | Remover (substituido pelo Kanban inline) |
| `src/components/phone/PhoneCallKanban.tsx` | **Novo** -- componente Kanban com 4 colunas e drag-and-drop |
| `src/components/phone/PhoneCallDetailDialog.tsx` | Melhorar visual com badges, icones e layout mais profissional |

---

## Detalhes tecnicos

### Busca automatica no formulario
- Debounce de 400ms nos campos `client_name` e `invoice_number`
- Query para `client_name`: `supabase.from("tickets").select(...).ilike("client_name", "%nome%").not("status", "in", "(fechados)")` -- busca tickets nao fechados
- Query para `invoice_number`: `supabase.from("tickets").select(...).eq("order_number", invoice_number)` -- correspondencia exata com numero de encomenda
- Combinar resultados sem duplicatas (por `id`)
- Mostrar secao "Tickets sugeridos" apenas quando ha resultados

### Kanban de ligacoes
- Usar `@dnd-kit/core` (ja instalado) com `useDraggable` e `useDroppable`
- 4 estados fixos (nao dinamicos como os tickets): pendente, em_andamento, concluido, cancelado
- Ao soltar numa coluna diferente, faz `UPDATE phone_calls SET status = novo_status WHERE id = call_id`
- Aplicar filtro de prioridade e pesquisa antes de agrupar nas colunas
- Scroll vertical dentro de cada coluna com `ScrollArea`

### Nenhuma alteracao de base de dados necessaria
Todas as colunas ja existem (`order_number` nos tickets, `client_name` em ambas as tabelas).

