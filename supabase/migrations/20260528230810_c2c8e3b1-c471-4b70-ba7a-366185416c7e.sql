-- Phase 9 — additive macros library (no DELETE/UPDATE of existing rows).
-- Uses ON CONFLICT DO NOTHING so re-runs are safe and never overwrite agent edits.
INSERT INTO public.macros (id, title, content, macro_category, variables, sort_order) VALUES
  ('M31', 'Aguarda fornecedor/fábrica',
$$Olá [cliente],

O seu caso está em análise junto da equipa responsável. Assim que recebermos confirmação da fábrica/fornecedor, enviaremos uma atualização.

Obrigado pela compreensão,
UP Móveis — Apoio ao Cliente$$,
   'geral'::macro_category, ARRAY['cliente']::text[], 31),

  ('M32', 'Pedido de atualização de encomenda',
$$Olá [cliente],

Vamos verificar o estado atualizado da sua encomenda #[encomenda] e retornaremos com uma previsão assim que tivermos confirmação da equipa responsável.

Obrigado,
UP Móveis — Apoio ao Cliente$$,
   'entrega'::macro_category, ARRAY['cliente','encomenda']::text[], 32),

  ('M33', 'Cliente sem número de encomenda',
$$Olá [cliente],

Para conseguirmos localizar o seu pedido, pedimos que nos envie o número da encomenda, nome completo, telefone ou e-mail usado na compra.

Com esses dados, conseguiremos verificar a situação com maior rapidez.

Obrigado,
UP Móveis — Apoio ao Cliente$$,
   'geral'::macro_category, ARRAY['cliente']::text[], 33),

  ('M34', 'Pedido de contacto telefónico',
$$Olá [cliente],

Tentámos entrar em contacto consigo por telefone, mas não conseguimos falar. Pedimos que nos indique, por favor, um horário preferencial para contacto.

Obrigado,
UP Móveis — Apoio ao Cliente$$,
   'geral'::macro_category, ARRAY['cliente']::text[], 34),

  ('M35', 'Resolução proposta',
$$Olá [cliente],

Após análise do seu caso, propomos a seguinte solução:

[descrever solução]

Caso concorde, daremos seguimento ao processo.

Obrigado,
UP Móveis — Apoio ao Cliente$$,
   'geral'::macro_category, ARRAY['cliente']::text[], 35),

  ('M36', 'Encerramento com resolução',
$$Olá [cliente],

Confirmamos que o seu caso foi tratado e vamos proceder ao encerramento do ticket #[ticket].

Se precisar de nova ajuda, pode responder a este e-mail ou abrir um novo pedido pelo portal.

Obrigado,
UP Móveis — Apoio ao Cliente$$,
   'geral'::macro_category, ARRAY['cliente','ticket']::text[], 36)
ON CONFLICT (id) DO NOTHING;