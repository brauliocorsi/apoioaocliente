import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Pause, AlertTriangle, CheckCircle, Timer } from "lucide-react";

interface SlaIndicatorProps {
  ticket: {
    sla_first_response_at: string | null;
    sla_resolution_at: string | null;
    sla_paused_at: string | null;
    sla_paused_total_seconds: number | null;
    first_responded_at: string | null;
    resolved_at: string | null;
    created_at: string;
    status: string;
    sla_stage_deadline_at?: string | null;
    status_changed_at?: string | null;
  };
}

function calcRemaining(deadline: string, pausedSeconds: number, pausedAt: string | null): number {
  const deadlineMs = new Date(deadline).getTime();
  let pausedMs = (pausedSeconds || 0) * 1000;
  if (pausedAt) {
    pausedMs += Date.now() - new Date(pausedAt).getTime();
  }
  const adjustedDeadline = deadlineMs + pausedMs;
  return adjustedDeadline - Date.now();
}

function formatTime(ms: number): string {
  const abs = Math.abs(ms);
  const hours = Math.floor(abs / 3600000);
  const mins = Math.floor((abs % 3600000) / 60000);
  const prefix = ms < 0 ? "-" : "";
  if (hours > 0) return `${prefix}${hours}h ${mins}m`;
  return `${prefix}${mins}m`;
}

function formatCountdown(ms: number): { main: string; sub: string } {
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const mins = Math.floor((abs % 3600000) / 60000);

  if (days > 0) {
    return { main: `${days} dia${days !== 1 ? "s" : ""} e ${hours}h`, sub: `${hours}h ${mins}m` };
  }
  if (hours > 0) {
    return { main: `${hours}h e ${mins}min`, sub: `${mins} minutos` };
  }
  return { main: `${mins} minutos`, sub: "" };
}

function getProgress(created: string, deadline: string, pausedSeconds: number, pausedAt: string | null): number {
  const total = new Date(deadline).getTime() - new Date(created).getTime();
  const remaining = calcRemaining(deadline, pausedSeconds, pausedAt);
  const elapsed = total - remaining + ((pausedSeconds || 0) * 1000);
  const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
  return pct;
}

function getColor(remainingMs: number, totalMs: number): string {
  if (remainingMs <= 0) return "bg-destructive";
  const ratio = remainingMs / totalMs;
  if (ratio < 0.25) return "bg-destructive";
  if (ratio < 0.5) return "bg-warning";
  return "bg-success";
}

function SlaRow({ label, deadline, created, pausedSeconds, pausedAt, completed, completedAt }: {
  label: string;
  deadline: string | null;
  created: string;
  pausedSeconds: number;
  pausedAt: string | null;
  completed: boolean;
  completedAt: string | null;
}) {
  if (!deadline) return null;

  const totalMs = new Date(deadline).getTime() - new Date(created).getTime();
  const remainingMs = calcRemaining(deadline, pausedSeconds, pausedAt);
  const progress = getProgress(created, deadline, pausedSeconds, pausedAt);
  const colorClass = getColor(remainingMs, totalMs);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground font-medium">{label}</span>
        <span className="flex items-center gap-1">
          {completed ? (
            <><CheckCircle className="h-3 w-3 text-success" /><span className="text-success">Concluído</span></>
          ) : remainingMs <= 0 ? (
            <><AlertTriangle className="h-3 w-3 text-destructive" /><span className="text-destructive font-semibold">Expirado {formatTime(remainingMs)}</span></>
          ) : (
            <><Clock className="h-3 w-3" /><span>{formatTime(remainingMs)} restante</span></>
          )}
        </span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className={`h-full transition-all ${completed ? "bg-success" : colorClass}`} style={{ width: `${completed ? 100 : progress}%` }} />
      </div>
      <p className="text-[10px] text-muted-foreground">
        Prazo: {new Date(deadline).toLocaleString("pt-PT")}
        {completedAt && ` · Concluído: ${new Date(completedAt).toLocaleString("pt-PT")}`}
      </p>
    </div>
  );
}

// Big resolution countdown block
function ResolutionCountdown({ ticket }: { ticket: SlaIndicatorProps["ticket"] }) {
  if (!ticket.sla_resolution_at) return null;

  const pausedSeconds = ticket.sla_paused_total_seconds || 0;
  const isPaused = !!ticket.sla_paused_at;
  const isCompleted = !!ticket.resolved_at;

  const remainingMs = calcRemaining(ticket.sla_resolution_at, pausedSeconds, ticket.sla_paused_at);
  const totalMs = new Date(ticket.sla_resolution_at).getTime() - new Date(ticket.created_at).getTime();
  const progress = getProgress(ticket.created_at, ticket.sla_resolution_at, pausedSeconds, ticket.sla_paused_at);
  const isExpired = remainingMs <= 0;
  const colorClass = isCompleted ? "bg-success" : getColor(remainingMs, totalMs);

  const { main } = formatCountdown(remainingMs);

  let textColor = "text-success";
  if (isExpired) textColor = "text-destructive";
  else if (remainingMs / totalMs < 0.25) textColor = "text-destructive";
  else if (remainingMs / totalMs < 0.5) textColor = "text-warning";

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${isExpired && !isCompleted ? "border-destructive/40 bg-destructive/5" : isPaused ? "border-warning/40 bg-warning/5" : "border-border bg-muted/20"}`}>
      <div className="flex items-center gap-2">
        {isCompleted ? (
          <CheckCircle className="h-4 w-4 text-success shrink-0" />
        ) : isExpired ? (
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        ) : isPaused ? (
          <Pause className="h-4 w-4 text-warning shrink-0" />
        ) : (
          <Timer className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          {isCompleted ? (
            <p className="text-sm font-semibold text-success">Resolução concluída</p>
          ) : isPaused ? (
            <p className="text-sm font-semibold text-warning">Pausado — Aguarda cliente</p>
          ) : (
            <p className={`text-sm font-bold ${textColor}`}>
              {isExpired ? "Expirado há " : ""}{main}
              {!isExpired && <span className="font-normal text-muted-foreground text-xs"> para resolução</span>}
            </p>
          )}
        </div>
        <span className={`text-xs font-medium tabular-nums ${textColor}`}>
          {isCompleted ? "100%" : `${Math.round(isExpired ? 100 : progress)}%`}
        </span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full transition-all duration-500 ${isCompleted ? "bg-success" : colorClass}`}
          style={{ width: `${isCompleted ? 100 : Math.min(100, progress)}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">
        Prazo: {new Date(ticket.sla_resolution_at).toLocaleString("pt-PT")}
      </p>
    </div>
  );
}

export default function SlaIndicator({ ticket }: SlaIndicatorProps) {
  const hasSla = ticket.sla_first_response_at || ticket.sla_resolution_at;
  if (!hasSla && !ticket.sla_stage_deadline_at) return null;

  const isPaused = !!ticket.sla_paused_at;

  return (
    <Card className={isPaused ? "border-warning/50" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="h-4 w-4" />
          SLA
          {isPaused && (
            <span className="inline-flex items-center gap-1 text-xs text-warning font-normal">
              <Pause className="h-3 w-3" /> Pausado (Aguarda cliente)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Big countdown for resolution */}
        <ResolutionCountdown ticket={ticket} />

        <SlaRow
          label="Primeira resposta"
          deadline={ticket.sla_first_response_at}
          created={ticket.created_at}
          pausedSeconds={ticket.sla_paused_total_seconds || 0}
          pausedAt={ticket.sla_paused_at}
          completed={!!ticket.first_responded_at}
          completedAt={ticket.first_responded_at}
        />
        <SlaRow
          label="Resolução"
          deadline={ticket.sla_resolution_at}
          created={ticket.created_at}
          pausedSeconds={ticket.sla_paused_total_seconds || 0}
          pausedAt={ticket.sla_paused_at}
          completed={!!ticket.resolved_at}
          completedAt={ticket.resolved_at}
        />
        {ticket.sla_stage_deadline_at && (
          <SlaRow
            label="Tempo no estágio atual"
            deadline={ticket.sla_stage_deadline_at}
            created={ticket.status_changed_at || ticket.created_at}
            pausedSeconds={0}
            pausedAt={null}
            completed={false}
            completedAt={null}
          />
        )}
      </CardContent>
    </Card>
  );
}
