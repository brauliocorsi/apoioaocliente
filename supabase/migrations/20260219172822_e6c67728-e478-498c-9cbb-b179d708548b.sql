
-- ============================================================
-- Correção retroativa: Ticket 7 sem eventos e sem SLA
-- ============================================================

-- 1. Inserir evento de criação do ticket 7
INSERT INTO ticket_events (ticket_id, event_type, content, created_at, metadata)
SELECT 
  t.id,
  'created',
  'Ticket criado',
  t.created_at,
  '{}'::jsonb
FROM tickets t
WHERE NOT EXISTS (
  SELECT 1 FROM ticket_events te WHERE te.ticket_id = t.id AND te.event_type = 'created'
);

-- 2. Inserir evento de mudança de estado para o estado atual (se diferente do estado inicial)
-- O estado inicial é 'novo', o ticket 7 está em 'aguarda_cliente'
INSERT INTO ticket_events (ticket_id, event_type, content, created_at, metadata)
SELECT 
  t.id,
  'status_change',
  'Estado alterado: novo → ' || t.status,
  t.updated_at,
  jsonb_build_object('from', 'novo', 'to', t.status)
FROM tickets t
WHERE t.status != 'novo'
  AND NOT EXISTS (
    SELECT 1 FROM ticket_events te 
    WHERE te.ticket_id = t.id AND te.event_type = 'status_change'
  );

-- 3. Preencher SLA nos tickets que têm categoria mas sla_first_response_at NULL
UPDATE tickets t
SET 
  sla_first_response_at = t.created_at + (sc.first_response_minutes * interval '1 minute'),
  sla_resolution_at     = t.created_at + (sc.resolution_minutes     * interval '1 minute')
FROM sla_config sc
WHERE sc.category_id = t.category_id
  AND sc.priority    = t.priority
  AND t.sla_first_response_at IS NULL
  AND t.category_id IS NOT NULL;
