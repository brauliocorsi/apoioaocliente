import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Gavel, Pencil, Loader2, ShieldCheck, Clock, ThumbsUp, ThumbsDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ResolutionCardProps {
  ticket: any;
  userId: string;
  onUpdate: () => void;
}

type Approval = {
  id: string;
  ticket_id: string;
  requested_by: string;
  supervisor_id: string;
  proposed_type: string;
  proposed_reason: string;
  status: string;
  supervisor_notes: string | null;
  created_at: string;
  resolved_at: string | null;
};

export default function ResolutionCard({ ticket, userId, onUpdate }: ResolutionCardProps) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState<string>(ticket.resolution_type || "");
  const [reason, setReason] = useState<string>(ticket.resolution_reason || "");
  const [saving, setSaving] = useState(false);

  // Approval flow state
  const [requireApproval, setRequireApproval] = useState(false);
  const [selectedSupervisor, setSelectedSupervisor] = useState("");
  const [supervisors, setSupervisors] = useState<{ id: string; full_name: string }[]>([]);
  const [pendingApproval, setPendingApproval] = useState<Approval | null>(null);
  const [latestApproval, setLatestApproval] = useState<Approval | null>(null);
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [supervisorNotes, setSupervisorNotes] = useState("");
  const [processingApproval, setProcessingApproval] = useState(false);
  const [approvalProfiles, setApprovalProfiles] = useState<Record<string, string>>({});

  const hasResolution = !!ticket.resolution_type;

  // Load supervisors and check current user role
  useEffect(() => {
    const load = async () => {
      const { data: agents } = await supabase.rpc("get_agent_profiles");
      const sups = (agents || []).filter((a: any) => a.role === "supervisor");
      setSupervisors(sups.map((s: any) => ({ id: s.id, full_name: s.full_name })));
      setIsSupervisor(sups.some((s: any) => s.id === userId));

      // Build profile map
      const map: Record<string, string> = {};
      (agents || []).forEach((a: any) => { map[a.id] = a.full_name; });
      setApprovalProfiles(map);
    };
    load();
  }, [userId]);

  // Load pending/latest approval for this ticket
  useEffect(() => {
    const loadApprovals = async () => {
      const { data } = await supabase
        .from("resolution_approvals")
        .select("*")
        .eq("ticket_id", ticket.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const latest = (data as any[])?.[0] || null;
      if (latest?.status === "pending") {
        setPendingApproval(latest);
        setLatestApproval(null);
      } else {
        setPendingApproval(null);
        setLatestApproval(latest);
      }
    };
    loadApprovals();

    // Realtime subscription
    const channel = supabase
      .channel(`approvals-${ticket.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "resolution_approvals", filter: `ticket_id=eq.${ticket.id}` },
        () => { loadApprovals(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ticket.id]);

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

  const requestApproval = async () => {
    if (!type || !reason.trim() || !selectedSupervisor) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    setSaving(true);

    await supabase.from("resolution_approvals").insert({
      ticket_id: ticket.id,
      requested_by: userId,
      supervisor_id: selectedSupervisor,
      proposed_type: type,
      proposed_reason: reason.trim(),
    });

    // Notify supervisor
    const supName = approvalProfiles[selectedSupervisor] || "Supervisor";
    await supabase.from("agent_notifications").insert({
      recipient_id: selectedSupervisor,
      sender_id: userId,
      ticket_id: ticket.id,
      type: "approval_request",
      content: `solicitou a sua aprovação para ${type === "resolved" ? "resolução" : "cancelamento"} do ticket #${ticket.ticket_number}`,
    });

    await supabase.from("ticket_events").insert({
      ticket_id: ticket.id,
      user_id: userId,
      event_type: "approval_request",
      content: `Solicitou aprovação de ${supName} para ${type === "resolved" ? "resolução" : "cancelamento"}`,
      metadata: { supervisor_id: selectedSupervisor, proposed_type: type },
    });

    toast({ title: "Pedido de aprovação enviado" });
    setSaving(false);
    setEditing(false);
    setRequireApproval(false);
    onUpdate();
  };

  const handleApproval = async (approved: boolean) => {
    if (!pendingApproval) return;
    setProcessingApproval(true);

    await supabase.from("resolution_approvals").update({
      status: approved ? "approved" : "rejected",
      supervisor_notes: supervisorNotes.trim() || null,
      resolved_at: new Date().toISOString(),
    }).eq("id", pendingApproval.id);

    // If approved, apply the resolution
    if (approved) {
      const now = new Date().toISOString();
      await supabase.from("tickets").update({
        resolution_type: pendingApproval.proposed_type,
        resolution_reason: pendingApproval.proposed_reason,
        resolution_at: now,
        resolution_by: userId,
      } as any).eq("id", ticket.id);

      try {
        await supabase.functions.invoke("send-ticket-email", {
          body: { ticket_id: ticket.id, template_id: "resolution_decision" },
        });
      } catch (e) {
        console.error("Failed to send resolution email:", e);
      }
    }

    // Notify requesting agent
    await supabase.from("agent_notifications").insert({
      recipient_id: pendingApproval.requested_by,
      sender_id: userId,
      ticket_id: ticket.id,
      type: "approval_response",
      content: `${approved ? "aprovou" : "recusou"} a sua proposta de ${pendingApproval.proposed_type === "resolved" ? "resolução" : "cancelamento"} do ticket #${ticket.ticket_number}`,
    });

    await supabase.from("ticket_events").insert({
      ticket_id: ticket.id,
      user_id: userId,
      event_type: approved ? "approval_approved" : "approval_rejected",
      content: `${approved ? "Aprovou" : "Recusou"} a proposta de ${pendingApproval.proposed_type === "resolved" ? "resolução" : "cancelamento"}${supervisorNotes.trim() ? ` — ${supervisorNotes.trim()}` : ""}`,
      metadata: { approval_id: pendingApproval.id },
    });

    toast({ title: approved ? "Proposta aprovada" : "Proposta recusada" });
    setProcessingApproval(false);
    setSupervisorNotes("");
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

  // Pending approval card (visible to all agents)
  if (pendingApproval && !editing) {
    const isMySupervisorReview = isSupervisor && pendingApproval.supervisor_id === userId;
    const isProposed = pendingApproval.proposed_type === "resolved";
    return (
      <Card className="border-2 border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" />
              Aguarda Aprovação de Supervisor
            </span>
            <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
              Pendente
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Solicitado por <strong>{approvalProfiles[pendingApproval.requested_by] || "Agente"}</strong> a{" "}
              <strong>{approvalProfiles[pendingApproval.supervisor_id] || "Supervisor"}</strong>
            </p>
            <p className="text-xs text-muted-foreground">
              Tipo: <strong>{isProposed ? "Resolução" : "Cancelamento"}</strong>
            </p>
          </div>
          <p className="text-sm whitespace-pre-wrap bg-background/50 rounded p-3 border">{pendingApproval.proposed_reason}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(pendingApproval.created_at).toLocaleString("pt-PT")}
          </p>

          {isMySupervisorReview && (
            <div className="space-y-3 border-t pt-3">
              <p className="text-sm font-medium">A sua decisão:</p>
              <Textarea
                placeholder="Notas do supervisor (opcional)..."
                value={supervisorNotes}
                onChange={(e) => setSupervisorNotes(e.target.value)}
                rows={3}
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => handleApproval(true)}
                  disabled={processingApproval}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {processingApproval ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ThumbsUp className="h-4 w-4 mr-1" />}
                  Aprovar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleApproval(false)}
                  disabled={processingApproval}
                >
                  {processingApproval ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ThumbsDown className="h-4 w-4 mr-1" />}
                  Recusar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Show latest rejected approval as info
  if (latestApproval?.status === "rejected" && !hasResolution && !editing) {
    return (
      <Card className="border-2 border-red-500/30 bg-red-50/30 dark:bg-red-950/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ThumbsDown className="h-4 w-4 text-red-500" />
              Proposta Recusada
            </span>
            <Button variant="ghost" size="sm" onClick={() => { setType(latestApproval.proposed_type); setReason(latestApproval.proposed_reason); setEditing(true); }}>
              <Pencil className="h-3 w-3 mr-1" /> Nova Proposta
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm whitespace-pre-wrap">{latestApproval.proposed_reason}</p>
          {latestApproval.supervisor_notes && (
            <div className="bg-background/50 rounded p-2 border">
              <p className="text-xs font-medium text-muted-foreground mb-1">Notas do supervisor:</p>
              <p className="text-sm">{latestApproval.supervisor_notes}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Recusado por {approvalProfiles[latestApproval.supervisor_id] || "Supervisor"} em{" "}
            {latestApproval.resolved_at ? new Date(latestApproval.resolved_at).toLocaleString("pt-PT") : ""}
          </p>
        </CardContent>
      </Card>
    );
  }

  // View mode (resolution exists)
  if (hasResolution && !editing) {
    const isResolved = ticket.resolution_type === "resolved";
    return (
      <Card className={`border-2 ${isResolved ? "border-green-500/40 bg-green-50/50 dark:bg-green-950/20" : "border-red-500/40 bg-red-50/50 dark:bg-red-950/20"}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              {isResolved ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
              {isResolved ? "Resolução Formal" : "Cancelamento Formal"}
              {latestApproval?.status === "approved" && (
                <Badge variant="outline" className="border-green-500 text-green-700 dark:text-green-400 text-xs">
                  <ShieldCheck className="h-3 w-3 mr-1" /> Aprovado
                </Badge>
              )}
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

        {/* Toggle: request supervisor approval */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="require-approval"
            checked={requireApproval}
            onChange={(e) => setRequireApproval(e.target.checked)}
            className="rounded border-input"
          />
          <label htmlFor="require-approval" className="text-sm cursor-pointer flex items-center gap-1">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Solicitar aprovação de supervisor
          </label>
        </div>

        {requireApproval && (
          <Select value={selectedSupervisor} onValueChange={setSelectedSupervisor}>
            <SelectTrigger><SelectValue placeholder="Selecionar supervisor..." /></SelectTrigger>
            <SelectContent>
              {supervisors.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex gap-2">
          {requireApproval ? (
            <Button onClick={requestApproval} disabled={saving || !type || !reason.trim() || !selectedSupervisor}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
              Solicitar Aprovação
            </Button>
          ) : (
            <Button onClick={save} disabled={saving || !type || !reason.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Confirmar Decisão
            </Button>
          )}
          {editing && (
            <Button variant="outline" onClick={() => { setEditing(false); setRequireApproval(false); }}>Cancelar</Button>
          )}
          {hasResolution && editing && (
            <Button variant="destructive" onClick={clear} disabled={saving}>
              Remover Decisão
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
