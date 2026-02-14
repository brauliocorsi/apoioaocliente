import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import ReminderForm from "./ReminderForm";
import ReminderList from "./ReminderList";
import PriorityFlag from "@/components/ticket/PriorityFlag";
import { Link, X, ExternalLink } from "lucide-react";
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
  { value: "pendente", label: "Pendente" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluido", label: "Concluído" },
  { value: "cancelado", label: "Cancelado" },
];

export default function PhoneCallDetailDialog({ call, open, onClose, onUpdated }: PhoneCallDetailDialogProps) {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [notes, setNotes] = useState("");
  const [reminders, setReminders] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  // Ticket linking state
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

  // Search tickets
  useEffect(() => {
    if (!ticketSearch || ticketSearch.length < 2) {
      setTicketResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      const isNumber = /^\d+$/.test(ticketSearch);
      let query = supabase.from("tickets").select("id, ticket_number, subject, client_name").limit(8);
      if (isNumber) {
        query = query.eq("ticket_number", parseInt(ticketSearch));
      } else {
        query = query.or(`client_name.ilike.%${ticketSearch}%,subject.ilike.%${ticketSearch}%`);
      }
      const { data } = await query;
      setTicketResults(data || []);
    }, 300);
    return () => clearTimeout(timeout);
  }, [ticketSearch]);

  const linkTicket = async (ticket: any) => {
    if (!call) return;
    setTicketSearch("");
    setTicketResults([]);

    const { error } = await supabase
      .from("phone_calls" as any)
      .update({ ticket_id: ticket.id } as any)
      .eq("id", call.id);

    if (error) {
      toast({ title: "Erro ao vincular ticket", description: error.message, variant: "destructive" });
      return;
    }

    // Register in ticket timeline
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from("ticket_events").insert({
      ticket_id: ticket.id,
      user_id: userData?.user?.id || null,
      event_type: "phone_call_linked",
      content: `📞 Ligação telefónica vinculada: "${call.subject}" — Cliente: ${call.client_name} (${call.client_phone})`,
      metadata: { phone_call_id: call.id },
    });

    setLinkedTicket(ticket);
    toast({ title: "Ticket vinculado com sucesso" });
    onUpdated();
  };

  const unlinkTicket = async () => {
    if (!call || !linkedTicket) return;

    // Register unlink in ticket timeline
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from("ticket_events").insert({
      ticket_id: linkedTicket.id,
      user_id: userData?.user?.id || null,
      event_type: "phone_call_unlinked",
      content: `📞 Ligação telefónica desvinculada: "${call.subject}"`,
      metadata: { phone_call_id: call.id },
    });

    await supabase
      .from("phone_calls" as any)
      .update({ ticket_id: null } as any)
      .eq("id", call.id);

    setLinkedTicket(null);
    toast({ title: "Ticket desvinculado" });
    onUpdated();
  };

  const handleSave = async () => {
    if (!call) return;
    setSaving(true);
    const { error } = await supabase
      .from("phone_calls" as any)
      .update({ status, priority, notes: notes || null } as any)
      .eq("id", call.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Ligação atualizada" });
      onUpdated();
    }
  };

  if (!call) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PriorityFlag priority={priority} /> {call.client_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-muted-foreground">Telefone:</span> {call.client_phone}</div>
            <div><span className="text-muted-foreground">Nota:</span> {call.invoice_number || "—"}</div>
          </div>
          <div><span className="text-muted-foreground">Assunto:</span> {call.subject}</div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Status</Label>
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
              <Label>Prioridade</Label>
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

          <div className="space-y-1">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">{saving ? "A guardar..." : "Guardar Alterações"}</Button>

          <Separator />

          {/* Ticket linking section */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <Link className="h-3.5 w-3.5" /> Ticket Vinculado
            </h4>
            {linkedTicket ? (
              <div className="flex items-center gap-2 p-2 rounded border bg-muted/50">
                <span className="font-medium">#{linkedTicket.ticket_number}</span>
                <span className="text-muted-foreground truncate flex-1">{linkedTicket.subject}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    onClose();
                    navigate(`/tickets/${linkedTicket.id}`);
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={unlinkTicket}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  placeholder="Pesquisar ticket por nº, nome ou assunto..."
                  value={ticketSearch}
                  onChange={(e) => setTicketSearch(e.target.value)}
                />
                {ticketResults.length > 0 && (
                  <div className="absolute z-10 top-full mt-1 w-full bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
                    {ticketResults.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                        onClick={() => linkTicket(t)}
                      >
                        <span className="font-medium">#{t.ticket_number}</span>
                        <span className="text-muted-foreground truncate">{t.subject} — {t.client_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Lembretes</h4>
            <ReminderForm phoneCallId={call.id} onCreated={() => fetchReminders(call.id)} />
            <ReminderList reminders={reminders} onUpdated={() => fetchReminders(call.id)} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
