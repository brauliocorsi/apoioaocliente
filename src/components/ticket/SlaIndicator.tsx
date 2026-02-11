import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Pause, AlertTriangle, CheckCircle } from "lucide-react";

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
