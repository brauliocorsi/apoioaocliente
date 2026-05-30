import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare, User, Bot, Mail, MailX, Paperclip, Activity,
  GitBranch, AlertTriangle, Inbox, Loader2, Phone, PhoneMissed,
} from "lucide-react";

/**
 * Unified, read-only ticket timeline.
 *
 * Builds a chronological view from existing data only — does NOT duplicate or
 * mutate anything. Hidden from clients (agent-only pages consume it).
 *
 * Sources:
 *   - ticket_messages (customer messages + agent replies)
 *   - ticket_events (system events, internal notes, status changes, continuations)
 *   - email_logs (outbound email delivery audit)
 *   - inbound_email_events (incoming email routing audit)
 *   - ticket_attachments (file uploads)
 *   - tickets (parent/child via parent_ticket_id)
 */

type TimelineKind =
  | "customer_message"
  | "agent_reply"
  | "internal_note"
  | "system_event"
  | "status_changed"
  | "email_sent"
  | "email_failed"
  | "email_received"
  | "attachment_added"
  | "ticket_continuation_created"
  | "inbound_event"
  | "phone_call";

interface TimelineItem {
  id: string;
  at: string;
  kind: TimelineKind;
  author?: string | null;
  summary: string;
  meta?: Record<string, unknown>;
}

interface Props {
  ticketId: string;
  /** When the parent already loads these, pass them to avoid re-fetching */
  preloadedMessages?: Array<{ id: string; created_at: string; content: string; sender_id?: string; sender_type: string }>;
  preloadedEvents?: Array<{ id: string; created_at: string; event_type: string; content?: string | null; user_id?: string | null; metadata?: unknown }>;
}

const KIND_META: Record<TimelineKind, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  customer_message: { label: "Cliente", icon: User, tone: "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300" },
  agent_reply: { label: "Agente", icon: MessageSquare, tone: "border-primary/30 text-primary" },
  internal_note: { label: "Interno", icon: MessageSquare, tone: "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300" },
  system_event: { label: "Sistema", icon: Bot, tone: "border-muted-foreground/30 text-muted-foreground" },
  status_changed: { label: "Status", icon: Activity, tone: "border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-300" },
  email_sent: { label: "E-mail enviado", icon: Mail, tone: "border-primary/30 text-primary" },
  email_failed: { label: "Falha de e-mail", icon: MailX, tone: "border-destructive/40 text-destructive" },
  email_received: { label: "E-mail recebido", icon: Inbox, tone: "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300" },
  attachment_added: { label: "Anexo", icon: Paperclip, tone: "border-muted-foreground/30 text-muted-foreground" },
  ticket_continuation_created: { label: "Continuação", icon: GitBranch, tone: "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300" },
  inbound_event: { label: "Caixa de Entrada", icon: AlertTriangle, tone: "border-muted-foreground/30 text-muted-foreground" },
  phone_call: { label: "Chamada", icon: Phone, tone: "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300" },
};

function stripHtml(s: string | null | undefined, limit = 200): string {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

export default function TicketTimeline({ ticketId, preloadedMessages, preloadedEvents }: Props) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      const [msgsRes, evRes, logsRes, inboundRes, attRes, childrenRes, callsRes] = await Promise.all([
        preloadedMessages
          ? Promise.resolve({ data: preloadedMessages })
          : supabase.from("ticket_messages")
              .select("id, created_at, content, sender_id, sender_type")
              .eq("ticket_id", ticketId)
              .order("created_at", { ascending: true }),
        preloadedEvents
          ? Promise.resolve({ data: preloadedEvents })
          : supabase.from("ticket_events")
              .select("id, created_at, event_type, content, user_id, metadata")
              .eq("ticket_id", ticketId)
              .order("created_at", { ascending: true }),
        supabase.from("email_logs")
          .select("id, created_at, subject, recipient, delivery_status, error_message, source")
          .eq("ticket_id", ticketId)
          .order("created_at", { ascending: true }),
        supabase.from("inbound_email_events")
          .select("id, received_at, from_address, from_name, subject, status, routing_action, routing_reason")
          .eq("routed_ticket_id", ticketId)
          .order("received_at", { ascending: true }),
        supabase.from("ticket_attachments")
          .select("id, created_at, file_name, uploaded_by")
          .eq("ticket_id", ticketId)
          .order("created_at", { ascending: true }),
        supabase.from("tickets")
          .select("id, ticket_number, subject, created_at, status")
          .eq("parent_ticket_id", ticketId)
          .order("created_at", { ascending: true }),
        supabase.from("phone_calls")
          .select("id, created_at, direction, attended, call_status, extension, duration_seconds, source, client_name")
          .eq("ticket_id", ticketId)
          .order("created_at", { ascending: true }),
      ]);

      const msgs = (msgsRes.data as any[]) || [];
      const evs = (evRes.data as any[]) || [];
      const logs = (logsRes.data as any[]) || [];
      const inbound = (inboundRes.data as any[]) || [];
      const atts = (attRes.data as any[]) || [];
      const children = (childrenRes.data as any[]) || [];
      const phoneCalls = (callsRes.data as any[]) || [];

      // Collect author ids
      const ids = new Set<string>();
      msgs.forEach((m) => m.sender_id && ids.add(m.sender_id));
      evs.forEach((e) => e.user_id && ids.add(e.user_id));
      atts.forEach((a) => a.uploaded_by && ids.add(a.uploaded_by));

      const profMap: Record<string, string> = {};
      if (ids.size > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", Array.from(ids));
        (profs || []).forEach((p: any) => { profMap[p.id] = p.full_name; });
      }

      const built: TimelineItem[] = [];

      msgs.forEach((m) => {
        built.push({
          id: `msg-${m.id}`,
          at: m.created_at,
          kind: m.sender_type === "client" ? "customer_message" : "agent_reply",
          author: m.sender_id ? profMap[m.sender_id] : (m.sender_type === "client" ? "Cliente" : "Agente"),
          summary: stripHtml(m.content, 240),
        });
      });

      evs.forEach((e) => {
        let kind: TimelineKind = "system_event";
        if (e.event_type === "status_change") kind = "status_changed";
        else if (e.event_type === "note") kind = "internal_note";
        built.push({
          id: `ev-${e.id}`,
          at: e.created_at,
          kind,
          author: e.user_id ? profMap[e.user_id] : null,
          summary: stripHtml(e.content, 240) || e.event_type,
          meta: { event_type: e.event_type },
        });
      });

      logs.forEach((l) => {
        const failed = l.delivery_status && l.delivery_status !== "accepted" && l.delivery_status !== "sent";
        built.push({
          id: `log-${l.id}`,
          at: l.created_at,
          kind: failed ? "email_failed" : "email_sent",
          author: l.source || null,
          summary: `${l.subject || "(sem assunto)"} → ${l.recipient}${failed ? ` — ${l.error_message || l.delivery_status}` : ""}`,
        });
      });

      inbound.forEach((i) => {
        built.push({
          id: `in-${i.id}`,
          at: i.received_at,
          kind: "email_received",
          author: i.from_name || i.from_address,
          summary: `${i.subject || "(sem assunto)"} — ${i.routing_action || i.status}${i.routing_reason ? ` · ${i.routing_reason}` : ""}`,
        });
      });

      atts.forEach((a) => {
        built.push({
          id: `att-${a.id}`,
          at: a.created_at,
          kind: "attachment_added",
          author: a.uploaded_by ? profMap[a.uploaded_by] : null,
          summary: a.file_name,
        });
      });

      children.forEach((c) => {
        built.push({
          id: `child-${c.id}`,
          at: c.created_at,
          kind: "ticket_continuation_created",
          author: null,
          summary: `Continuação criada: #${c.ticket_number} — ${c.subject}`,
          meta: { child_ticket_id: c.id },
        });
      });

      phoneCalls.forEach((c) => {
        const dir = c.direction === "incoming" || c.direction === "inbound" ? "Recebida" : c.direction === "outgoing" || c.direction === "outbound" ? "Efetuada" : "Chamada";
        const attended = c.attended === false ? " (não atendida)" : c.attended ? " (atendida)" : "";
        const ext = c.extension ? ` · ramal ${c.extension}` : "";
        const dur = c.duration_seconds ? ` · ${c.duration_seconds}s` : "";
        const src = c.source === "letscall" ? " · MicroSIP" : c.source === "manual" ? " · manual" : "";
        built.push({
          id: `call-${c.id}`,
          at: c.created_at,
          kind: "phone_call",
          author: c.client_name || null,
          summary: `${dir}${attended}${ext}${dur}${src}`,
          meta: { phone_call_id: c.id },
        });
      });

      built.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

      if (!cancelled) {
        setProfiles(profMap);
        setItems(built);
        setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [ticketId, preloadedMessages, preloadedEvents]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Histórico completo do ticket
          {!loading && <span className="text-xs text-muted-foreground font-normal">({items.length})</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> A carregar histórico…
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem eventos.</p>
        ) : (
          <ol className="relative border-l border-border ml-2 space-y-3">
            {items.map((it) => {
              const meta = KIND_META[it.kind];
              const Icon = meta.icon;
              return (
                <li key={it.id} className="ml-4">
                  <span className="absolute -left-[7px] flex h-3 w-3 items-center justify-center rounded-full bg-background border border-border">
                    <Icon className="h-2.5 w-2.5 text-muted-foreground" />
                  </span>
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${meta.tone}`}>
                      {meta.label}
                    </Badge>
                    {it.author && (
                      <span className="text-xs font-medium text-foreground">{it.author}</span>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(it.at).toLocaleString("pt-PT", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/90 break-words">{it.summary || "—"}</p>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
