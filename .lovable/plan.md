
# Motor de Regras Completo — Novas Regras, Macros e Etiquetas Alinhadas com o Contrato

## Diagnóstico do Estado Actual

O sistema tem uma estrutura sólida mas **incompleta**: existem 8 categorias, 33 subcategorias, 22 etiquetas, 18 macros e apenas 7 regras do Motor. O contrato tem 11 secções com dezenas de situações de suporte, das quais muitas ainda **não têm regra, macro ou etiqueta correspondente**.

Lacunas identificadas:
- Categorias A (Entrega), G (Exposição), H (Manutenção) **não têm nenhuma regra** no Motor
- Categoria B (Reclamação) só tem regra de tempo mas **não cobre danos, faltas, produto diferente**
- Categoria C (Garantia) só tem 1 regra de exclusão mas **não cobre abertura normal nem assistência técnica paga**
- Etiquetas em falta para: ausência do cliente, entrega em kit, produto sem embalagem, reembolso em curso, colchão/higiene, etc.
- Macros em falta para: ausência no dia de entrega, produto diferente do pedido, falta de peças, entrega em kit, garantia com visita técnica, colchão/higiene, cancelamento E2/E3

---

## O Que Vai Ser Criado

### 1. Novas Etiquetas (tags)

Serão adicionadas etiquetas organizadas nos grupos existentes para cobrir os casos em falta:

**Grupo `entrega`** (novo grupo):
- `ausencia_cliente` — Cliente ausente no dia de entrega
- `reagendamento` — Entrega reagendada
- `entrega_kit` — Entrega sem montagem (kit)
- `entrega_parcial` — Apenas parte da encomenda entregue
- `meios_especiais` — Grua/escadas externas necessárias
- `termo_responsabilidade` — Termo assinado pelo cliente

**Grupo `devolucao`** (novo grupo):
- `sem_embalagem` — Produto sem embalagem original
- `fora_prazo_devolucao` — Pedido após os 15 dias
- `reembolso_em_curso` — Devolução aprovada, aguarda reembolso
- `custo_recolha_cliente` — Custos de recolha imputados ao cliente

**Grupo `pagamento`** (novo grupo):
- `pagamento_entrega` — Pagamento na entrega (tag já pode existir)
- `tpa_solicitado` — Terminal de pagamento solicitado
- `transferencia_antecipada` — Transferência antecipada confirmada
- `sequra_informado` — seQura explicado ao cliente

**Grupo `garantia`** (novo grupo):
- `garantia_valida` — Dentro dos 3 anos, defeito de fabrico
- `garantia_excluida` — Fora da cobertura
- `visita_tecnica` — Visita técnica agendada
- `colchao_higiene` — Produto de higiene (colchão/almofada)

**Nota:** Etiquetas `acesso_dificil`, `48h_ok`, `48h_fora` serão adicionadas ao sistema se ainda não existirem (as regras R1-R7 referenciam-nas mas não estão na tabela de tags).

---

### 2. Novas Macros

Serão criadas 12 macros novas para cobrir os cenários em falta:

| ID | Categoria | Título | Baseada em |
|---|---|---|---|
| M19 | entrega | Ausência do cliente — nova taxa | V-g (via V-g real: re-entrega) — clausula V-g via contrato |
| M20 | entrega | Entrega em kit — montagem não incluída | V-f, VI-b |
| M21 | entrega | Meios especiais não incluídos | III-a |
| M22 | reclamacao | Dano visível na entrega (registo) | V-e, V-f |
| M23 | reclamacao | Falta de peças (registo formal) | V-e |
| M24 | reclamacao | Produto diferente do pedido | V-e |
| M25 | garantia | Garantia válida — abertura formal | VI-a |
| M26 | garantia | Visita técnica com custos (não coberta) | VI-d |
| M27 | devolucao | Devolução recusada — sem embalagem | IX-a, VII-a |
| M28 | devolucao | Devolução recusada — fora de prazo | VII-a |
| M29 | garantia | Colchão/higiene — devolução recusada | VII-d |
| M30 | geral | Cancelamento personalizado — após 72h | I-d, E2 |

---

### 3. Novas Regras do Motor (10 regras)

| ID | Nome | Condição | Cláusulas | Tags | Macro |
|---|---|---|---|---|---|
| R8 | Ausência do cliente na entrega | subcategoria = A3 | V-g (nova), IV-b | ausencia_cliente | M19 |
| R9 | Entrega em kit — aviso montagem | subcategoria = A7 | VI-b, V-f | entrega_kit | M20 |
| R10 | Meios especiais (grua/escadas) | subcategoria = A4 + field: needs_special_access | III-a, V-d | meios_especiais | M21 |
| R11 | Dano na entrega — registo obrigatório | subcategoria = B1 | V-e, V-f | dano_transporte, aguarda_fotos | M22 |
| R12 | Falta de peças | subcategoria = B2 | V-e | falta_pecas, aguarda_fotos | M23 |
| R13 | Produto diferente do pedido | subcategoria = B3 | V-e | produto_diferente, aguarda_fotos | M24 |
| R14 | Garantia válida — defeito fabrico | subcategoria = C1 | VI-a | defeito_fabrico_suspeito, aguarda_fotos | M25 |
| R15 | Garantia — visita técnica com custo | subcategoria = C4 | VI-d | aguarda_tecnico, visita_tecnica | M26 |
| R16 | Devolução sem embalagem original | categoria = D + field: has_original_packaging = false | IX-a, VII-a | sem_embalagem | M27 |
| R17 | Colchão/higiene — devolução condicionada | categoria = D + tag: higiene_colchao | VII-d | colchao_higiene | M29 |

**Total após implementação:** 17 regras activas no Motor.

---

## Execução Técnica

### Operações na base de dados (sem alteração de schema):

**A — INSERT de novas etiquetas** na tabela `tags`:
Grupos novos: `entrega`, `devolucao`, `pagamento`, `garantia`
Etiquetas que as regras R1–R7 referenciam mas ainda não existem: `acesso_dificil`, `48h_ok`, `48h_fora`, `tpa_solicitado`, `pagamento_entrega`, `transferencia_antecipada`

**B — INSERT de novas macros** na tabela `macros` (M19 a M30):
Conteúdo redigido em português formal, com referência às cláusulas do contrato e variáveis como `{nome_cliente}`, `{n_encomenda}`, `{clausulas}`

**C — INSERT de novas regras** na tabela `decision_rules` (R8 a R17):
Usando os tipos de condição existentes: `subcategory`, `field_bool`, `tag_exists`

**D — UPDATE das cláusulas** na tabela `clauses`:
Substituir os `description` actuais (resumos curtos) pelo texto integral do contrato em todas as 44 cláusulas

---

## Cobertura Final por Categoria

| Categoria | Regras Cobertas |
|---|---|
| A — Entrega e Montagem | R6 (acesso), R8 (ausência), R9 (kit), R10 (meios especiais) |
| B — Reclamação pós-entrega | R1a/R1b (48h), R11 (dano), R12 (falta peças), R13 (produto diferente) |
| C — Garantia | R7 (exclusões), R14 (defeito válido), R15 (visita técnica) |
| D — Devolução/Troca | R2 (montado), R3 (personalizado), R16 (sem embalagem), R17 (colchão) |
| E — Personalizado/Cancelamento | R3 (já cobre) + M30 (macro nova) |
| F — Pagamentos | R4 (multibanco), R5 (transferência) |
| G — Exposição | Cobertura via cláusulas VIII nas macros M15 |
| H — Uso e Manutenção | R7 (via tag humidade/impacto) |

