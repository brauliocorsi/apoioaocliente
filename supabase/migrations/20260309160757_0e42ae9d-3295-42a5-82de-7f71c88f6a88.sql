-- Template: welcome (pure text, minimal signature)
UPDATE public.email_templates SET body_html = 'Olá {nome_cliente},

A sua conta no portal de apoio foi criada com sucesso.

Email: {email}
Password: {password}

Aceda ao portal em: {portal_url}

Recomendamos que altere a sua password após o primeiro acesso.

--
UP Móveis - Apoio ao Cliente
Este email foi enviado automaticamente.', updated_at = now() WHERE id = 'welcome';

-- Template: ticket_created
UPDATE public.email_templates SET body_html = 'Olá {nome_cliente},

O seu ticket foi registado com sucesso. A nossa equipa irá analisá-lo brevemente.

Ticket: #{numero_ticket}
Assunto: {assunto}
Estado: {estado}

Acompanhe em: {ticket_url}

--
UP Móveis - Apoio ao Cliente
Este email foi enviado automaticamente.', updated_at = now() WHERE id = 'ticket_created';

-- Template: status_changed
UPDATE public.email_templates SET body_html = 'Olá {nome_cliente},

O estado do seu ticket foi atualizado.

Ticket: #{numero_ticket}
Assunto: {assunto}
Novo Estado: {estado}

Acompanhe em: {ticket_url}

--
UP Móveis - Apoio ao Cliente
Este email foi enviado automaticamente.', updated_at = now() WHERE id = 'status_changed';

-- Template: resolution_decision
UPDATE public.email_templates SET body_html = 'Olá {nome_cliente},

Foi registada uma decisão formal no seu ticket.

Ticket: #{numero_ticket} - {assunto}
Decisão: {tipo_decisao}
Motivo: {motivo_decisao}

Acompanhe em: {ticket_url}

--
UP Móveis - Apoio ao Cliente
Este email foi enviado automaticamente.', updated_at = now() WHERE id = 'resolution_decision';