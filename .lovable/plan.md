## Objetivo

Modernizar toda a aplicação interna com visual mais colorido, espaçoso e didático, mantendo 100% da lógica de negócio. Foco especial em **legibilidade**, **clareza visual** e **melhoria dos kanbans** (Tickets e Ligações).

---

## 1. Sistema de Design (base de tudo)

Atualizar `src/index.css` e `tailwind.config.ts`:

- **Paleta colorida** (mantendo HSL semântico):
  - Primary: índigo vibrante `hsl(243 75% 59%)`
  - Accent: turquesa `hsl(174 72% 56%)`
  - Success: verde-esmeralda, Warning: âmbar, Destructive: coral
  - Cores dedicadas por categoria de ticket (8 categorias) e por status do kanban
- **Tipografia**: manter Inter, mas hierarquia mais clara (display 28/32px, h2 20px, body 14px, micro 12px).
- **Espaçamento**: aumentar paddings (cards `p-5`, seções `gap-6`, página `p-8`).
- **Radius**: subir para `1rem` em cards principais, manter `0.75rem` em elementos internos.
- **Sombras**: nova escala suave colorida (`shadow-soft`, `shadow-glow-primary`).
- **Gradientes utilitários** para headers de seção e cards de destaque.

---

## 2. Shell da Aplicação

**`AppSidebar`**
- Reorganizar em grupos colapsáveis com ícones coloridos por área (Operação, Comunicação, Catálogo, Sistema).
- Item ativo com pílula colorida full-width + barra lateral em accent.
- Avatar do utilizador + role no rodapé com indicador online.
- Tooltip didático em modo colapsado.

**`AppLayout` / Header**
- Header mais alto (h-14), com breadcrumb dinâmico à esquerda + ações à direita.
- Barra de busca global compacta no centro (Ctrl+K).
- Background sutilmente diferenciado do conteúdo.

---

## 3. Dashboard (`/dashboard`)

- Manter estrutura recente (StatCards + tabs + Action Queue), mas:
  - StatCards com **acentos coloridos por tom** e mini-spark de tendência.
  - Action Queue com cards "convidativos" (ícone grande, CTA claro).
  - Tabs com indicador animado.
  - Saudação personalizada no topo ("Bom dia, {nome} — tem X tickets urgentes").

---

## 4. Kanbans (Tickets + Ligações) — foco principal

**Toolbar superior** (novo, comum aos dois kanbans):
- Busca textual + filtros rápidos (Agente, Prioridade, Tag, SLA).
- Toggle visualização (Kanban / Lista).
- Contador total + "Apenas meus" / "Não atribuídos".

**Colunas**
- Header com:
  - Cor de status na borda superior (mais grossa, 4px).
  - Nome + contador grande + mini-indicador de SLA agregado (✓ no prazo / ⚠ atenção / ! atrasados).
  - Ações: renomear/excluir mantidas, mais acessíveis.
- Background da coluna ligeiramente tonalizado conforme cor do status.
- Empty state ilustrado.

**Cards de ticket/ligação**
- Layout em 3 zonas claras:
  1. **Topo**: prioridade (pílula colorida) + categoria (chip colorido) + indicador SLA (badge com tempo restante e cor).
  2. **Meio**: título maior (15px, 2 linhas), cliente, nº encomenda.
  3. **Rodapé**: avatares (criador → atribuído), tags compactas, timestamp relativo, ícones de email/portal/anexos.
- Borda esquerda colorida = cor do criador (mantém).
- **Indicadores visuais novos**:
  - Pulse animado em cards com mensagem não lida.
  - Badge "SLA" com countdown colorido (verde > amarelo > laranja > vermelho).
  - Ícone de canal (📧 email, 💬 portal, ☎ ligação).
- Hover: leve elevação + outline accent.

---

## 5. Páginas Principais

- **Tickets, PhoneCalls, EmailTickets, DeliveryConfirmations, PostDelivery, DelayedOrders**: padronizar header de página (título + descrição curta explicativa + ações primárias).
- **TicketDetail**: refinar sidebar e timeline (espaçamento, ícones coloridos por tipo de evento, separadores mais suaves).
- **Settings**: tabs verticais com ícones coloridos.

---

## 6. Detalhes técnicos

- Tudo via tokens semânticos (HSL) — sem cores hardcoded em componentes.
- Novos componentes utilitários:
  - `PageHeader` (título + descrição + ações)
  - `KanbanToolbar` (busca + filtros)
  - `SlaBadge` (countdown colorido)
  - `CategoryChip` (chip colorido por categoria)
- Animações com `tailwindcss-animate` já instalado; sem novas dependências.
- Mantém toda lógica: drag-and-drop, RLS, queries, realtime, mentions, SLA — nenhum business logic alterado.

---

## 7. Entregáveis

```text
src/index.css                                  (paleta colorida + tokens)
src/components/AppSidebar.tsx                  (grupos + cores)
src/components/AppLayout.tsx                   (header + breadcrumb)
src/components/ui/PageHeader.tsx               (novo)
src/components/kanban/KanbanToolbar.tsx        (novo)
src/components/ticket/SlaBadge.tsx             (novo)
src/components/ticket/CategoryChip.tsx         (novo)
src/components/KanbanBoard.tsx                 (refit colunas + cards)
src/components/phone/PhoneCallKanban.tsx       (refit colunas + cards)
src/pages/Dashboard.tsx                        (saudação + polish)
src/pages/Tickets.tsx, PhoneCalls.tsx, ...     (PageHeader + toolbar)
```

## 8. Fora de escopo

- Portal do cliente (`/portal/*`) — mantém como está.
- Lógica de SLA, regras, automações, edge functions.
- Refatoração de queries/dados.

---

Posso seguir e implementar a primeira fase (design system + shell + kanbans), depois iterar nas páginas restantes — ou prefere que faça tudo numa só passagem?