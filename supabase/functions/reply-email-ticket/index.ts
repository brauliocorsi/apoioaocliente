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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await callerClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { ticket_id, content } = await req.json();
    if (!ticket_id || !content) {
      return new Response(JSON.stringify({ error: "ticket_id e content são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get ticket
    const { data: ticket } = await adminClient
      .from("tickets")
      .select("id, ticket_number, client_email, client_name, subject")
      .eq("id", ticket_id)
      .single();

    if (!ticket) {
      return new Response(JSON.stringify({ error: "Ticket não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get client email from email_threads or ticket
    let clientEmail = ticket.client_email;
    if (!clientEmail) {
      const { data: thread } = await adminClient
        .from("email_threads")
        .select("email_address")
        .eq("ticket_id", ticket_id)
        .limit(1)
        .single();
      if (thread) clientEmail = thread.email_address;
    }

    if (!clientEmail) {
      return new Response(JSON.stringify({ error: "Email do cliente não encontrado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load SMTP config
    const smtpCfg = await getSmtpConfig(adminClient);
    if (!smtpCfg.smtp_host || !smtpCfg.smtp_user || !smtpCfg.smtp_pass) {
      return new Response(JSON.stringify({ error: "SMTP não configurado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build email
    const subject = `Re: [Ticket #${ticket.ticket_number}] ${ticket.subject || ""}`;
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563eb; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 16px;">Resposta ao Ticket #${ticket.ticket_number}</h2>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 8px 0;">Caro(a) ${ticket.client_name || "Cliente"},</p>
          <div style="white-space: pre-wrap; margin: 16px 0; padding: 16px; background: #f9fafb; border-radius: 6px; border-left: 3px solid #2563eb;">
            ${content.replace(/\n/g, "<br>")}
          </div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">
          <p style="font-size: 12px; color: #6b7280; margin: 0;">
            Para responder, basta responder a este email. A sua mensagem será adicionada ao ticket automaticamente.
          </p>
        </div>
      </div>
    `;

    // Send email via SMTP
    const port = Number(smtpCfg.smtp_port) || 465;
    const client = new SMTPClient({
      connection: {
        hostname: smtpCfg.smtp_host,
        port,
        tls: port === 465,
        auth: {
          username: smtpCfg.smtp_user,
          password: smtpCfg.smtp_pass,
        },
      },
    });

    const fromAddr = `${smtpCfg.smtp_from_name || "Apoio ao Cliente"} <${smtpCfg.smtp_from_email || smtpCfg.smtp_user}>`;

    await client.send({
      from: fromAddr,
      to: clientEmail,
      subject,
      content: content,
      html: htmlContent,
    });

    try { await client.close(); } catch { /* ignore */ }

    // Insert ticket message as agent reply
    await adminClient.from("ticket_messages").insert({
      ticket_id,
      sender_id: userData.user.id,
      sender_type: "agent",
      content,
    });

    // Log email
    await adminClient.from("email_logs").insert({
      recipient: clientEmail,
      subject,
      status: "sent",
      source: "reply-email-ticket",
      ticket_id,
    });

    // Update first_responded_at if not set
    const { data: currentTicket } = await adminClient
      .from("tickets")
      .select("first_responded_at")
      .eq("id", ticket_id)
      .single();

    if (currentTicket && !currentTicket.first_responded_at) {
      await adminClient.from("tickets")
        .update({ first_responded_at: new Date().toISOString() })
        .eq("id", ticket_id);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("reply-email-ticket error:", (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
