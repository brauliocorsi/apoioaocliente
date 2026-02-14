import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import ReminderForm from "./ReminderForm";
import ReminderList from "./ReminderList";
import PriorityFlag from "@/components/ticket/PriorityFlag";
import { Link, X, ExternalLink, Save, Phone, Bell, Ticket } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface PhoneCall {
  id: string;
  client_name: string;
  client_phone: string;
  invoice_number: string | null;
  subject: string;
  notes: string | null;
  status: string;
  priority: string;
  created_at: string;
  ticket_id?: string | null;
}

interface PhoneCallDetailDialogProps {
  call: PhoneCall | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

const statusOptions = [
  { value: "pendente", label: "Pendente", color: "bg-warning/10 text-warning border-warning/30" },
  { value: "em_andamento", label: "Em andamento", color: "bg-primary/10 text-primary border-primary/30" },
  { value: "concluido", label: "Concluído", color: "bg-success/10 text-success border-success/30" },
  { value: "cancelado", label: "Cancelado", color: "bg-muted text-muted-foreground border-border" },
];

export default function PhoneCallDetailDialog({ call, open, onClose, onUpdated }: PhoneCallDetailDialogProps) {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [notes, setNotes] = useState("");
  const [reminders, setReminders] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [linkedTicket, setLinkedTicket] = useState<any | null>(null);
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketResults, setTicketResults] = useState<any[]>([]);

  useEffect(() => {
    if (call) {
      setStatus(call.status);
      setPriority(call.priority);
      setNotes(call.notes || "");
      fetchReminders(call.id);
      if (call.ticket_id) {
        fetchLinkedTicket(call.ticket_id);
      } else {
        setLinkedTicket(null);
      }
    }
  }, [call]);

  const fetchLinkedTicket = async (ticketId: string) => {
    const { data } = await supabase.from("tickets").select("id, ticket_number, subject, client_name").eq("id", ticketId).single();
    setLinkedTicket(data);
  };

  const fetchReminders = async (callId: string) => {
    const { data } = await supabase
      .from("phone_call_reminders" as any)
      .select("*")
      .eq("phone_call_id", callId)
      .order("remind_at", { ascending: true });
    setReminders((data as any[]) || []);
  };

  useEffect(() => {
    if (!ticketSearch || ticketSearch.length < 2) { setTicketResults([]); return; }
    const timeout = setTimeout(async () => {
      const isNumber = /^\d+$/.test(ticketSearch);
      let query = supabase.from("tickets").select("id, ticket_number, subject, client_name").limit(8);
      if (isNumber) query = query.eq("ticket_number", parseInt(ticketSearch));
      else query = query.or(`client_name.ilike.%${ticketSearch}%,subject.ilike.%${ticketSearch}%`);
      const { data } = await query;
      setTicketResults(data || []);
    }, 300);
    return () => clearTimeout(timeout);
  }, [ticketSearch]);

  const linkTicket = async (ticket: any) => {
    if (!call) return;
    setTicketSearch(""); setTicketResults([]);
    const { error } = await supabase.from("phone_calls" as any).update({ ticket_id: ticket.id } as any).eq("id", call.id);
    if (error) { toast({ title: "Erro ao vincular", description: error.message, variant: "destructive" }); return; }
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from("ticket_events").insert({
      ticket_id: ticket.id, user_id: userData?.user?.id || null,
      event_type: "phone_call_linked",
      content: `📞 Ligação telefónica vinculada: "${call.subject}" — ${call.client_name} (${call.client_phone})`,
      metadata: { phone_call_id: call.id },
    });
    setLinkedTicket(ticket);
    toast({ title: "Ticket vinculado com sucesso" });
    onUpdated();
  };

  const unlinkTicket = async () => {
    if (!call || !linkedTicket) return;
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from("ticket_events").insert({
      ticket_id: linkedTicket.id, user_id: userData?.user?.id || null,
      event_type: "phone_call_unlinked",
      content: `📞 Ligação desvinculada: "${call.subject}"`,
      metadata: { phone_call_id: call.id },
    });
    await supabase.from("phone_calls" as any).update({ ticket_id: null } as any).eq("id", call.id);
    setLinkedTicket(null);
    toast({ title: "Ticket desvinculado" });
    onUpdated();
  };

  const handleSave = async () => {
    if (!call) return;
    setSaving(true);
    const { error } = await supabase.from("phone_calls" as any).update({ status, priority, notes: notes || null } as any).eq("id", call.id);
    setSaving(false);
    if (error) { toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Ligação atualizada" }); onUpdated(); }
  };

  if (!call) return null;

  const currentStatus = statusOptions.find((s) => s.value === status);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Phone className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle className="flex items-center gap-2">
                {call.client_name}
                <PriorityFlag priority={priority} size={16} />
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{call.client_phone} • {new Date(call.created_at).toLocaleString("pt-PT")}</p>
            </div>
            {currentStatus && (
              <Badge variant="outline" className={`${currentStatus.color} text-xs`}>
                {currentStatus.label}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Call info */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
            <div className="text-sm"><span className="text-muted-foreground font-medium">Assunto:</span> {call.subject}</div>
            <div className="flex gap-4 text-sm">
              <span><span className="text-muted-foreground font-medium">Nota:</span> {call.invoice_number || "—"}</span>
            </div>
          </div>

          {/* Editable fields */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Gestão</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Prioridade</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="P1">P1 – Urgente</SelectItem>
                    <SelectItem value="P2">P2 – Normal</SelectItem>
                    <SelectItem value="P3">P3 – Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Adicionar observações..." />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {saving ? "A guardar..." : "Guardar Alterações"}
          </Button>

          <Separator />

          {/* Ticket linking */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Ticket className="h-3.5 w-3.5" /> Ticket Vinculado
            </h4>
            {linkedTicket ? (
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-primary/20 bg-primary/5">
                <Ticket className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="font-mono font-semibold text-sm text-primary">#{linkedTicket.ticket_number}</span>
                <span className="text-sm text-muted-foreground truncate flex-1">{linkedTicket.subject}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { onClose(); navigate(`/tickets/${linkedTicket.id}`); }}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-destructive/10" onClick={unlinkTicket}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Input placeholder="Pesquisar ticket por nº, nome ou assunto..." value={ticketSearch} onChange={(e) => setTicketSearch(e.target.value)} />
                {ticketResults.length > 0 && (
                  <div className="absolute z-10 top-full mt-1 w-full bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {ticketResults.map((t) => (
                      <button key={t.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2" onClick={() => linkTicket(t)}>
                        <span className="font-mono font-semibold text-primary">#{t.ticket_number}</span>
                        <span className="text-muted-foreground truncate">{t.subject} — {t.client_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Reminders */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5" /> Lembretes
            </h4>
            <ReminderForm phoneCallId={call.id} onCreated={() => fetchReminders(call.id)} />
            <ReminderList reminders={reminders} onUpdated={() => fetchReminders(call.id)} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
