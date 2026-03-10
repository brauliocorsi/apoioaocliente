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

    // Verify caller is supervisor
    const { data: isSupervisor } = await adminClient.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "supervisor",
    });
    if (!isSupervisor) {
      return new Response(JSON.stringify({ error: "Apenas supervisores podem eliminar clientes" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { client_user_id } = await req.json();
    if (!client_user_id) {
      return new Response(JSON.stringify({ error: "client_user_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the target is actually a client (has 'client' role or no agent/supervisor role)
    const { data: targetRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", client_user_id);

    const isAgent = targetRoles?.some((r) => r.role === "agent" || r.role === "supervisor");
    if (isAgent) {
      return new Response(JSON.stringify({ error: "Não é possível eliminar um agente/supervisor por esta via" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Remove client_user_id from tickets (set to null, keep tickets)
    await adminClient
      .from("tickets")
      .update({ client_user_id: null })
      .eq("client_user_id", client_user_id);

    // Delete from client_users table
    const { error: deleteClientError } = await adminClient
      .from("client_users")
      .delete()
      .eq("id", client_user_id);

    if (deleteClientError) {
      console.error("Error deleting client_users row:", deleteClientError.message);
      return new Response(JSON.stringify({ error: "Erro ao eliminar dados do cliente: " + deleteClientError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete user_roles for this client
    await adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", client_user_id);

    // Delete auth user
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(client_user_id);
    if (authDeleteError) {
      console.error("Error deleting auth user:", authDeleteError.message);
      // Non-fatal: data already cleaned
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("delete-client error:", (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
