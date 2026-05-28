// Phase 9 — Suggests open tickets to append a Caixa de Entrada event to,
// based on matching the inbound event's from_address with tickets.client_email.
//
// Security:
//   - Bearer JWT required (anon key rejected).
//   - Caller must have role agent or supervisor.
//   - Portal clients are rejected (no role match).
//   - Read-only: never mutates data.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const TERMINAL = new Set(["processed", "duplicate", "spam", "ignored", "reviewed"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ error: "unauthorized" }, 401);
  }
  const token = authHeader.slice(7).trim();
  if (!token || token === anonKey || token === serviceRoleKey) {
    return json({ error: "unauthorized" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return json({ error: "invalid_token" }, 401);
  }
  const userId = claims.claims.sub as string;
  const { data: roleRows } = await admin
    .from("user_roles").select("role").eq("user_id", userId);
  const roles = (roleRows || []).map((r: { role: string }) => r.role);
  if (!roles.includes("agent") && !roles.includes("supervisor")) {
    return json({ error: "forbidden" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const eventId: string | undefined = body.event_id;
  if (!eventId || typeof eventId !== "string") {
    return json({ error: "event_id_required" }, 400);
  }

  const { data: ev } = await admin
    .from("inbound_email_events")
    .select("id, from_address, status, routed_ticket_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) return json({ error: "event_not_found" }, 404);

  const email = (ev.from_address || "").trim().toLowerCase();
  if (!email) {
    return json({ candidates: [], recommendation: "no_open_ticket" });
  }

  // Fetch all tickets for this email (any status) — we filter open/closed in code
  // to avoid leaking statuses we don't control. Limited to 50 for safety.
  const { data: tickets } = await admin
    .from("tickets")
    .select("id, ticket_number, subject, status, assigned_to, priority, updated_at, next_action, next_action_due_at")
    .ilike("client_email", email)
    .order("updated_at", { ascending: false })
    .limit(50);

  const allTickets = tickets || [];
  if (allTickets.length === 0) {
    return json({ candidates: [], recommendation: "no_open_ticket" });
  }

  const statusIds = Array.from(new Set(allTickets.map((t: any) => t.status).filter(Boolean)));
  const { data: statusRows } = await admin
    .from("ticket_statuses")
    .select("id, is_closed, is_resolved")
    .in("id", statusIds);
  const statusMap = new Map(
    (statusRows || []).map((s: any) => [s.id, { is_closed: !!s.is_closed, is_resolved: !!s.is_resolved }]),
  );

  const enriched = allTickets.map((t: any) => {
    const s = statusMap.get(t.status) || { is_closed: false, is_resolved: false };
    return { ...t, is_closed: s.is_closed, is_resolved: s.is_resolved };
  });

  const openTickets = enriched.filter((t: any) => !t.is_closed && !t.is_resolved);

  let recommendation: "auto_append_safe" | "manual_select" | "no_open_ticket" | "closed_ticket_only";
  if (openTickets.length === 0) {
    recommendation = enriched.length > 0 ? "closed_ticket_only" : "no_open_ticket";
  } else if (openTickets.length > 1) {
    recommendation = "manual_select";
  } else {
    const onlyOpen = openTickets[0];
    const eventOk =
      !TERMINAL.has(String(ev.status)) &&
      ev.status !== "quarantined" &&
      ev.status !== "failed" &&
      !ev.routed_ticket_id;
    recommendation = eventOk ? "auto_append_safe" : "manual_select";
    void onlyOpen;
  }

  // Return at most 10 candidates (open first, then closed for context)
  const candidates = [...openTickets, ...enriched.filter((t: any) => t.is_closed || t.is_resolved)]
    .slice(0, 10)
    .map((t: any) => ({
      ticket_id: t.id,
      ticket_number: t.ticket_number,
      subject: t.subject,
      status: t.status,
      is_closed: t.is_closed,
      is_resolved: t.is_resolved,
      assigned_to: t.assigned_to,
      priority: t.priority,
      updated_at: t.updated_at,
      next_action: t.next_action ?? null,
      next_action_due_at: t.next_action_due_at ?? null,
    }));

  return json({ candidates, recommendation });
});
