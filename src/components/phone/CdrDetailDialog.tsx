import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  PhoneIncoming, PhoneOutgoing, PhoneMissed, ChevronDown, Code2, AlertCircle, CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface Props {
  callId: string | null;
  open: boolean;
  onClose: () => void;
}

type CallRow = {
  id: string;
  source: string | null;
  direction: string | null;
  attended: boolean | null;
  call_status: string | null;
  extension: string | null;
  client_phone: string;
  client_name: string;
  created_at: string;
  duration_seconds: number | null;
  ringing_seconds: number | null;
  cdr_raw: any;
  cdr_answered_at: string | null;
  cdr_ended_at: string | null;
  cdr_src: string | null;
  cdr_dst: string | null;
  letscall_linkedid: string | null;
};

type Candidate = {
  phone_call_id: string;
  source: string;
  direction: string | null;
  call_status: string | null;
  attended: boolean | null;
  created_at: string;
  extension: string | null;
  client_phone: string;
};

const STATUS_LABELS: Record<string, string> = {
  answered: "Atendida",
  missed: "Perdida",
  no_answer: "Sem atendimento",
  busy: "Ocupado",
  failed: "Falhou",
  cancelled: "Cancelada",
  unknown: "Desconhecido",
};

const STATUS_TONES: Record<string, string> = {
  answered: "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300",
  missed: "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300",
  no_answer: "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300",
  busy: "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300",
  failed: "border-destructive/40 text-destructive",
  cancelled: "border-muted-foreground/30 text-muted-foreground",
  unknown: "border-muted-foreground/30 text-muted-foreground",
};

export default function CdrDetailDialog({ callId, open, onClose }: Props) {
  const { role } = useAuth();
  const isSupervisor = role === "supervisor";
  const [loading, setLoading] = useState(false);
  const [origin, setOrigin] = useState<CallRow | null>(null);
  const [match, setMatch] = useState<CallRow | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [recon, setRecon] = useState<{ reconciliation_status: string; match_count: number; matched_call_id: string | null } | null>(null);

  useEffect(() => {
    if (!callId || !open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setOrigin(null); setMatch(null); setCandidates([]); setRecon(null);

      const [originRes, reconRes] = await Promise.all([
        supabase.from("phone_calls")
          .select("id, source, direction, attended, call_status, extension, client_phone, client_name, created_at, duration_seconds, ringing_seconds, cdr_raw, cdr_answered_at, cdr_ended_at, cdr_src, cdr_dst, letscall_linkedid")
          .eq("id", callId).maybeSingle(),
        supabase.from("phone_calls_reconciliation")
          .select("reconciliation_status, match_count, matched_call_id")
          .eq("phone_call_id", callId).maybeSingle(),
      ]);
      if (cancelled) return;
      const o = originRes.data as CallRow | null;
      const r = reconRes.data as any;
      setOrigin(o);
      setRecon(r);

      if (r?.reconciliation_status === "confirmed" && r.matched_call_id) {
        const { data: m } = await supabase.from("phone_calls")
          .select("id, source, direction, attended, call_status, extension, client_phone, client_name, created_at, duration_seconds, ringing_seconds, cdr_raw, cdr_answered_at, cdr_ended_at, cdr_src, cdr_dst, letscall_linkedid")
          .eq("id", r.matched_call_id).maybeSingle();
        if (!cancelled) setMatch(m as CallRow | null);
      } else if (r?.reconciliation_status === "ambiguous" && o) {
        // Fetch candidates from the reconciliation view's underlying source
        const phoneNorm = (o.client_phone || "").replace(/\D/g, "").replace(/^(00351|351)/, "");
        const since = new Date(new Date(o.created_at).getTime() - 15 * 60_000).toISOString();
        const until = new Date(new Date(o.created_at).getTime() + 15 * 60_000).toISOString();
        const otherSource = o.source === "letscall" ? "neq" : "eq";
        let q = supabase.from("phone_calls")
          .select("id, source, direction, call_status, attended, created_at, extension, client_phone")
          .gte("created_at", since).lte("created_at", until)
          .neq("id", o.id);
        q = otherSource === "eq" ? q.eq("source", "letscall") : q.neq("source", "letscall");
        const { data: cands } = await q;
        const list = (cands as Candidate[] || []).filter(c => {
          const norm = (c.client_phone || "").replace(/\D/g, "").replace(/^(00351|351)/, "");
          return norm && phoneNorm && norm === phoneNorm;
        });
        if (!cancelled) setCandidates(list.map(c => ({ ...c, phone_call_id: (c as any).id })));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [callId, open]);

  const cdr = match || (origin?.source === "letscall" ? origin : null);
  const status = recon?.reconciliation_status;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="h-4 w-4" /> Detalhes CDR MicroSIP
          </DialogTitle>
          <DialogDescription className="text-xs">
            Comparação ±15 min entre o registo e o CDR Let's Call.
          </DialogDescription>
        </DialogHeader>

        {loading && <Skeleton className="h-40 w-full" />}

        {!loading && status === "not_found_in_microsip" && (
          <div className="rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Nenhuma chamada MicroSIP encontrada</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Não existe chamada Let's Call para este registo dentro da janela de ±15 minutos.
                  Pode ser uma chamada não realizada pelo MicroSIP ou um registo manual sem CDR.
                </p>
              </div>
            </div>
          </div>
        )}

        {!loading && status === "not_registered_in_system" && (
          <div className="rounded-lg border border-blue-300/50 bg-blue-50 dark:bg-blue-950/20 p-4 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">CDR sem registo manual no sistema</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Esta chamada existe no MicroSIP mas nenhum agente abriu um registo correspondente.
                </p>
              </div>
            </div>
          </div>
        )}

        {!loading && status === "ambiguous" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
              <p className="font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" /> Chamada ambígua
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Foram encontradas {candidates.length} chamadas possíveis. Nenhuma foi escolhida automaticamente.
              </p>
            </div>
            <div className="border rounded-lg divide-y">
              {candidates.map((c) => (
                <div key={c.phone_call_id} className="p-2 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {c.direction === "incoming" || c.direction === "inbound"
                      ? <PhoneIncoming className="h-3 w-3 shrink-0" />
                      : c.direction === "outgoing" || c.direction === "outbound"
                      ? <PhoneOutgoing className="h-3 w-3 shrink-0" />
                      : <PhoneMissed className="h-3 w-3 shrink-0" />}
                    <span className="font-mono">{c.extension || "—"}</span>
                    <span className="font-mono truncate">{c.client_phone}</span>
                    <span className="text-muted-foreground">{format(new Date(c.created_at), "dd/MM HH:mm:ss", { locale: pt })}</span>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${STATUS_TONES[c.call_status || "unknown"]}`}>
                    {STATUS_LABELS[c.call_status || "unknown"]}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && cdr && (status === "confirmed" || status === "not_registered_in_system") && (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 p-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <Field label="Status">
                <Badge variant="outline" className={`text-[10px] ${STATUS_TONES[cdr.call_status || "unknown"]}`}>
                  {STATUS_LABELS[cdr.call_status || "unknown"]}
                </Badge>
              </Field>
              <Field label="Direção">{cdr.direction || "—"}</Field>
              <Field label="Ramal" mono>{cdr.extension || "—"}</Field>
              <Field label="ID Let's Call" mono>{cdr.letscall_linkedid || "—"}</Field>
              <Field label="Origem" mono>{cdr.cdr_src || "—"}</Field>
              <Field label="Destino" mono>{cdr.cdr_dst || "—"}</Field>
              <Field label="Telefone cliente" mono>{cdr.client_phone}</Field>
              <Field label="Cliente">{cdr.client_name}</Field>
              <Field label="Início">{format(new Date(cdr.created_at), "dd/MM/yyyy HH:mm:ss", { locale: pt })}</Field>
              <Field label="Atendimento">{cdr.cdr_answered_at ? format(new Date(cdr.cdr_answered_at), "dd/MM HH:mm:ss", { locale: pt }) : "—"}</Field>
              <Field label="Fim">{cdr.cdr_ended_at ? format(new Date(cdr.cdr_ended_at), "dd/MM HH:mm:ss", { locale: pt }) : "—"}</Field>
              <Field label="Duração">{typeof cdr.duration_seconds === "number" ? `${cdr.duration_seconds}s` : "—"}</Field>
              <Field label="Toque">{typeof cdr.ringing_seconds === "number" ? `${cdr.ringing_seconds}s` : "—"}</Field>
              <Field label="Reconciliação">
                <Badge variant="outline" className="text-[10px] gap-1 border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Confirmada
                </Badge>
              </Field>
            </div>

            {isSupervisor && cdr.cdr_raw && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
                    <ChevronDown className="h-3 w-3" /> Payload técnico (supervisor)
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="text-[10px] bg-muted/50 p-2 rounded border overflow-x-auto max-h-64">
                    {JSON.stringify(cdr.cdr_raw, null, 2)}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}

        {!loading && !cdr && !status && (
          <p className="text-xs text-muted-foreground">Sem informação disponível.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className={`text-xs ${mono ? "font-mono" : ""}`}>{children}</div>
    </div>
  );
}
