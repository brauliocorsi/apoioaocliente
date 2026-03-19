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

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
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

  const gcHeaders = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "access-token": accessToken,
    "secret-access-token": secretToken,
  };

  const gcFetch = async (path: string, params?: URLSearchParams) => {
    const qs = params?.toString();
    const url = `${GC_BASE}${path}${qs ? "?" + qs : ""}`;
    console.log(`GestaoClick request: ${url}`);
    const res = await fetch(url, { method: "GET", headers: gcHeaders });
    const text = await res.text();
    console.log(`GestaoClick response status: ${res.status}, body preview: ${text.substring(0, 500)}`);
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) throw { status: res.status, data };
    return data;
  };

  try {
    const { action, query, id, page, telefone, nome, codigo, situacao } = await req.json();

    switch (action) {
      // === VENDAS ===
      case "search_vendas": {
        const params = new URLSearchParams();
        if (query) params.set("codigo", query);
        if (nome) params.set("nome", nome);
        if (situacao) params.set("situacao", situacao);
        if (page) params.set("pagina", String(page));
        const data = await gcFetch("/vendas", params);
        return json(data);
      }
      case "get_venda": {
        const data = await gcFetch(`/vendas/${id}`);
        return json(data);
      }

      // === ORDENS DE SERVIÇO ===
      case "search_os": {
        const params = new URLSearchParams();
        if (codigo) params.set("codigo", codigo);
        if (nome) params.set("nome", nome);
        if (query) {
          // If query looks numeric, search by codigo; otherwise by nome
          if (/^\d+$/.test(query.trim())) {
            params.set("codigo", query.trim());
          } else {
            params.set("nome", query.trim());
          }
        }
        if (page) params.set("pagina", String(page));
        const data = await gcFetch("/ordens_servicos", params);
        return json(data);
      }
      case "get_os": {
        const data = await gcFetch(`/ordens_servicos/${id}`);
        return json(data);
      }

      // === CLIENTES ===
      case "search_clientes": {
        const params = new URLSearchParams();
        if (query) params.set("nome", query);
        if (telefone) params.set("telefone", telefone);
        if (page) params.set("pagina", String(page));
        const data = await gcFetch("/clientes", params);
        return json(data);
      }
      case "get_cliente": {
        const data = await gcFetch(`/clientes/${id}`);
        return json(data);
      }

      // === SEARCH ALL (vendas + OS, optionally by phone) ===
      case "search_all": {
        const results: { vendas: any[]; ordens_servico: any[]; clientes: any[] } = {
          vendas: [],
          ordens_servico: [],
          clientes: [],
        };

        const isPhone = /^[\d\s\+\(\)\-]{7,}$/.test((query || "").trim());
        const isNumeric = /^\d+$/.test((query || "").trim());

        if (isPhone) {
          // Search clients by phone first
          const clientData = await gcFetch("/clientes", (() => {
            const p = new URLSearchParams();
            p.set("telefone", query.trim());
            return p;
          })());
          const clientes = clientData?.data || clientData?.clientes || (Array.isArray(clientData) ? clientData : []);
          results.clientes = clientes.map((c: any) => c.cliente || c);

          // For each client found, search vendas and OS by client name
          const clientNames = results.clientes.map((c: any) => c.nome).filter(Boolean);
          const uniqueNames = [...new Set(clientNames)];

          const fetches: Promise<void>[] = [];
          for (const name of uniqueNames.slice(0, 3)) {
            fetches.push(
              gcFetch("/vendas", (() => { const p = new URLSearchParams(); p.set("nome", name); return p; })())
                .then(d => {
                  const v = d?.data || d?.vendas || (Array.isArray(d) ? d : []);
                  results.vendas.push(...v);
                })
                .catch(() => {})
            );
            fetches.push(
              gcFetch("/ordens_servicos", (() => { const p = new URLSearchParams(); p.set("nome", name); return p; })())
                .then(d => {
                  const os = d?.data || d?.ordens_servicos || (Array.isArray(d) ? d : []);
                  results.ordens_servico.push(...os);
                })
                .catch(() => {})
            );
          }
          await Promise.all(fetches);
        } else {
          // Search vendas and OS in parallel
          const vendaParams = new URLSearchParams();
          const osParams = new URLSearchParams();

          if (isNumeric) {
            vendaParams.set("codigo", query.trim());
            osParams.set("codigo", query.trim());
          } else if (query) {
            vendaParams.set("nome", query.trim());
            osParams.set("nome", query.trim());
          }

          const [vendaData, osData] = await Promise.all([
            gcFetch("/vendas", vendaParams).catch(() => ({})),
            gcFetch("/ordens_servicos", osParams).catch(() => ({})),
          ]);

          results.vendas = vendaData?.data || vendaData?.vendas || (Array.isArray(vendaData) ? vendaData : []);
          results.ordens_servico = osData?.data || osData?.ordens_servicos || (Array.isArray(osData) ? osData : []);
        }

        return json(results);
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: any) {
    if (error?.status && error?.data) {
      return new Response(
        JSON.stringify({ error: `GestãoClick API error [${error.status}]`, details: error.data }),
        { status: error.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("GestaoClick proxy error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function json(data: any) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
