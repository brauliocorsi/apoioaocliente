import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Clock, CheckCircle, Timer, TrendingUp } from "lucide-react";

export type SlaTicket = {
  id: string;
  ticket_number: number;
  status: string;
  assigned_to: string | null;
  priority: string;
  sla_first_response_at: string | null;
  sla_resolution_at: string | null;
  sla_paused_at: string | null;
  sla_paused_total_seconds: number | null;
  first_responded_at: string | null;
  resolved_at: string | null;
  sla_stage_deadline_at: string | null;
};

function calcRemaining(deadline: string, pausedSeconds: number, pausedAt: string | null): number {
  const deadlineMs = new Date(deadline).getTime();
  let pausedMs = (pausedSeconds || 0) * 1000;
  if (pausedAt) pausedMs += Date.now() - new Date(pausedAt).getTime();
  return deadlineMs + pausedMs - Date.now();
}

type SlaStatus = "breached" | "at_risk" | "on_track" | "completed" | "no_sla";

function getTicketSlaStatus(t: SlaTicket): SlaStatus {
  if (t.resolved_at) return "completed";

  const deadline = t.sla_resolution_at;
  if (!deadline) return "no_sla";

  const remaining = calcRemaining(deadline, t.sla_paused_total_seconds || 0, t.sla_paused_at);
  const total = new Date(deadline).getTime() - (Date.now() - remaining);

  if (remaining <= 0) return "breached";
  if (remaining / total < 0.25) return "at_risk";
  return "on_track";
}

interface SlaDashboardProps {
  tickets: SlaTicket[];
}

export default function SlaDashboard({ tickets }: SlaDashboardProps) {
  const stats = useMemo(() => {
    let breached = 0;
    let atRisk = 0;
    let onTrack = 0;
    let completed = 0;
    let firstResponseBreached = 0;

    tickets.forEach((t) => {
      const status = getTicketSlaStatus(t);
      if (status === "breached") breached++;
      else if (status === "at_risk") atRisk++;
      else if (status === "on_track") onTrack++;
      else if (status === "completed") completed++;

      // First response check
      if (!t.first_responded_at && t.sla_first_response_at) {
        const frRemaining = calcRemaining(t.sla_first_response_at, t.sla_paused_total_seconds || 0, t.sla_paused_at);
        if (frRemaining <= 0) firstResponseBreached++;
      }
    });

    const active = tickets.filter((t) => !t.resolved_at).length;
    const complianceRate = active > 0 ? Math.round(((active - breached) / active) * 100) : 100;

    return { breached, atRisk, onTrack, completed, firstResponseBreached, active, complianceRate };
  }, [tickets]);

  const cards = [
    {
      label: "SLA Expirado",
      value: stats.breached,
      icon: AlertTriangle,
      color: "text-destructive",
      bg: "bg-destructive/10",
      border: stats.breached > 0 ? "border-destructive/30" : "",
    },
    {
      label: "Em Risco",
      value: stats.atRisk,
      icon: Timer,
      color: "text-warning",
      bg: "bg-warning/10",
      border: stats.atRisk > 0 ? "border-warning/30" : "",
    },
    {
      label: "Dentro do SLA",
      value: stats.onTrack,
      icon: Clock,
      color: "text-primary",
      bg: "bg-primary/10",
      border: "",
    },
    {
      label: "Resolvidos",
      value: stats.completed,
      icon: CheckCircle,
      color: "text-success",
      bg: "bg-success/10",
      border: "",
    },
    {
      label: "Conformidade",
      value: `${stats.complianceRate}%`,
      icon: TrendingUp,
      color: stats.complianceRate >= 90 ? "text-success" : stats.complianceRate >= 70 ? "text-warning" : "text-destructive",
      bg: stats.complianceRate >= 90 ? "bg-success/10" : stats.complianceRate >= 70 ? "bg-warning/10" : "bg-destructive/10",
      border: "",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className={c.border}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.bg}`}>
              <c.icon className={`h-4 w-4 ${c.color}`} />
            </div>
            <div>
              <p className={`text-xl font-bold leading-none ${c.color}`}>{c.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
