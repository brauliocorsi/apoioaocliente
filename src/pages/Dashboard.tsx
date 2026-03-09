import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Ticket, Clock, AlertTriangle, CheckCircle2, Loader2, Users, Bell, ArrowUpRight, Mail, MailOpen, Inbox, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow, format } from "date-fns";
import { pt } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";

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
  client_email: string | null;
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

type EmailTicketRow = {
  id: string;
  ticket_number: number;
  client_name: string;
  client_email: string | null;
  subject: string;
  created_at: string;
  status: string;
  priority: string;
};

type UnreadTicketRow = {
  id: string;
  ticket_number: number;
  client_name: string;
  subject: string;
  status: string;
  priority: string;
  last_client_msg_at: string;
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

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  accent?: string;
  delay?: number;
}

function StatCard({ title, value, icon, accent, delay = 0 }: StatCardProps) {
  return (
    <Card className="card-hover group relative overflow-hidden slide-up" style={{ animationDelay: `${delay}ms` }}>
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${accent || "bg-primary/[0.02]"}`} />
      <CardHeader className="flex flex-row items-center justify-between pb-2 relative">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="h-9 w-9 rounded-xl bg-muted/80 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
          {icon}
        </div>
      </CardHeader>
      <CardContent className="relative">
        <div className="text-3xl font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<ReminderRow[]>([]);
  const [emailsReceived, setEmailsReceived] = useState(0);
  const [emailTicketsCount, setEmailTicketsCount] = useState(0);
  const [recentEmailTickets, setRecentEmailTickets] = useState<EmailTicketRow[]>([]);
  const [unreadEmailTickets, setUnreadEmailTickets] = useState<UnreadTicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      // Parallel fetch of all data
      const [ticketsRes, clientsRes, emailThreadsRes, pendingEmailsRes] = await Promise.all([
        supabase
          .from("tickets")
          .select("id, ticket_number, client_name, subject, category_id, priority, status, created_at, sla_first_response_at, sla_resolution_at, first_responded_at, client_email")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("client_users")
          .select("id, full_name, email, phone, last_seen_at")
          .order("last_seen_at", { ascending: false })
          .limit(10),
        // Count email threads (emails converted to tickets)
        supabase
          .from("email_threads")
          .select("id, ticket_id", { count: "exact" }),
        // Count total emails received (pending + processed)
        supabase
          .from("pending_emails")
          .select("id", { count: "exact" }),
      ]);

      setTickets((ticketsRes.data as TicketRow[]) || []);
      setClients((clientsRes.data as ClientRow[]) || []);

      // Email stats
      const emailThreadCount = emailThreadsRes.count || 0;
      setEmailTicketsCount(emailThreadCount);

      // Total emails = pending emails + email threads (converted)
      const pendingCount = pendingEmailsRes.count || 0;
      setEmailsReceived(pendingCount + emailThreadCount);

      // Get last 5 email tickets
      if (emailThreadsRes.data && emailThreadsRes.data.length > 0) {
        const threadTicketIds = (emailThreadsRes.data as any[]).map((t: any) => t.ticket_id);
        const { data: emailTickets } = await supabase
          .from("tickets")
          .select("id, ticket_number, client_name, client_email, subject, created_at, status, priority")
          .in("id", threadTicketIds)
          .order("created_at", { ascending: false })
          .limit(5);
        setRecentEmailTickets((emailTickets as EmailTicketRow[]) || []);
      }

      // Find tickets with unread client email messages
      if (user) {
        // Get all email ticket IDs
        const emailTicketIds = (emailThreadsRes.data as any[] || []).map((t: any) => t.ticket_id);
        
        if (emailTicketIds.length > 0) {
          // Get open email tickets
          const { data: openEmailTickets } = await supabase
            .from("tickets")
            .select("id, ticket_number, client_name, subject, status, priority")
            .in("id", emailTicketIds)
            .not("status", "in", '("resolvido","encerrado")');

          if (openEmailTickets && openEmailTickets.length > 0) {
            const openIds = openEmailTickets.map((t: any) => t.id);

            // Get last client message per ticket
            const { data: clientMsgs } = await supabase
              .from("ticket_messages")
              .select("ticket_id, created_at")
              .in("ticket_id", openIds)
              .eq("sender_type", "client")
              .order("created_at", { ascending: false });

            // Get agent read status
            const { data: readStatus } = await supabase
              .from("ticket_read_status")
              .select("ticket_id, last_read_at")
              .in("ticket_id", openIds)
              .eq("agent_id", user.id);

            const readMap = new Map((readStatus || []).map((r: any) => [r.ticket_id, r.last_read_at]));

            // Group last client msg per ticket
            const lastClientMsg = new Map<string, string>();
            (clientMsgs || []).forEach((m: any) => {
              if (!lastClientMsg.has(m.ticket_id)) {
                lastClientMsg.set(m.ticket_id, m.created_at);
              }
            });

            // Filter tickets where last client msg is after last read
            const unread: UnreadTicketRow[] = [];
            openEmailTickets.forEach((t: any) => {
              const lastMsg = lastClientMsg.get(t.id);
              if (!lastMsg) return;
              const lastRead = readMap.get(t.id);
              if (!lastRead || new Date(lastMsg) > new Date(lastRead)) {
                unread.push({
                  ...t,
                  last_client_msg_at: lastMsg,
                });
              }
            });

            unread.sort((a, b) => new Date(b.last_client_msg_at).getTime() - new Date(a.last_client_msg_at).getTime());
            setUnreadEmailTickets(unread);
          }
        }
      }

      // Reminders
      const { data: remData } = await supabase
        .from("phone_call_reminders" as any)
        .select("id, remind_at, message, phone_call_id")
        .eq("is_completed", false)
        .lte("remind_at", new Date(Date.now() + 60 * 60 * 1000).toISOString())
        .order("remind_at", { ascending: true })
        .limit(5);
      
      const rems = ((remData as any[]) || []) as ReminderRow[];
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
    fetchData();
  }, [user]);

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
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="slide-up">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Visão geral do suporte ao cliente</p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Tickets Abertos"
          value={openTickets.length}
          icon={<Ticket className="h-4 w-4 text-primary" />}
          accent="bg-primary/[0.03]"
          delay={0}
        />
        <StatCard
          title="Em Análise"
          value={tickets.filter((t) => t.status === "em_analise").length}
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
          delay={50}
        />
        <StatCard
          title="SLA em Risco"
          value={slaAtRisk.length}
          icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
          accent="bg-destructive/[0.03]"
          delay={100}
        />
        <StatCard
          title="Resolvidos Hoje"
          value={resolvedToday.length}
          icon={<CheckCircle2 className="h-4 w-4 text-success" />}
          accent="bg-success/[0.03]"
          delay={150}
        />
        <StatCard
          title="Emails Recebidos"
          value={emailsReceived}
          icon={<Inbox className="h-4 w-4 text-blue-500" />}
          accent="bg-blue-500/[0.03]"
          delay={200}
        />
        <StatCard
          title="Emails → Tickets"
          value={emailTicketsCount}
          icon={<MailOpen className="h-4 w-4 text-emerald-500" />}
          accent="bg-emerald-500/[0.03]"
          delay={250}
        />
      </div>

      {/* Unread email tickets awaiting agent */}
      {unreadEmailTickets.length > 0 && (
        <Card className="card-hover slide-up border-blue-500/20 bg-blue-500/[0.02]" style={{ animationDelay: "270ms" }}>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Eye className="h-4 w-4 text-blue-500" />
              </div>
              Respostas de Clientes por Email Aguardando Visualização
              <Badge variant="secondary" className="ml-1 text-xs">{unreadEmailTickets.length}</Badge>
            </CardTitle>
            <button
              onClick={() => navigate("/email-tickets")}
              className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
            >
              Ver todos <ArrowUpRight className="h-3 w-3" />
            </button>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {unreadEmailTickets.slice(0, 8).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-xl border border-blue-500/20 bg-card p-3.5 cursor-pointer hover:border-blue-500/40 hover:shadow-sm transition-all duration-200 group"
                  onClick={() => navigate(`/tickets/${t.id}`)}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                    <span className="text-xs font-mono text-muted-foreground/70 shrink-0">#{t.ticket_number}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{t.subject}</p>
                      <p className="text-xs text-muted-foreground truncate">{t.client_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(t.last_client_msg_at), { addSuffix: true, locale: pt })}
                    </span>
                    <Badge className={`${priorityColors[t.priority]} text-[10px] px-1.5 py-0`}>{t.priority}</Badge>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-all" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reminders */}
      {upcomingReminders.length > 0 && (
        <Card className="card-hover slide-up border-warning/20 bg-warning/[0.02]" style={{ animationDelay: "300ms" }}>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center">
                <Bell className="h-4 w-4 text-warning" />
              </div>
              Lembretes Próximos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {upcomingReminders.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-xl border border-warning/20 bg-card p-3.5 cursor-pointer hover:border-warning/40 hover:shadow-sm transition-all duration-200 group"
                  onClick={() => navigate("/phone-calls")}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{r.message}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{r.client_name} – {r.subject}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-xs font-medium text-muted-foreground tabular-nums">
                      {format(new Date(r.remind_at), "HH:mm", { locale: pt })}
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-all" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent email tickets */}
      {recentEmailTickets.length > 0 && (
        <Card className="card-hover slide-up" style={{ animationDelay: "350ms" }}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="h-8 w-8 rounded-lg bg-muted/80 flex items-center justify-center">
                  <Mail className="h-4 w-4 text-primary" />
                </div>
                Últimos Emails Convertidos em Tickets
              </CardTitle>
              <button
                onClick={() => navigate("/email-tickets")}
                className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
              >
                Ver todos <ArrowUpRight className="h-3 w-3" />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {recentEmailTickets.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-xl border border-border/60 p-3.5 cursor-pointer hover:bg-muted/40 hover:border-border transition-all duration-200 group"
                  onClick={() => navigate(`/tickets/${t.id}`)}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Mail className="h-4 w-4 text-primary/60 shrink-0" />
                    <span className="text-xs font-mono text-muted-foreground/70 shrink-0">#{t.ticket_number}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                        {t.subject?.replace(/^(Re:\s*)*(\[Ticket\s*#\d+\]\s*)*/gi, "").trim() || t.subject}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {t.client_name}{t.client_email ? ` · ${t.client_email}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(t.created_at), { addSuffix: true, locale: pt })}
                    </span>
                    <Badge className={`${priorityColors[t.priority]} text-[10px] px-1.5 py-0`}>{t.priority}</Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">{statusLabels[t.status] || t.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent tickets */}
      <Card className="card-hover slide-up" style={{ animationDelay: "400ms" }}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Tickets Recentes</CardTitle>
            <button
              onClick={() => navigate("/tickets")}
              className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
            >
              Ver todos <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {openTickets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum ticket aberto</p>
          ) : (
            <div className="space-y-1.5">
              {openTickets.slice(0, 10).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-xl border border-border/60 p-3.5 cursor-pointer hover:bg-muted/40 hover:border-border transition-all duration-200 group"
                  onClick={() => navigate(`/tickets/${t.id}`)}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-xs font-mono text-muted-foreground/70 shrink-0">#{t.ticket_number}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{t.subject}</p>
                      <p className="text-xs text-muted-foreground truncate">{t.client_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <Badge className={`${priorityColors[t.priority]} text-[10px] px-1.5 py-0`}>{t.priority}</Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">{statusLabels[t.status] || t.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Online clients */}
      <Card className="card-hover slide-up" style={{ animationDelay: "450ms" }}>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Últimos Clientes Online</CardTitle>
          <div className="h-8 w-8 rounded-lg bg-muted/80 flex items-center justify-center">
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum cliente registado</p>
          ) : (
            <div className="space-y-1.5">
              {clients.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl border border-border/60 p-3.5 hover:bg-muted/30 transition-colors duration-200">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/8 text-primary text-xs font-bold shrink-0">
                      {c.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-3">
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
