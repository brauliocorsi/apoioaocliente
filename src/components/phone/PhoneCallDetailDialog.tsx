import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import ReminderForm from "./ReminderForm";
import ReminderList from "./ReminderList";
import PriorityFlag from "@/components/ticket/PriorityFlag";

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
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [notes, setNotes] = useState("");
  const [reminders, setReminders] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (call) {
      setStatus(call.status);
      setPriority(call.priority);
      setNotes(call.notes || "");
      fetchReminders(call.id);
    }
  }, [call]);

  const fetchReminders = async (callId: string) => {
    const { data } = await supabase
      .from("phone_call_reminders" as any)
      .select("*")
      .eq("phone_call_id", callId)
      .order("remind_at", { ascending: true });
    setReminders((data as any[]) || []);
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
