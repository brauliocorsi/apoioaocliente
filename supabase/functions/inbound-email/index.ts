import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const contentType = req.headers.get("content-type") || "";
    let from = "";
    let subject = "";
    let body = "";

    if (contentType.includes("application/json")) {
      const json = await req.json();
      from = json.from || json.sender || json.envelope?.from || "";
      subject = json.subject || "Sem assunto";
      body = json.text || json.body || json["stripped-text"] || json.html || "";
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      from = (formData.get("from") || formData.get("sender") || "") as string;
      subject = (formData.get("subject") || "Sem assunto") as string;
      body = (formData.get("text") || formData.get("body-plain") || formData.get("html") || "") as string;
    } else {
      const text = await req.text();
      try {
        const json = JSON.parse(text);
        from = json.from || json.sender || "";
        subject = json.subject || "Sem assunto";
        body = json.text || json.body || "";
      } catch {
        body = text;
        subject = "Email recebido";
      }
    }

    // Extract name and email from "From" field
    const emailMatch = from.match(/<(.+?)>/);
    const clientEmail = emailMatch ? emailMatch[1] : from.replace(/[<>]/g, "").trim();
    const clientName = from.replace(/<.+?>/, "").trim() || clientEmail;

    // Create ticket
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .insert({
        client_name: clientName || "Cliente via email",
        client_email: clientEmail || null,
        subject: subject.substring(0, 200),
        description: body.substring(0, 5000),
        priority: "P2",
        status: "novo",
        created_by: "00000000-0000-0000-0000-000000000000",
      })
      .select("id, ticket_number")
      .single();

    if (ticketError) {
      console.error("Error creating ticket:", ticketError);
      return new Response(JSON.stringify({ error: ticketError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create initial event
    await supabase.from("ticket_events").insert({
      ticket_id: ticket.id,
      event_type: "created",
      content: `Ticket criado automaticamente via email de ${clientEmail || clientName}`,
    });

    return new Response(
      JSON.stringify({ success: true, ticket_id: ticket.id, ticket_number: ticket.ticket_number }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Inbound email error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
