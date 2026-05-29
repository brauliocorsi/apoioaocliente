// Sync Let's Call CDR → phone_calls table
// Triggered by pg_cron every 5 minutes (no JWT required)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LC_BASE = "https://ccpbx.letscall.net";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LC_EMAIL = Deno.env.get("LETSCALL_EMAIL")!;
const LC_PASSWORD = Deno.env.get("LETSCALL_PASSWORD")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function getJwt(): Promise<string> {
  // Check cache
  const { data: rows } = await admin
    .from("system_settings")
    .select("key,value")
    .in("key", ["letscall_jwt", "letscall_jwt_expires_at"]);
  const map: Record<string, string> = {};
  (rows || []).forEach((r: any) => (map[r.key] = r.value || ""));
  const cached = map["letscall_jwt"];
  const exp = parseInt(map["letscall_jwt_expires_at"] || "0", 10);
  // Renew if missing or expires in less than 1 hour
  if (cached && exp > Date.now() + 3600_000) return cached;

  // Try refresh first if we have a token
  if (cached) {
    try {
      const r = await fetch(`${LC_BASE}/api/v2/refresh`, {
        method: "GET",
        headers: { Authorization: `Bearer ${cached}`, Accept: "application/json" },
      });
      if (r.ok) {
        const j = await r.json();
        const tok = j.access_token || j.token;
        const expSecs = j.expires_in || 450000;
        if (tok) {
          await persistJwt(tok, Date.now() + expSecs * 1000);
          return tok;
        }
      }
    } catch { /* fall through to login */ }
  }

  // Fresh login
  const r = await fetch(`${LC_BASE}/api/v2/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: LC_EMAIL, password: LC_PASSWORD }),
  });
  if (!r.ok) throw new Error(`Let's Call login failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  const tok = j.access_token || j.token;
  const expSecs = j.expires_in || 450000;
  if (!tok) throw new Error("No token returned from Let's Call");
  await persistJwt(tok, Date.now() + expSecs * 1000);
  return tok;
}

async function persistJwt(tok: string, expiresAtMs: number) {
  await admin.from("system_settings").upsert(
    [
      { key: "letscall_jwt", value: tok },
      { key: "letscall_jwt_expires_at", value: String(expiresAtMs) },
    ],
    { onConflict: "key" },
  );
}

function yyyymm(d: Date): number {
  return d.getUTCFullYear() * 100 + (d.getUTCMonth() + 1);
}

async function fetchCdrPage(jwt: string, month: number, page: number, limit: number) {
  const url = new URL(`${LC_BASE}/api/v2/pbx/loadCdr`);
  url.searchParams.set("month", String(month));
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("order", "-calldate");
  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${jwt}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`loadCdr ${month} p${page} failed: ${r.status}`);
  return await r.json();
}

function normalizePhone(p: string | null | undefined): string {
  return (p || "").replace(/\D/g, "").replace(/^00351/, "").replace(/^351/, "");
}

async function upsertCdr(cdr: any, month: number, fallbackCreator: string) {
  const linkedid = String(cdr.linkedid || cdr.id);
  if (!linkedid) return { skipped: true };

  const direction = String(cdr.direction || "").toLowerCase();
  const isIncoming = direction === "incoming";
  const clientPhone = isIncoming ? (cdr.callerid || "") : (cdr.destination || "");
  const clientName = isIncoming ? (cdr.src_name || cdr.callerid || "Desconhecido")
                                  : (cdr.dst_name || cdr.destination || "Desconhecido");

  // Extract extension (preference: queueAgent → dst for outbound → src for inbound attended)
  const extRaw = cdr.queueAgent || cdr.queue_agent || cdr.agent_extension
    || (isIncoming ? cdr.dst_extension : cdr.src_extension)
    || (isIncoming ? cdr.destination : cdr.callerid);
  const extMatch = String(extRaw || "").match(/\b(\d{3,4})\b/);
  const extension = extMatch ? extMatch[1] : null;

  // Check if already exists
  const { data: existing } = await admin
    .from("phone_calls")
    .select("id")
    .eq("letscall_linkedid", linkedid)
    .maybeSingle();

  const calldate = cdr.calldate ? new Date(cdr.calldate).toISOString() : new Date().toISOString();
  const attended = !!cdr.attended;

  // Update extension status (most recent wins)
  if (extension) {
    await admin.from("microsip_extension_status").upsert({
      extension: parseInt(extension, 10),
      last_call_at: calldate,
      last_direction: direction,
      last_attended: attended,
      last_seen_source: "cdr",
      updated_at: new Date().toISOString(),
    }, { onConflict: "extension" });
  }

  if (existing) return { existing: true };

  // Try to link to an open ticket by normalized phone match against any existing client
  const normalized = normalizePhone(clientPhone);
  let ticketId: string | null = null;
  if (normalized.length >= 6) {
    const { data: match } = await admin
      .from("phone_calls")
      .select("ticket_id")
      .ilike("client_phone", `%${normalized}%`)
      .not("ticket_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    ticketId = (match as any)?.ticket_id || null;
  }

  const duration = Number(cdr.duration || 0);
  const ringing = Number(cdr.ringing || 0);
  const hasRec = !!cdr.record_file;

  const subject = `Chamada ${isIncoming ? "recebida" : "efetuada"}${attended ? "" : " (não atendida)"} — ${duration}s`;

  const insert: any = {
    client_name: String(clientName).slice(0, 200),
    client_phone: String(clientPhone).slice(0, 50),
    subject,
    notes: null,
    status: "pendente",
    priority: "P3",
    created_at: calldate,
    source: "letscall",
    letscall_linkedid: linkedid,
    letscall_month: month,
    direction,
    duration_seconds: duration,
    ringing_seconds: ringing,
    attended,
    has_recording: hasRec,
    closed_at: calldate, // historical — auto-close
    ticket_id: ticketId,
    created_by: fallbackCreator,
    extension,
  };

  const { error } = await admin.from("phone_calls").insert(insert);
  if (error) {
    if ((error as any).code === "23505") return { existing: true };
    throw new Error(`upsert(${linkedid}): ${error.message} | code=${error.code} | details=${error.details}`);
  }
  return { inserted: true };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Require x-cron-secret header to prevent unauthenticated invocations.
  try {
    const provided = req.headers.get("x-cron-secret") || "";
    const { data: secretRow } = await admin
      .from("system_settings")
      .select("value")
      .eq("key", "letscall_sync_cron_secret")
      .maybeSingle();
    const expected = (secretRow as any)?.value || "";
    if (!expected || provided !== expected) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }


  try {
    const jwt = await getJwt();

    // Determine fallback creator (first available agent profile)
    const { data: creatorRow, error: creatorErr } = await admin
      .from("profiles")
      .select("id")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const fallbackCreator = (creatorRow as any)?.id;
    console.log("fallbackCreator=", fallbackCreator, "err=", creatorErr?.message);
    if (!fallbackCreator) throw new Error("No active profile found to use as creator: " + (creatorErr?.message || "no rows"));

    const now = new Date();
    const months = [yyyymm(now)];
    // also include previous month during the first 3 days
    if (now.getUTCDate() <= 3) {
      const prev = new Date(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
      months.push(yyyymm(prev));
    }

    let totalInserted = 0;
    let totalSeen = 0;
    const errors: string[] = [];

    for (const month of months) {
      let page = 1;
      const limit = 100;
      let pagesProcessed = 0;
      while (pagesProcessed < 20) { // hard cap
        let resp: any;
        try { resp = await fetchCdrPage(jwt, month, page, limit); }
        catch (e) { errors.push(String(e)); break; }
        const items: any[] = resp?.data || [];
        if (items.length === 0) break;
        let pageInsertedCount = 0;
        for (const cdr of items) {
          totalSeen++;
          try {
            const r = await upsertCdr(cdr, month, fallbackCreator);
            if (r.inserted) { totalInserted++; pageInsertedCount++; }
          } catch (e) { errors.push(e instanceof Error ? e.message : JSON.stringify(e)); }
        }
        // Optimization: if no new inserts on this page AND we are past page 1, we have caught up
        if (pageInsertedCount === 0 && page > 1) break;
        const total = resp?.meta?.total || 0;
        if (page * limit >= total) break;
        page++;
        pagesProcessed++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, months, totalSeen, totalInserted, errors: errors.slice(0, 10) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
