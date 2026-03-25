

## Plano: Adicionar status de chamada e opção de montagem na Pós-Entrega

### O que muda

1. **Novo campo `call_status`** na tabela `post_delivery_confirmations` — valores: `"atendeu"` ou `"nao_atendeu"` (texto, nullable para registos antigos)

2. **Novo campo `assembly_status`** na tabela `post_delivery_confirmations` — valores: `"ok"`, `"sem_montagem"`, `"nao_aplicavel"` (texto, nullable). Substitui o checkbox booleano `assembly_ok` visualmente, mas mantemos `assembly_ok` para compatibilidade.

3. **Interface (formulário + tabela)**:
   - No formulário de novo registo: adicionar um **Select** para "Cliente atendeu?" (Atendeu / Não atendeu) e substituir o checkbox "Montagem OK" por um **Select** com opções: "Montagem OK", "Sem montagem", "N/A"
   - Na tabela: mostrar badge de status da chamada (verde "Atendeu" / vermelho "Não atendeu") como nova coluna, e o badge de montagem reflete as 3 opções
   - Na edição inline: mesmos selects

4. **Cartões de resumo**: adicionar contagem de "Atendeu" vs "Não atendeu" hoje

### Alterações técnicas

| Ficheiro | Alteração |
|----------|-----------|
| **Migração SQL** | `ALTER TABLE post_delivery_confirmations ADD COLUMN call_status text DEFAULT NULL; ADD COLUMN assembly_status text DEFAULT NULL;` |
| **PostDeliveryConfirmations.tsx** | Adicionar campos no formulário, tabela, edição inline e cartões de resumo |
| **OrderInternalData.tsx** | Mostrar o novo badge de call_status nos dados internos |
| **Dashboard.tsx** | Atualizar indicadores de pós-entrega para incluir taxa de atendimento |

### Migração SQL

```sql
ALTER TABLE public.post_delivery_confirmations 
  ADD COLUMN call_status text DEFAULT NULL,
  ADD COLUMN assembly_status text DEFAULT NULL;
```

