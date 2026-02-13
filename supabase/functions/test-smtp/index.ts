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

    // Verify caller is agent/supervisor
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

    // Load SMTP settings from system_settings
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: settings } = await adminClient
      .from("system_settings")
      .select("key, value")
      .in("key", ["smtp_host", "smtp_port", "smtp_user", "smtp_pass"]);

    const cfg: Record<string, string> = {};
    settings?.forEach((s: { key: string; value: string }) => {
      cfg[s.key] = s.value;
    });

    if (!cfg.smtp_host || !cfg.smtp_user || !cfg.smtp_pass) {
      return new Response(
        JSON.stringify({ success: false, message: "Configuração SMTP incompleta. Preencha host, utilizador e password." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const port = Number(cfg.smtp_port) || 465;
    const useTLS = port === 465;

    const client = new SMTPClient({
      connection: {
        hostname: cfg.smtp_host,
        port,
        tls: useTLS,
        auth: {
          username: cfg.smtp_user,
          password: cfg.smtp_pass,
        },
      },
    });

    // Just connect and close to test
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
