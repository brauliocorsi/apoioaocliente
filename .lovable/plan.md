
# Melhorias ao Motor de Regras e Decisão Formal

## O Que Vai Mudar

### 1. Motor de Regras — Cláusulas com Texto Completo + Nome da Macro

**Situação actual:** O motor mostra apenas os códigos das cláusulas (ex: `V-f`, `IX-b`) e o ID da macro (ex: `M03`).

**Novo comportamento:**
- Cada cláusula sugerida passa a mostrar **código + descrição completa** (ex: `IX-b — Devolução: não montado`)
- A macro sugerida passa a mostrar **ID + título** (ex: `M03 — Reclamação fora das 48h`)
- Para isso, o componente que renderiza as sugestões em `TicketDetail.tsx` irá buscar todas as cláusulas e macros ao carregar o ticket, e fazer o cruzamento no frontend
- Não é necessário alterar o `DecisionEngine.ts` — apenas o componente de exibição

### 2. Decisão Formal — Passar para Dropdown Colapsável

**Situação actual:** O `ResolutionCard` é sempre visível como um card em destaque na página, logo abaixo do SLA, ocupando espaço mesmo quando não há nenhuma resolução registada.

**Novo comportamento:**
- A secção "Registar Decisão Formal" passa a ser um **item colapsável** (accordion/collapsible) integrado na zona de ações do ticket
- Quando não há resolução: aparece como uma linha discreta `▶ Registar Decisão Formal` que expande ao clicar
- Quando há resolução registada ou aprovação pendente: o item fica **expandido por defeito** e com indicação visual colorida no cabeçalho (verde = resolvido, amarelo = pendente, vermelho = recusado)
- O card interno permanece exactamente igual — só muda como é acessado

## Ficheiros a Alterar

| Ficheiro | Alteração |
|---|---|
| `src/pages/TicketDetail.tsx` | Carregar cláusulas e macros; enriquecer exibição das sugestões; envolver `ResolutionCard` num Collapsible |

## Detalhes Técnicos

### Carregamento de dados para o Motor de Regras

No `fetchTicket()`, adicionar duas queries em paralelo:
```
supabase.from("clauses").select("id, code, description")
supabase.from("macros").select("id, title")
```

Guardar em estados `clauseMap: Record<string, string>` e `macroMap: Record<string, string>`.

### Renderização das sugestões enriquecida

Em vez de:
```
Cláusulas: V-f, IX-b
Macro sugerida: M03
```

Passa a mostrar:
```
Cláusulas:
  • V-f — Devolução: condição f
  • IX-b — Devolução: não montado

Macro sugerida: M03 — Reclamação fora das 48h [botão: Usar Macro]
```

O botão "Usar Macro" pode pré-preencher a nota interna (já existe este mecanismo via `MacroSelector`). Para isso, ao clicar, invoca a função que já existe para seleccionar macros, procurando pelo ID da macro sugerida.

### Collapsible para Decisão Formal

Usar o componente `Collapsible` já disponível em `@/components/ui/collapsible` (Radix UI já instalado):

```
<Collapsible open={isResolutionOpen} onOpenChange={setIsResolutionOpen}>
  <CollapsibleTrigger>
    <div className="flex items-center gap-2">
      <Gavel className="h-4 w-4" />
      Decisão Formal
      {/* Badge colorido se houver resolução/pendente */}
    </div>
  </CollapsibleTrigger>
  <CollapsibleContent>
    <ResolutionCard ... />
  </CollapsibleContent>
</Collapsible>
```

O estado `isResolutionOpen` começa como `true` se `ticket.resolution_type` existir ou houver aprovação pendente; caso contrário começa `false`.

O trigger mostra badges discretos:
- Sem resolução: sem badge
- Pendente: `🟡 Aguarda Aprovação`
- Aprovada: `🟢 Resolvido` ou `🔴 Cancelado`
