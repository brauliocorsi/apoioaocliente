// Importa, de forma privada e idempotente, as evidências (fotos) de uma
// assistência aberta no "Contagem Stock UP" (WMS).
//
// Transporte: POST servidor-servidor para WMS_ASSISTANCE_SOURCE_ATTACHMENTS_URL
// autenticado por WMS_ASSISTANCE_SHARED_SECRET, body
// {schema_version:1, incident_id, storage_reference}. A resposta é binária.
// NUNCA se descarrega uma URL vinda do payload (sem SSRF).
//
// Retry independente: nunca cria/duplica tickets; cada ficheiro tem estado
// próprio (pending | copied | error) na tabela wms_incident_attachments.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SCHEMA_VERSION = 1;
const BUCKET = "ticket-attachments";
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB, alinhado com os anexos do apoio
const MAX_FILES_PER_RUN = 30;
const FETCH_TIMEOUT_MS = 30_000;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

function safeName(name: string | null, mime: string, i: number): string {
  const base = (name || `evidencia-${i + 1}`).replace(/[^\w.\-]+/g, "_").slice(0, 120);
  if (/\.[A-Za-z0-9]{2,5}$/.test(base)) return base;
  return `${base}.${EXT[mime] ?? "bin"}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const secret = Deno.env.get("WMS_ASSISTANCE_SHARED_SECRET");
  const sourceUrl = Deno.env.get("WMS_ASSISTANCE_SOURCE_ATTACHMENTS_URL");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // --- Autorização: segredo servidor-servidor OU agente/supervisor autenticado
  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  let authorized = false;

  if (secret && bearer && timingSafeEqual(bearer, secret)) {
    authorized = true;
  } else if (bearer) {
    const { data: userData } = await admin.auth.getUser(bearer);
    const uid = userData?.user?.id;
    if (uid) {
      const { data: roles } = await admin
        .from("user_roles").select("role").eq("user_id", uid);
      authorized = !!roles?.some((r) => r.role === "agent" || r.role === "supervisor");
    }
  }
  if (!authorized) return json({ error: "unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  const ticketId = typeof body.ticket_id === "string" ? body.ticket_id : null;
  const incidentId = typeof body.incident_id === "string" ? body.incident_id : null;
  if (!ticketId && !incidentId) return json({ error: "ticket_id or incident_id required" }, 400);

  let q = admin
    .from("wms_incident_attachments")
    .select("*")
    .in("status", ["pending", "error"])
    .limit(MAX_FILES_PER_RUN);
  q = ticketId ? q.eq("ticket_id", ticketId) : q.eq("incident_id", incidentId!);

  const { data: rows, error: rowsErr } = await q;
  if (rowsErr) return json({ error: "failed to list attachments" }, 500);
  if (!rows || rows.length === 0) return json({ imported: 0, failed: 0, pending: 0, results: [] });

  // Transporte ainda não configurado: manter estado pendente, sem afirmar cópia.
  if (!secret || !sourceUrl) {
    return json({
      error: "attachment transport not configured",
      missing_configuration: [
        !secret ? "WMS_ASSISTANCE_SHARED_SECRET" : null,
        !sourceUrl ? "WMS_ASSISTANCE_SOURCE_ATTACHMENTS_URL" : null,
      ].filter(Boolean),
      pending: rows.length,
    }, 503);
  }

  let imported = 0;
  let failed = 0;
  const results: Array<{ storage_reference: string; status: string; error?: string }> = [];

  for (const [i, row] of rows.entries()) {
    const markError = async (msg: string) => {
      failed++;
      results.push({ storage_reference: row.storage_reference, status: "error", error: msg });
      await admin.from("wms_incident_attachments").update({
        status: "error",
        attempts: (row.attempts ?? 0) + 1,
        last_error: msg.slice(0, 500),
        last_attempt_at: new Date().toISOString(),
      }).eq("id", row.id);
    };

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(sourceUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schema_version: SCHEMA_VERSION,
          incident_id: row.incident_id,
          storage_reference: row.storage_reference,
        }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer));

      if (res.status === 401 || res.status === 403) {
        await markError(`origem recusou o acesso (${res.status}) — segredo/autorização`);
        continue;
      }
      if (res.status === 404 || res.status === 410) {
        await markError(`referência inexistente ou expirada na origem (${res.status})`);
        continue;
      }
      if (!res.ok) {
        await markError(`origem devolveu ${res.status}`);
        continue;
      }

      const mime = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!ALLOWED_MIME.has(mime)) {
        await markError(`tipo de ficheiro não permitido: ${mime || "desconhecido"}`);
        continue;
      }
      const declared = Number(res.headers.get("content-length") || "0");
      if (declared && declared > MAX_FILE_BYTES) {
        await markError(`ficheiro demasiado grande (${declared} bytes)`);
        continue;
      }

      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength === 0) { await markError("ficheiro vazio"); continue; }
      if (buf.byteLength > MAX_FILE_BYTES) {
        await markError(`ficheiro demasiado grande (${buf.byteLength} bytes)`);
        continue;
      }

      const fileName = safeName(row.file_name, mime, i);
      const path = `${row.ticket_id}/wms/${row.id}-${fileName}`;

      const { error: upErr } = await admin.storage.from(BUCKET).upload(path, buf, {
        contentType: mime,
        upsert: true,
      });
      if (upErr) { await markError(`falha ao guardar: ${upErr.message}`); continue; }

      const { data: att, error: attErr } = await admin
        .from("ticket_attachments")
        .insert({
          ticket_id: row.ticket_id,
          file_name: fileName,
          file_path: path,
          file_type: mime,
          file_size: buf.byteLength,
          uploaded_by: null,
        })
        .select("id")
        .single();
      if (attErr) { await markError(`falha ao anexar: ${attErr.message}`); continue; }

      await admin.from("wms_incident_attachments").update({
        status: "copied",
        mime_type: mime,
        file_size: buf.byteLength,
        file_name: fileName,
        attempts: (row.attempts ?? 0) + 1,
        last_error: null,
        last_attempt_at: new Date().toISOString(),
        copied_at: new Date().toISOString(),
        ticket_attachment_id: att.id,
      }).eq("id", row.id);

      imported++;
      results.push({ storage_reference: row.storage_reference, status: "copied" });
    } catch (e) {
      await markError(`erro de transporte: ${(e as Error).message}`);
    }
  }

  // Estado agregado da incidência
  const { count: stillPending } = await admin
    .from("wms_incident_attachments")
    .select("id", { count: "exact", head: true })
    .eq("incident_id", rows[0].incident_id)
    .in("status", ["pending", "error"]);

  await admin
    .from("wms_delivery_incidents")
    .update({ attachments_status: (stillPending ?? 0) > 0 ? "pending" : "copied" })
    .eq("incident_id", rows[0].incident_id)
    .eq("source_project_id", rows[0].source_project_id);

  if (imported > 0) {
    await admin.from("ticket_events").insert({
      ticket_id: rows[0].ticket_id,
      user_id: null,
      event_type: "wms_attachments_imported",
      content: `${imported} evidência(s) da entrega importada(s)${failed ? ` · ${failed} com erro` : ""}`,
      metadata: { source: "wms", incident_id: rows[0].incident_id, imported, failed },
    });
  }

  return json({ imported, failed, pending: stillPending ?? 0, results });
});
