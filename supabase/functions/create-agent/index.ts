import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Verify the caller is a supervisor
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "supervisor")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Apenas supervisores podem criar agentes" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, full_name, password, role } = await req.json();
    if (!email || !full_name || !password) {
      return new Response(JSON.stringify({ error: "Email, nome e password são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try to create user via admin API (auto-confirms email)
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    let userId: string | undefined;

    if (createError) {
      // If user already exists, try to find them and promote to agent/supervisor
      if (createError.message.includes("already been registered")) {
        const { data: { users } } = await adminClient.auth.admin.listUsers();
        const existingUser = users?.find((u) => u.email === email);
        if (!existingUser) {
          return new Response(JSON.stringify({ error: "Utilizador não encontrado" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        userId = existingUser.id;

        // Update password and metadata
        await adminClient.auth.admin.updateUserById(userId, {
          password,
          user_metadata: { full_name },
        });

        // Update or insert the role to agent/supervisor
        const targetRole = role === "supervisor" ? "supervisor" : "agent";
        const { data: existingRole } = await adminClient
          .from("user_roles")
          .select("id")
          .eq("user_id", userId)
          .single();

        if (existingRole) {
          await adminClient
            .from("user_roles")
            .update({ role: targetRole })
            .eq("user_id", userId);
        } else {
          await adminClient
            .from("user_roles")
            .insert({ user_id: userId, role: targetRole });
        }

        // Update profile name
        await adminClient
          .from("profiles")
          .update({ full_name })
          .eq("id", userId);
      } else {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      userId = newUser.user?.id;
      // If role is supervisor, update the auto-created agent role
      if (role === "supervisor" && userId) {
        await adminClient
          .from("user_roles")
          .update({ role: "supervisor" })
          .eq("user_id", userId);
      }
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
