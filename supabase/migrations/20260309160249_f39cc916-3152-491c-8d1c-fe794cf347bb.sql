-- Template: welcome
UPDATE public.email_templates SET body_html = '<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:32px;max-width:600px;">
<p style="color:#d32f2f;font-size:18px;font-weight:bold;margin:0 0 24px;">UP Móveis — Apoio ao Cliente</p>
<p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 12px;">Olá <strong>{nome_cliente}</strong>,</p>
<p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 20px;">A sua conta no portal de apoio foi criada com sucesso. Utilize as credenciais abaixo para aceder:</p>
<p style="color:#333;font-size:15px;line-height:1.8;margin:0 0 4px;"><strong>Email:</strong> {email}</p>
<p style="color:#333;font-size:15px;line-height:1.8;margin:0 0 20px;"><strong>Password:</strong> {password}</p>
<p style="margin:0 0 24px;"><a href="{portal_url}" style="color:#d32f2f;font-size:15px;font-weight:bold;text-decoration:underline;">Aceder ao Portal</a></p>
<p style="color:#666;font-size:13px;line-height:1.5;margin:0 0 0;">Recomendamos que altere a sua password após o primeiro acesso.</p>
<hr style="border:none;border-top:1px solid #ddd;margin:24px 0 16px;">
<p style="color:#999;font-size:12px;margin:0;">UP Móveis — Tudo para casa.</p>
</td></tr>
</table>
</body>
</html>', updated_at = now() WHERE id = 'welcome';

-- Template: ticket_created
UPDATE public.email_templates SET body_html = '<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:32px;max-width:600px;">
<p style="color:#d32f2f;font-size:18px;font-weight:bold;margin:0 0 24px;">UP Móveis — Apoio ao Cliente</p>
<p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 12px;">Olá <strong>{nome_cliente}</strong>,</p>
<p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 20px;">O seu ticket foi registado com sucesso. A nossa equipa irá analisá-lo brevemente.</p>
<p style="color:#333;font-size:15px;line-height:1.8;margin:0 0 4px;"><strong>Ticket:</strong> #{numero_ticket}</p>
<p style="color:#333;font-size:15px;line-height:1.8;margin:0 0 4px;"><strong>Assunto:</strong> {assunto}</p>
<p style="color:#333;font-size:15px;line-height:1.8;margin:0 0 20px;"><strong>Estado:</strong> {estado}</p>
<p style="margin:0 0 24px;"><a href="{ticket_url}" style="color:#d32f2f;font-size:15px;font-weight:bold;text-decoration:underline;">Ver Ticket no Portal</a></p>
<hr style="border:none;border-top:1px solid #ddd;margin:24px 0 16px;">
<p style="color:#999;font-size:12px;margin:0;">UP Móveis — Tudo para casa.</p>
</td></tr>
</table>
</body>
</html>', updated_at = now() WHERE id = 'ticket_created';

-- Template: status_changed
UPDATE public.email_templates SET body_html = '<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:32px;max-width:600px;">
<p style="color:#d32f2f;font-size:18px;font-weight:bold;margin:0 0 24px;">UP Móveis — Apoio ao Cliente</p>
<p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 12px;">Olá <strong>{nome_cliente}</strong>,</p>
<p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 20px;">O estado do seu ticket foi atualizado.</p>
<p style="color:#333;font-size:15px;line-height:1.8;margin:0 0 4px;"><strong>Ticket:</strong> #{numero_ticket}</p>
<p style="color:#333;font-size:15px;line-height:1.8;margin:0 0 4px;"><strong>Assunto:</strong> {assunto}</p>
<p style="color:#333;font-size:15px;line-height:1.8;margin:0 0 20px;"><strong>Novo Estado:</strong> {estado}</p>
<p style="margin:0 0 24px;"><a href="{ticket_url}" style="color:#d32f2f;font-size:15px;font-weight:bold;text-decoration:underline;">Ver Ticket no Portal</a></p>
<hr style="border:none;border-top:1px solid #ddd;margin:24px 0 16px;">
<p style="color:#999;font-size:12px;margin:0;">UP Móveis — Tudo para casa.</p>
</td></tr>
</table>
</body>
</html>', updated_at = now() WHERE id = 'status_changed';

-- Template: resolution_decision
UPDATE public.email_templates SET body_html = '<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:32px;max-width:600px;">
<p style="color:#d32f2f;font-size:18px;font-weight:bold;margin:0 0 24px;">UP Móveis — Apoio ao Cliente</p>
<p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 12px;">Olá <strong>{nome_cliente}</strong>,</p>
<p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 20px;">Foi registada uma decisão formal no seu ticket.</p>
<p style="color:#333;font-size:15px;line-height:1.8;margin:0 0 4px;"><strong>Ticket:</strong> #{numero_ticket} — {assunto}</p>
<p style="color:#333;font-size:15px;line-height:1.8;margin:0 0 4px;"><strong>Decisão:</strong> {tipo_decisao}</p>
<p style="color:#333;font-size:15px;line-height:1.8;margin:0 0 20px;"><strong>Motivo:</strong> {motivo_decisao}</p>
<p style="margin:0 0 24px;"><a href="{ticket_url}" style="color:#d32f2f;font-size:15px;font-weight:bold;text-decoration:underline;">Ver Ticket no Portal</a></p>
<hr style="border:none;border-top:1px solid #ddd;margin:24px 0 16px;">
<p style="color:#999;font-size:12px;margin:0;">UP Móveis — Tudo para casa.</p>
</td></tr>
</table>
</body>
</html>', updated_at = now() WHERE id = 'resolution_decision';