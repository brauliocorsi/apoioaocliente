import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

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
      // Check if already a client
      const { data: existingClient } = await adminClient
        .from("client_users")
        .select("id")
        .eq("id", existingUser.id)
        .single();

      if (existingClient) {
        userId = existingUser.id;
        // Resend welcome email with new password if requested
        if (resend_welcome) {
          password = generatePassword();
          await adminClient.auth.admin.updateUserById(userId, { password });
        }
      } else {
        // User exists but not as client — add client profile and role
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
      // Create new user
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

      // The handle_new_user trigger creates a profile and agent role.
      // We need to change the role to client and create client_users entry.
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
        const portalUrl = req.headers.get("origin") || "https://portal.exemplo.com";
        const subject = template.subject
          .replace("{nome_cliente}", full_name);
        const body = template.body_html
          .replace("{nome_cliente}", full_name)
          .replace("{email}", email)
          .replace("{password}", password)
          .replace(/{portal_url}/g, `${portalUrl}/portal/login`);

        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Apoio ao Cliente <noreply@upmoveis.pt>",
            to: [email],
            subject,
            html: body,
          }),
        });
        const emailResult = await emailRes.json();
        console.log("Resend response:", JSON.stringify(emailResult));
        if (!emailRes.ok) {
          console.error("Resend error:", emailResult);
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
