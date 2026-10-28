import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { emailTicketSchema, readBoundedBody } from "./schema.ts";

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Utilize POST." }, 405);
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Autenticação necessária." }, 401);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) return json({ error: "Serviço indisponível." }, 503);
  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await client.auth.getUser(token);
  if (authError || !auth.user) return json({ error: "Sessão inválida ou expirada." }, 401);
  const [{ data: roles, error: roleError }, { data: profile, error: profileError }] = await Promise.all([
    client.from("user_roles").select("role").eq("user_id", auth.user.id).in("role", ["agent", "supervisor"]),
    client.from("profiles").select("is_active").eq("id", auth.user.id).maybeSingle(),
  ]);
  if (roleError || profileError) return json({ error: "Não foi possível verificar as permissões." }, 503);
  if (!roles?.length || profile?.is_active !== true) return json({ error: "Acesso reservado à equipa ativa." }, 403);
  if (!request.headers.get("Content-Type")?.includes("application/json")) return json({ error: "Envie application/json." }, 415);
  try {
    const parsed = emailTicketSchema.safeParse(await readBoundedBody(request));
    if (!parsed.success) return json({ error: "Dados inválidos.", fields: parsed.error.flatten() }, 400);
    const { idempotency_key, ...payload } = parsed.data;
    const { data, error } = await client.rpc("create_ticket_from_email_data", { p_key: idempotency_key, p_payload: payload });
    if (error) {
      if (error.code === "23505") return json({ error: "Chave já utilizada com outros dados ou ticket removido." }, 409);
      if (error.code === "42501") return json({ error: "Sem permissão para criar tickets." }, 403);
      if (error.code === "22023" || error.code === "23503") return json({ error: "Categoria, estado inicial ou dados inválidos." }, 400);
      return json({ error: "Receção indisponível; configuração da automação pendente." }, 503);
    }
    return json(data, data?.replayed ? 200 : 201);
  } catch (error) {
    return json({ error: error instanceof Error && error.message === "body_too_large" ? "Pedido excede 100 KB." : "JSON inválido." }, error instanceof Error && error.message === "body_too_large" ? 413 : 400);
  }
});