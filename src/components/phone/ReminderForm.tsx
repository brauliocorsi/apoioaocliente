import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Bell } from "lucide-react";

interface ReminderFormProps {
  phoneCallId: string;
  callSubject?: string;
  callClientName?: string;
  onCreated: () => void;
}

export default function ReminderForm({ phoneCallId, callSubject, callClientName, onCreated }: ReminderFormProps) {
  const [remindAt, setRemindAt] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remindAt || !message) return;
    setLoading(true);
    const { error } = await supabase.from("phone_call_reminders" as any).insert({
      phone_call_id: phoneCallId,
      remind_at: new Date(remindAt).toISOString(),
      message,
    } as any);
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao criar lembrete", description: error.message, variant: "destructive" });
    } else {
      const callLabel = [callClientName, callSubject].filter(Boolean).join(" — ");
      toast({ title: "Lembrete criado", description: callLabel ? `Ligação: ${callLabel}` : undefined });
      setRemindAt("");
      setMessage("");
      onCreated();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Label className="flex items-center gap-1 text-sm font-medium"><Bell className="h-3.5 w-3.5" /> Novo Lembrete</Label>
      <div className="flex gap-2">
        <Input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} required className="flex-1" />
        <Input placeholder="Mensagem do lembrete" value={message} onChange={(e) => setMessage(e.target.value)} required className="flex-[2]" />
        <Button type="submit" size="sm" disabled={loading}>Adicionar</Button>
      </div>
    </form>
  );
}
