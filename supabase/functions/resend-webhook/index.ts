import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Webhook } from "https://esm.sh/svix@1.42.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
};

type EventMap = {
  status: string;
  details: string;
  failed?: boolean;
};

const EVENT_MAP: Record<string, EventMap> = {
  "email.sent": { status: "sent", details: "Enviado pelo Resend" },
  "email.delivered": { status: "delivered", details: "Entregue ao servidor do destinatário" },
  "email.delivery_delayed": { status: "deferred", details: "Entrega atrasada — o Resend vai tentar novamente" },
  "email.bounced": { status: "bounced", details: "Devolvido pelo servidor do destinatário", failed: true },
  "email.complained": { status: "complained", details: "Destinatário marcou como spam", failed: true },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const raw = await req.text();
    const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");

    if (secret) {
      const headers = {
        "svix-id": req.headers.get("svix-id") ?? "",
        "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
        "svix-signature": req.headers.get("svix-signature") ?? "",
      };
      try {
        new Webhook(secret).verify(raw, headers);
      } catch (err) {
        console.error("Assinatura inválida:", (err as Error).message);
        return new Response(JSON.stringify({ error: "Assinatura inválida" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      console.warn("RESEND_WEBHOOK_SECRET não configurado — evento aceite sem validação de assinatura");
    }

    const payload = JSON.parse(raw) as {
      type?: string;
      created_at?: string;
      data?: { email_id?: string; to?: string[]; subject?: string; bounce?: { message?: string }; reason?: string };
    };

    const type = payload.type ?? "";
    const emailId = payload.data?.email_id;
    const mapped = EVENT_MAP[type];

    if (!mapped || !emailId) {
      return new Response(JSON.stringify({ ignored: true, type }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: log } = await admin
      .from("email_logs")
      .select("id, events, delivery_status")
      .eq("provider_message_id", emailId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!log) {
      console.warn("Nenhum registo para email_id", emailId);
      return new Response(JSON.stringify({ matched: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventAt = payload.created_at ?? new Date().toISOString();
    const reason = payload.data?.bounce?.message || payload.data?.reason || null;
    const detail = reason ? `${mapped.details}: ${reason}` : mapped.details;

    // Não regride de "delivered" para "sent" caso os eventos cheguem fora de ordem.
    const isRegression = log.delivery_status === "delivered" && mapped.status === "sent";

    const events = Array.isArray(log.events) ? log.events : [];
    events.push({ type, at: eventAt, detail });

    await admin
      .from("email_logs")
      .update({
        ...(isRegression
          ? {}
          : {
              delivery_status: mapped.status,
              delivery_details: detail,
              status: mapped.failed ? "failed" : "sent",
              error_message: mapped.failed ? detail : null,
            }),
        last_event_at: eventAt,
        events,
      })
      .eq("id", log.id);

    return new Response(JSON.stringify({ success: true, status: mapped.status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("resend-webhook error:", (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
