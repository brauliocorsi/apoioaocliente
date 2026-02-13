import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Parse optional body for send_to
    let sendTo: string | null = null;
    try {
      const body = await req.json();
      sendTo = body?.send_to || null;
    } catch {
      // No body = connection test only
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: settings } = await adminClient
      .from("system_settings")
      .select("key, value")
      .in("key", ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from_name", "smtp_from_email"]);

    const cfg: Record<string, string> = {};
    settings?.forEach((s: { key: string; value: string }) => { cfg[s.key] = s.value; });

    if (!cfg.smtp_host || !cfg.smtp_user || !cfg.smtp_pass) {
      return new Response(
        JSON.stringify({ success: false, message: "Configuração SMTP incompleta. Preencha host, utilizador e password." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    if (sendTo) {
      const fromAddr = `${cfg.smtp_from_name || "Apoio ao Cliente"} <${cfg.smtp_from_email || cfg.smtp_user}>`;
      const testSubject = "Email de Teste - Sistema de Tickets";
      try {
        await client.send({
          from: fromAddr,
          to: sendTo,
          subject: testSubject,
          content: "Este é um email de teste enviado pelo sistema de tickets.",
          html: `<div style="font-family:sans-serif;padding:20px;max-width:500px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px">
            <h2 style="color:#1f2937;margin-bottom:12px">✅ Email de Teste</h2>
            <p style="color:#4b5563">Este email confirma que a configuração SMTP do sistema de tickets está a funcionar corretamente.</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
            <p style="color:#9ca3af;font-size:12px">Enviado automaticamente pelo sistema.</p>
          </div>`,
        });
        await client.close();
        await adminClient.from("email_logs").insert({
          recipient: sendTo,
          subject: testSubject,
          status: "sent",
          source: "test-smtp",
        });
        return new Response(
          JSON.stringify({ success: true, message: `Email de teste enviado com sucesso para ${sendTo}.` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (sendErr) {
        await client.close().catch(() => {});
        await adminClient.from("email_logs").insert({
          recipient: sendTo,
          subject: testSubject,
          status: "failed",
          error_message: (sendErr as Error).message,
          source: "test-smtp",
        });
        throw sendErr;
      }
    }

    // Connection test only
    await client.close();
    return new Response(
      JSON.stringify({ success: true, message: `Conexão SMTP com ${cfg.smtp_host}:${port} estabelecida com sucesso.` }),
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
