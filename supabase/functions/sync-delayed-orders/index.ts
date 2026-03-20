import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GC_BASE = "https://api.gestaoclick.com/api";
const TARGET_SITUACOES = [
  "Encomenda - Fábrica",
  "Encomenda - Fornecedor",
  "Encomenda - Fábrica e Fornecedor",
];

// Known situacao_ids from GestãoClick (discovered via diagnose mode)
const TARGET_SITUACAO_IDS = [
  "2211651",   // Encomenda - Fábrica
  "8578323",   // Encomenda - Fornecedor
  "8578342",   // Encomenda - Fábrica e Fornecedor
];

// Post-fetch filter: only keep vendas whose situacao matches target list
const isTargetSituacao = (situacao: string | null | undefined): boolean => {
  if (!situacao) return false;
  return TARGET_SITUACOES.some(target => 
    situacao.toLowerCase().trim() === target.toLowerCase().trim()
  );
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const diagnose = url.searchParams.get("diagnose") === "true";
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

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
    Accept: "application/json",
    "access-token": accessToken,
    "secret-access-token": secretToken,
  };

  const gcFetch = async (path: string, params?: URLSearchParams) => {
    const qs = params?.toString();
    const url = `${GC_BASE}${path}${qs ? "?" + qs : ""}`;
    console.log(`GC request: ${url}`);
    const res = await fetch(url, { method: "GET", headers: gcHeaders });
    const text = await res.text();
    console.log(`GC response [${res.status}]: ${text.substring(0, 800)}`);
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) throw new Error(`GC API error [${res.status}]: ${text.substring(0, 200)}`);
    return data;
  };

  // Diagnose mode: scan sampled pages to discover all unique situações
  if (diagnose) {
    try {
      const situacoes = new Map<string, { id: string; count: number }>();
      const firstParams = new URLSearchParams();
      firstParams.set("pagina", "1");
      const firstData = await gcFetch("/vendas", firstParams);
      const totalPages = firstData?.meta?.total_paginas || 1;
      
      // Sample ~8 evenly spaced pages for speed
      const samplePages = new Set<number>();
      const step = Math.max(1, Math.floor(totalPages / 8));
      for (let i = 1; i <= totalPages; i += step) samplePages.add(i);
      samplePages.add(totalPages);
      
      for (const p of samplePages) {
        const params = new URLSearchParams();
        params.set("pagina", String(p));
        const data = await gcFetch("/vendas", params);
        const vendas = data?.data || [];
        for (const v of vendas) {
          const venda = v.venda || v;
          const sit = venda.nome_situacao || venda.situacao || "N/A";
          const sitId = String(venda.situacao_id || "");
          const existing = situacoes.get(sit) || { id: sitId, count: 0 };
          existing.count++;
          situacoes.set(sit, existing);
        }
      }
      
      const result = Object.fromEntries(
        [...situacoes.entries()].sort((a, b) => b[1].count - a[1].count)
      );
      
      return new Response(JSON.stringify({ 
        totalPages, 
        samplePagesScanned: samplePages.size,
        situacoes: result 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const allVendas: any[] = [];

    // Fetch vendas for each target situacao_id
    for (const sitId of TARGET_SITUACAO_IDS) {
      let page = 1;
      const maxPages = 20;
      while (page <= maxPages) {
        const params = new URLSearchParams();
        params.set("situacao_id", sitId);
        params.set("pagina", String(page));
        try {
          const data = await gcFetch("/vendas", params);
          const vendas = data?.data || data?.vendas || (Array.isArray(data) ? data : []);
          if (vendas.length === 0) break;
          allVendas.push(...vendas);
          console.log(`SitID ${sitId} page ${page}: ${vendas.length} vendas`);
          const totalPages = data?.meta?.total_paginas || data?.meta?.ultima_pagina || 1;
          if (page >= totalPages) break;
          page++;
        } catch (e) {
          console.error(`Error fetching sitID ${sitId} page ${page}:`, e);
          break;
        }
      }
    }

    console.log(`Total vendas fetched: ${allVendas.length}`);

    // Deduplicate
    const uniqueMap = new Map<string, any>();
    allVendas.forEach((v: any) => {
      const venda = v.venda || v;
      const code = String(venda.codigo || venda.id || "");
      if (code && !uniqueMap.has(code)) uniqueMap.set(code, venda);
    });

    const uniqueVendas = Array.from(uniqueMap.values());
    let imported = 0;
    let updated = 0;

    for (const venda of uniqueVendas) {
      const orderNumber = String(venda.codigo || venda.id);
      const orderDate = venda.data_emissao || venda.data_venda || venda.created_at || null;
      const clientName = venda.nome_cliente || venda.cliente?.nome || venda.nome || "Cliente";
      const clientPhone = venda.telefone_cliente || venda.cliente?.telefone || venda.telefone || null;
      const situacao = venda.nome_situacao || venda.situacao || venda.status || null;

      // Check if already exists
      const { data: existing } = await supabaseAdmin
        .from("delayed_orders")
        .select("id, situacao")
        .eq("order_number", orderNumber)
        .maybeSingle();

      if (existing) {
        // Update situacao if changed
        if (existing.situacao !== situacao) {
          await supabaseAdmin
            .from("delayed_orders")
            .update({ situacao, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
          updated++;
        }
        continue;
      }

      // Insert new
      const slaDeadline = orderDate
        ? new Date(new Date(orderDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const { error: insertError } = await supabaseAdmin.from("delayed_orders").insert({
        order_number: orderNumber,
        client_name: clientName,
        client_phone: clientPhone,
        order_date: orderDate ? orderDate.substring(0, 10) : null,
        situacao,
        sla_deadline_at: slaDeadline,
        created_by: "00000000-0000-0000-0000-000000000000", // system
      });

      if (insertError) {
        console.error(`Insert error for ${orderNumber}:`, insertError.message);
      } else {
        imported++;
      }
    }

    // Auto-archive orders whose situacao is no longer in TARGET_SITUACOES
    // (they were delivered or changed status)
    const activeOrderNumbers = new Set(uniqueVendas.map(v => String((v.venda || v).codigo || (v.venda || v).id)));
    
    const { data: dbOrders } = await supabaseAdmin
      .from("delayed_orders")
      .select("id, order_number")
      .eq("is_archived", false);

    let archived = 0;
    for (const dbOrder of (dbOrders || [])) {
      if (!activeOrderNumbers.has(dbOrder.order_number)) {
        await supabaseAdmin
          .from("delayed_orders")
          .update({ is_archived: true, updated_at: new Date().toISOString() })
          .eq("id", dbOrder.id);
        archived++;
      }
    }

    // Save last sync timestamp
    await supabaseAdmin
      .from("system_settings")
      .upsert({ key: "delayed_orders_last_sync", value: new Date().toISOString() }, { onConflict: "key" });

    const summary = { imported, updated, archived, totalFetched: uniqueVendas.length };
    console.log("Sync complete:", summary);

    return new Response(JSON.stringify({ success: true, ...summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Sync error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
