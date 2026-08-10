import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { encode as base64Encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";

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

function buildEmailHtml(clientName: string, content: string): string {
  const escapedContent = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f7f7f7;">
<div style="max-width:600px;margin:20px auto;background-color:#ffffff;border-radius:6px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#333333;">
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px 0;">Olá <strong>${clientName}</strong>,</p>
    <div style="margin:0 0 24px 0;">${escapedContent}</div>
    <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;">
    <div style="font-size:12px;color:#888888;line-height:1.5;">
      <p style="margin:0 0 2px 0;font-weight:bold;color:#555555;">UP Móveis</p>
      <p style="margin:0 0 2px 0;">Apoio ao Cliente</p>
      <p style="margin:0 0 2px 0;">✉ apoioaocliente@upmoveis.pt</p>
      <p style="margin:0 0 8px 0;">🌐 www.upmoveis.pt</p>
      <p style="margin:0;font-size:11px;color:#aaaaaa;">Para responder, basta responder a este email.</p>
    </div>
  </div>
</div>
</body>
</html>`;
}

interface DownloadedAttachment {
  filename: string;
  content: string; // base64
  contentType: string;
  size: number;
}

async function downloadAttachments(
  adminClient: ReturnType<typeof createClient>,
  paths: string[]
): Promise<DownloadedAttachment[]> {
  const results: DownloadedAttachment[] = [];
  for (const path of paths) {
    try {
      const { data, error } = await adminClient.storage.from("ticket-attachments").download(path);
      if (error || !data) {
        console.error(`Failed to download attachment ${path}:`, error?.message);
        continue;
      }
      const arrayBuffer = await data.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const b64 = base64Encode(bytes);
      const filename = path.split("/").pop() || "attachment";
      results.push({
        filename,
        content: b64,
        contentType: data.type || "application/octet-stream",
        size: bytes.length,
      });
    } catch (err) {
      console.error(`Error downloading ${path}:`, (err as Error).message);
    }
  }
  return results;
}

async function sendViaResend(
  from: string, to: string, subject: string, text: string,
  html?: string, attachments?: DownloadedAttachment[]
) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY não configurada");

  const payload: Record<string, unknown> = {
    from, to: [to], subject, text, html: html || text,
  };

  if (attachments && attachments.length > 0) {
    payload.attachments = attachments.map(a => ({
      filename: a.filename,
      content: a.content,
      content_type: a.contentType,
    }));
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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

    const { ticket_id, content, attachment_paths } = await req.json();
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

    // Download attachments if provided
    let downloadedAttachments: DownloadedAttachment[] = [];
    if (attachment_paths && Array.isArray(attachment_paths) && attachment_paths.length > 0) {
      downloadedAttachments = await downloadAttachments(adminClient, attachment_paths);
    }

    const subject = `Re: [Ticket #${ticket.ticket_number}] ${ticket.subject || ""}`;
    const clientDisplayName = ticket.client_name || "Cliente";
    const plainText = `Olá ${clientDisplayName},\n\n${content}\n\n--\nUP Móveis\nApoio ao Cliente\napoioaocliente@upmoveis.pt\nwww.upmoveis.pt\n\nPara responder, basta responder a este email.`;
    const htmlBody = buildEmailHtml(clientDisplayName, content);

    let deliveryStatus = "accepted";
    let deliveryDetails: string | null = null;
    let smtpResponse: string | null = null;
    let sendError: string | null = null;
    let providerMessageId: string | null = null;

    try {
      if (useResend) {
        const fromAddr = `${cfg.smtp_from_name || "Apoio ao Cliente"} <${cfg.resend_from_email || cfg.smtp_from_email || "noreply@upmoveis.pt"}>`;
        const result = await sendViaResend(fromAddr, clientEmail, subject, plainText, htmlBody, downloadedAttachments);
        providerMessageId = (result as { id?: string })?.id ?? null;
        // Resend só confirma aceitação neste momento; a entrega real chega via webhook.
        deliveryStatus = "sent";
        deliveryDetails = "Aceite pelo Resend — a aguardar confirmação de entrega";
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

        const smtpPayload: Record<string, unknown> = {
          from: fromAddr,
          to: clientEmail,
          subject,
          content: plainText,
          html: htmlBody,
        };

        if (downloadedAttachments.length > 0) {
          smtpPayload.attachments = downloadedAttachments.map(a => ({
            filename: a.filename,
            content: a.content,
            encoding: "base64",
            contentType: a.contentType,
          }));
        }

        const sendResult = await client.send(smtpPayload as any);

        if (sendResult) {
          smtpResponse = typeof sendResult === "string" ? sendResult : JSON.stringify(sendResult);
        }
        deliveryStatus = "accepted";
        deliveryDetails = `Aceite pelo servidor SMTP ${cfg.smtp_host}:${port} (sem confirmação de entrega)`;
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

    // Save attachment records in ticket_attachments
    if (attachment_paths && Array.isArray(attachment_paths)) {
      for (const path of attachment_paths) {
        const filename = path.split("/").pop() || "attachment";
        const matchedDownload = downloadedAttachments.find(a => a.filename === filename);
        await adminClient.from("ticket_attachments").insert({
          ticket_id,
          uploaded_by: userData.user.id,
          file_name: filename,
          file_path: path,
          file_type: matchedDownload?.contentType || "application/octet-stream",
          file_size: matchedDownload?.size || 0,
        });
      }
    }

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
