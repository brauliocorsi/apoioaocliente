import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles").select("role")
      .eq("user_id", caller.id).eq("role", "supervisor").single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Apenas supervisores podem eliminar agentes" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (user_id === caller.id) {
      return new Response(JSON.stringify({ error: "Não pode eliminar a sua própria conta" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: target } = await adminClient.from("profiles").select("email, full_name").eq("id", user_id).maybeSingle();
    const { data: callerProfile } = await adminClient.from("profiles").select("full_name").eq("id", caller.id).maybeSingle();
    const audit = (status: string, error_message: string | null) =>
      adminClient.from("user_deletion_audit").insert({
        deleted_user_id: user_id,
        deleted_user_email: target?.email ?? null,
        deleted_user_name: target?.full_name ?? null,
        account_type: "agent",
        deleted_by: caller.id,
        deleted_by_name: callerProfile?.full_name ?? null,
        status,
        error_message,
      });

    // Unlink references to preserve history (tickets keep client_name in text)
    await adminClient.from("tickets").update({ assigned_to: null }).eq("assigned_to", user_id);
    await adminClient.from("phone_calls").update({ assigned_to: null }).eq("assigned_to", user_id);

    // Remove from auth first (profile/roles cascade); keeps data intact if it fails
    const { error: authErr } = await adminClient.auth.admin.deleteUser(user_id);
    if (authErr) {
      await audit("failed", authErr.message);
      return new Response(JSON.stringify({ error: "Não foi possível eliminar o agente: " + authErr.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await audit("success", null);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
