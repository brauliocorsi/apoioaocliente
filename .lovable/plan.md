
# Plano: Melhorar Visualizacao de Status no Portal + FAQs dos Termos e Condicoes

## 1. Melhorar Visualizacao do Status no Portal do Cliente

### Problema Atual
O status aparece apenas como um pequeno badge com texto. Falta contexto visual para o cliente entender o progresso do seu ticket.

### Solucao
- **Lista de Tickets (`PortalTickets.tsx`)**: Adicionar um indicador visual mais rico com icone de status (circulo colorido) e uma barra de progresso simplificada baseada na posicao do status no fluxo (Novo -> Em analise -> Aguarda -> Resolvido -> Encerrado).
- **Detalhe do Ticket (`PortalTicketDetail.tsx`)**: Adicionar uma timeline/stepper horizontal no topo que mostra todos os estados do fluxo, destacando o estado atual com cor e icone. O cliente ve claramente onde esta o seu ticket no processo.

### Componente de Progresso (Stepper)
Sera criado um componente `TicketStatusStepper` que:
- Mostra os estados principais do fluxo como etapas visuais
- Destaca o estado atual com a cor do status
- Marca estados anteriores como "concluidos"
- Usa icones para cada estado (circulo, lupa, relogio, check, arquivo)

## 2. Criar FAQs Baseadas nos Termos e Condicoes

### Abordagem
Inserir diretamente na tabela `faq_items` as perguntas frequentes baseadas nos 11 capitulos dos termos e condicoes fornecidos. Cada capitulo sera convertido numa ou mais FAQs com linguagem acessivel.

### FAQs a Criar (11 itens, um por capitulo)

1. **Quais sao as minhas responsabilidades na compra de produtos?** - Resume Capitulo I (medidas, cores, personalizados)
2. **Quais sao as modalidades de pagamento disponiveis?** - Resume Capitulo II (numerario, multibanco, transferencia, seQura)
3. **Os precos podem mudar entre a encomenda e a entrega?** - Resume Capitulo III (precos fixos entre encomenda e entrega)
4. **As datas de entrega sao garantidas?** - Resume Capitulo IV (estimativas, stock 15 dias)
5. **Como funciona o servico de entrega e montagem?** - Resume Capitulo V (horarios, pagamento, verificacao, criancas)
6. **Qual e a garantia dos produtos?** - Resume Capitulo VI (3 anos, exclusoes)
7. **Posso devolver ou trocar um artigo?** - Resume Capitulo VII (15 dias, condicoes, personalizados)
8. **O que sao artigos de exposicao e quais as condicoes?** - Resume Capitulo VIII (estado, sem trocas)
9. **Quais sao as condicoes para devolucao?** - Resume Capitulo IX (embalagem original, custos)
10. **Como funciona o reembolso?** - Resume Capitulo X (5 dias uteis, transferencia)
11. **Que cuidados devo ter com os moveis?** - Resume Capitulo XI (limpeza, calor, peso)

### Implementacao Tecnica
- Usar a ferramenta de insercao de dados para adicionar as 11 FAQs na tabela `faq_items`
- Cada FAQ tera `is_active = true`, `sort_order` sequencial
- O campo `answer` contera o texto formatado em HTML para boa apresentacao
- Nao sao necessarias alteracoes de schema (tabela `faq_items` ja existe)

## Resumo das Alteracoes

| Ficheiro | Alteracao |
|---|---|
| `src/components/portal/TicketStatusStepper.tsx` | Novo componente de stepper visual |
| `src/pages/portal/PortalTickets.tsx` | Adicionar indicador de progresso nos cards |
| `src/pages/portal/PortalTicketDetail.tsx` | Adicionar stepper no topo do detalhe |
| Base de dados `faq_items` | Inserir 11 FAQs dos termos e condicoes |
