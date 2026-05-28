// Fase 5B — generate operational notifications for next_action deadlines.
// Idempotent: relies on create_notification() helper which skips duplicates
// of (user_id, type, ticket_id) when unread.
//
// Fase 5B.1: hardened authorization — only service-role calls (cron) or
// authenticated supervisors can trigger this function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // --- Authorization gate ---
    // Allow if caller presents the service-role key (scheduled cron / internal),
    // otherwise require authenticated supervisor JWT.
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const isServiceRole = bearer && bearer === SERVICE_KEY;

    if (!isServiceRole) {
      if (!bearer) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: claims, error: claimsErr } = await userClient.auth.getClaims(bearer);
      if (claimsErr || !claims?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = claims.claims.sub;
      // Verify supervisor role via service-role client (bypasses RLS safely)
      const admin = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data: roleRow } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "supervisor")
        .maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);

    // Get open statuses (not closed, not resolved) — use ticket_statuses flags, not text
    const { data: statuses } = await supabase
      .from("ticket_statuses")
      .select("id, is_closed, is_resolved");
    const openIds = (statuses || []).filter((s: any) => !s.is_closed && !s.is_resolved).map((s: any) => s.id);

    // Supervisors (fallback recipients)
    const { data: supRoles } = await supabase
      .from("user_roles")
      .select("user_id, profiles!inner(is_active)")
      .eq("role", "supervisor");
    const supervisors = (supRoles || []).filter((r: any) => r.profiles?.is_active !== false).map((r: any) => r.user_id);

    // Fetch tickets with a due action
    const { data: tickets, error } = await supabase
      .from("tickets")
      .select("id, ticket_number, subject, assigned_to, status, next_action, next_action_due_at")
      .in("status", openIds.length ? openIds : ["__none__"])
      .not("next_action_due_at", "is", null)
      .lte("next_action_due_at", endOfDay.toISOString());

    if (error) throw error;

    let dueTodayCreated = 0;
    let overdueCreated = 0;

    for (const t of tickets || []) {
      const due = new Date(t.next_action_due_at as string);
      const isOverdue = due.getTime() < now.getTime();
      const isToday = due >= startOfDay && due <= endOfDay;

      const type = isOverdue ? "ticket_next_action_overdue" : (isToday ? "ticket_next_action_due_today" : null);
      if (!type) continue;

      const title = isOverdue
        ? `Ação atrasada: #${t.ticket_number}`
        : `Ação para hoje: #${t.ticket_number}`;
      const message = (t.next_action || "Próxima ação definida.") + " — " + (t.subject || "");
      const priority = isOverdue ? "urgent" : "high";

      const recipients = t.assigned_to ? [t.assigned_to] : supervisors;
      for (const userId of recipients) {
        const { error: nErr } = await supabase.rpc("create_notification", {
          _user_id: userId,
          _type: type,
          _title: title,
          _message: message,
          _ticket_id: t.id,
          _inbound_email_event_id: null,
          _priority: priority,
          _due_at: t.next_action_due_at,
          _source: "edge-function",
          _metadata: { assigned: !!t.assigned_to },
        });
        if (!nErr) {
          if (isOverdue) overdueCreated++; else dueTodayCreated++;
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, scanned: tickets?.length ?? 0, dueTodayCreated, overdueCreated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
