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

const BATCH_SIZE = 20;
const MAX_PAGES = 50;
const CLIENT_BATCH_SIZE = 10;

const isTargetSituacao = (situacao: string | null | undefined): boolean => {
  if (!situacao) return false;
  return TARGET_SITUACOES.some(target =>
    situacao.toLowerCase().trim() === target.toLowerCase().trim()
  );
};

Deno.serve(async (req) => {
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
    const res = await fetch(url, { method: "GET", headers: gcHeaders });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) throw new Error(`GC API error [${res.status}]: ${text.substring(0, 200)}`);
    return data;
  };

  const fetchPage = async (page: number): Promise<any[]> => {
    try {
      const params = new URLSearchParams();
      params.set("pagina", String(page));
      const data = await gcFetch("/vendas", params);
      return data?.data || data?.vendas || (Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(`Error fetching page ${page}:`, e);
      return [];
    }
  };

  const fetchClientPhone = async (clientId: string): Promise<string | null> => {
    try {
      const data = await gcFetch(`/clientes/${clientId}`);
      const cliente = data?.data?.cliente || data?.data || data?.cliente || data;
      return cliente?.telefone || cliente?.celular || cliente?.telefone_celular || null;
    } catch {
      return null;
    }
  };

  try {
    // Step 1: Fetch pages in parallel
    const firstData = await gcFetch("/vendas", (() => { const p = new URLSearchParams(); p.set("pagina", "1"); return p; })());
    const totalPages = firstData?.meta?.total_paginas || 1;
    const firstVendas = firstData?.data || firstData?.vendas || (Array.isArray(firstData) ? firstData : []);
    const pagesToScan = Math.min(totalPages, MAX_PAGES);
    console.log(`Total pages: ${totalPages}, scanning first ${pagesToScan}`);

    const allVendas: any[] = [...firstVendas];

    for (let batchStart = 2; batchStart <= pagesToScan; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, pagesToScan);
      const promises: Promise<any[]>[] = [];
      for (let p = batchStart; p <= batchEnd; p++) promises.push(fetchPage(p));
      const results = await Promise.all(promises);
      for (const vendas of results) allVendas.push(...vendas);
      if (batchEnd % 50 === 0 || batchEnd === pagesToScan) {
        console.log(`Fetched page ${batchEnd}/${pagesToScan}, total: ${allVendas.length}`);
      }
    }

    // Step 2: Deduplicate + filter
    const uniqueMap = new Map<string, any>();
    allVendas.forEach((v: any) => {
      const venda = v.venda || v;
      const code = String(venda.codigo || venda.id || "");
      if (code && !uniqueMap.has(code)) uniqueMap.set(code, venda);
    });

    const filteredVendas = Array.from(uniqueMap.values()).filter(venda => {
      const sit = venda.nome_situacao || venda.situacao || "";
      return isTargetSituacao(sit);
    });

    console.log(`Filtered: ${filteredVendas.length} of ${uniqueMap.size} match target situacoes`);

    // Step 3: Fetch client phones for unique client IDs
    const clientIds = [...new Set(filteredVendas.map(v => String(v.cliente_id || "")).filter(Boolean))];
    const phoneMap = new Map<string, string | null>();
    
    console.log(`Fetching phone for ${clientIds.length} unique clients...`);
    for (let i = 0; i < clientIds.length; i += CLIENT_BATCH_SIZE) {
      const batch = clientIds.slice(i, i + CLIENT_BATCH_SIZE);
      const phoneResults = await Promise.all(batch.map(id => fetchClientPhone(id).then(phone => ({ id, phone }))));
      phoneResults.forEach(r => phoneMap.set(r.id, r.phone));
    }
    console.log(`Got phones for ${[...phoneMap.values()].filter(Boolean).length} clients`);

    // Step 4: Upsert into database
    let imported = 0;
    let updated = 0;

    for (const venda of filteredVendas) {
      const orderNumber = String(venda.codigo || venda.id);
      const orderDate = venda.data || venda.data_emissao || venda.data_venda || null;
      const clientName = venda.nome_cliente || venda.cliente?.nome || "Cliente";
      const clienteId = String(venda.cliente_id || "");
      const clientPhone = phoneMap.get(clienteId) || null;
      const situacao = venda.nome_situacao || venda.situacao || null;

      const { data: existing } = await supabaseAdmin
        .from("delayed_orders")
        .select("id, situacao, client_phone, order_date, sla_deadline_at")
        .eq("order_number", orderNumber)
        .maybeSingle();

      if (existing) {
        // Update if situacao changed, or phone/date was missing
        const updates: Record<string, any> = {};
        if (existing.situacao !== situacao) updates.situacao = situacao;
        if (!existing.client_phone && clientPhone) updates.client_phone = clientPhone;
        if (!existing.order_date && orderDate) {
          updates.order_date = orderDate.substring(0, 10);
          updates.sla_deadline_at = new Date(new Date(orderDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
        }
        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString();
          await supabaseAdmin.from("delayed_orders").update(updates).eq("id", existing.id);
          updated++;
        }
        continue;
      }

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
        created_by: "00000000-0000-0000-0000-000000000000",
      });

      if (insertError) {
        console.error(`Insert error for ${orderNumber}:`, insertError.message);
      } else {
        imported++;
      }
    }

    // Step 5: Auto-archive
    const activeOrderNumbers = new Set(filteredVendas.map(v => String(v.codigo || v.id)));
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

    await supabaseAdmin
      .from("system_settings")
      .upsert({ key: "delayed_orders_last_sync", value: new Date().toISOString() }, { onConflict: "key" });

    const summary = { imported, updated, archived, totalFetched: filteredVendas.length, totalPages, clientsWithPhone: [...phoneMap.values()].filter(Boolean).length };
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
