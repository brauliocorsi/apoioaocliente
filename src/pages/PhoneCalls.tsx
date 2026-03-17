import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Phone, Clock, CheckCircle2, Loader2, XCircle, Search, Filter, CalendarDays, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import PhoneCallForm from "@/components/phone/PhoneCallForm";
import { usePhoneCallStatuses } from "@/hooks/usePhoneCallStatuses";
import PhoneCallKanban from "@/components/phone/PhoneCallKanban";
import PhoneCallDetailDialog from "@/components/phone/PhoneCallDetailDialog";
import PhoneCallList from "@/components/phone/PhoneCallList";
import NotePreviewDialog from "@/components/phone/NotePreviewDialog";

type PhoneCall = {
  id: string;
  client_name: string;
  client_phone: string;
  invoice_number: string | null;
  subject: string;
  notes: string | null;
  status: string;
  priority: string;
  created_at: string;
  ticket_id?: string | null;
  reminder_count?: number;
  created_by?: string;
  created_by_name?: string;
  created_by_color?: string;
  created_by_avatar?: string | null;
  assigned_to?: string | null;
  assigned_to_name?: string;
  assigned_to_color?: string;
  assigned_to_avatar?: string | null;
  closed_at?: string | null;
  closed_by?: string | null;
  closed_by_name?: string;
};

export default function PhoneCalls() {
  const [calls, setCalls] = useState<PhoneCall[]>([]);
  const [reminderCounts, setReminderCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [priorityFilter, setPriorityFilter] = useState("todas");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [agentFilter, setAgentFilter] = useState("todos");
  const [search, setSearch] = useState("");
  const [selectedCall, setSelectedCall] = useState<PhoneCall | null>(null);
  const [activeTab, setActiveTab] = useState("ativas");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const { statuses, statusLabels } = usePhoneCallStatuses();

  const fetchAgents = async () => {
    const { data } = await supabase.rpc("get_agent_profiles");
    if (data) setAgents(data.map((a: any) => ({ id: a.id, full_name: a.full_name })));
  };

  const fetchCalls = async () => {
    const { data } = await supabase
      .from("phone_calls" as any)
      .select("*")
      .order("created_at", { ascending: false });
    const rows = (data as any as PhoneCall[]) || [];

    const allUserIds = [...new Set([
      ...rows.map((r) => r.created_by).filter(Boolean),
      ...rows.map((r) => r.assigned_to).filter(Boolean),
      ...rows.map((r) => r.closed_by).filter(Boolean),
    ])];
    let profileMap: Record<string, { name: string; color: string; avatar_url?: string | null }> = {};
    if (allUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, agent_color, avatar_url")
        .in("id", allUserIds);
      (profiles || []).forEach((p: any) => {
        profileMap[p.id] = { name: p.full_name, color: p.agent_color || '#6b7280', avatar_url: p.avatar_url };
      });
    }

    const enrichedRows = rows.map((r) => ({
      ...r,
      created_by_name: r.created_by ? profileMap[r.created_by]?.name || "" : "",
      created_by_color: r.created_by ? profileMap[r.created_by]?.color || "#6b7280" : "#6b7280",
      created_by_avatar: r.created_by ? profileMap[r.created_by]?.avatar_url || null : null,
      assigned_to_name: r.assigned_to ? profileMap[r.assigned_to]?.name || "" : "",
      assigned_to_color: r.assigned_to ? profileMap[r.assigned_to]?.color || "#6b7280" : "#6b7280",
      assigned_to_avatar: r.assigned_to ? profileMap[r.assigned_to]?.avatar_url || null : null,
      closed_by_name: r.closed_by ? profileMap[r.closed_by]?.name || "" : "",
    }));
    setCalls(enrichedRows);

    const { data: remData } = await supabase
      .from("phone_call_reminders" as any)
      .select("phone_call_id")
      .eq("is_completed", false);
    const counts: Record<string, number> = {};
    ((remData as any[]) || []).forEach((r: any) => {
      counts[r.phone_call_id] = (counts[r.phone_call_id] || 0) + 1;
    });
    setReminderCounts(counts);
    setLoading(false);
  };

  useEffect(() => { fetchCalls(); fetchAgents(); }, []);

  const enrichedCalls = useMemo(
    () => calls.map((c) => ({ ...c, reminder_count: reminderCounts[c.id] || 0 })),
    [calls, reminderCounts]
  );

  // Split into active (not closed) and closed
  const activeCalls = useMemo(() => enrichedCalls.filter((c) => !c.closed_at), [enrichedCalls]);
  const closedCalls = useMemo(() => enrichedCalls.filter((c) => !!c.closed_at), [enrichedCalls]);

  const applyFilters = (list: PhoneCall[]) => {
    let result = list;
    if (priorityFilter !== "todas") result = result.filter((c) => c.priority === priorityFilter);
    if (statusFilter !== "todos") result = result.filter((c) => c.status === statusFilter);
    if (agentFilter !== "todos") {
      if (agentFilter === "sem_atribuicao") {
        result = result.filter((c) => !c.assigned_to);
      } else {
        result = result.filter((c) => c.assigned_to === agentFilter);
      }
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      result = result.filter((c) => new Date(c.created_at) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((c) => new Date(c.created_at) <= to);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.client_name.toLowerCase().includes(q) ||
          c.client_phone.includes(q) ||
          c.subject.toLowerCase().includes(q) ||
          (c.invoice_number || "").toLowerCase().includes(q)
      );
    }
    return result;
  };

  const filteredActive = useMemo(() => applyFilters(activeCalls), [activeCalls, priorityFilter, statusFilter, agentFilter, dateFrom, dateTo, search]);
  const filteredClosed = useMemo(() => applyFilters(closedCalls), [closedCalls, priorityFilter, statusFilter, agentFilter, dateFrom, dateTo, search]);

  const today = new Date().toDateString();
  const todayCalls = activeCalls.filter((c) => new Date(c.created_at).toDateString() === today);

  const iconList = [Clock, Phone, CheckCircle2];
  const iconBgList = ["bg-warning/10 text-warning", "bg-primary/10 text-primary", "bg-success/10 text-success"];

  const summaryCards = [
    {
      title: "Hoje",
      subtitle: "Ligações registadas hoje",
      value: todayCalls.length,
      icon: Phone,
      color: "hsl(215, 70%, 45%)",
      iconBg: "bg-primary/10 text-primary",
    },
    ...statuses.map((s, i) => ({
      title: s.name,
      subtitle: `Estado: ${s.name}`,
      value: activeCalls.filter((c) => c.status === s.id).length,
      icon: iconList[i % iconList.length],
      color: s.color,
      iconBg: iconBgList[i % iconBgList.length],
    })),
    {
      title: "Encerradas",
      subtitle: "Total de ligações encerradas",
      value: closedCalls.length,
      icon: Archive,
      color: "#6b7280",
      iconBg: "bg-muted text-muted-foreground",
    },
  ];

  const hasActiveFilters = priorityFilter !== "todas" || statusFilter !== "todos" || agentFilter !== "todos" || !!dateFrom || !!dateTo;

  const clearFilters = () => {
    setPriorityFilter("todas");
    setStatusFilter("todos");
    setAgentFilter("todos");
    setDateFrom(undefined);
    setDateTo(undefined);
    setSearch("");
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ligações</h1>
        <p className="text-muted-foreground">Controle de atendimentos telefónicos</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {summaryCards.map((card) => (
          <Card key={card.title} className="border-t-4 overflow-hidden" style={{ borderTopColor: card.color }}>
            <CardHeader className="flex flex-row items-center justify-between pb-1">
              <div>
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <p className="text-[11px] text-muted-foreground mt-0.5">{card.subtitle}</p>
              </div>
              <div className={`p-2 rounded-lg ${card.iconBg}`}>
                <card.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick form */}
      <PhoneCallForm onCreated={fetchCalls} />

      {/* Filters + Tabs */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Quadro de Ligações</CardTitle>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="ativas" className="gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> Ativas ({activeCalls.length})
                </TabsTrigger>
                <TabsTrigger value="encerradas" className="gap-1.5">
                  <Archive className="h-3.5 w-3.5" /> Encerradas ({closedCalls.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap gap-2 mt-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 sm:w-48"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Prioridade</SelectItem>
                <SelectItem value="P1">P1</SelectItem>
                <SelectItem value="P2">P2</SelectItem>
                <SelectItem value="P3">P3</SelectItem>
              </SelectContent>
            </Select>
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Atribuído a" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os atribuídos</SelectItem>
                <SelectItem value="sem_atribuicao">Sem atribuição</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date range */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-9">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {dateFrom ? format(dateFrom, "dd/MM", { locale: pt }) : "De"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={pt} initialFocus />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-9">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {dateTo ? format(dateTo, "dd/MM", { locale: pt }) : "Até"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={pt} initialFocus />
              </PopoverContent>
            </Popover>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-9 text-xs gap-1" onClick={clearFilters}>
                <XCircle className="h-3.5 w-3.5" /> Limpar
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {activeTab === "ativas" ? (
            <PhoneCallKanban
              calls={filteredActive}
              onSelect={setSelectedCall}
              onStatusChanged={fetchCalls}
            />
          ) : (
            <ClosedCallsTable calls={filteredClosed} onSelect={setSelectedCall} statusLabels={statusLabels} />
          )}
        </CardContent>
      </Card>

      <PhoneCallDetailDialog
        call={selectedCall}
        open={!!selectedCall}
        onClose={() => setSelectedCall(null)}
        onUpdated={() => { fetchCalls(); }}
      />
    </div>
  );
}

/* ---- Closed calls history table ---- */
function ClosedCallsTable({
  calls,
  onSelect,
  statusLabels,
}: {
  calls: PhoneCall[];
  onSelect: (c: PhoneCall) => void;
  statusLabels: Record<string, string>;
}) {
  if (calls.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Archive className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">Nenhuma ligação encerrada encontrada</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Cliente</th>
            <th className="text-left px-3 py-2 font-medium">Assunto</th>
            <th className="text-left px-3 py-2 font-medium">Tipo</th>
            <th className="text-left px-3 py-2 font-medium">Prioridade</th>
            <th className="text-left px-3 py-2 font-medium">Criada em</th>
            <th className="text-left px-3 py-2 font-medium">Encerrada em</th>
            <th className="text-left px-3 py-2 font-medium">Encerrada por</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c) => (
            <tr
              key={c.id}
              className="border-t hover:bg-muted/30 cursor-pointer transition-colors"
              onClick={() => onSelect(c)}
            >
              <td className="px-3 py-2.5">
                <div className="font-medium">{c.client_name}</div>
                <div className="text-xs text-muted-foreground">{c.client_phone}</div>
              </td>
              <td className="px-3 py-2.5 max-w-[200px] truncate">{c.subject}</td>
              <td className="px-3 py-2.5">
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{statusLabels[c.status] || c.status}</span>
              </td>
              <td className="px-3 py-2.5">
                <span className={`text-xs font-semibold ${c.priority === 'P1' ? 'text-destructive' : c.priority === 'P2' ? 'text-warning' : 'text-muted-foreground'}`}>
                  {c.priority}
                </span>
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                {format(new Date(c.created_at), "dd/MM/yyyy HH:mm", { locale: pt })}
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                {c.closed_at ? format(new Date(c.closed_at), "dd/MM/yyyy HH:mm", { locale: pt }) : "—"}
              </td>
              <td className="px-3 py-2.5 text-xs">{c.closed_by_name || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
