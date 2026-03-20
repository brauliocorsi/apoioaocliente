DELETE FROM delayed_order_contacts
WHERE delayed_order_id IN (
  SELECT id FROM delayed_orders 
  WHERE situacao NOT IN ('Encomenda - Fábrica', 'Encomenda - Fornecedor', 'Encomenda - Fábrica e Fornecedor')
);

DELETE FROM delayed_orders 
WHERE situacao NOT IN ('Encomenda - Fábrica', 'Encomenda - Fornecedor', 'Encomenda - Fábrica e Fornecedor');