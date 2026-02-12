import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Gavel, Pencil, Loader2 } from "lucide-react";

interface ResolutionCardProps {
  ticket: any;
  userId: string;
  onUpdate: () => void;
}

export default function ResolutionCard({ ticket, userId, onUpdate }: ResolutionCardProps) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState<string>(ticket.resolution_type || "");
  const [reason, setReason] = useState<string>(ticket.resolution_reason || "");
  const [saving, setSaving] = useState(false);

  const hasResolution = !!ticket.resolution_type;

  const save = async () => {
    if (!type || !reason.trim()) {
      toast({ title: "Preencha o tipo e o motivo", variant: "destructive" });
      return;
    }
    setSaving(true);
    const now = new Date().toISOString();
    await supabase.from("tickets").update({
      resolution_type: type,
      resolution_reason: reason.trim(),
      resolution_at: now,
      resolution_by: userId,
    } as any).eq("id", ticket.id);

    await supabase.from("ticket_events").insert({
      ticket_id: ticket.id,
      user_id: userId,
      event_type: "resolution",
      content: `Decisão registada: ${type === "resolved" ? "Resolução" : "Cancelamento"} — ${reason.trim()}`,
      metadata: { resolution_type: type },
    });

    // Send email notification to client
    try {
      await supabase.functions.invoke("send-ticket-email", {
        body: { ticket_id: ticket.id, template_id: "resolution_decision" },
      });
    } catch (e) {
      console.error("Failed to send resolution email:", e);
    }

    toast({ title: "Decisão registada com sucesso" });
    setSaving(false);
    setEditing(false);
    onUpdate();
  };

  const clear = async () => {
    setSaving(true);
    await supabase.from("tickets").update({
      resolution_type: null,
      resolution_reason: null,
      resolution_at: null,
      resolution_by: null,
    } as any).eq("id", ticket.id);

    await supabase.from("ticket_events").insert({
      ticket_id: ticket.id,
      user_id: userId,
      event_type: "resolution",
      content: "Decisão removida",
    });

    toast({ title: "Decisão removida" });
    setSaving(false);
    setEditing(false);
    setType("");
    setReason("");
    onUpdate();
  };

  // View mode
  if (hasResolution && !editing) {
    const isResolved = ticket.resolution_type === "resolved";
    return (
      <Card className={`border-2 ${isResolved ? "border-green-500/40 bg-green-50/50 dark:bg-green-950/20" : "border-red-500/40 bg-red-50/50 dark:bg-red-950/20"}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              {isResolved ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
              {isResolved ? "Resolução Formal" : "Cancelamento Formal"}
            </span>
            <Button variant="ghost" size="sm" onClick={() => { setType(ticket.resolution_type); setReason(ticket.resolution_reason); setEditing(true); }}>
              <Pencil className="h-3 w-3 mr-1" /> Editar
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm whitespace-pre-wrap">{ticket.resolution_reason}</p>
          <p className="text-xs text-muted-foreground">
            Registado em {new Date(ticket.resolution_at).toLocaleString("pt-PT")}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Edit / create mode
  return (
    <Card className="border-2 border-dashed border-muted-foreground/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Gavel className="h-4 w-4" />
          {hasResolution ? "Editar Decisão" : "Registar Decisão Formal"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger><SelectValue placeholder="Tipo de decisão..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="resolved">✅ Resolução</SelectItem>
            <SelectItem value="cancelled">❌ Cancelamento</SelectItem>
          </SelectContent>
        </Select>
        <Textarea
          placeholder="Motivo / justificação formal (obrigatório)..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
        />
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving || !type || !reason.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Confirmar Decisão
          </Button>
          {editing && (
            <Button variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
          )}
          {hasResolution && editing && (
            <Button variant="destructive" onClick={clear} disabled={saving}>
              Remover Decisão
            </Button>
          )}
          {!hasResolution && !editing && (
            <Button variant="ghost" onClick={() => setEditing(false)} className="hidden">x</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
