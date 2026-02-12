import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Loader2, List, LayoutGrid, AlertTriangle, Clock, CheckCircle, Timer } from "lucide-react";
import { useNavigate } from "react-router-dom";
import KanbanBoard from "@/components/KanbanBoard";
import PriorityFlag from "@/components/ticket/PriorityFlag";
import SlaDashboard, { type SlaTicket, getTicketSlaStatus, calcRemaining, type SlaStatus } from "@/components/ticket/SlaDashboard";
import { useTicketStatuses } from "@/hooks/useTicketStatuses";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function formatSlaTime(ms: number): string {
  const abs = Math.abs(ms);
  const hours = Math.floor(abs / 3600000);
  const mins = Math.floor((abs % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function slaTooltipText(ticket: SlaTicket, status: SlaStatus): string {
  if (status === "completed") return "SLA concluído";
  if (status === "no_sla") return "Sem SLA definido";
  const deadline = ticket.sla_resolution_at;
  if (!deadline) return "Sem SLA";
  const remaining = calcRemaining(deadline, ticket.sla_paused_total_seconds || 0, ticket.sla_paused_at);
  if (remaining <= 0) return `Expirado há ${formatSlaTime(remaining)}`;
  return `${formatSlaTime(remaining)} restante`;
}

function SlaIcon({ status, ticket }: { status: SlaStatus; ticket: SlaTicket }) {
  const icon =
    status === "breached" ? <AlertTriangle className="h-4 w-4 text-destructive" /> :
    status === "at_risk" ? <Timer className="h-4 w-4 text-warning" /> :
    status === "on_track" ? <Clock className="h-4 w-4 text-success" /> :
    status === "completed" ? <CheckCircle className="h-4 w-4 text-success" /> :
    null;

  if (!icon) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild><span className="cursor-default">{icon}</span></TooltipTrigger>
      <TooltipContent><p className="text-xs">{slaTooltipText(ticket, status)}</p></TooltipContent>
    </Tooltip>
  );
}

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
  assigned_to: string | null;
  sla_first_response_at: string | null;
  sla_resolution_at: string | null;
  sla_paused_at: string | null;
  sla_paused_total_seconds: number | null;
  first_responded_at: string | null;
  resolved_at: string | null;
  sla_stage_deadline_at: string | null;
};

export default function Tickets() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [slaFilter, setSlaFilter] = useState<string>("all");
  const [view, setView] = useState<"list" | "kanban">("list");
  const [fetchKey, setFetchKey] = useState(0);
  const navigate = useNavigate();
  const { statuses, statusLabels } = useTicketStatuses();

  const refreshTickets = () => setFetchKey((k) => k + 1);

  useEffect(() => {
    Promise.all([
      supabase.from("categories").select("id, name"),
      supabase.from("user_roles").select("user_id, role").in("role", ["agent", "supervisor"]),
    ]).then(async ([{ data: cats }, { data: roles }]) => {
      const map: Record<string, string> = {};
      (cats || []).forEach((c: any) => { map[c.id] = c.name; });
      setCategories(map);
      const agentIds = (roles || []).map((r: any) => r.user_id);
      if (agentIds.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", agentIds);
        setAgents(profs || []);
      } else {
        setAgents([]);
      }
    });
  }, []);

  useEffect(() => {
    const fetch = async () => {
      let query = supabase
        .from("tickets")
        .select("id, ticket_number, client_name, subject, category_id, priority, status, order_number, created_at, assigned_to, sla_first_response_at, sla_resolution_at, sla_paused_at, sla_paused_total_seconds, first_responded_at, resolved_at, sla_stage_deadline_at")
        .order("created_at", { ascending: false });
      
      if (statusFilter !== "all") query = query.eq("status", statusFilter as any);
      if (priorityFilter !== "all") query = query.eq("priority", priorityFilter as any);
      if (agentFilter !== "all") query = query.eq("assigned_to", agentFilter);

      const { data } = await query.limit(200);
      setTickets((data as TicketRow[]) || []);
      setLoading(false);
    };
    fetch();
  }, [statusFilter, priorityFilter, agentFilter, fetchKey]);

  // Pre-compute SLA counts (before SLA filter, but after other filters)
  const preSlaCounts = (() => {
    const counts = { breached: 0, at_risk: 0, on_track: 0, completed: 0, no_sla: 0 };
    tickets.forEach((t) => {
      const matchesSearch =
        t.client_name.toLowerCase().includes(search.toLowerCase()) ||
        t.subject.toLowerCase().includes(search.toLowerCase()) ||
        (t.order_number && t.order_number.includes(search)) ||
        String(t.ticket_number).includes(search);
      if (!matchesSearch) return;
      const s = getTicketSlaStatus(t);
      if (s in counts) counts[s as keyof typeof counts]++;
    });
    return counts;
  })();

  const filtered = tickets.filter((t) => {
    const matchesSearch =
      t.client_name.toLowerCase().includes(search.toLowerCase()) ||
      t.subject.toLowerCase().includes(search.toLowerCase()) ||
      (t.order_number && t.order_number.includes(search)) ||
      String(t.ticket_number).includes(search);
    if (!matchesSearch) return false;
    if (slaFilter === "all") return true;
    const sla = getTicketSlaStatus(t);
    return sla === slaFilter;
  });

  const agentName = (id: string | null) => {
    if (!id) return null;
    return agents.find((a) => a.id === id)?.full_name;
  };

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tickets</h1>
          <p className="text-muted-foreground">Gestão de tickets de suporte</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md">
            <Button variant={view === "list" ? "secondary" : "ghost"} size="icon" className="h-9 w-9 rounded-r-none" onClick={() => setView("list")}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={view === "kanban" ? "secondary" : "ghost"} size="icon" className="h-9 w-9 rounded-l-none" onClick={() => setView("kanban")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={() => navigate("/tickets/new")}>
            <Plus className="mr-2 h-4 w-4" /> Novo Ticket
          </Button>
        </div>
      </div>

      {!loading && <SlaDashboard tickets={filtered as SlaTicket[]} />}

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Pesquisar por nome, assunto, nº encomenda..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {view === "list" && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os estados</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
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
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Agente" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os agentes</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={slaFilter} onValueChange={setSlaFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="SLA" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos SLA</SelectItem>
            <SelectItem value="breached">Expirado ({preSlaCounts.breached})</SelectItem>
            <SelectItem value="at_risk">Em risco ({preSlaCounts.at_risk})</SelectItem>
            <SelectItem value="on_track">Dentro do prazo ({preSlaCounts.on_track})</SelectItem>
            <SelectItem value="completed">Concluído ({preSlaCounts.completed})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : view === "kanban" ? (
        <KanbanBoard tickets={filtered} categoryNames={categories} onTicketMoved={refreshTickets} />
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
                        <p className="text-xs text-muted-foreground">
                          {t.client_name}
                          {t.order_number ? ` · Enc. ${t.order_number}` : ""}
                          {t.assigned_to ? ` · ${agentName(t.assigned_to)}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <SlaIcon status={getTicketSlaStatus(t)} ticket={t as SlaTicket} />
                      {t.category_id && <Badge variant="outline" className="text-xs">{categories[t.category_id] || t.category_id}</Badge>}
                      <PriorityFlag priority={t.priority} />
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
    </TooltipProvider>
  );
}
