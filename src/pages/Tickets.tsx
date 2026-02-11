import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Loader2, List, LayoutGrid } from "lucide-react";
import { useNavigate } from "react-router-dom";
import KanbanBoard from "@/components/KanbanBoard";

const statusLabels: Record<string, string> = {
  novo: "Novo",
  em_analise: "Em análise",
  aguarda_cliente: "Aguarda cliente",
  aguarda_logistica: "Aguarda logística",
  aguarda_tecnico: "Aguarda técnico",
  resolvido: "Resolvido",
  encerrado: "Encerrado",
};

const priorityColors: Record<string, string> = {
  P1: "bg-destructive text-destructive-foreground",
  P2: "bg-warning text-warning-foreground",
  P3: "bg-muted text-muted-foreground",
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

export default function Tickets() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [view, setView] = useState<"list" | "kanban">("list");
  const navigate = useNavigate();

  useEffect(() => {
    const fetch = async () => {
      let query = supabase
        .from("tickets")
        .select("id, ticket_number, client_name, subject, category_id, priority, status, order_number, created_at")
        .order("created_at", { ascending: false });
      
      if (statusFilter !== "all") query = query.eq("status", statusFilter as any);
      if (priorityFilter !== "all") query = query.eq("priority", priorityFilter as any);

      const { data } = await query.limit(100);
      setTickets((data as TicketRow[]) || []);
      setLoading(false);
    };
    fetch();
  }, [statusFilter, priorityFilter]);

  const filtered = tickets.filter(
    (t) =>
      t.client_name.toLowerCase().includes(search.toLowerCase()) ||
      t.subject.toLowerCase().includes(search.toLowerCase()) ||
      (t.order_number && t.order_number.includes(search)) ||
      String(t.ticket_number).includes(search)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tickets</h1>
          <p className="text-muted-foreground">Gestão de tickets de suporte</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md">
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-9 w-9 rounded-r-none"
              onClick={() => setView("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={view === "kanban" ? "secondary" : "ghost"}
              size="icon"
              className="h-9 w-9 rounded-l-none"
              onClick={() => setView("kanban")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={() => navigate("/tickets/new")}>
            <Plus className="mr-2 h-4 w-4" /> Novo Ticket
          </Button>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Pesquisar por nome, assunto, nº encomenda..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {view === "list" && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os estados</SelectItem>
              {Object.entries(statusLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Prioridade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="P1">P1 Urgente</SelectItem>
            <SelectItem value="P2">P2 Normal</SelectItem>
            <SelectItem value="P3">P3 Baixa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : view === "kanban" ? (
        <KanbanBoard tickets={filtered} />
      ) : (
        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">Nenhum ticket encontrado</p>
            ) : (
              <div className="divide-y">
                {filtered.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/tickets/${t.id}`)}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono text-muted-foreground w-12">#{t.ticket_number}</span>
                      <div>
                        <p className="text-sm font-medium">{t.subject}</p>
                        <p className="text-xs text-muted-foreground">{t.client_name}{t.order_number ? ` · Enc. ${t.order_number}` : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {t.category_id && <Badge variant="outline" className="text-xs">{t.category_id}</Badge>}
                      <Badge className={priorityColors[t.priority]}>{t.priority}</Badge>
                      <Badge variant="secondary">{statusLabels[t.status] || t.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
