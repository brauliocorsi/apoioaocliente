import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Clock, Send, MessageSquare } from "lucide-react";
import { DecisionEngine, type RuleSuggestion } from "@/lib/decisionEngine";
import FileUpload from "@/components/FileUpload";
import MacroSelector from "@/components/ticket/MacroSelector";
import TicketSidebar from "@/components/ticket/TicketSidebar";
import SlaIndicator from "@/components/ticket/SlaIndicator";
import PriorityFlag from "@/components/ticket/PriorityFlag";
import { useTicketStatuses } from "@/hooks/useTicketStatuses";

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { statuses, statusLabels } = useTicketStatuses();
  const [ticket, setTicket] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [clauses, setClauses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [reply, setReply] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [suggestions, setSuggestions] = useState<RuleSuggestion[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);

  const fetchTicket = async () => {
    if (!id) return;
    const [{ data: t }, { data: evts }, { data: tTags }, { data: tClauses }, { data: tAttachments }, { data: msgs }] = await Promise.all([
      supabase.from("tickets").select("*").eq("id", id).single(),
      supabase.from("ticket_events").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
      supabase.from("ticket_tags").select("tag_id").eq("ticket_id", id),
      supabase.from("ticket_clauses").select("clause_id").eq("ticket_id", id),
      supabase.from("ticket_attachments").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
      supabase.from("ticket_messages").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
    ]);
    setTicket(t);
    setEvents(evts || []);
    setMessages(msgs || []);
    setTags((tTags || []).map((r: any) => r.tag_id));
    setClauses((tClauses || []).map((r: any) => r.clause_id));
    setAttachments((tAttachments || []).map((a: any) => ({
      ...a,
      url: supabase.storage.from("ticket-attachments").getPublicUrl(a.file_path).data.publicUrl,
    })));
    
    if (t) {
      const s = DecisionEngine.evaluate(t, (tTags || []).map((r: any) => r.tag_id));
      setSuggestions(s);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTicket(); }, [id]);

  // Realtime for messages
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`agent-ticket-messages-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${id}` },
        (payload) => { setMessages((prev) => [...prev, payload.new]); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const updateStatus = async (newStatus: string) => {
    if (!id || !user) return;
    const oldStatus = ticket.status;
    const newStatusObj = statuses.find((s) => s.id === newStatus);
    const oldStatusObj = statuses.find((s) => s.id === oldStatus);
    
    const updates: any = { status: newStatus, status_changed_at: new Date().toISOString() };

    if (newStatusObj?.pauses_sla && !ticket.sla_paused_at) {
      updates.sla_paused_at = new Date().toISOString();
    } else if (oldStatusObj?.pauses_sla && !newStatusObj?.pauses_sla && ticket.sla_paused_at) {
      const pausedSeconds = Math.floor((Date.now() - new Date(ticket.sla_paused_at).getTime()) / 1000);
      updates.sla_paused_total_seconds = (ticket.sla_paused_total_seconds || 0) + pausedSeconds;
      updates.sla_paused_at = null;
    }

    if (newStatusObj?.is_resolved) updates.resolved_at = new Date().toISOString();

    if (newStatusObj?.sla_minutes) {
      updates.sla_stage_deadline_at = new Date(Date.now() + newStatusObj.sla_minutes * 60000).toISOString();
    } else {
      updates.sla_stage_deadline_at = null;
    }

    if (newStatusObj?.default_assign) {
      updates.assigned_to = newStatusObj.default_assign;
    }

    await supabase.from("tickets").update(updates).eq("id", id);
    await supabase.from("ticket_events").insert({
      ticket_id: id,
      user_id: user.id,
      event_type: "status_change",
      content: `Estado alterado: ${statusLabels[oldStatus] || oldStatus} → ${statusLabels[newStatus] || newStatus}`,
      metadata: { from: oldStatus, to: newStatus },
    });

    // Send email notification on status change
    if (ticket.client_user_id || ticket.client_email) {
      try {
        await supabase.functions.invoke("send-ticket-email", {
          body: { ticket_id: id, template_id: "status_changed" },
        });
      } catch (e) {
        console.error("Failed to send status email:", e);
      }
    }

    toast({ title: "Estado atualizado" });
    fetchTicket();
  };

  const addNote = async () => {
    if (!id || !user || !note.trim()) return;
    setAddingNote(true);
    await supabase.from("ticket_events").insert({
      ticket_id: id,
      user_id: user.id,
      event_type: "note",
      content: note,
    });
    setNote("");
    setAddingNote(false);
    fetchTicket();
  };

  const sendReply = async () => {
    if (!id || !user || !reply.trim()) return;
    setSendingReply(true);
    await supabase.from("ticket_messages").insert({
      ticket_id: id,
      sender_id: user.id,
      sender_type: "agent",
      content: reply.trim(),
    });
    setReply("");
    setSendingReply(false);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!ticket) return <div className="text-center py-20 text-muted-foreground">Ticket não encontrado</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/tickets")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">#{ticket.ticket_number} – {ticket.subject}</h1>
            <PriorityFlag priority={ticket.priority} showLabel />
          </div>
          <p className="text-sm text-muted-foreground">{ticket.client_name}{ticket.order_number ? ` · Enc. ${ticket.order_number}` : ""}{ticket.service_number ? ` · OS ${ticket.service_number}` : ""}</p>
        </div>
        <Select value={ticket.status} onValueChange={updateStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {suggestions.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              ⚡ Sugestões do Motor de Regras
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {suggestions.map((s, i) => (
              <div key={i} className="text-sm p-2 rounded bg-background border">
                <p className="font-medium">{s.rule}: {s.message}</p>
                {s.suggestedTags.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Tags: {s.suggestedTags.join(", ")}</p>
                )}
                {s.suggestedClauses.length > 0 && (
                  <p className="text-xs text-muted-foreground">Cláusulas: {s.suggestedClauses.join(", ")}</p>
                )}
                {s.suggestedMacro && (
                  <p className="text-xs text-muted-foreground">Macro sugerida: {s.suggestedMacro}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <SlaIndicator ticket={ticket} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-sm">Descrição</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{ticket.description || "Sem descrição"}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Anexos</CardTitle></CardHeader>
            <CardContent>
              <FileUpload
                ticketId={id}
                userId={user?.id || ""}
                attachments={attachments}
                onAttachmentsChange={async (newAtts) => {
                  const toInsert = newAtts.filter((a) => !a.id);
                  if (toInsert.length > 0) {
                    await supabase.from("ticket_attachments").insert(
                      toInsert.map((a) => ({
                        ticket_id: id!,
                        file_name: a.file_name,
                        file_path: a.file_path,
                        file_type: a.file_type,
                        file_size: a.file_size,
                        uploaded_by: user!.id,
                      }))
                    );
                  }
                  fetchTicket();
                }}
              />
            </CardContent>
          </Card>

          {/* Client Messages */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Mensagens do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Sem mensagens do cliente</p>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sender_type === "agent" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg px-4 py-2 text-sm ${
                          msg.sender_type === "agent"
                            ? "bg-primary text-primary-foreground"
                            : "bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200"
                        }`}
                      >
                        <p className="text-xs font-medium mb-1">
                          {msg.sender_type === "agent" ? "Agente" : "Cliente"}
                        </p>
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        <p className={`text-xs mt-1 opacity-70`}>
                          {new Date(msg.created_at).toLocaleString("pt-PT")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="border-t pt-3 space-y-2">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Responder ao cliente..."
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={2}
                    className="flex-1"
                  />
                  <Button size="icon" onClick={sendReply} disabled={sendingReply || !reply.trim()}>
                    {sendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Internal Timeline */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Timeline (Notas Internas)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {events.map((ev) => (
                <div key={ev.id} className="flex gap-3 text-sm">
                  <Clock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p>{ev.content}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(ev.created_at).toLocaleString("pt-PT")}
                    </p>
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t space-y-2">
                <div className="flex items-center gap-2">
                  <MacroSelector ticket={ticket} onSelect={(content) => setNote(content)} />
                </div>
                <div className="flex gap-2">
                  <Textarea placeholder="Adicionar nota interna..." value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="flex-1" />
                  <Button size="icon" onClick={addNote} disabled={addingNote || !note.trim()}>
                    {addingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <TicketSidebar ticket={ticket} tags={tags} clauses={clauses} onUpdate={fetchTicket} />
      </div>
    </div>
  );
}
