// Sends an automatic "ticket created" confirmation to the client.
// Invoked from: fetch-inbound-emails (email + closed-continuation),
// PortalNewTicket (portal), TicketNew (manual agent if "notify_client").
//
// Never throws if email fails — caller's ticket creation must not roll back.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Source = "email" | "email_closed_continuation" | "portal" | "manual_agent";

// Helper: decide if a confirmation should be sent based on sender / subject / headers.
// Exported semantics — applied to the *recipient* email (since the recipient
// of the confirmation is the same address that originated the ticket).
function shouldSendTicketConfirmation(opts: {
  fromEmail?: string | null;
  subject?: string | null;
  headers?: Record<string, string> | null;
}): boolean {
  const email = (opts.fromEmail || "").toLowerCase().trim();
  if (!email || !email.includes("@")) return false;

  const blockedSubstrings = ["noreply", "no-reply", "mailer-daemon", "postmaster"];
  if (blockedSubstrings.some((s) => email.includes(s))) return false;

  const subject = (opts.subject || "").toLowerCase();
  const blockedSubjects = [
    "auto-reply",
    "automatic reply",
    "out of office",
    "fora do escritório",
    "fora do escritorio",
    "undeliverable",
    "delivery status notification",
  ];
  if (blockedSubjects.some((s) => subject.includes(s))) return false;

  if (opts.headers) {
    const normalized: Record<string, string> = {};
    for (const [k, v] of Object.entries(opts.headers)) {
      normalized[k.toLowerCase()] = String(v).toLowerCase();
    }
    const autoSubmitted = normalized["auto-submitted"];
    if (autoSubmitted && autoSubmitted !== "no") return false;
    const precedence = normalized["precedence"];
    if (precedence && ["bulk", "junk", "list"].includes(precedence)) return false;
  }

  return true;
}

async function getEmailConfig(adminClient: ReturnType<typeof createClient>) {
  const { data } = await adminClient
    .from("system_settings")
    .select("key, value")
    .in("key", [
      "smtp_host", "smtp_port", "smtp_user", "smtp_pass",
      "smtp_from_name", "smtp_from_email",
      "resend_enabled", "resend_from_email",
    ]);
  const cfg: Record<string, string> = {};
  data?.forEach((s: { key: string; value: string }) => { cfg[s.key] = s.value; });
  return cfg;
}

function buildEmail(ticketNumber: number | string, clientName: string | null | undefined, subject: string | null | undefined) {
  const greeting = clientName && clientName.trim() ? `Olá ${clientName.trim()},` : "Olá,";
  const resumo = (subject || "—").trim();
  const text =
`${greeting}

Recebemos o seu pedido e abrimos o ticket #${ticketNumber}.

Resumo:
${resumo}

A nossa equipa irá analisar o caso. Para adicionar informação, responda diretamente a este e-mail mantendo o número do ticket no assunto.

Obrigado,
UP Móveis — Apoio ao Cliente`;

  const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:Arial,Helvetica,sans-serif;color:#333;font-size:14px;line-height:1.6;">
<div style="max-width:600px;margin:20px auto;background:#fff;border-radius:6px;padding:28px 32px;">
  <p>${greeting}</p>
  <p>Recebemos o seu pedido e abrimos o ticket <strong>#${ticketNumber}</strong>.</p>
  <p><strong>Resumo:</strong><br>${escapeHtml(resumo)}</p>
  <p>A nossa equipa irá analisar o caso. Para adicionar informação, responda diretamente a este e-mail mantendo o número do ticket no assunto.</p>
  <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;">
  <p style="font-size:12px;color:#888;">UP Móveis — Apoio ao Cliente<br>✉ apoioaocliente@upmoveis.pt</p>
</div></body></html>`;
  return { text, html, subject: `Recebemos o seu pedido — Ticket #${ticketNumber}` };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

async function sendViaResend(from: string, to: string, subject: string, text: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY não configurada");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  });
  if (!res.ok) throw new Error(`Resend (${res.status}): ${await res.text()}`);
}

async function sendViaSmtp(cfg: Record<string, string>, to: string, subject: string, text: string, html: string) {
  const port = Number(cfg.smtp_port) || 465;
  const client = new SMTPClient({
    connection: {
      hostname: cfg.smtp_host, port, tls: port === 465,
      auth: { username: cfg.smtp_user, password: cfg.smtp_pass },
    },
  });
  const fromAddr = `${cfg.smtp_from_name || "Apoio ao Cliente"} <${cfg.smtp_from_email || cfg.smtp_user}>`;
  await client.send({ from: fromAddr, to, subject, content: text, html });
  try { await client.close(); } catch { /* ignore */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json().catch(() => ({}));
    const ticketId: string | undefined = body.ticket_id;
    const source: Source = body.source || "manual_agent";
    const headers = body.headers as Record<string, string> | null | undefined;

    if (!ticketId) {
      return new Response(JSON.stringify({ success: false, message: "ticket_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: ticket } = await adminClient
      .from("tickets")
      .select("id, ticket_number, subject, client_name, client_email, client_user_id")
      .eq("id", ticketId)
      .single();

    if (!ticket) {
      return new Response(JSON.stringify({ success: false, message: "Ticket não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve recipient: prefer linked client_users record, fallback to ticket.client_email
    let toEmail = ticket.client_email as string | null;
    let toName = ticket.client_name as string | null;
    if (ticket.client_user_id) {
      const { data: cu } = await adminClient
        .from("client_users")
        .select("email, full_name")
        .eq("id", ticket.client_user_id)
        .single();
      if (cu?.email) { toEmail = cu.email; toName = cu.full_name || toName; }
    }

    if (!toEmail) {
      return new Response(JSON.stringify({ success: false, message: "Sem e-mail do cliente" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!shouldSendTicketConfirmation({ fromEmail: toEmail, subject: ticket.subject, headers })) {
      await adminClient.from("email_logs").insert({
        recipient: toEmail, subject: `Ticket #${ticket.ticket_number}`,
        status: "skipped", source: "ticket_created_confirmation",
        ticket_id: ticketId,
        delivery_details: `skipped:${source}:auto-sender`,
      });
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cfg = await getEmailConfig(adminClient);
    const useResend = cfg.resend_enabled === "true";
    const { text, html, subject } = buildEmail(ticket.ticket_number, toName, ticket.subject);

    try {
      if (useResend) {
        const fromAddr = `${cfg.smtp_from_name || "Apoio ao Cliente"} <${cfg.resend_from_email || cfg.smtp_from_email || "noreply@upmoveis.pt"}>`;
        await sendViaResend(fromAddr, toEmail, subject, text, html);
      } else if (cfg.smtp_host && cfg.smtp_user && cfg.smtp_pass) {
        await sendViaSmtp(cfg, toEmail, subject, text, html);
      } else {
        throw new Error("Nenhum método de envio configurado");
      }

      await adminClient.from("email_logs").insert({
        recipient: toEmail, subject, status: "sent",
        source: "ticket_created_confirmation", ticket_id: ticketId,
        delivery_details: `source:${source}:${useResend ? "resend" : "smtp"}`,
      });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (sendErr) {
      const msg = (sendErr as Error).message;
      await adminClient.from("email_logs").insert({
        recipient: toEmail, subject, status: "failed",
        error_message: msg, source: "ticket_created_confirmation",
        ticket_id: ticketId, delivery_details: `source:${source}`,
      });
      // never throw to caller — ticket creation must not be affected
      return new Response(JSON.stringify({ success: false, message: msg }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("send-ticket-created-confirmation error:", (err as Error).message);
    return new Response(JSON.stringify({ success: false, message: (err as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
