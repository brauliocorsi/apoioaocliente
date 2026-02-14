import { Badge } from "@/components/ui/badge";
import { Bell } from "lucide-react";
import PriorityFlag from "@/components/ticket/PriorityFlag";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

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
  reminder_count?: number;
}

interface PhoneCallListProps {
  calls: PhoneCall[];
  onSelect: (call: PhoneCall) => void;
}

const statusLabels: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const statusColors: Record<string, string> = {
  pendente: "bg-warning/15 text-warning-foreground border-warning/30",
  em_andamento: "bg-primary/15 text-primary border-primary/30",
  concluido: "bg-success/15 text-success border-success/30",
  cancelado: "bg-muted text-muted-foreground",
};

export default function PhoneCallList({ calls, onSelect }: PhoneCallListProps) {
  if (calls.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma ligação encontrada</p>;
  }

  return (
    <div className="space-y-2">
      {calls.map((c) => (
        <div
          key={c.id}
          className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => onSelect(c)}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <PriorityFlag priority={c.priority} size={14} />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{c.client_name}</p>
              <p className="text-xs text-muted-foreground truncate">{c.subject}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(c.reminder_count ?? 0) > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-warning-foreground">
                <Bell className="h-3.5 w-3.5" />
                {c.reminder_count}
              </span>
            )}
            <span className="text-xs text-muted-foreground hidden sm:block">
              {c.client_phone}
            </span>
            {c.invoice_number && (
              <span className="text-xs text-muted-foreground hidden md:block">NF {c.invoice_number}</span>
            )}
            <Badge className={statusColors[c.status] || ""} variant="outline">
              {statusLabels[c.status] || c.status}
            </Badge>
            <span className="text-[10px] text-muted-foreground hidden lg:block">
              {format(new Date(c.created_at), "dd/MM HH:mm", { locale: pt })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
