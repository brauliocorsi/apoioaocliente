import { Check, Circle, Search, Clock, CheckCircle2, Archive } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusStep {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  is_resolved?: boolean;
  is_closed?: boolean;
}

interface TicketStatusStepperProps {
  statuses: StatusStep[];
  currentStatusId: string;
  compact?: boolean;
}

const STEP_ICONS: Record<string, React.ElementType> = {
  novo: Circle,
  em_analise: Search,
  aguarda_cliente: Clock,
  aguarda_logistica: Clock,
  aguarda_tecnico: Clock,
  resolvido: CheckCircle2,
  encerrado: Archive,
};

export default function TicketStatusStepper({ statuses, currentStatusId, compact = false }: TicketStatusStepperProps) {
  const sorted = [...statuses].sort((a, b) => a.sort_order - b.sort_order);
  const currentIndex = sorted.findIndex((s) => s.id === currentStatusId);

  if (compact) {
    const progress = currentIndex >= 0 ? Math.round(((currentIndex + 1) / sorted.length) * 100) : 0;
    const current = sorted[currentIndex];
    return (
      <div className="flex items-center gap-2 w-full">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, backgroundColor: current?.color || "hsl(var(--primary))" }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{currentIndex + 1}/{sorted.length}</span>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-center gap-0 min-w-max px-1">
        {sorted.map((step, i) => {
          const isComplete = i < currentIndex;
          const isCurrent = i === currentIndex;
          const Icon = STEP_ICONS[step.id] || Circle;

          return (
            <div key={step.id} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "flex items-center justify-center rounded-full transition-all duration-300",
                    isCurrent ? "w-9 h-9 ring-2 ring-offset-2 ring-offset-background" : "w-7 h-7",
                    isComplete ? "bg-primary/15" : isCurrent ? "" : "bg-muted"
                  )}
                  style={
                    isCurrent
                      ? { backgroundColor: step.color + "20", borderColor: step.color, boxShadow: `0 0 0 2px ${step.color}40` }
                      : isComplete
                      ? { backgroundColor: step.color + "25" }
                      : {}
                  }
                >
                  {isComplete ? (
                    <Check className="w-3.5 h-3.5" style={{ color: step.color }} />
                  ) : (
                    <Icon
                      className={cn("w-3.5 h-3.5", isCurrent ? "" : "text-muted-foreground/50")}
                      style={isCurrent ? { color: step.color } : {}}
                    />
                  )}
                </div>
                <span
                  className={cn(
                    "text-[10px] max-w-[70px] text-center leading-tight",
                    isCurrent ? "font-semibold" : isComplete ? "text-muted-foreground" : "text-muted-foreground/50"
                  )}
                  style={isCurrent ? { color: step.color } : {}}
                >
                  {step.name}
                </span>
              </div>
              {i < sorted.length - 1 && (
                <div
                  className={cn("h-0.5 w-8 mx-1 rounded-full transition-all", isComplete ? "" : "bg-muted")}
                  style={isComplete ? { backgroundColor: sorted[i + 1]?.color || step.color } : {}}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
