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
    const plainText = `Olá ${ticket.client_name || "Cliente"},\n\n${content}\n\n---\nPara responder, basta responder a este email.\nUP Móveis — Apoio ao Cliente`;
    const htmlContent = `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:32px;max-width:600px;">
<p style="color:#d32f2f;font-size:18px;font-weight:bold;margin:0 0 24px;">UP Móveis — Apoio ao Cliente</p>
<p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 12px;">Olá <strong>${ticket.client_name || "Cliente"}</strong>,</p>
<p style="color:#333;font-size:15px;line-height:1.6;white-space:pre-wrap;margin:0 0 20px;">${content.replace(/\n/g, "<br>")}</p>
<hr style="border:none;border-top:1px solid #ddd;margin:24px 0 16px;">
<p style="color:#666;font-size:12px;margin:0 0 4px;">Para responder, basta responder a este email.</p>
<p style="color:#999;font-size:12px;margin:0;">UP Móveis — Tudo para casa.</p>
</td></tr>
</table>
</body>
</html>`;

    // Send email via SMTP with detailed error tracking
    const port = Number(smtpCfg.smtp_port) || 465;
    let deliveryStatus = "accepted";
    let deliveryDetails: string | null = null;
    let smtpResponse: string | null = null;
    let sendError: string | null = null;

    try {
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

      const sendResult = await client.send({
        from: fromAddr,
        to: clientEmail,
        subject,
        content: plainText,
        html: htmlContent,
      });

      // Capture SMTP response for tracking
      if (sendResult) {
        smtpResponse = typeof sendResult === "string" ? sendResult : JSON.stringify(sendResult);
      }

      deliveryStatus = "delivered";
      deliveryDetails = `SMTP accepted by ${smtpCfg.smtp_host}:${port}`;

      try { await client.close(); } catch { /* ignore */ }
    } catch (smtpErr) {
      const errMsg = (smtpErr as Error).message || String(smtpErr);
      console.error("SMTP send error:", errMsg);

      // Classify error
      if (errMsg.includes("550") || errMsg.includes("551") || errMsg.includes("553")) {
        deliveryStatus = "bounced";
        deliveryDetails = "Endereço de email rejeitado pelo servidor destino";
      } else if (errMsg.includes("552") || errMsg.includes("554")) {
        deliveryStatus = "rejected";
        deliveryDetails = "Mensagem rejeitada pelo servidor destino";
      } else if (errMsg.includes("421") || errMsg.includes("451") || errMsg.includes("452")) {
        deliveryStatus = "deferred";
        deliveryDetails = "Servidor temporariamente indisponível, entrega adiada";
      } else if (errMsg.includes("connect") || errMsg.includes("timeout") || errMsg.includes("EHLO")) {
        deliveryStatus = "failed";
        deliveryDetails = "Falha na conexão SMTP";
      } else {
        deliveryStatus = "failed";
        deliveryDetails = "Erro no envio SMTP";
      }

      sendError = errMsg;
      smtpResponse = errMsg;
    }

    // Insert ticket message as agent reply (always, even if email failed)
    await adminClient.from("ticket_messages").insert({
      ticket_id,
      sender_id: userData.user.id,
      sender_type: "agent",
      content,
    });

    // Log email with delivery tracking
    await adminClient.from("email_logs").insert({
      recipient: clientEmail,
      subject,
      status: deliveryStatus === "delivered" || deliveryStatus === "accepted" ? "sent" : "failed",
      error_message: sendError,
      source: "reply-email-ticket",
      ticket_id,
      delivery_status: deliveryStatus,
      delivery_details: deliveryDetails,
      smtp_response: smtpResponse,
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

    // If email failed, return error to UI
    if (deliveryStatus !== "delivered" && deliveryStatus !== "accepted") {
      return new Response(JSON.stringify({ 
        error: `Email não enviado: ${deliveryDetails}`,
        delivery_status: deliveryStatus,
        message_saved: true 
      }), {
        status: 200, // 200 because the message was saved
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, delivery_status: deliveryStatus }), {
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