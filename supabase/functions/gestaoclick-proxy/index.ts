import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GC_BASE = "https://api.gestaoclick.com/api";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const accessToken = Deno.env.get("GESTAOCLICK_ACCESS_TOKEN");
  const secretToken = Deno.env.get("GESTAOCLICK_SECRET_ACCESS_TOKEN");

  if (!accessToken || !secretToken) {
    return new Response(
      JSON.stringify({ error: "GestãoClick API tokens not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { action, query, id, page } = await req.json();

    // Build URL based on action
    let path: string;
    const params = new URLSearchParams();

    switch (action) {
      case "search_vendas":
        path = "/vendas";
        if (query) params.set("pesquisa", query);
        if (page) params.set("pagina", String(page));
        break;
      case "get_venda":
        path = `/vendas/${id}`;
        break;
      case "search_clientes":
        path = "/clientes";
        if (query) params.set("pesquisa", query);
        if (page) params.set("pagina", String(page));
        break;
      case "get_cliente":
        path = `/clientes/${id}`;
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const queryString = params.toString();
    const url = `${GC_BASE}${path}${queryString ? "?" + queryString : ""}`;

    console.log(`GestaoClick request: ${url}`);

    const gcResponse = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "access-token": accessToken,
        "secret-access-token": secretToken,
      },
    });

    const responseText = await gcResponse.text();
    console.log(`GestaoClick response status: ${gcResponse.status}, body preview: ${responseText.substring(0, 500)}`);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    if (!gcResponse.ok) {
      return new Response(
        JSON.stringify({ error: `GestãoClick API error [${gcResponse.status}]`, details: data }),
        { status: gcResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("GestaoClick proxy error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
