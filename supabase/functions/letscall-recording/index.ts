// Stream a Let's Call recording MP3 to the authenticated agent
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LC_BASE = "https://ccpbx.letscall.net";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LC_EMAIL = Deno.env.get("LETSCALL_EMAIL")!;
const LC_PASSWORD = Deno.env.get("LETSCALL_PASSWORD")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function getJwt(): Promise<string> {
  const { data: rows } = await admin
    .from("system_settings").select("key,value")
    .in("key", ["letscall_jwt", "letscall_jwt_expires_at"]);
  const map: Record<string, string> = {};
  (rows || []).forEach((r: any) => (map[r.key] = r.value || ""));
  const cached = map["letscall_jwt"];
  const exp = parseInt(map["letscall_jwt_expires_at"] || "0", 10);
  if (cached && exp > Date.now() + 3600_000) return cached;

  const r = await fetch(`${LC_BASE}/api/v2/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: LC_EMAIL, password: LC_PASSWORD }),
  });
  if (!r.ok) throw new Error("login failed");
  const j = await r.json();
  const tok = j.access_token || j.token;
  const expSecs = j.expires_in || 450000;
  await admin.from("system_settings").upsert([
    { key: "letscall_jwt", value: tok },
    { key: "letscall_jwt_expires_at", value: String(Date.now() + expSecs * 1000) },
  ], { onConflict: "key" });
  return tok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Authenticate caller (must be an active agent/supervisor)
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const { data: roleData } = await admin.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    if (!roleData || !["agent", "supervisor"].includes((roleData as any).role)) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    const url = new URL(req.url);
    const callId = url.searchParams.get("call_id");
    if (!callId) return new Response("Missing call_id", { status: 400, headers: corsHeaders });

    const { data: call } = await admin.from("phone_calls")
      .select("letscall_linkedid, letscall_month, has_recording")
      .eq("id", callId).maybeSingle();
    if (!call || !(call as any).has_recording) {
      return new Response("Recording not available", { status: 404, headers: corsHeaders });
    }

    const jwt = await getJwt();
    const r = await fetch(
      `${LC_BASE}/api/v2/pbx/recordFile/${(call as any).letscall_month}/${(call as any).letscall_linkedid}`,
      { headers: { Authorization: `Bearer ${jwt}`, Accept: "audio/mp3" } },
    );
    if (!r.ok) return new Response(`Upstream ${r.status}`, { status: 502, headers: corsHeaders });

    return new Response(r.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": r.headers.get("Content-Type") || "audio/mpeg",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
