import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Ticket, Clock, AlertTriangle, CheckCircle2, Loader2, Users, Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow, format } from "date-fns";
import { pt } from "date-fns/locale";

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

type ClientRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  last_seen_at: string | null;
};

type ReminderRow = {
  id: string;
  remind_at: string;
  message: string;
  phone_call_id: string;
  client_name?: string;
  subject?: string;
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
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<ReminderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetch = async () => {
      const [ticketsRes, clientsRes] = await Promise.all([
        supabase
          .from("tickets")
          .select("id, ticket_number, client_name, subject, category_id, priority, status, created_at, sla_first_response_at, sla_resolution_at, first_responded_at")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("client_users")
          .select("id, full_name, email, phone, last_seen_at")
          .order("last_seen_at", { ascending: false })
          .limit(10),
      ]);
      setTickets((ticketsRes.data as TicketRow[]) || []);
      setClients((clientsRes.data as ClientRow[]) || []);

      // Fetch upcoming reminders (next hour)
      const { data: remData } = await supabase
        .from("phone_call_reminders" as any)
        .select("id, remind_at, message, phone_call_id")
        .eq("is_completed", false)
        .lte("remind_at", new Date(Date.now() + 60 * 60 * 1000).toISOString())
        .order("remind_at", { ascending: true })
        .limit(5);
      
      const rems = ((remData as any[]) || []) as ReminderRow[];
      // Enrich with call data
      if (rems.length > 0) {
        const callIds = [...new Set(rems.map((r) => r.phone_call_id))];
        const { data: callsData } = await supabase
          .from("phone_calls" as any)
          .select("id, client_name, subject")
          .in("id", callIds);
        const callMap = new Map(((callsData as any[]) || []).map((c: any) => [c.id, c]));
        rems.forEach((r) => {
          const call = callMap.get(r.phone_call_id);
          if (call) { r.client_name = call.client_name; r.subject = call.subject; }
        });
      }
      setUpcomingReminders(rems);
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

      {upcomingReminders.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Bell className="h-4 w-4 text-warning" /> Lembretes Próximos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {upcomingReminders.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning/5 p-3 cursor-pointer hover:bg-warning/10 transition-colors"
                  onClick={() => navigate("/phone-calls")}
                >
                  <div>
                    <p className="text-sm font-medium">{r.message}</p>
                    <p className="text-xs text-muted-foreground">{r.client_name} – {r.subject}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(r.remind_at), "HH:mm", { locale: pt })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Últimos Clientes Online</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum cliente registado</p>
          ) : (
            <div className="space-y-2">
              {clients.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                      {c.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{c.full_name}</p>
                      <p className="text-xs text-muted-foreground">{c.email}</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {c.last_seen_at
                      ? formatDistanceToNow(new Date(c.last_seen_at), { addSuffix: true, locale: pt })
                      : "Nunca"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
