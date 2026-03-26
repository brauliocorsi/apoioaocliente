import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Ticket, Clock, AlertTriangle, CheckCircle2, Loader2, Users, Bell,
  ArrowUpRight, Mail, MailOpen, Inbox, Eye, Phone, PhoneCall, PhoneIncoming,
  PhoneOutgoing, Truck, ClipboardCheck, TrendingUp, TrendingDown, BarChart3,
  CalendarClock, Star, ThumbsUp, ThumbsDown, Package, Calendar
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow, format, isToday, subDays, startOfDay, isAfter } from "date-fns";
import { pt } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";

type PeriodFilter = "today" | "7d" | "30d";

/* ---------- types ---------- */
type TicketRow = {
  id: string; ticket_number: number; client_name: string; subject: string;
  category_id: string | null; priority: string; status: string; created_at: string;
  sla_first_response_at: string | null; sla_resolution_at: string | null;
  first_responded_at: string | null; client_email: string | null; resolved_at: string | null;
};

type PhoneCallRow = {
  id: string; client_name: string; client_phone: string; subject: string;
  status: string; priority: string; created_at: string; assigned_to: string | null;
  closed_at: string | null; notes: string | null;
};

type DeliveryRow = {
  id: string; order_number: string; client_phone: string; confirmed: boolean;
  contact_attempts: number; created_at: string; notes: string | null;
};

type PostDeliveryRow = {
  id: string; order_number: string; client_name: string; client_phone: string;
  client_satisfied: boolean; product_ok: boolean; no_damage: boolean;
  assembly_ok: boolean; assembly_nps: number | null; created_at: string;
  issues_reported: string | null; call_status: string | null; assembly_status: string | null;
};

type ReminderRow = {
  id: string; remind_at: string; message: string; phone_call_id: string;
  client_name?: string; subject?: string;
};

type UnreadTicketRow = {
  id: string; ticket_number: number; client_name: string; subject: string;
  status: string; priority: string; last_client_msg_at: string;
};

const priorityColors: Record<string, string> = {
  P1: "bg-destructive text-destructive-foreground",
  P2: "bg-warning text-warning-foreground",
  P3: "bg-muted text-muted-foreground",
};

/* ---------- StatCard ---------- */
interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  accent?: string;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
}

function StatCard({ title, value, icon, accent, subtitle, trend }: StatCardProps) {
  return (
    <Card className="group relative overflow-hidden transition-shadow hover:shadow-md">
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${accent || "bg-primary/[0.02]"}`} />
      <CardContent className="p-4 relative">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tracking-tight">{value}</span>
              {trend && trend !== "neutral" && (
                trend === "up"
                  ? <TrendingUp className="h-3.5 w-3.5 text-success" />
                  : <TrendingDown className="h-3.5 w-3.5 text-destructive" />
              )}
            </div>
            {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="h-9 w-9 rounded-xl bg-muted/80 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- ListItem ---------- */
function ListItem({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between rounded-xl border border-border/60 p-3.5 cursor-pointer hover:bg-muted/40 hover:border-border transition-all duration-200 group"
    >
      {children}
    </div>
  );
}

/* ---------- MAIN ---------- */
export default function Dashboard() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [phoneCalls, setPhoneCalls] = useState<PhoneCallRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [postDeliveries, setPostDeliveries] = useState<PostDeliveryRow[]>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<ReminderRow[]>([]);
  const [unreadEmailTickets, setUnreadEmailTickets] = useState<UnreadTicketRow[]>([]);
  const [emailsReceived, setEmailsReceived] = useState(0);
  const [emailTicketsCount, setEmailTicketsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodFilter>("30d");
  const navigate = useNavigate();
  const { user } = useAuth();

  const periodStart = useMemo(() => {
    const now = startOfDay(new Date());
    if (period === "today") return now;
    if (period === "7d") return subDays(now, 7);
    return subDays(now, 30);
  }, [period]);

  const inPeriod = (dateStr: string) => isAfter(new Date(dateStr), periodStart);

  const fTickets = useMemo(() => tickets.filter((t) => inPeriod(t.created_at)), [tickets, periodStart]);
  const fCalls = useMemo(() => phoneCalls.filter((c) => inPeriod(c.created_at)), [phoneCalls, periodStart]);
  const fDeliveries = useMemo(() => deliveries.filter((d) => inPeriod(d.created_at)), [deliveries, periodStart]);
  const fPostDeliveries = useMemo(() => postDeliveries.filter((p) => inPeriod(p.created_at)), [postDeliveries, periodStart]);

  useEffect(() => {
    const fetchAll = async () => {
      const [ticketsRes, phoneRes, deliveryRes, postRes, emailThreadsRes, pendingEmailsRes] = await Promise.all([
        supabase.from("tickets").select("id, ticket_number, client_name, subject, category_id, priority, status, created_at, sla_first_response_at, sla_resolution_at, first_responded_at, client_email, resolved_at").order("created_at", { ascending: false }).limit(200),
        supabase.from("phone_calls").select("id, client_name, client_phone, subject, status, priority, created_at, assigned_to, closed_at, notes").order("created_at", { ascending: false }).limit(200),
        supabase.from("delivery_confirmations").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("post_delivery_confirmations").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("email_threads").select("id, ticket_id", { count: "exact" }),
        supabase.from("pending_emails").select("id", { count: "exact" }),
      ]);

      setTickets((ticketsRes.data as TicketRow[]) || []);
      setPhoneCalls((phoneRes.data as PhoneCallRow[]) || []);
      setDeliveries((deliveryRes.data as DeliveryRow[]) || []);
      setPostDeliveries((postRes.data as PostDeliveryRow[]) || []);

      const threadCount = emailThreadsRes.count || 0;
      const pendingCount = pendingEmailsRes.count || 0;
      setEmailTicketsCount(threadCount);
      setEmailsReceived(pendingCount + threadCount);

      // Unread email tickets
      if (user && emailThreadsRes.data && emailThreadsRes.data.length > 0) {
        const threadTicketIds = (emailThreadsRes.data as any[]).map((t: any) => t.ticket_id);
        const { data: openEmailTickets } = await supabase.from("tickets")
          .select("id, ticket_number, client_name, subject, status, priority")
          .in("id", threadTicketIds)
          .not("status", "in", '("resolvido","encerrado")');

        if (openEmailTickets && openEmailTickets.length > 0) {
          const openIds = openEmailTickets.map((t: any) => t.id);
          const [{ data: clientMsgs }, { data: readStatus }] = await Promise.all([
            supabase.from("ticket_messages").select("ticket_id, created_at").in("ticket_id", openIds).eq("sender_type", "client").order("created_at", { ascending: false }),
            supabase.from("ticket_read_status").select("ticket_id, last_read_at").in("ticket_id", openIds).eq("agent_id", user.id),
          ]);
          const readMap = new Map((readStatus || []).map((r: any) => [r.ticket_id, r.last_read_at]));
          const lastClientMsg = new Map<string, string>();
          (clientMsgs || []).forEach((m: any) => { if (!lastClientMsg.has(m.ticket_id)) lastClientMsg.set(m.ticket_id, m.created_at); });
          const unread: UnreadTicketRow[] = [];
          openEmailTickets.forEach((t: any) => {
            const lastMsg = lastClientMsg.get(t.id);
            if (!lastMsg) return;
            const lastRead = readMap.get(t.id);
            if (!lastRead || new Date(lastMsg) > new Date(lastRead)) unread.push({ ...t, last_client_msg_at: lastMsg });
          });
          unread.sort((a, b) => new Date(b.last_client_msg_at).getTime() - new Date(a.last_client_msg_at).getTime());
          setUnreadEmailTickets(unread);
        }
      }

      // Reminders
      const { data: remData } = await supabase.from("phone_call_reminders" as any)
        .select("id, remind_at, message, phone_call_id")
        .eq("is_completed", false)
        .lte("remind_at", new Date(Date.now() + 60 * 60 * 1000).toISOString())
        .order("remind_at", { ascending: true }).limit(5);
      const rems = ((remData as any[]) || []) as ReminderRow[];
      if (rems.length > 0) {
        const callIds = [...new Set(rems.map((r) => r.phone_call_id))];
        const { data: callsData } = await supabase.from("phone_calls" as any).select("id, client_name, subject").in("id", callIds);
        const callMap = new Map(((callsData as any[]) || []).map((c: any) => [c.id, c]));
        rems.forEach((r) => { const call = callMap.get(r.phone_call_id); if (call) { r.client_name = call.client_name; r.subject = call.subject; } });
      }
      setUpcomingReminders(rems);
      setLoading(false);
    };
    fetchAll();
  }, [user]);

  /* ---------- computed stats ---------- */
  // Tickets (filtered by period)
  const openTickets = fTickets.filter((t) => !["resolvido", "encerrado"].includes(t.status));
  const slaAtRisk = openTickets.filter((t) => {
    if (!t.sla_first_response_at || t.first_responded_at) return false;
    return new Date(t.sla_first_response_at) < new Date();
  });
  const resolvedInPeriod = fTickets.filter((t) => t.resolved_at && inPeriod(t.resolved_at));
  const ticketsByPriority = { P1: 0, P2: 0, P3: 0 };
  openTickets.forEach((t) => { if (t.priority in ticketsByPriority) ticketsByPriority[t.priority as keyof typeof ticketsByPriority]++; });
  const avgResolutionHours = useMemo(() => {
    const resolved = fTickets.filter((t) => t.resolved_at);
    if (resolved.length === 0) return 0;
    const total = resolved.reduce((acc, t) => acc + (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()), 0);
    return Math.round(total / resolved.length / (1000 * 60 * 60));
  }, [fTickets]);

  // Phone calls (filtered)
  const openCalls = fCalls.filter((c) => !c.closed_at);
  const closedInPeriod = fCalls.filter((c) => c.closed_at);

  // Deliveries (filtered)
  const confirmed = fDeliveries.filter((d) => d.confirmed);
  const notConfirmed = fDeliveries.filter((d) => !d.confirmed);
  const confirmRate = fDeliveries.length > 0 ? Math.round((confirmed.length / fDeliveries.length) * 100) : 0;

  // Post deliveries (filtered)
  const satisfied = fPostDeliveries.filter((p) => p.client_satisfied);
  const satisfactionRate = fPostDeliveries.length > 0 ? Math.round((satisfied.length / fPostDeliveries.length) * 100) : 0;
  const avgNps = useMemo(() => {
    const withNps = fPostDeliveries.filter((p) => p.assembly_nps !== null);
    if (withNps.length === 0) return null;
    return (withNps.reduce((acc, p) => acc + (p.assembly_nps || 0), 0) / withNps.length).toFixed(1);
  }, [fPostDeliveries]);
  const issuesCount = fPostDeliveries.filter((p) => p.issues_reported).length;

  const periodLabel = period === "today" ? "hoje" : period === "7d" ? "últimos 7 dias" : "últimos 30 dias";

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Visão geral do suporte ao cliente · {periodLabel}</p>
        </div>
        <ToggleGroup type="single" value={period} onValueChange={(v) => v && setPeriod(v as PeriodFilter)} className="bg-muted rounded-lg p-0.5">
          <ToggleGroupItem value="today" className="text-xs px-3 h-8 rounded-md data-[state=on]:bg-background data-[state=on]:shadow-sm">
            <Calendar className="h-3.5 w-3.5 mr-1" /> Hoje
          </ToggleGroupItem>
          <ToggleGroupItem value="7d" className="text-xs px-3 h-8 rounded-md data-[state=on]:bg-background data-[state=on]:shadow-sm">
            7 dias
          </ToggleGroupItem>
          <ToggleGroupItem value="30d" className="text-xs px-3 h-8 rounded-md data-[state=on]:bg-background data-[state=on]:shadow-sm">
            30 dias
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Reminders banner */}
      {upcomingReminders.length > 0 && (
        <Card className="border-warning/20 bg-warning/[0.02]">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center">
                <Bell className="h-4 w-4 text-warning" />
              </div>
              Lembretes Próximos
              <Badge variant="secondary" className="text-xs">{upcomingReminders.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {upcomingReminders.map((r) => (
                <ListItem key={r.id} onClick={() => navigate("/phone-calls")}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{r.message}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{r.client_name} – {r.subject}</p>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0 ml-3">
                    {format(new Date(r.remind_at), "HH:mm", { locale: pt })}
                  </span>
                </ListItem>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unread email tickets */}
      {unreadEmailTickets.length > 0 && (
        <Card className="border-blue-500/20 bg-blue-500/[0.02]">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Eye className="h-4 w-4 text-blue-500" />
              </div>
              Respostas de Clientes Aguardando Visualização
              <Badge variant="secondary" className="text-xs">{unreadEmailTickets.length}</Badge>
            </CardTitle>
            <button onClick={() => navigate("/email-tickets")} className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors">
              Ver todos <ArrowUpRight className="h-3 w-3" />
            </button>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {unreadEmailTickets.slice(0, 5).map((t) => (
                <ListItem key={t.id} onClick={() => navigate(`/tickets/${t.id}`)}>
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
                  </div>
                </ListItem>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* TABS */}
      <Tabs defaultValue="tickets" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 h-11">
          <TabsTrigger value="tickets" className="gap-1.5 text-xs">
            <Ticket className="h-3.5 w-3.5" /> Tickets
          </TabsTrigger>
          <TabsTrigger value="calls" className="gap-1.5 text-xs">
            <Phone className="h-3.5 w-3.5" /> Ligações
          </TabsTrigger>
          <TabsTrigger value="deliveries" className="gap-1.5 text-xs">
            <Truck className="h-3.5 w-3.5" /> Reg. Ligações
          </TabsTrigger>
          <TabsTrigger value="post" className="gap-1.5 text-xs">
            <ClipboardCheck className="h-3.5 w-3.5" /> Pós-Entrega
          </TabsTrigger>
        </TabsList>

        {/* ===================== TAB: TICKETS ===================== */}
        <TabsContent value="tickets" className="space-y-4">
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <StatCard title="Abertos" value={openTickets.length} icon={<Ticket className="h-4 w-4 text-primary" />} accent="bg-primary/[0.03]" />
            <StatCard title="Criados" value={fTickets.length} icon={<CalendarClock className="h-4 w-4 text-muted-foreground" />} />
            <StatCard title="SLA em Risco" value={slaAtRisk.length} icon={<AlertTriangle className="h-4 w-4 text-destructive" />} accent="bg-destructive/[0.03]" />
            <StatCard title="Resolvidos" value={resolvedInPeriod.length} icon={<CheckCircle2 className="h-4 w-4 text-success" />} accent="bg-success/[0.03]" />
            <StatCard title="Emails Recebidos" value={emailsReceived} icon={<Inbox className="h-4 w-4 text-primary" />} accent="bg-primary/[0.03]" />
            <StatCard title="Tempo Médio" value={`${avgResolutionHours}h`} icon={<Clock className="h-4 w-4 text-muted-foreground" />} subtitle="resolução" />
          </div>

          {/* Priority breakdown */}
          <div className="grid gap-3 grid-cols-3">
            <Card className="border-destructive/20">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                </div>
                <div>
                  <p className="text-xl font-bold text-destructive">{ticketsByPriority.P1}</p>
                  <p className="text-[10px] text-muted-foreground">Prioridade P1</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-warning/20">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-warning" />
                </div>
                <div>
                  <p className="text-xl font-bold text-warning">{ticketsByPriority.P2}</p>
                  <p className="text-[10px] text-muted-foreground">Prioridade P2</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xl font-bold">{ticketsByPriority.P3}</p>
                  <p className="text-[10px] text-muted-foreground">Prioridade P3</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent tickets */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Tickets Recentes Abertos</CardTitle>
                <button onClick={() => navigate("/tickets")} className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors">
                  Ver todos <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {openTickets.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nenhum ticket aberto</p>
              ) : (
                <div className="space-y-1.5">
                  {openTickets.slice(0, 8).map((t) => (
                    <ListItem key={t.id} onClick={() => navigate(`/tickets/${t.id}`)}>
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="text-xs font-mono text-muted-foreground/70 shrink-0">#{t.ticket_number}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{t.subject}</p>
                          <p className="text-xs text-muted-foreground truncate">{t.client_name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(t.created_at), { addSuffix: true, locale: pt })}
                        </span>
                        <Badge className={`${priorityColors[t.priority]} text-[10px] px-1.5 py-0`}>{t.priority}</Badge>
                      </div>
                    </ListItem>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== TAB: LIGAÇÕES ===================== */}
        <TabsContent value="calls" className="space-y-4">
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <StatCard title="Ligações Abertas" value={openCalls.length} icon={<PhoneCall className="h-4 w-4 text-primary" />} accent="bg-primary/[0.03]" />
            <StatCard title="Registadas" value={fCalls.length} icon={<PhoneIncoming className="h-4 w-4 text-primary" />} accent="bg-primary/[0.03]" />
            <StatCard title="Fechadas" value={closedInPeriod.length} icon={<CheckCircle2 className="h-4 w-4 text-success" />} accent="bg-success/[0.03]" />
            <StatCard title="Lembretes Pendentes" value={upcomingReminders.length} icon={<Bell className="h-4 w-4 text-warning" />} accent="bg-warning/[0.03]" />
          </div>

          {/* Priority breakdown */}
          <div className="grid gap-3 grid-cols-3">
            {(["P1", "P2", "P3"] as const).map((p) => {
              const count = openCalls.filter((c) => c.priority === p.toLowerCase() || c.priority === p).length;
              const colors = { P1: "text-destructive bg-destructive/10", P2: "text-warning bg-warning/10", P3: "text-muted-foreground bg-muted" };
              return (
                <Card key={p}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${colors[p].split(" ")[1]}`}>
                      <Phone className={`h-4 w-4 ${colors[p].split(" ")[0]}`} />
                    </div>
                    <div>
                      <p className={`text-xl font-bold ${colors[p].split(" ")[0]}`}>{count}</p>
                      <p className="text-[10px] text-muted-foreground">{p} abertas</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Recent calls */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Últimas Ligações</CardTitle>
                <button onClick={() => navigate("/phone-calls")} className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors">
                  Ver todas <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {phoneCalls.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma ligação registada</p>
              ) : (
                <div className="space-y-1.5">
                  {phoneCalls.slice(0, 8).map((c) => (
                    <ListItem key={c.id} onClick={() => navigate("/phone-calls")}>
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Phone className="h-4 w-4 text-primary/60 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{c.subject}</p>
                          <p className="text-xs text-muted-foreground truncate">{c.client_name} · {c.client_phone}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: pt })}
                        </span>
                        {!c.closed_at && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Aberta</Badge>}
                        {c.closed_at && <Badge className="bg-success/10 text-success border-0 text-[10px] px-1.5 py-0">Fechada</Badge>}
                      </div>
                    </ListItem>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== TAB: REG. LIGAÇÕES ===================== */}
        <TabsContent value="deliveries" className="space-y-4">
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <StatCard title="Total Registos" value={fDeliveries.length} icon={<Truck className="h-4 w-4 text-primary" />} accent="bg-primary/[0.03]" />
            <StatCard title="Confirmados" value={confirmed.length} icon={<CheckCircle2 className="h-4 w-4 text-success" />} accent="bg-success/[0.03]" subtitle={`${confirmRate}%`} />
            <StatCard title="Não Confirmados" value={notConfirmed.length} icon={<AlertTriangle className="h-4 w-4 text-destructive" />} accent="bg-destructive/[0.03]" />
            <StatCard title="Taxa Confirmação" value={`${confirmRate}%`} icon={<TrendingUp className="h-4 w-4 text-success" />} accent="bg-success/[0.03]" />
          </div>

          {/* Recent deliveries */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Últimos Registos</CardTitle>
                <button onClick={() => navigate("/delivery-confirmations")} className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors">
                  Ver todos <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {deliveries.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nenhum registo encontrado</p>
              ) : (
                <div className="space-y-1.5">
                  {deliveries.slice(0, 8).map((d) => (
                    <ListItem key={d.id} onClick={() => navigate("/delivery-confirmations")}>
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Truck className="h-4 w-4 text-primary/60 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">Encomenda #{d.order_number}</p>
                          <p className="text-xs text-muted-foreground truncate">{d.client_phone} · {d.contact_attempts} tentativa(s)</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(d.created_at), { addSuffix: true, locale: pt })}
                        </span>
                        {d.confirmed
                          ? <Badge className="bg-success/10 text-success border-0 text-[10px] px-1.5 py-0">Confirmado</Badge>
                          : <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-destructive border-destructive/30">Não confirm.</Badge>
                        }
                      </div>
                    </ListItem>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== TAB: PÓS-ENTREGA ===================== */}
        <TabsContent value="post" className="space-y-4">
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
            <StatCard title="Total Inquéritos" value={fPostDeliveries.length} icon={<ClipboardCheck className="h-4 w-4 text-primary" />} accent="bg-primary/[0.03]" />
            <StatCard title="Satisfação" value={`${satisfactionRate}%`} icon={<ThumbsUp className="h-4 w-4 text-success" />} accent="bg-success/[0.03]" />
            <StatCard title="Satisfação" value={`${satisfactionRate}%`} icon={<ThumbsUp className="h-4 w-4 text-success" />} accent="bg-success/[0.03]" />
            <StatCard title="Com Problemas" value={issuesCount} icon={<ThumbsDown className="h-4 w-4 text-destructive" />} accent="bg-destructive/[0.03]" />
            {avgNps !== null && <StatCard title="NPS Montagem" value={avgNps} icon={<Star className="h-4 w-4 text-warning" />} accent="bg-warning/[0.03]" />}
          </div>

          {/* Quality breakdown */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            {[
              { label: "Produto OK", value: postDeliveries.filter((p) => p.product_ok).length, total: postDeliveries.length, icon: Package, color: "text-success" },
              { label: "Sem Danos", value: postDeliveries.filter((p) => p.no_damage).length, total: postDeliveries.length, icon: CheckCircle2, color: "text-success" },
              { label: "Montagem OK", value: postDeliveries.filter((p) => p.assembly_ok).length, total: postDeliveries.length, icon: ClipboardCheck, color: "text-primary" },
              { label: "Cliente Satisfeito", value: satisfied.length, total: postDeliveries.length, icon: ThumbsUp, color: "text-success" },
            ].map((item) => (
              <Card key={item.label}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                    <item.icon className={`h-4 w-4 ${item.color}`} />
                  </div>
                  <div>
                    <p className="text-lg font-bold">
                      {item.value}<span className="text-sm text-muted-foreground font-normal">/{item.total}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">{item.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Recent post-deliveries */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Últimos Inquéritos</CardTitle>
                <button onClick={() => navigate("/post-delivery")} className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors">
                  Ver todos <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {postDeliveries.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nenhum inquérito encontrado</p>
              ) : (
                <div className="space-y-1.5">
                  {postDeliveries.slice(0, 8).map((p) => (
                    <ListItem key={p.id} onClick={() => navigate("/post-delivery")}>
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <ClipboardCheck className="h-4 w-4 text-primary/60 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">Encomenda #{p.order_number}</p>
                          <p className="text-xs text-muted-foreground truncate">{p.client_name} · {p.client_phone}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(p.created_at), { addSuffix: true, locale: pt })}
                        </span>
                        {p.client_satisfied
                          ? <Badge className="bg-success/10 text-success border-0 text-[10px] px-1.5 py-0">Satisfeito</Badge>
                          : <Badge className="bg-destructive/10 text-destructive border-0 text-[10px] px-1.5 py-0">Insatisfeito</Badge>
                        }
                        {p.issues_reported && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-destructive">Problemas</Badge>}
                      </div>
                    </ListItem>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
