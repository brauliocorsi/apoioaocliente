// Fase 5C — envia e-mail ao cliente a partir de uma client_notification.
// Chamada por trigger via pg_net. Falha silenciosa (apenas regista erro).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AUTOMATIC_ADDR = /^(noreply|no-reply|mailer-daemon|postmaster|donotreply)@/i;

function wrapHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f7f7f7;">
<div style="max-width:600px;margin:20px auto;background:#fff;border-radius:6px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#333;padding:28px 32px;">
  <h2 style="margin:0 0 16px 0;color:#222;">${title}</h2>
  ${bodyHtml}
  <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;">
  <div style="font-size:12px;color:#888;">
    <p style="margin:0;font-weight:bold;color:#555;">UP Móveis</p>
    <p style="margin:0;">Apoio ao Cliente</p>
    <p style="margin:0;">✉ apoioaocliente@upmoveis.pt · 🌐 www.upmoveis.pt</p>
  </div>
</div></body></html>`;
}

async function loadCfg(admin: ReturnType<typeof createClient>) {
  const { data } = await admin.from("system_settings").select("key, value")
    .in("key", ["smtp_host","smtp_port","smtp_user","smtp_pass","smtp_from_name","smtp_from_email","resend_enabled","resend_from_email"]);
  const cfg: Record<string, string> = {};
  data?.forEach((s: { key: string; value: string }) => { cfg[s.key] = s.value; });
  return cfg;
}

async function sendResend(from: string, to: string, subject: string, text: string, html: string): Promise<{ id?: string }> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY ausente");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return await res.json();
}

async function sendSmtp(cfg: Record<string,string>, to: string, subject: string, text: string, html: string) {
  const port = Number(cfg.smtp_port) || 465;
  const c = new SMTPClient({ connection: { hostname: cfg.smtp_host, port, tls: port === 465, auth: { username: cfg.smtp_user, password: cfg.smtp_pass } } });
  const from = `${cfg.smtp_from_name || "Apoio ao Cliente"} <${cfg.smtp_from_email || cfg.smtp_user}>`;
  await c.send({ from, to, subject, content: text, html });
  try { await c.close(); } catch { /* ignore */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    // --- Autorização: aceitar apenas chamadas internas ---
    // (a) Authorization: Bearer <service_role_key>, ou
    // (b) x-dispatch-secret = system_settings.client_notification_dispatch_secret
    const authHeader = req.headers.get("authorization") || "";
    const dispatchSecretHeader = req.headers.get("x-dispatch-secret") || "";
    let authorized = false;

    if (authHeader === `Bearer ${serviceKey}`) {
      authorized = true;
    } else if (dispatchSecretHeader) {
      const { data: row } = await admin
        .from("system_settings")
        .select("value")
        .eq("key", "client_notification_dispatch_secret")
        .maybeSingle();
      if (row?.value && row.value === dispatchSecretHeader) {
        authorized = true;
      }
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { notification_id } = await req.json();
    if (!notification_id) {
      return new Response(JSON.stringify({ error: "notification_id obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: notif } = await admin.from("client_notifications").select("*").eq("id", notification_id).single();
    if (!notif) return new Response(JSON.stringify({ error: "não encontrado" }), { status: 404, headers: corsHeaders });

    if (notif.email_sent) {
      return new Response(JSON.stringify({ skipped: "already_sent" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Resolver e-mail destinatário
    let email: string | null = (notif.metadata?.client_email as string) || null;
    let name: string | null = (notif.metadata?.client_name as string) || null;
    if ((!email || !name) && notif.client_user_id) {
      const { data: cu } = await admin.from("client_users").select("email, full_name").eq("id", notif.client_user_id).single();
      if (cu) { email = email || cu.email; name = name || cu.full_name; }
    }
    if (!email && notif.ticket_id) {
      const { data: t } = await admin.from("tickets").select("client_email, client_name").eq("id", notif.ticket_id).single();
      if (t) { email = email || t.client_email; name = name || t.client_name; }
    }

    if (!email) {
      await admin.from("client_notifications").update({ email_error: "sem e-mail destinatário" }).eq("id", notif.id);
      return new Response(JSON.stringify({ skipped: "no_email" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (AUTOMATIC_ADDR.test(email)) {
      await admin.from("client_notifications").update({ email_error: "endereço automático bloqueado" }).eq("id", notif.id);
      return new Response(JSON.stringify({ skipped: "automatic_address" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ticketNumber = notif.metadata?.ticket_number || "";
    const greeting = name ? `Olá ${name},` : "Olá,";
    const bodyMessage = (notif.message || "").replace(/\n/g, "<br>");
    const html = wrapHtml(notif.title, `
      <p>${greeting}</p>
      <p>${bodyMessage}</p>
      ${ticketNumber ? `<p style="margin-top:16px;">Pode consultar e responder pelo <a href="https://sistemaupmoveis.com/portal/tickets" style="color:#c00;">portal do cliente</a> ou respondendo a este e-mail.</p>` : ""}
      <p style="margin-top:24px;">Obrigado,<br>UP Móveis — Apoio ao Cliente</p>
    `);
    const text = `${greeting}\n\n${notif.message || notif.title}\n\nUP Móveis — Apoio ao Cliente`;
    const subject = notif.title;

    const cfg = await loadCfg(admin);
    const useResend = cfg.resend_enabled === "true";

    let providerMessageId: string | null = null;
    try {
      if (useResend) {
        const from = `${cfg.smtp_from_name || "Apoio ao Cliente"} <${cfg.resend_from_email || cfg.smtp_from_email || "noreply@upmoveis.pt"}>`;
        const result = await sendResend(from, email, subject, text, html);
        providerMessageId = result?.id ?? null;
      } else if (cfg.smtp_host && cfg.smtp_user && cfg.smtp_pass) {
        await sendSmtp(cfg, email, subject, text, html);
      } else {
        throw new Error("Sem configuração de e-mail (Resend ou SMTP).");
      }

      await admin.from("client_notifications").update({
        email_sent: true, email_sent_at: new Date().toISOString(), email_error: null,
      }).eq("id", notif.id);

      await admin.from("email_logs").insert({
        recipient: email, subject, status: "sent",
        source: "client_notification", ticket_id: notif.ticket_id,
        smtp_response: useResend ? "Resend API" : `SMTP ${cfg.smtp_host}`,
        delivery_status: useResend ? "sent" : "accepted",
        delivery_details: `Notificação cliente: ${notif.type}`,
        provider: useResend ? "resend" : "smtp",
        provider_message_id: providerMessageId,
        last_event_at: new Date().toISOString(),
      });

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (sendErr) {
      const msg = (sendErr as Error).message;
      await admin.from("client_notifications").update({ email_error: msg }).eq("id", notif.id);
      await admin.from("email_logs").insert({
        recipient: email, subject, status: "failed",
        source: "client_notification", ticket_id: notif.ticket_id, error_message: msg,
        delivery_status: "failed", provider: useResend ? "resend" : "smtp",
        last_event_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("send-client-notification error:", (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
