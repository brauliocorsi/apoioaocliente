import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Clock, Send } from "lucide-react";
import { DecisionEngine, type RuleSuggestion } from "@/lib/decisionEngine";
import FileUpload from "@/components/FileUpload";

const statusLabels: Record<string, string> = {
  novo: "Novo",
  em_analise: "Em análise",
  aguarda_cliente: "Aguarda cliente",
  aguarda_logistica: "Aguarda logística",
  aguarda_tecnico: "Aguarda técnico",
  resolvido: "Resolvido",
  encerrado: "Encerrado",
};

const priorityColors: Record<string, string> = {
  P1: "bg-destructive text-destructive-foreground",
  P2: "bg-warning text-warning-foreground",
  P3: "bg-muted text-muted-foreground",
};

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [ticket, setTicket] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [clauses, setClauses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [suggestions, setSuggestions] = useState<RuleSuggestion[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);

  const fetchTicket = async () => {
    if (!id) return;
    const [{ data: t }, { data: evts }, { data: tTags }, { data: tClauses }, { data: tAttachments }] = await Promise.all([
      supabase.from("tickets").select("*").eq("id", id).single(),
      supabase.from("ticket_events").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
      supabase.from("ticket_tags").select("tag_id").eq("ticket_id", id),
      supabase.from("ticket_clauses").select("clause_id").eq("ticket_id", id),
      supabase.from("ticket_attachments").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
    ]);
    setTicket(t);
    setEvents(evts || []);
    setTags((tTags || []).map((r: any) => r.tag_id));
    setClauses((tClauses || []).map((r: any) => r.clause_id));
    setAttachments((tAttachments || []).map((a: any) => ({
      ...a,
      url: supabase.storage.from("ticket-attachments").getPublicUrl(a.file_path).data.publicUrl,
    })));
    
    // Run decision engine
    if (t) {
      const s = DecisionEngine.evaluate(t, (tTags || []).map((r: any) => r.tag_id));
      setSuggestions(s);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTicket(); }, [id]);

  const updateStatus = async (newStatus: string) => {
    if (!id || !user) return;
    const oldStatus = ticket.status;
    
    // Handle SLA pause
    const updates: any = { status: newStatus };
    if (newStatus === "aguarda_cliente" && !ticket.sla_paused_at) {
      updates.sla_paused_at = new Date().toISOString();
    } else if (oldStatus === "aguarda_cliente" && newStatus !== "aguarda_cliente" && ticket.sla_paused_at) {
      const pausedSeconds = Math.floor((Date.now() - new Date(ticket.sla_paused_at).getTime()) / 1000);
      updates.sla_paused_total_seconds = (ticket.sla_paused_total_seconds || 0) + pausedSeconds;
      updates.sla_paused_at = null;
    }
    if (newStatus === "resolvido") updates.resolved_at = new Date().toISOString();

    await supabase.from("tickets").update(updates).eq("id", id);
    await supabase.from("ticket_events").insert({
      ticket_id: id,
      user_id: user.id,
      event_type: "status_change",
      content: `Estado alterado: ${statusLabels[oldStatus]} → ${statusLabels[newStatus]}`,
      metadata: { from: oldStatus, to: newStatus },
    });
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
            <Badge className={priorityColors[ticket.priority]}>{ticket.priority}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{ticket.client_name}{ticket.order_number ? ` · Enc. ${ticket.order_number}` : ""}</p>
        </div>
        <Select value={ticket.status} onValueChange={updateStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(statusLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Decision Engine Suggestions */}
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-sm">Descrição</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{ticket.description || "Sem descrição"}</p>
            </CardContent>
          </Card>

          {/* Attachments */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Anexos</CardTitle></CardHeader>
            <CardContent>
              <FileUpload
                ticketId={id}
                userId={user?.id || ""}
                attachments={attachments}
                onAttachmentsChange={async (newAtts) => {
                  // Save any new attachments (those without id)
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

          {/* Timeline */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Timeline</CardTitle></CardHeader>
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
              <div className="flex gap-2 pt-2 border-t">
                <Textarea placeholder="Adicionar nota..." value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="flex-1" />
                <Button size="icon" onClick={addNote} disabled={addingNote || !note.trim()}>
                  {addingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar info */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Informação</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">Categoria:</span> <span className="ml-2">{ticket.category_id || "–"}</span></div>
              <div><span className="text-muted-foreground">Subcategoria:</span> <span className="ml-2">{ticket.subcategory_id || "–"}</span></div>
              <div><span className="text-muted-foreground">Email:</span> <span className="ml-2">{ticket.client_email || "–"}</span></div>
              <div><span className="text-muted-foreground">Telefone:</span> <span className="ml-2">{ticket.client_phone || "–"}</span></div>
              <div><span className="text-muted-foreground">Data entrega:</span> <span className="ml-2">{ticket.delivery_date || "–"}</span></div>
              <div><span className="text-muted-foreground">Montado:</span> <span className="ml-2">{ticket.is_assembled ? "Sim" : "Não"}</span></div>
              <div><span className="text-muted-foreground">Personalizado:</span> <span className="ml-2">{ticket.is_personalized ? "Sim" : "Não"}</span></div>
              <div><span className="text-muted-foreground">Exposição:</span> <span className="ml-2">{ticket.is_exhibition ? "Sim" : "Não"}</span></div>
              <div><span className="text-muted-foreground">Criado:</span> <span className="ml-2">{new Date(ticket.created_at).toLocaleString("pt-PT")}</span></div>
            </CardContent>
          </Card>

          {tags.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Tags</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-1">
                {tags.map((t) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
              </CardContent>
            </Card>
          )}

          {clauses.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Cláusulas</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-1">
                {clauses.map((c) => <Badge key={c} variant="outline" className="text-xs font-mono">{c}</Badge>)}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
