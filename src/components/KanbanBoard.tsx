import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";

const statusLabels: Record<string, string> = {
  novo: "Novo",
  em_analise: "Em análise",
  aguarda_cliente: "Aguarda cliente",
  aguarda_logistica: "Aguarda logística",
  aguarda_tecnico: "Aguarda técnico",
  resolvido: "Resolvido",
  encerrado: "Encerrado",
};

const statusColumns = [
  "novo",
  "em_analise",
  "aguarda_cliente",
  "aguarda_logistica",
  "aguarda_tecnico",
  "resolvido",
  "encerrado",
];

const priorityColors: Record<string, string> = {
  P1: "bg-destructive text-destructive-foreground",
  P2: "bg-warning text-warning-foreground",
  P3: "bg-muted text-muted-foreground",
};

const columnColors: Record<string, string> = {
  novo: "border-t-primary",
  em_analise: "border-t-blue-500",
  aguarda_cliente: "border-t-warning",
  aguarda_logistica: "border-t-orange-500",
  aguarda_tecnico: "border-t-purple-500",
  resolvido: "border-t-success",
  encerrado: "border-t-muted-foreground",
};

type TicketRow = {
  id: string;
  ticket_number: number;
  client_name: string;
  subject: string;
  category_id: string | null;
  priority: string;
  status: string;
  order_number: string | null;
  created_at: string;
};

interface KanbanBoardProps {
  tickets: TicketRow[];
}

export default function KanbanBoard({ tickets }: KanbanBoardProps) {
  const navigate = useNavigate();

  const grouped = statusColumns.reduce((acc, status) => {
    acc[status] = tickets.filter((t) => t.status === status);
    return acc;
  }, {} as Record<string, TicketRow[]>);

  return (
    <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
      {statusColumns.map((status) => (
        <div
          key={status}
          className={`flex-shrink-0 w-64 bg-muted/30 rounded-lg border border-t-4 ${columnColors[status]}`}
        >
          <div className="px-3 py-2 border-b">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {statusLabels[status]}
              </h3>
              <Badge variant="secondary" className="text-xs h-5 min-w-[20px] justify-center">
                {grouped[status].length}
              </Badge>
            </div>
          </div>
          <ScrollArea className="h-[calc(100vh-320px)]">
            <div className="p-2 space-y-2">
              {grouped[status].map((t) => (
                <div
                  key={t.id}
                  className="bg-background border rounded-md p-3 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate(`/tickets/${t.id}`)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-muted-foreground">#{t.ticket_number}</span>
                    <Badge className={`text-[10px] px-1.5 py-0 ${priorityColors[t.priority]}`}>{t.priority}</Badge>
                  </div>
                  <p className="text-sm font-medium leading-tight line-clamp-2">{t.subject}</p>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{t.client_name}</p>
                  {t.category_id && (
                    <Badge variant="outline" className="text-[10px] mt-1.5">{t.category_id}</Badge>
                  )}
                </div>
              ))}
              {grouped[status].length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">Sem tickets</p>
              )}
            </div>
          </ScrollArea>
        </div>
      ))}
    </div>
  );
}
