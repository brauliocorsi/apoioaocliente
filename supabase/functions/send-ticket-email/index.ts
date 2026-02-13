import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getSmtpConfig(adminClient: ReturnType<typeof createClient>) {
  const { data } = await adminClient
    .from("system_settings")
    .select("key, value")
    .in("key", ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from_name", "smtp_from_email"]);

  const cfg: Record<string, string> = {};
  data?.forEach((s: { key: string; value: string }) => { cfg[s.key] = s.value; });
  return cfg;
}

async function sendEmail(cfg: Record<string, string>, to: string, subject: string, html: string) {
  const port = Number(cfg.smtp_port) || 465;
  const client = new SMTPClient({
    connection: {
      hostname: cfg.smtp_host,
      port,
      tls: port === 465,
      auth: {
        username: cfg.smtp_user,
        password: cfg.smtp_pass,
      },
    },
  });

  const fromAddr = `${cfg.smtp_from_name || "Apoio ao Cliente"} <${cfg.smtp_from_email || cfg.smtp_user}>`;

  await client.send({
    from: fromAddr,
    to,
    subject,
    content: subject,
    html,
  });

  await client.close();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { ticket_id, template_id } = await req.json();
    if (!ticket_id || !template_id) {
      return new Response(JSON.stringify({ error: "ticket_id e template_id são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get ticket
    const { data: ticket } = await adminClient
      .from("tickets")
      .select("*")
      .eq("id", ticket_id)
      .single();

    if (!ticket) {
      return new Response(JSON.stringify({ error: "Ticket não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get client email
    let clientEmail = ticket.client_email;
    let clientName = ticket.client_name;

    if (ticket.client_user_id) {
      const { data: clientUser } = await adminClient
        .from("client_users")
        .select("email, full_name")
        .eq("id", ticket.client_user_id)
        .single();
      if (clientUser) {
        clientEmail = clientUser.email;
        clientName = clientUser.full_name;
      }
    }

    if (!clientEmail) {
      return new Response(JSON.stringify({ error: "Cliente sem email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get template
    const { data: template } = await adminClient
      .from("email_templates")
      .select("subject, body_html")
      .eq("id", template_id)
      .single();

    if (!template) {
      return new Response(JSON.stringify({ error: "Template não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get status name
    let statusName = ticket.status;
    const { data: statusData } = await adminClient
      .from("ticket_statuses")
      .select("name")
      .eq("id", ticket.status)
      .single();
    if (statusData) statusName = statusData.name;

    const portalUrl = req.headers.get("origin") || "https://portal.exemplo.com";
    const ticketUrl = `${portalUrl}/portal/tickets/${ticket.id}`;

    const resolutionTypeLabel = ticket.resolution_type === "resolved" ? "Resolução" : ticket.resolution_type === "cancelled" ? "Cancelamento" : "";

    const replacements: Record<string, string> = {
      "{nome_cliente}": clientName || "",
      "{numero_ticket}": String(ticket.ticket_number),
      "{assunto}": ticket.subject || "",
      "{estado}": statusName,
      "{ticket_url}": ticketUrl,
      "{email}": clientEmail,
      "{tipo_decisao}": resolutionTypeLabel,
      "{motivo_decisao}": ticket.resolution_reason || "",
    };

    let subject = template.subject;
    let body = template.body_html;
    for (const [key, val] of Object.entries(replacements)) {
      subject = subject.replaceAll(key, val);
      body = body.replaceAll(key, val);
    }

    // Load SMTP config from DB and send
    const smtpCfg = await getSmtpConfig(adminClient);
    if (!smtpCfg.smtp_host || !smtpCfg.smtp_user || !smtpCfg.smtp_pass) {
      return new Response(JSON.stringify({ error: "Configuração SMTP não definida. Configure em Configurações > Email SMTP." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      await sendEmail(smtpCfg, clientEmail, subject, body);
      await adminClient.from("email_logs").insert({
        recipient: clientEmail,
        subject,
        status: "sent",
        source: "send-ticket-email",
        ticket_id,
        template_id,
      });
    } catch (sendErr) {
      await adminClient.from("email_logs").insert({
        recipient: clientEmail,
        subject,
        status: "failed",
        error_message: (sendErr as Error).message,
        source: "send-ticket-email",
        ticket_id,
        template_id,
      });
      throw sendErr;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Send email error:", (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
