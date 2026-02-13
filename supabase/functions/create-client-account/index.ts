import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generatePassword(length = 12): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join("");
}

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

    // Verify caller is agent/supervisor
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

    // Check caller is agent
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .in("role", ["agent", "supervisor"])
      .limit(1);

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Apenas agentes podem criar contas de cliente" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, full_name, phone, ticket_id, resend_welcome } = await req.json();
    if (!email || !full_name) {
      return new Response(JSON.stringify({ error: "Email e nome são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if client already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u) => u.email === email);

    let userId: string;
    let password: string | null = null;

    if (existingUser) {
      const { data: existingClient } = await adminClient
        .from("client_users")
        .select("id")
        .eq("id", existingUser.id)
        .single();

      if (existingClient) {
        userId = existingUser.id;
        if (resend_welcome) {
          password = generatePassword();
          await adminClient.auth.admin.updateUserById(userId, { password });
        }
      } else {
        userId = existingUser.id;
        await adminClient.from("client_users").insert({
          id: userId,
          email,
          full_name,
          phone: phone || null,
        });
        await adminClient.from("user_roles").insert({
          user_id: userId,
          role: "client",
        });
      }
    } else {
      password = generatePassword();
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      userId = newUser.user!.id;

      await adminClient.from("user_roles").update({ role: "client" }).eq("user_id", userId);
      await adminClient.from("client_users").insert({
        id: userId,
        email,
        full_name,
        phone: phone || null,
      });
    }

    // Link ticket to client if provided
    if (ticket_id) {
      await adminClient.from("tickets").update({ client_user_id: userId }).eq("id", ticket_id);
    }

    // Send welcome email with credentials if new account
    if (password) {
      const { data: template } = await adminClient
        .from("email_templates")
        .select("subject, body_html")
        .eq("id", "welcome")
        .single();

      if (template) {
        const smtpCfg = await getSmtpConfig(adminClient);
        if (smtpCfg.smtp_host && smtpCfg.smtp_user && smtpCfg.smtp_pass) {
          const portalUrl = req.headers.get("origin") || "https://portal.exemplo.com";
          const subject = template.subject.replace("{nome_cliente}", full_name);
          const body = template.body_html
            .replace("{nome_cliente}", full_name)
            .replace("{email}", email)
            .replace("{password}", password)
            .replace(/{portal_url}/g, `${portalUrl}/portal/login`);

          try {
            await sendEmail(smtpCfg, email, subject, body);
            console.log("Welcome email sent via SMTP to", email);
          } catch (emailErr) {
            console.error("SMTP send error:", (emailErr as Error).message);
          }
        } else {
          console.warn("SMTP not configured, skipping welcome email");
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, user_id: userId, is_new: !!password }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
