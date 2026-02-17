

## Texto de Resolução Separado para o Cliente

### Problema Atual
O campo `resolution_reason` e armazenado no ticket e mostrado tanto aos agentes como aos clientes no portal. Nao existe forma de escrever um texto interno (detalhado, tecnico) e um texto diferente, mais adequado, para o cliente ver.

### Solucao

Adicionar um novo campo `resolution_client_reason` na tabela `tickets` que permite ao agente escrever um texto especifico para o cliente. Se preenchido, o portal mostra esse texto; se vazio, mostra o `resolution_reason` normal como fallback.

### Alteracoes

**1. Base de dados** - Adicionar coluna `resolution_client_reason` (text, nullable) a tabela `tickets`.

**2. ResolutionCard.tsx** - Adicionar um campo de texto extra "Texto para o cliente (opcional)" no formulario de decisao. Este campo aparece tanto na criacao direta como no pedido de aprovacao. Quando o supervisor aprova, o texto para o cliente tambem e aplicado ao ticket.

**3. Tabela resolution_approvals** - Adicionar coluna `proposed_client_reason` (text, nullable) para guardar o texto proposto para o cliente durante o fluxo de aprovacao.

**4. PortalTicketDetail.tsx** - Alterar para mostrar `resolution_client_reason` em vez de `resolution_reason`. Se `resolution_client_reason` estiver vazio, faz fallback para `resolution_reason`.

### Secao Tecnica

```text
tickets table
+----------------------------+
| resolution_reason          | (interno - visivel apenas a agentes)
| resolution_client_reason   | (NEW - texto para o cliente, nullable)
+----------------------------+

resolution_approvals table
+----------------------------+
| proposed_reason            | (texto interno proposto)
| proposed_client_reason     | (NEW - texto cliente proposto, nullable)
+----------------------------+

Portal mostra:
  resolution_client_reason ?? resolution_reason
```

- Migracao SQL: `ALTER TABLE tickets ADD COLUMN resolution_client_reason text;` e `ALTER TABLE resolution_approvals ADD COLUMN proposed_client_reason text;`
- No `ResolutionCard`, novo `<Textarea>` com placeholder "Texto visivel para o cliente (opcional)..."
- No `save()` e `handleApproval(true)`, guardar o `resolution_client_reason`
- No `requestApproval()`, guardar `proposed_client_reason`
- No `PortalTicketDetail.tsx`, usar `ticket.resolution_client_reason || ticket.resolution_reason`
- Query do portal ja inclui `resolution_reason`; adicionar `resolution_client_reason` ao select

