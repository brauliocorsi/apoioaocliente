// Receção autenticada de assistências abertas pelo entregador no
// "Contagem Stock UP" (WMS). Server-to-server apenas.
//
// Âmbito estrito: cria OU recupera o ticket da incidência WMS autenticada.
// Não consulta nem edita tickets arbitrários, não executa ações comerciais,
// não envia comunicações ao cliente.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const ALLOWED_SOURCE_PROJECT_IDS = new Set([
  "dd897e32-4653-4690-9050-f1c44419691a", // Contagem Stock UP
]);

const SCHEMA_VERSION = 1;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_PRODUCT_LINES = 200;
const MAX_ATTACHMENTS = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Comparação em tempo constante (sem early-return por caracter). */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Comprimentos diferentes ainda percorrem o mesmo número de bytes.
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Serialização canónica estável para o hash de conteúdo. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      if (obj[k] === undefined || obj[k] === null) continue;
      out[k] = canonical(obj[k]);
    }
    return out;
  }
  return value;
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.slice(0, max);
}

type Validated = {
  source_project_id: string;
  incident_id: string;
  payload: Record<string, unknown>;
};

function validate(raw: unknown): { ok: true; value: Validated } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "body must be a JSON object" };
  const b = raw as Record<string, any>;

  if (b.schema_version !== SCHEMA_VERSION) return { ok: false, error: "unsupported schema_version" };

  const source_project_id = str(b.source_project_id, 64);
  if (!source_project_id || !ALLOWED_SOURCE_PROJECT_IDS.has(source_project_id)) {
    return { ok: false, error: "source_project_id not allowed" };
  }

  const incident_id = str(b.incident_id, 64);
  if (!incident_id || !UUID_RE.test(incident_id)) return { ok: false, error: "incident_id must be a uuid" };

  const subject = str(b.subject, 300);
  if (!subject) return { ok: false, error: "subject is required" };

  const description = str(b.description, 20000);
  if (!description) return { ok: false, error: "description is required" };

  const client = b.client && typeof b.client === "object" ? b.client : {};
  const clientName = str(client.name, 200);
  if (!clientName) return { ok: false, error: "client.name is required" };
  const clientEmail = str(client.email, 320);
  if (clientEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clientEmail)) {
    return { ok: false, error: "client.email is invalid" };
  }
  const clientPhone = str(client.phone, 40);

  const occurredRaw = str(b.occurred_at, 40);
  if (occurredRaw && Number.isNaN(Date.parse(occurredRaw))) {
    return { ok: false, error: "occurred_at must be an ISO timestamp" };
  }

  const linesRaw = Array.isArray(b.product_lines) ? b.product_lines : [];
  if (linesRaw.length > MAX_PRODUCT_LINES) return { ok: false, error: "too many product_lines" };
  const product_lines = linesRaw.map((l: any) => ({
    product_id: str(l?.product_id, 100),
    product_code: str(l?.product_code, 100),
    product_name: str(l?.product_name, 300),
    colis_number: str(l?.colis_number, 60) ?? (typeof l?.colis_number === "number" ? String(l.colis_number) : null),
    quantity: typeof l?.quantity === "number" && Number.isFinite(l.quantity) ? l.quantity : null,
    disposition: str(l?.disposition, 60),
  }));

  const attRaw = Array.isArray(b.attachments) ? b.attachments : [];
  if (attRaw.length > MAX_ATTACHMENTS) return { ok: false, error: "too many attachments" };
  const attachments = attRaw.map((a: any) => ({
    name: str(a?.name, 260),
    mime_type: str(a?.mime_type, 120),
    // Referência opaca do servidor de origem. NUNCA é descarregada como URL.
    storage_reference: str(a?.storage_reference, 500),
  }));

  const payload: Record<string, unknown> = {
    schema_version: SCHEMA_VERSION,
    source_project_id,
    incident_id,
    order_number: str(b.order_number, 60),
    route_id: str(b.route_id, 100),
    attempt_id: str(b.attempt_id, 100),
    note_id: str(b.note_id, 100),
    occurred_at: occurredRaw,
    driver_id: str(b.driver_id, 100),
    driver_name: str(b.driver_name, 200),
    client: { name: clientName, email: clientEmail, phone: clientPhone },
    subject,
    description,
    delivery_outcome: str(b.delivery_outcome, 60),
    product_lines,
    attachments,
  };

  return { ok: true, value: { source_project_id, incident_id, payload } };
}

function buildDescription(p: Record<string, any>): string {
  const lines: string[] = [];
  lines.push(p.description);
  lines.push("");
  lines.push("— Contexto da entrega (Contagem Stock UP) —");
  if (p.order_number) lines.push(`Encomenda: ${p.order_number}`);
  if (p.delivery_outcome) lines.push(`Resultado da entrega: ${p.delivery_outcome}`);
  if (p.route_id) lines.push(`Rota: ${p.route_id}`);
  if (p.attempt_id) lines.push(`Tentativa: ${p.attempt_id}`);
  if (p.driver_name || p.driver_id) lines.push(`Entregador: ${p.driver_name ?? "—"} (${p.driver_id ?? "—"})`);
  if (p.occurred_at) lines.push(`Ocorrido em: ${p.occurred_at}`);
  const pl = (p.product_lines || []) as any[];
  if (pl.length) {
    lines.push("Produtos / volumes:");
    for (const l of pl) {
      lines.push(
        `• ${l.product_name ?? l.product_code ?? l.product_id ?? "produto"}` +
          (l.colis_number ? ` — volume ${l.colis_number}` : "") +
          (l.quantity != null ? ` — qtd ${l.quantity}` : "") +
          (l.disposition ? ` — ${l.disposition}` : ""),
      );
    }
  }
  const at = (p.attachments || []) as any[];
  if (at.length) {
    lines.push(`Evidências na origem: ${at.length} ficheiro(s) — transferência pendente.`);
  }
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const secret = Deno.env.get("WMS_ASSISTANCE_SHARED_SECRET");
  if (!secret) {
    console.error("WMS_ASSISTANCE_SHARED_SECRET not configured");
    return json({ error: "integration not configured" }, 503);
  }

  const auth = req.headers.get("Authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!provided || !timingSafeEqual(provided, secret)) {
    return json({ error: "unauthorized" }, 401);
  }

  const bodyText = await req.text();
  if (bodyText.length > MAX_BODY_BYTES) return json({ error: "payload too large" }, 413);

  let raw: unknown;
  try {
    raw = JSON.parse(bodyText);
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  const v = validate(raw);
  if (!v.ok) return json({ error: v.error }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Autoria: ator de integração, não uma pessoa. Não se falsifica autoria
  // humana nem se usa o UUID do driver (identidade de outra base).
  // Opcional: WMS_ASSISTANCE_INTEGRATION_USER_ID (utilizador técnico dedicado).
  const integrationUserId = Deno.env.get("WMS_ASSISTANCE_INTEGRATION_USER_ID");
  const createdBy = integrationUserId && UUID_RE.test(integrationUserId) ? integrationUserId : null;

  const payload = { ...v.value.payload, description: buildDescription(v.value.payload as any) };
  const hash = await sha256Hex(JSON.stringify(canonical(v.value.payload)));

  const { data, error } = await admin.rpc("wms_upsert_assistance", {
    _source_project_id: v.value.source_project_id,
    _incident_id: v.value.incident_id,
    _payload_hash: hash,
    _payload: payload,
    _created_by: agent.id,
  });

  if (error) {
    if ((error.message || "").includes("wms_incident_conflict")) {
      return json({ error: "incident_id already exists with different content" }, 409);
    }
    console.error("wms_upsert_assistance failed:", error.message);
    return json({ error: "failed to register assistance" }, 500);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ticket_id) return json({ error: "failed to register assistance" }, 500);

  return json({
    ticket_id: row.ticket_id,
    ticket_number: row.ticket_number,
    deduplicated: !!row.deduplicated,
  });
});
