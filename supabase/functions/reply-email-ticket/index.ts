import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getEmailConfig(adminClient: ReturnType<typeof createClient>) {
  const { data } = await adminClient
    .from("system_settings")
    .select("key, value")
    .in("key", ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from_name", "smtp_from_email", "resend_enabled", "resend_from_email"]);

  const cfg: Record<string, string> = {};
  data?.forEach((s: { key: string; value: string }) => { cfg[s.key] = s.value; });
  return cfg;
}

async function sendViaResend(from: string, to: string, subject: string, text: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY não configurada");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error (${res.status}): ${body}`);
  }
  return await res.json();
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

    const cfg = await getEmailConfig(adminClient);
    const useResend = cfg.resend_enabled === "true";

    if (!useResend && (!cfg.smtp_host || !cfg.smtp_user || !cfg.smtp_pass)) {
      return new Response(JSON.stringify({ error: "SMTP não configurado e Resend não está ativo" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subject = `Re: [Ticket #${ticket.ticket_number}] ${ticket.subject || ""}`;
    const clientDisplayName = ticket.client_name || "Cliente";
    const plainText = `Olá ${clientDisplayName},\n\n${content}\n\n--\nUP Móveis\nApoio ao Cliente\napoioaocliente@upmoveis.pt\nwww.upmoveis.pt\n\nPara responder, basta responder a este email.`;
    const htmlBody = buildEmailHtml(clientDisplayName, content);

    let deliveryStatus = "accepted";
    let deliveryDetails: string | null = null;
    let smtpResponse: string | null = null;
    let sendError: string | null = null;

    try {
      if (useResend) {
        const fromAddr = `${cfg.smtp_from_name || "Apoio ao Cliente"} <${cfg.resend_from_email || cfg.smtp_from_email || "noreply@upmoveis.pt"}>`;
        const result = await sendViaResend(fromAddr, clientEmail, subject, plainText);
        deliveryStatus = "delivered";
        deliveryDetails = "Enviado via Resend API";
        smtpResponse = JSON.stringify(result);
      } else {
        const port = Number(cfg.smtp_port) || 465;
        const client = new SMTPClient({
          connection: {
            hostname: cfg.smtp_host,
            port,
            tls: port === 465,
            auth: { username: cfg.smtp_user, password: cfg.smtp_pass },
          },
        });

        const fromAddr = `${cfg.smtp_from_name || "Apoio ao Cliente"} <${cfg.smtp_from_email || cfg.smtp_user}>`;
        const sendResult = await client.send({
          from: fromAddr,
          to: clientEmail,
          subject,
          content: plainText,
          html: plainText,
        });

        if (sendResult) {
          smtpResponse = typeof sendResult === "string" ? sendResult : JSON.stringify(sendResult);
        }
        deliveryStatus = "delivered";
        deliveryDetails = `SMTP accepted by ${cfg.smtp_host}:${port}`;
        try { await client.close(); } catch { /* ignore */ }
      }
    } catch (err) {
      const errMsg = (err as Error).message || String(err);
      console.error("Email send error:", errMsg);

      if (errMsg.includes("550") || errMsg.includes("551") || errMsg.includes("553")) {
        deliveryStatus = "bounced";
        deliveryDetails = "Endereço de email rejeitado pelo servidor destino";
      } else if (errMsg.includes("552") || errMsg.includes("554")) {
        deliveryStatus = "rejected";
        deliveryDetails = "Mensagem rejeitada pelo servidor destino";
      } else if (errMsg.includes("421") || errMsg.includes("451") || errMsg.includes("452")) {
        deliveryStatus = "deferred";
        deliveryDetails = "Servidor temporariamente indisponível";
      } else {
        deliveryStatus = "failed";
        deliveryDetails = useResend ? "Erro no envio via Resend" : "Erro no envio SMTP";
      }
      sendError = errMsg;
      smtpResponse = errMsg;
    }

    // Insert ticket message always
    await adminClient.from("ticket_messages").insert({
      ticket_id,
      sender_id: userData.user.id,
      sender_type: "agent",
      content,
    });

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

    if (deliveryStatus !== "delivered" && deliveryStatus !== "accepted") {
      return new Response(JSON.stringify({ 
        error: `Email não enviado: ${deliveryDetails}`,
        delivery_status: deliveryStatus,
        message_saved: true 
      }), {
        status: 200,
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
