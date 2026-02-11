import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Ticket, Clock, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

type TicketRow = {
  id: string;
  ticket_number: number;
  client_name: string;
  subject: string;
  category_id: string | null;
  priority: string;
  status: string;
  created_at: string;
  sla_first_response_at: string | null;
  sla_resolution_at: string | null;
  first_responded_at: string | null;
};

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

export default function Dashboard() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("tickets")
        .select("id, ticket_number, client_name, subject, category_id, priority, status, created_at, sla_first_response_at, sla_resolution_at, first_responded_at")
        .order("created_at", { ascending: false })
        .limit(50);
      setTickets((data as TicketRow[]) || []);
      setLoading(false);
    };
    fetch();
  }, []);

  const openTickets = tickets.filter((t) => !["resolvido", "encerrado"].includes(t.status));
  const slaAtRisk = openTickets.filter((t) => {
    if (!t.sla_first_response_at || t.first_responded_at) return false;
    return new Date(t.sla_first_response_at) < new Date();
  });
  const resolvedToday = tickets.filter(
    (t) => t.status === "resolvido" && new Date(t.created_at).toDateString() === new Date().toDateString()
  );

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral do suporte ao cliente</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Tickets Abertos</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{openTickets.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Em Análise</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{tickets.filter((t) => t.status === "em_analise").length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">SLA em Risco</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{slaAtRisk.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Resolvidos Hoje</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{resolvedToday.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tickets Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {openTickets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum ticket aberto</p>
          ) : (
            <div className="space-y-2">
              {openTickets.slice(0, 10).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/tickets/${t.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-muted-foreground">#{t.ticket_number}</span>
                    <div>
                      <p className="text-sm font-medium">{t.subject}</p>
                      <p className="text-xs text-muted-foreground">{t.client_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={priorityColors[t.priority]}>{t.priority}</Badge>
                    <Badge variant="outline">{statusLabels[t.status] || t.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
