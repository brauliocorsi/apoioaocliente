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
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    // Verify caller
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { ticket_id, template_id } = await req.json();
    if (!ticket_id || !template_id) {
      return new Response(JSON.stringify({ error: "ticket_id e template_id são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get ticket
    const { data: ticket } = await adminClient
      .from("tickets")
      .select("*")
      .eq("id", ticket_id)
      .single();

    if (!ticket) {
      return new Response(JSON.stringify({ error: "Ticket não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get client email
    let clientEmail = ticket.client_email;
    let clientName = ticket.client_name;

    if (ticket.client_user_id) {
      const { data: clientUser } = await adminClient
        .from("client_users")
        .select("email, full_name")
        .eq("id", ticket.client_user_id)
        .single();
      if (clientUser) {
        clientEmail = clientUser.email;
        clientName = clientUser.full_name;
      }
    }

    if (!clientEmail) {
      return new Response(JSON.stringify({ error: "Cliente sem email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get template
    const { data: template } = await adminClient
      .from("email_templates")
      .select("subject, body_html")
      .eq("id", template_id)
      .single();

    if (!template) {
      return new Response(JSON.stringify({ error: "Template não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get status name
    let statusName = ticket.status;
    const { data: statusData } = await adminClient
      .from("ticket_statuses")
      .select("name")
      .eq("id", ticket.status)
      .single();
    if (statusData) statusName = statusData.name;

    const portalUrl = req.headers.get("origin") || "https://portal.exemplo.com";
    const ticketUrl = `${portalUrl}/portal/tickets/${ticket.id}`;

    const resolutionTypeLabel = ticket.resolution_type === "resolved" ? "Resolução" : ticket.resolution_type === "cancelled" ? "Cancelamento" : "";

    const replacements: Record<string, string> = {
      "{nome_cliente}": clientName || "",
      "{numero_ticket}": String(ticket.ticket_number),
      "{assunto}": ticket.subject || "",
      "{estado}": statusName,
      "{ticket_url}": ticketUrl,
      "{email}": clientEmail,
      "{tipo_decisao}": resolutionTypeLabel,
      "{motivo_decisao}": ticket.resolution_reason || "",
    };

    let subject = template.subject;
    let body = template.body_html;
    for (const [key, val] of Object.entries(replacements)) {
      subject = subject.replaceAll(key, val);
      body = body.replaceAll(key, val);
    }

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Apoio ao Cliente <noreply@resend.dev>",
        to: [clientEmail],
        subject,
        html: body,
      }),
    });

    const emailResult = await emailRes.json();

    return new Response(JSON.stringify({ success: true, email_result: emailResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
