import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const in5min = new Date(now.getTime() + 5 * 60 * 1000);

    // Find reminders due in the next 5 minutes that haven't been completed or already notified
    const { data: reminders, error: remErr } = await supabase
      .from("phone_call_reminders")
      .select("id, phone_call_id, message, remind_at, created_by")
      .eq("is_completed", false)
      .lte("remind_at", in5min.toISOString())
      .gte("remind_at", new Date(now.getTime() - 30 * 60 * 1000).toISOString()); // only last 30min to avoid old ones

    if (remErr) throw remErr;
    if (!reminders || reminders.length === 0) {
      return new Response(JSON.stringify({ notified: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check which reminders already have a notification to avoid duplicates
    const reminderIds = reminders.map((r) => r.id);
    const { data: existing } = await supabase
      .from("agent_notifications")
      .select("id, content")
      .eq("type", "reminder")
      .gte("created_at", new Date(now.getTime() - 60 * 60 * 1000).toISOString());

    const alreadyNotified = new Set(
      (existing || [])
        .filter((n) => n.content)
        .map((n) => {
          const match = n.content.match(/\[rid:(.*?)\]/);
          return match ? match[1] : null;
        })
        .filter(Boolean)
    );

    // Get phone call info for context
    const callIds = [...new Set(reminders.map((r) => r.phone_call_id))];
    const { data: calls } = await supabase
      .from("phone_calls")
      .select("id, client_name, subject")
      .in("id", callIds);

    const callMap = Object.fromEntries((calls || []).map((c) => [c.id, c]));

    const notifications = [];
    for (const rem of reminders) {
      if (alreadyNotified.has(rem.id)) continue;

      const call = callMap[rem.phone_call_id];
      const callLabel = call ? `${call.client_name} — ${call.subject}` : "Ligação";
      const isOverdue = new Date(rem.remind_at) <= now;
      const prefix = isOverdue ? "⏰ Lembrete atrasado" : "🔔 Lembrete próximo";

      notifications.push({
        recipient_id: rem.created_by,
        type: "reminder",
        content: `${prefix}: "${rem.message}" (${callLabel}) [rid:${rem.id}]`,
      });
    }

    if (notifications.length > 0) {
      const { error: insErr } = await supabase
        .from("agent_notifications")
        .insert(notifications);
      if (insErr) throw insErr;
    }

    return new Response(
      JSON.stringify({ notified: notifications.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
