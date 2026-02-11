

# Sistema de Suporte ao Cliente — UP Móveis

## Visão Geral
Plataforma interna de gestão de tickets de suporte ao cliente para a UP Móveis, com categorização inteligente, SLA automático, macros pré-definidas e assistente AI para orientação de respostas.

---

## 1. Autenticação e Gestão de Utilizadores
- Login com email/password para agentes (equipa de 1-3 pessoas)
- Perfil do agente com nome e papel (agente / supervisor)
- Tabela de roles separada para controlo de acesso seguro

## 2. Dashboard Principal
- Visão geral dos tickets abertos, em análise e encerrados
- Contadores de SLA (tickets em risco de ultrapassar prazo)
- Filtros rápidos por categoria, prioridade, tags e estado
- Lista de tickets com informações-chave: nº encomenda, categoria, prioridade, tempo restante SLA

## 3. Gestão de Tickets
- **Criação de ticket** com seleção de categoria (A-H) e subcategoria
- **Campos obrigatórios dinâmicos** que mudam conforme a categoria selecionada (ex: fotos do local para acessos difíceis, data de entrega para reclamações)
- **Upload de fotos/vídeos** quando obrigatório
- **Sistema de tags** — 50 tags pré-definidas organizadas por grupo (Prazo, Produto, Entrega, Pagamentos, Reclamação, Gestão interna)
- **Chips de cláusulas** — referência visual às cláusulas aplicáveis (V-a, VI-b, etc.)
- **Timeline/histórico** de cada ticket com eventos, mudanças de estado e comunicações
- **Estados**: Novo → Em análise → Aguarda cliente → Aguarda logística/técnico → Resolvido → Encerrado

## 4. Motor de Regras Automáticas (Decision Engine)
As 7 regras (R1-R7) implementadas como lógica que, ao criar/atualizar um ticket:
- **R1**: Verifica se reclamação está dentro/fora das 48h e sugere tags + cláusulas
- **R2**: Bloqueia devolução se produto montado, sugere recusa com cláusulas
- **R3**: Trava devolução de personalizados, sugere janela 72h
- **R4**: Alerta para aviso prévio em pagamento multibanco
- **R5**: Resposta automática para transferências na entrega
- **R6**: Checklist de fotos + termo para acessos difíceis
- **R7**: Identifica exclusões de garantia (humidade, impacto, limpeza)

As sugestões aparecem como alertas/cards no ticket para o agente aceitar ou ignorar.

## 5. SLA Automático
- Cálculo automático de prazos de primeira resposta e resolução baseado na categoria + prioridade (P1/P2/P3)
- Horário de operação: Seg-Sáb 08:00-20:00
- **Pausa de SLA** quando estado = "Aguarda cliente" (com registo de evento)
- Indicadores visuais: verde (dentro do prazo), amarelo (a aproximar-se), vermelho (ultrapassado)
- Alertas quando SLA está em risco

## 6. Macros de Resposta (18 modelos)
- Biblioteca de 18 macros pré-definidas para email/WhatsApp
- Preenchimento automático de variáveis: {nome_cliente}, {n_encomenda}, {data_entrega}, etc.
- Inserção de cláusulas aplicáveis automaticamente
- Botão de copiar para clipboard ou enviar diretamente
- Organização por categoria (Entrega, Reclamação, Garantia, Devolução, Pagamento, Exposição)

## 7. Assistente AI (Lovable AI)
- **Sugestão de categoria/subcategoria** baseada na descrição do cliente
- **Sugestão de resposta** combinando macros + cláusulas + contexto do ticket
- **Análise de tom** para tickets sensíveis (tag cliente_sensivel)
- **Resumo automático** do histórico do ticket
- Integração via edge function com streaming de respostas

## 8. Base de Dados (Lovable Cloud / Supabase)
- Tabelas: tickets, ticket_events, categories, subcategories, tags, clauses, macros, profiles, user_roles
- Seed data com toda a taxonomia, 50 tags, cláusulas e 18 macros
- RLS policies para segurança de dados

## 9. Design e UX
- Interface limpa e profissional, otimizada para produtividade
- Navegação por sidebar com secções: Dashboard, Tickets, Macros, Configurações
- Tema claro com acentos em azul (identidade profissional)
- Responsivo mas otimizado para desktop (uso principal dos agentes)

