import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function testSmtpConnection(hostname: string, port: number): Promise<string> {
  const timeout = 10_000;
  const timer = setTimeout(() => {}, timeout);

  try {
    let conn: Deno.Conn;
    if (port === 465) {
      conn = await Deno.connectTls({ hostname, port });
    } else {
      conn = await Deno.connect({ hostname, port });
    }

    const buf = new Uint8Array(1024);
    const n = await conn.read(buf);
    conn.close();
    clearTimeout(timer);

    if (n === null) throw new Error("Servidor não respondeu.");

    const banner = new TextDecoder().decode(buf.subarray(0, n));
    if (!banner.startsWith("220")) throw new Error(`Resposta inesperada do servidor: ${banner.trim()}`);

    return `Conexão SMTP com ${hostname}:${port} estabelecida com sucesso. Banner: ${banner.trim()}`;
  } catch (err) {
    clearTimeout(timer);
    const msg = (err as Error).message || String(err);
    if (msg.includes("abort") || msg.includes("timed out") || msg.includes("TimedOut")) {
      throw new Error(`Timeout: o servidor ${hostname}:${port} não respondeu em ${timeout / 1000}s.`);
    }
    if (msg.includes("dns") || msg.includes("NotFound") || msg.includes("not known")) {
      throw new Error(`Hostname não encontrado: ${hostname}.`);
    }
    if (msg.includes("refused")) {
      throw new Error(`Conexão recusada em ${hostname}:${port}.`);
    }
    throw err;
  }
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
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, message: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ success: false, message: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sendTo: string | null = null;
    try {
      const body = await req.json();
      sendTo = body?.send_to || null;
    } catch { /* No body = connection test only */ }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: settings } = await adminClient
      .from("system_settings")
      .select("key, value")
      .in("key", ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from_name", "smtp_from_email", "resend_enabled", "resend_from_email"]);

    const cfg: Record<string, string> = {};
    settings?.forEach((s: { key: string; value: string }) => { cfg[s.key] = s.value; });

    const useResend = cfg.resend_enabled === "true";

    if (!useResend && (!cfg.smtp_host || !cfg.smtp_user || !cfg.smtp_pass)) {
      return new Response(
        JSON.stringify({ success: false, message: "Configuração SMTP incompleta e Resend não está ativo." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const port = Number(cfg.smtp_port) || 465;

    if (sendTo) {
      const testSubject = "Email de Teste - Sistema de Tickets";
      const testText = "Este é um email de teste enviado pelo sistema de tickets.\n\n--\nUP Móveis - Apoio ao Cliente";

      try {
        if (useResend) {
          const fromAddr = `${cfg.smtp_from_name || "Apoio ao Cliente"} <${cfg.resend_from_email || cfg.smtp_from_email || "noreply@upmoveis.pt"}>`;
          await sendViaResend(fromAddr, sendTo, testSubject, testText);
        } else {
          const client = new SMTPClient({
            connection: { hostname: cfg.smtp_host, port, tls: port === 465, auth: { username: cfg.smtp_user, password: cfg.smtp_pass } },
          });
          const fromAddr = `${cfg.smtp_from_name || "Apoio ao Cliente"} <${cfg.smtp_from_email || cfg.smtp_user}>`;
          await client.send({ from: fromAddr, to: sendTo, subject: testSubject, content: testText, html: testText });
          try { await client.close(); } catch { /* ignore */ }
        }

        await adminClient.from("email_logs").insert({ recipient: sendTo, subject: testSubject, status: "sent", source: "test-smtp" });
        return new Response(
          JSON.stringify({ success: true, message: `Email de teste enviado com sucesso para ${sendTo} via ${useResend ? "Resend" : "SMTP"}.` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (sendErr) {
        await adminClient.from("email_logs").insert({ recipient: sendTo, subject: testSubject, status: "failed", error_message: (sendErr as Error).message, source: "test-smtp" });
        throw sendErr;
      }
    }

    // Connection test only
    if (useResend) {
      return new Response(
        JSON.stringify({ success: true, message: "Resend está ativo. Use 'Enviar Email de Teste' para verificar o envio." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const message = await testSmtpConnection(cfg.smtp_host, port);
    return new Response(
      JSON.stringify({ success: true, message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = (err as Error).message || String(err);
    console.error("SMTP test error:", message);
    return new Response(
      JSON.stringify({ success: false, message: `Erro: ${message}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
