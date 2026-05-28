import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertTriangle, CheckCircle2, PauseCircle, ShieldCheck, Lock } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";

type Ticket = {
  sla_status?: string | null;
  sla_first_response_at?: string | null;
  first_responded_at?: string | null;
  sla_resolution_at?: string | null;
  resolved_at?: string | null;
  next_customer_update_due_at?: string | null;
  next_action?: string | null;
  next_action_due_at?: string | null;
  sla_paused?: boolean | null;
  sla_paused_at?: string | null;
  sla_paused_reason?: string | null;
  sla_paused_total_seconds?: number | null;
  sla_breached?: boolean | null;
  sla_breach_reason?: string | null;
};

function formatSeconds(s: number): string {
  if (!s || s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm ? `${h}h ${rm}min` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

type State = "on_track" | "warning" | "breached" | "paused" | "resolved" | "closed" | "no_sla";

const WARN_MS = 2 * 60 * 60 * 1000;

function deriveState(t: Ticket): State {
  if (t.sla_status === "closed") return "closed";
  if (t.sla_status === "resolved" || t.resolved_at) return "resolved";
  if (t.sla_paused) return "paused";
  const now = Date.now();
  const fr = t.sla_first_response_at ? new Date(t.sla_first_response_at).getTime() : null;
  const res = t.sla_resolution_at ? new Date(t.sla_resolution_at).getTime() : null;
  const cu = t.next_customer_update_due_at ? new Date(t.next_customer_update_due_at).getTime() : null;
  if ((fr && !t.first_responded_at && fr < now) || (res && res < now) || (cu && cu < now)) return "breached";
  if ((fr && !t.first_responded_at && fr - now <= WARN_MS) || (res && res - now <= WARN_MS)) return "warning";
  if (!fr && !res) return "no_sla";
  return "on_track";
}

const META: Record<State, { label: string; cls: string; icon: any }> = {
  on_track: { label: "No prazo", cls: "bg-success/10 text-success border-success/30", icon: ShieldCheck },
  warning:  { label: "Atenção",  cls: "bg-warning/10 text-warning border-warning/30", icon: AlertTriangle },
  breached: { label: "Vencido",  cls: "bg-destructive/10 text-destructive border-destructive/30", icon: AlertTriangle },
  paused:   { label: "Pausado",  cls: "bg-muted text-muted-foreground border-border", icon: PauseCircle },
  resolved: { label: "Resolvido",cls: "bg-primary/10 text-primary border-primary/30", icon: CheckCircle2 },
  closed:   { label: "Fechado",  cls: "bg-muted text-muted-foreground border-border", icon: Lock },
  no_sla:   { label: "Sem SLA",  cls: "bg-muted text-muted-foreground border-border", icon: Clock },
};

function Row({ label, value, due, done }: { label: string; value?: string | null; due?: string | null; done?: boolean }) {
  if (!value && !due) return null;
  const now = Date.now();
  const dueMs = due ? new Date(due).getTime() : null;
  const overdue = !done && dueMs !== null && dueMs < now;
  const fmt = (d: string) => format(new Date(d), "dd MMM HH:mm", { locale: pt });
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right tabular-nums ${overdue ? "text-destructive font-medium" : "text-foreground"}`}>
        {value ? <>✓ {fmt(value)}</> : due ? (
          <>
            {fmt(due)}
            <span className={`block text-[10px] ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
              {overdue ? "atraso de " : "em "}{formatDistanceToNow(new Date(due), { locale: pt })}
            </span>
          </>
        ) : null}
      </span>
    </div>
  );
}

export default function SlaStatusCard({ ticket }: { ticket: Ticket }) {
  const state = deriveState(ticket);
  const meta = META[state];
  const Icon = meta.icon;

  return (
    <Card>
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" /> SLA
        </CardTitle>
        <Badge variant="outline" className={meta.cls}>
          <Icon className="h-3 w-3 mr-1" />{meta.label}
        </Badge>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-2">
        <Row label="Primeira resposta" value={ticket.first_responded_at || undefined} due={!ticket.first_responded_at ? ticket.sla_first_response_at : undefined} done={!!ticket.first_responded_at} />
        <Row label="Resolução" value={ticket.resolved_at || undefined} due={!ticket.resolved_at ? ticket.sla_resolution_at : undefined} done={!!ticket.resolved_at} />
        <Row label="Próxima atualização" due={ticket.next_customer_update_due_at} />
        <Row label="Próxima ação" due={ticket.next_action_due_at} />
        {ticket.next_action && (
          <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">
            <span className="text-foreground">Ação:</span> {ticket.next_action}
          </p>
        )}
        {state === "paused" && ticket.sla_paused_reason && (
          <p className="text-xs text-muted-foreground italic">Pausa: {ticket.sla_paused_reason}</p>
        )}
        {state === "breached" && ticket.sla_breach_reason && (
          <p className="text-xs text-destructive italic">{ticket.sla_breach_reason}</p>
        )}
      </CardContent>
    </Card>
  );
}
