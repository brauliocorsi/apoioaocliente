// Operational actions on inbound_email_events triggered by agents/supervisors from the
// Caixa de Entrada (InboundEmailEvents page).
//
// Security model:
//   - verify_jwt = false in config.toml so we can also accept service_role for internal use,
//     but EVERY call MUST present a valid Authorization: Bearer <JWT>.
//   - anon key -> 401
//   - regular user JWT -> must have role agent or supervisor (block_sender requires supervisor)
//   - portal clients -> 403
//
// Guarantees:
//   - Never DELETEs the event or the pending_email.
//   - Idempotent for create_ticket (won't create twice if routed_ticket_id is set).
//   - All recipient/sender data comes from the DB event row, never trusted from payload.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action =
  | "create_ticket"
  | "append_to_ticket"
  | "mark_spam"
  | "block_sender"
  | "ignore"
  | "mark_reviewed";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // ---- AUTH ---------------------------------------------------------------
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ success: false, message: "Unauthorized" }, 401);
  }
  const token = authHeader.slice(7).trim();
  if (!token || token === anonKey) {
    return json({ success: false, message: "Unauthorized" }, 401);
  }

  let userId: string | null = null;
  let isSupervisor = false;

  if (token !== serviceRoleKey) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return json({ success: false, message: "Invalid token" }, 401);
    }
    userId = claimsData.claims.sub as string;

    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roles = (roleRows || []).map((r: { role: string }) => r.role);
    if (!roles.includes("agent") && !roles.includes("supervisor")) {
      return json({ success: false, message: "Forbidden" }, 403);
    }
    isSupervisor = roles.includes("supervisor");
  } else {
    // service role acts as system; not allowed to mutate human-audit actions through here
    return json({ success: false, message: "Service role not allowed for manual actions" }, 403);
  }

  // ---- INPUT --------------------------------------------------------------
  const body = await req.json().catch(() => ({}));
  const eventId: string | undefined = body.event_id;
  const action: Action | undefined = body.action;
  const ticketIdParam: string | undefined = body.ticket_id;
  const notes: string | undefined = typeof body.notes === "string" ? body.notes : undefined;

  if (!eventId || typeof eventId !== "string") {
    return json({ success: false, message: "event_id obrigatório" }, 400);
  }
  const validActions: Action[] = [
    "create_ticket", "append_to_ticket", "mark_spam",
    "block_sender", "ignore", "mark_reviewed",
  ];
  if (!action || !validActions.includes(action)) {
    return json({ success: false, message: "action inválida" }, 400);
  }
  if (action === "block_sender" && !isSupervisor) {
    return json({ success: false, message: "Apenas supervisores podem bloquear remetentes" }, 403);
  }

  const { data: ev, error: evErr } = await admin
    .from("inbound_email_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  if (evErr || !ev) return json({ success: false, message: "Evento não encontrado" }, 404);

  // Terminal-state guard (server-side). UI hides actions for terminal events,
  // but a direct API call must also be rejected.
  const TERMINAL = new Set(["processed", "duplicate", "spam", "ignored", "reviewed"]);
  const isTerminal = TERMINAL.has(String(ev.status));
  const TERMINAL_BLOCKED: Action[] = ["append_to_ticket", "mark_spam", "ignore", "mark_reviewed"];
  // For create_ticket we use a stronger idempotency guard below (routed_ticket_id check).
  if (isTerminal && TERMINAL_BLOCKED.includes(action)) {
    return json({
      success: false,
      code: "event_terminal",
      message: "Este evento já foi processado ou encerrado.",
    }, 409);
  }

  const baseMeta = {
    action_by: userId,
    action_at: new Date().toISOString(),
    manual_action: action,
    notes: notes || null,
  };
  const mergedMeta = {
    ...((ev.action_metadata as Record<string, unknown>) || {}),
    last: baseMeta,
    history: [
      ...(((ev.action_metadata as any)?.history as any[]) || []),
      baseMeta,
    ],
  };

  async function updateEvent(patch: Record<string, unknown>) {
    await admin
      .from("inbound_email_events")
      .update({ ...patch, action_metadata: mergedMeta })
      .eq("id", eventId);
  }

  try {
    if (action === "create_ticket") {
      if (ev.routed_ticket_id) {
        return json({ success: true, status: "already_created", ticket_id: ev.routed_ticket_id });
      }

      // ---- CLAIM-FIRST (zero-delete) -----------------------------------
      // Atomically acquire a lock on this event BEFORE creating any ticket.
      // If another concurrent request already holds the lock or routed the
      // event, we never insert a ticket — so there is nothing to delete.
      const LOCK_TTL_MS = 60_000;
      const lockCutoff = new Date(Date.now() - LOCK_TTL_MS).toISOString();
      const nowIso = new Date().toISOString();

      const { data: claimedEvents, error: lockErr } = await admin
        .from("inbound_email_events")
        .update({
          processing_locked_at: nowIso,
          processing_locked_by: userId,
        })
        .eq("id", eventId)
        .is("routed_ticket_id", null)
        .not("status", "in", "(processed,duplicate,spam,ignored,reviewed)")
        .or(`processing_locked_at.is.null,processing_locked_at.lt.${lockCutoff}`)
        .select("id");

      if (lockErr) {
        return json({ success: false, message: lockErr.message }, 500);
      }

      if (!claimedEvents || claimedEvents.length === 0) {
        // Re-read to give the caller a meaningful reason.
        const { data: refreshed } = await admin
          .from("inbound_email_events")
          .select("routed_ticket_id, status, processing_locked_at")
          .eq("id", eventId)
          .maybeSingle();
        if (refreshed?.routed_ticket_id) {
          return json({ success: true, status: "already_created", ticket_id: refreshed.routed_ticket_id });
        }
        if (refreshed && TERMINAL.has(String(refreshed.status))) {
          return json({ success: false, code: "event_terminal", message: "Evento já encerrado." }, 409);
        }
        return json({
          success: false,
          code: "event_locked",
          message: "Este evento está a ser processado por outro agente. Tente novamente em instantes.",
        }, 409);
      }

      // Helper: release lock without touching anything else.
      const releaseLock = async (extraMeta?: Record<string, unknown>) => {
        await admin
          .from("inbound_email_events")
          .update({
            processing_locked_at: null,
            processing_locked_by: null,
            ...(extraMeta || {}),
          })
          .eq("id", eventId);
      };

      // Enrich body from pending_emails if available
      let description = ev.body_preview as string | null;
      let pe: any = null;
      if (ev.pending_email_id) {
        const { data } = await admin
          .from("pending_emails")
          .select("*")
          .eq("id", ev.pending_email_id)
          .maybeSingle();
        pe = data;
        if (pe) description = pe.body_html || pe.body_text || description;
      }
      if (!description || !description.trim()) {
        await releaseLock();
        return json({
          success: false,
          message: "Sem corpo de e-mail suficiente para criar ticket. Anexe ou reveja manualmente.",
        }, 422);
      }

      // Phase 4 — conservative order-number extraction from subject + body.
      const PHONE_RE = /\b(?:\+?351[\s.-]?)?[29]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/g;
      const KW_RE = /\b(?:encomenda|pedido|order|ordem(?:\s+de\s+servi[cç]o)?|os|nº\s*encomenda|n[º°ºo]\s*encomenda)\b[\s.:#nºo°-]{0,8}(\d{3,10})\b/gi;
      const scanText = `${ev.subject || ""}\n${description || ""}`.replace(PHONE_RE, " ");
      const orderCandidates = new Set<string>();
      let m: RegExpExecArray | null;
      KW_RE.lastIndex = 0;
      while ((m = KW_RE.exec(scanText)) !== null) orderCandidates.add(m[1]);
      const orderStatus =
        orderCandidates.size === 0 ? "not_checked" :
        orderCandidates.size === 1 ? null /* will be lookup-ready */ : "multiple_matches";
      const extractedOrder = orderCandidates.size === 1 ? [...orderCandidates][0] : null;

      const ticketInsert: Record<string, unknown> = {
        client_name: ev.from_name || ev.from_address,
        client_email: ev.from_address,
        subject: ev.subject || "(sem assunto)",
        description,
        priority: "P2",
        status: "novo",
        created_by: userId,
        email_received_at: ev.received_at,
        ...(extractedOrder ? { order_number: extractedOrder } : {}),
        ...(orderStatus ? { order_lookup_status: orderStatus } : {}),
      };

      const { data: newTicket, error: tErr } = await admin
        .from("tickets")
        .insert(ticketInsert)
        .select("id, ticket_number")
        .single();
      if (tErr || !newTicket) {
        // Ticket creation failed — release lock, record error, NEVER delete.
        await releaseLock({
          error_message: `create_ticket falhou: ${tErr?.message || "erro desconhecido"}`,
          action_metadata: {
            ...mergedMeta,
            last_error: {
              at: new Date().toISOString(),
              action: "create_ticket",
              message: tErr?.message || "erro desconhecido",
            },
          },
        });
        return json({ success: false, message: tErr?.message || "Erro ao criar ticket" }, 500);
      }

      // Attach the freshly created ticket to the event we already locked.
      await admin
        .from("inbound_email_events")
        .update({
          status: "processed",
          routing_action: "manual_created_ticket",
          routed_ticket_id: newTicket.id,
          routing_reason: "Criado manualmente a partir da Caixa de Entrada",
          processed_at: new Date().toISOString(),
          action_metadata: mergedMeta,
          processing_locked_at: null,
          processing_locked_by: null,
          ...(extractedOrder || orderCandidates.size > 0
            ? { extracted_order_number: extractedOrder ?? [...orderCandidates].join(",") }
            : {}),
        })
        .eq("id", eventId);

      await admin.from("email_threads").insert({
        ticket_id: newTicket.id,
        email_address: ev.from_address,
        last_message_id: ev.message_id,
      });

      if (pe) {
        await admin.from("pending_emails").update({
          status: "approved",
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          ticket_id: newTicket.id,
          rejection_reason: "Aprovado manualmente via Caixa de Entrada",
        }).eq("id", pe.id);
      }

      // Fire confirmation (non-blocking via fetch with service-role token)
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-ticket-created-confirmation`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ticket_id: newTicket.id, source: "manual_agent" }),
        });
      } catch (e) {
        console.error("confirmation fire error", (e as Error).message);
      }

      return json({ success: true, ticket_id: newTicket.id, ticket_number: newTicket.ticket_number });
    }

    if (action === "append_to_ticket") {
      if (!ticketIdParam) return json({ success: false, message: "ticket_id obrigatório" }, 400);
      const { data: ticket } = await admin
        .from("tickets")
        .select("id, ticket_number, status")
        .eq("id", ticketIdParam)
        .maybeSingle();
      if (!ticket) return json({ success: false, message: "Ticket destino não encontrado" }, 404);

      // Check status
      const { data: st } = await admin
        .from("ticket_statuses")
        .select("is_closed, is_resolved")
        .eq("id", ticket.status)
        .maybeSingle();
      if (st?.is_closed || st?.is_resolved) {
        return json({
          success: false,
          code: "ticket_closed",
          message: "Este ticket está fechado/resolvido. Crie um novo ticket de continuação em vez de anexar.",
        }, 409);
      }

      let content = ev.body_preview as string | null;
      if (ev.pending_email_id) {
        const { data: pe } = await admin
          .from("pending_emails")
          .select("body_html, body_text")
          .eq("id", ev.pending_email_id)
          .maybeSingle();
        if (pe) content = pe.body_html || pe.body_text || content;
      }
      content = content || "(email sem conteúdo)";

      await admin.from("ticket_messages").insert({
        ticket_id: ticket.id,
        sender_id: userId,
        sender_type: "client",
        content,
      });

      await admin.from("ticket_events").insert({
        ticket_id: ticket.id,
        event_type: "note",
        user_id: userId,
        content: `E-mail anexado manualmente a partir da Caixa de Entrada (remetente: ${ev.from_address})`,
        metadata: { inbound_event_id: eventId },
      });

      if (ev.pending_email_id) {
        await admin.from("pending_emails").update({
          status: "approved",
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          ticket_id: ticket.id,
          rejection_reason: "Anexado manualmente via Caixa de Entrada",
        }).eq("id", ev.pending_email_id);
      }

      await updateEvent({
        status: "processed",
        routing_action: "manual_appended_to_ticket",
        routed_ticket_id: ticket.id,
        routing_reason: "Anexado manualmente a ticket existente",
        processed_at: new Date().toISOString(),
      });

      return json({ success: true, ticket_id: ticket.id, ticket_number: ticket.ticket_number });
    }

    if (action === "mark_spam") {
      await updateEvent({
        status: "spam",
        routing_action: "manual_marked_spam",
        routing_reason: "Marcado como spam por agente",
        processed_at: new Date().toISOString(),
      });
      if (ev.pending_email_id) {
        await admin.from("pending_emails").update({
          status: "rejected",
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          rejection_reason: "Marcado como spam via Caixa de Entrada",
        }).eq("id", ev.pending_email_id);
      }
      return json({ success: true });
    }

    if (action === "block_sender") {
      const pattern = (ev.from_address || "").toLowerCase().trim();
      if (!pattern) return json({ success: false, message: "Remetente vazio" }, 400);
      // Idempotent insert
      const { data: existing } = await admin
        .from("email_blocked_senders")
        .select("id")
        .eq("pattern_type", "email")
        .eq("pattern", pattern)
        .maybeSingle();
      if (!existing) {
        await admin.from("email_blocked_senders").insert({
          pattern_type: "email",
          pattern,
          reason: notes || "Bloqueado via Caixa de Entrada",
          created_by: userId,
        });
      }
      await updateEvent({
        status: "spam",
        routing_action: "sender_blocked",
        routing_reason: "Remetente bloqueado por agente",
        processed_at: new Date().toISOString(),
      });
      if (ev.pending_email_id) {
        await admin.from("pending_emails").update({
          status: "rejected",
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          rejection_reason: "Remetente bloqueado",
        }).eq("id", ev.pending_email_id);
      }
      return json({ success: true });
    }

    if (action === "ignore") {
      await updateEvent({
        status: "ignored",
        routing_action: "ignored_by_agent",
        routing_reason: "Ignorado/arquivado por agente",
        processed_at: new Date().toISOString(),
      });
      return json({ success: true });
    }

    if (action === "mark_reviewed") {
      await updateEvent({
        status: "reviewed",
        routing_action: "failure_reviewed",
        routing_reason: "Falha revista por agente",
        processed_at: new Date().toISOString(),
      });
      return json({ success: true });
    }

    return json({ success: false, message: "Ação não suportada" }, 400);
  } catch (err) {
    console.error("handle-inbound-email-event-action error:", (err as Error).message);
    return json({ success: false, message: (err as Error).message }, 500);
  }
});
