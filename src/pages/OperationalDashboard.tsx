import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  Inbox,
  UserX,
  Clock,
  CalendarClock,
  ListChecks,
  ShieldAlert,
  MailX,
  Repeat2,
  Flame,
  PackageSearch,
  PackageX,
  ExternalLink,
} from "lucide-react";
import { formatDistanceToNow, format, isToday } from "date-fns";
import { pt } from "date-fns/locale";

/**
 * Fase 5A — Painel Operacional da Alessandra
 *
 * READ-ONLY operational dashboard. Aggregates indicators from existing tables.
 * No destructive changes; no notifications/mutations.
 *
 * Regra "clientes sem resposta":
 *  ticket aberto cuja última `ticket_messages` é de sender_type='client'
 *  (i.e. nenhum agent message posterior). Aproximação documentada.
 */

type Ticket = {
  id: string;
  ticket_number: number;
  client_name: string | null;
  subject: string | null;
  category_id: string | null;
  priority: string | null;
  status: string;
  assigned_to: string | null;
  created_at: string;
  next_action: string | null;
  next_action_due_at: string | null;
  parent_ticket_id: string | null;
  order_number: string | null;
  order_lookup_status: string | null;
  order_lookup_error: string | null;
  sla_first_response_at: string | null;
  first_responded_at: string | null;
  sla_resolution_at: string | null;
  resolved_at: string | null;
  next_customer_update_due_at: string | null;
  sla_paused: boolean | null;
  sla_paused_at: string | null;
  sla_paused_reason: string | null;
  sla_breached: boolean | null;
  sla_status: string | null;
};

type StatusRow = { id: string; name: string; is_closed: boolean | null; is_resolved: boolean | null };
type Profile = { id: string; full_name: string };
type LastMsg = { ticket_id: string; sender_type: string; created_at: string };
type InboundEvent = {
  id: string;
  status: string;
  from_address: string;
  from_name: string | null;
  subject: string | null;
  received_at: string;
  spam_score: number;
  routed_ticket_id: string | null;
};
type Category = { id: string; name: string };

const PERIOD_OPTS = [
  { value: "all", label: "Tudo" },
  { value: "today", label: "Hoje" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
];

function periodSince(p: string): Date | null {
  const now = new Date();
  if (p === "today") { const d = new Date(now); d.setHours(0, 0, 0, 0); return d; }
  if (p === "7d") return new Date(now.getTime() - 7 * 86400000);
  if (p === "30d") return new Date(now.getTime() - 30 * 86400000);
  return null;
}

export default function OperationalDashboard() {
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [lastMsgs, setLastMsgs] = useState<Record<string, { client?: string; agent?: string }>>({});
  const [inbound, setInbound] = useState<InboundEvent[]>([]);
  const [failedEmailLogs, setFailedEmailLogs] = useState<number>(0);

  // filters
  const [period, setPeriod] = useState("all");
  const [agent, setAgent] = useState("all");
  const [priority, setPriority] = useState("all");
  const [category, setCategory] = useState("all");

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const [tk, st, pr, cat, msgs, ib, fl] = await Promise.all([
      supabase.from("tickets").select("id, ticket_number, client_name, subject, category_id, priority, status, assigned_to, created_at, next_action, next_action_due_at, parent_ticket_id, order_number, order_lookup_status, order_lookup_error, sla_first_response_at, first_responded_at, sla_resolution_at, resolved_at, next_customer_update_due_at, sla_paused, sla_paused_at, sla_paused_reason, sla_breached, sla_status").order("created_at", { ascending: false }).limit(1000),
      supabase.from("ticket_statuses").select("id, name, is_closed, is_resolved"),
      supabase.from("profiles").select("id, full_name").eq("is_active", true),
      supabase.from("categories").select("id, name"),
      supabase.from("ticket_messages").select("ticket_id, sender_type, created_at").order("created_at", { ascending: false }).limit(5000),
      supabase.from("inbound_email_events").select("id, status, from_address, from_name, subject, received_at, spam_score, routed_ticket_id").in("status", ["pending_review", "quarantined", "failed"]).order("received_at", { ascending: false }).limit(500),
      supabase.from("email_logs").select("id", { count: "exact", head: true }).eq("status", "failed"),
    ]);

    setTickets((tk.data as Ticket[]) || []);
    setStatuses((st.data as StatusRow[]) || []);
    setProfiles((pr.data as Profile[]) || []);
    setCategories((cat.data as Category[]) || []);
    setInbound((ib.data as InboundEvent[]) || []);
    setFailedEmailLogs(fl.count || 0);

    // group last message per ticket per sender (already desc-ordered)
    const map: Record<string, { client?: string; agent?: string }> = {};
    for (const m of (msgs.data as LastMsg[]) || []) {
      const entry = map[m.ticket_id] || (map[m.ticket_id] = {});
      if (m.sender_type === "client" && !entry.client) entry.client = m.created_at;
      if (m.sender_type === "agent" && !entry.agent) entry.agent = m.created_at;
    }
    setLastMsgs(map);
    setLoading(false);
  }

  const statusMap = useMemo(() => Object.fromEntries(statuses.map(s => [s.id, s])), [statuses]);
  const profileMap = useMemo(() => Object.fromEntries(profiles.map(p => [p.id, p.full_name])), [profiles]);
  const categoryMap = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c.name])), [categories]);

  const isOpen = (t: Ticket) => {
    const s = statusMap[t.status];
    if (!s) return true; // fallback: trata desconhecido como aberto
    return !s.is_closed && !s.is_resolved;
  };

  // Apply filters
  const filtered = useMemo(() => {
    const since = periodSince(period);
    return tickets.filter(t => {
      if (since && new Date(t.created_at) < since) return false;
      if (agent !== "all") {
        if (agent === "none" && t.assigned_to) return false;
        if (agent !== "none" && t.assigned_to !== agent) return false;
      }
      if (priority !== "all" && t.priority !== priority) return false;
      if (category !== "all" && t.category_id !== category) return false;
      return true;
    });
  }, [tickets, period, agent, priority, category]);

  const openTickets = useMemo(() => filtered.filter(isOpen), [filtered, statusMap]);
  const now = Date.now();

  // Indicator computations
  const noResponseTickets = useMemo(() => openTickets
    .map(t => {
      const lm = lastMsgs[t.id];
      if (!lm?.client) return null;
      const clientAt = new Date(lm.client).getTime();
      const agentAt = lm.agent ? new Date(lm.agent).getTime() : 0;
      if (clientAt <= agentAt) return null;
      return { ticket: t, since: lm.client };
    })
    .filter(Boolean) as { ticket: Ticket; since: string }[], [openTickets, lastMsgs]);
  noResponseTickets.sort((a, b) => new Date(a.since).getTime() - new Date(b.since).getTime());

  const unassigned = openTickets.filter(t => !t.assigned_to);
  const overdueActions = openTickets.filter(t => t.next_action_due_at && new Date(t.next_action_due_at).getTime() < now);
  overdueActions.sort((a, b) => new Date(a.next_action_due_at!).getTime() - new Date(b.next_action_due_at!).getTime());
  const todayActions = openTickets.filter(t => t.next_action_due_at && isToday(new Date(t.next_action_due_at)));
  const noNextAction = openTickets.filter(t => !t.next_action || !t.next_action_due_at);
  const inboundPending = inbound.filter(i => i.status === "pending_review");
  const inboundQuarantine = inbound.filter(i => i.status === "quarantined");
  const inboundFailed = inbound.filter(i => i.status === "failed");
  const continuationTickets = openTickets.filter(t => t.parent_ticket_id);
  const criticalTickets = openTickets.filter(t => t.priority === "P1" || t.priority === "urgent" || t.priority === "high");
  const orderUnverified = openTickets.filter(t => t.order_number && (!t.order_lookup_status || t.order_lookup_status === "not_checked"));
  const orderAttention = openTickets.filter(t => ["not_found", "error", "multiple_matches", "mismatch"].includes(t.order_lookup_status || ""));

  // --- Fase 6: SLA derived lists -----------------------------------------
  const WARN_MS = 2 * 60 * 60 * 1000;
  const slaBreached = openTickets.filter(t => !t.sla_paused && (
    (!t.first_responded_at && t.sla_first_response_at && new Date(t.sla_first_response_at).getTime() < now) ||
    (!t.resolved_at && t.sla_resolution_at && new Date(t.sla_resolution_at).getTime() < now) ||
    (t.next_customer_update_due_at && new Date(t.next_customer_update_due_at).getTime() < now)
  ));
  const slaWarning = openTickets.filter(t => !t.sla_paused && !slaBreached.includes(t) && (
    (!t.first_responded_at && t.sla_first_response_at && new Date(t.sla_first_response_at).getTime() - now <= WARN_MS && new Date(t.sla_first_response_at).getTime() > now) ||
    (!t.resolved_at && t.sla_resolution_at && new Date(t.sla_resolution_at).getTime() - now <= WARN_MS && new Date(t.sla_resolution_at).getTime() > now)
  ));
  const frOverdue = openTickets.filter(t => !t.sla_paused && !t.first_responded_at && t.sla_first_response_at && new Date(t.sla_first_response_at).getTime() < now);
  const resOverdue = openTickets.filter(t => !t.sla_paused && !t.resolved_at && t.sla_resolution_at && new Date(t.sla_resolution_at).getTime() < now);
  const custUpdateOverdue = openTickets.filter(t => !t.sla_paused && t.next_customer_update_due_at && new Date(t.next_customer_update_due_at).getTime() < now);
  const slaPaused = openTickets.filter(t => t.sla_paused);
  const slaNone = openTickets.filter(t => !t.sla_first_response_at && !t.sla_resolution_at);
  slaBreached.sort((a, b) => {
    const da = Math.min(...[a.sla_first_response_at, a.sla_resolution_at, a.next_customer_update_due_at].filter(Boolean).map(s => new Date(s as string).getTime()));
    const db = Math.min(...[b.sla_first_response_at, b.sla_resolution_at, b.next_customer_update_due_at].filter(Boolean).map(s => new Date(s as string).getTime()));
    return da - db;
  });

  function slaBreachLabel(t: Ticket): { label: string; due: string } {
    const now2 = Date.now();
    const opts: Array<{ label: string; due: string }> = [];
    if (!t.first_responded_at && t.sla_first_response_at && new Date(t.sla_first_response_at).getTime() < now2)
      opts.push({ label: "Primeira resposta", due: t.sla_first_response_at });
    if (!t.resolved_at && t.sla_resolution_at && new Date(t.sla_resolution_at).getTime() < now2)
      opts.push({ label: "Resolução", due: t.sla_resolution_at });
    if (t.next_customer_update_due_at && new Date(t.next_customer_update_due_at).getTime() < now2)
      opts.push({ label: "Atualização ao cliente", due: t.next_customer_update_due_at });
    return opts.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())[0] || { label: "SLA", due: t.created_at };
  }

  // By responsible
  const byResp = useMemo(() => {
    const groups: Record<string, { name: string; open: number; noResp: number; overdue: number; today: number; noAction: number; critical: number; continuation: number }> = {};
    const ensure = (id: string, name: string) => groups[id] || (groups[id] = { name, open: 0, noResp: 0, overdue: 0, today: 0, noAction: 0, critical: 0, continuation: 0 });
    for (const t of openTickets) {
      const id = t.assigned_to || "__none__";
      const name = t.assigned_to ? (profileMap[t.assigned_to] || "Desconhecido") : "Sem responsável";
      const g = ensure(id, name);
      g.open++;
      if (!t.next_action || !t.next_action_due_at) g.noAction++;
      if (t.next_action_due_at && new Date(t.next_action_due_at).getTime() < now) g.overdue++;
      if (t.next_action_due_at && isToday(new Date(t.next_action_due_at))) g.today++;
      if (t.priority === "P1" || t.priority === "urgent" || t.priority === "high") g.critical++;
      if (t.parent_ticket_id) g.continuation++;
    }
    for (const { ticket: t } of noResponseTickets) {
      const id = t.assigned_to || "__none__";
      if (groups[id]) groups[id].noResp++;
    }
    return Object.entries(groups).sort((a, b) => b[1].open - a[1].open);
  }, [openTickets, noResponseTickets, profileMap]);

  // By category
  const byCategory = useMemo(() => {
    const g: Record<string, { name: string; open: number; overdue: number; noResp: number; continuation: number }> = {};
    const ensure = (id: string) => g[id] || (g[id] = { name: id === "__none__" ? "Sem categoria" : (categoryMap[id] || id), open: 0, overdue: 0, noResp: 0, continuation: 0 });
    for (const t of openTickets) {
      const id = t.category_id || "__none__";
      const e = ensure(id);
      e.open++;
      if (t.next_action_due_at && new Date(t.next_action_due_at).getTime() < now) e.overdue++;
      if (t.parent_ticket_id) e.continuation++;
    }
    for (const { ticket: t } of noResponseTickets) {
      const id = t.category_id || "__none__";
      if (g[id]) g[id].noResp++;
    }
    return Object.entries(g).sort((a, b) => b[1].open - a[1].open);
  }, [openTickets, noResponseTickets, categoryMap]);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Painel Operacional</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão de cobrança e coordenação diária. Apenas leitura.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterSelect value={period} onChange={setPeriod} options={PERIOD_OPTS} placeholder="Período" />
          <FilterSelect value={priority} onChange={setPriority} options={[{ value: "all", label: "Todas prioridades" }, { value: "P1", label: "P1" }, { value: "P2", label: "P2" }, { value: "P3", label: "P3" }]} />
          <FilterSelect value={agent} onChange={setAgent} options={[{ value: "all", label: "Todos responsáveis" }, { value: "none", label: "Sem responsável" }, ...profiles.map(p => ({ value: p.id, label: p.full_name }))]} />
          <FilterSelect value={category} onChange={setCategory} options={[{ value: "all", label: "Todas categorias" }, ...categories.map(c => ({ value: c.id, label: c.name }))]} />
        </div>
      </header>

      {/* CARDS */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <KpiCard icon={UserX} label="Clientes sem resposta" value={loading ? null : noResponseTickets.length} tone="warn" anchor="no-response" />
        <KpiCard icon={UserX} label="Sem responsável" value={loading ? null : unassigned.length} tone="warn" anchor="unassigned" />
        <KpiCard icon={Clock} label="Ações atrasadas" value={loading ? null : overdueActions.length} tone="danger" anchor="overdue" />
        <KpiCard icon={CalendarClock} label="Ações para hoje" value={loading ? null : todayActions.length} tone="info" anchor="today" />
        <KpiCard icon={ListChecks} label="Sem próxima ação" value={loading ? null : noNextAction.length} tone="muted" anchor="no-action" />
        <KpiCard icon={Inbox} label="Caixa pendente" value={loading ? null : inboundPending.length} tone="info" href="/inbound-events" />
        <KpiCard icon={ShieldAlert} label="Quarentena" value={loading ? null : inboundQuarantine.length} tone="warn" href="/inbound-events" />
        <KpiCard icon={MailX} label="E-mails falhados" value={loading ? null : inboundFailed.length + failedEmailLogs} tone="danger" href="/inbound-events" />
        <KpiCard icon={Repeat2} label="Tickets de continuação" value={loading ? null : continuationTickets.length} tone="info" anchor="continuation" />
        <KpiCard icon={Flame} label="Tickets críticos" value={loading ? null : criticalTickets.length} tone="danger" anchor="critical" />
        <KpiCard icon={PackageSearch} label="Encomenda não verificada" value={loading ? null : orderUnverified.length} tone="muted" anchor="orders" />
        <KpiCard icon={PackageX} label="Encomendas com atenção" value={loading ? null : orderAttention.length} tone="warn" anchor="orders" />
        <KpiCard icon={ShieldAlert} label="SLA vencido" value={loading ? null : slaBreached.length} tone="danger" anchor="sla-breached" />
        <KpiCard icon={Clock} label="SLA em risco" value={loading ? null : slaWarning.length} tone="warn" anchor="sla-warning" />
        <KpiCard icon={Clock} label="Primeira resp. vencida" value={loading ? null : frOverdue.length} tone="danger" anchor="sla-breached" />
        <KpiCard icon={Clock} label="Resolução vencida" value={loading ? null : resOverdue.length} tone="danger" anchor="sla-breached" />
        <KpiCard icon={UserX} label="Cliente sem atualização" value={loading ? null : custUpdateOverdue.length} tone="warn" anchor="cust-update" />
        <KpiCard icon={Clock} label="SLA pausado" value={loading ? null : slaPaused.length} tone="muted" />
        <KpiCard icon={Clock} label="Sem SLA" value={loading ? null : slaNone.length} tone="muted" />
      </section>

      <ListSection id="sla-breached" title="SLA vencido" description="Tickets com primeira resposta, resolução ou atualização ao cliente em atraso.">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Ticket</TableHead><TableHead>Cliente</TableHead><TableHead>Responsável</TableHead>
            <TableHead>Tipo</TableHead><TableHead>Prazo</TableHead><TableHead>Atraso</TableHead>
            <TableHead>Prio.</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {slaBreached.slice(0, 50).map(t => {
              const b = slaBreachLabel(t);
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">#{t.ticket_number}</TableCell>
                  <TableCell className="text-sm">{t.client_name}</TableCell>
                  <TableCell className="text-sm">{t.assigned_to ? profileMap[t.assigned_to] || "—" : <Badge variant="outline">Sem resp.</Badge>}</TableCell>
                  <TableCell className="text-xs">{b.label}</TableCell>
                  <TableCell className="text-xs">{format(new Date(b.due), "dd/MM HH:mm", { locale: pt })}</TableCell>
                  <TableCell className="text-xs text-destructive">{formatDistanceToNow(new Date(b.due), { locale: pt })}</TableCell>
                  <TableCell><PriorityBadge p={t.priority} /></TableCell>
                  <TableCell><OpenLink to={`/tickets/${t.id}`} /></TableCell>
                </TableRow>
              );
            })}
            {slaBreached.length === 0 && <EmptyRow cols={8} text="Sem SLA vencido." />}
          </TableBody>
        </Table>
      </ListSection>

      <ListSection id="cust-update" title="Clientes sem atualização" description="Tickets cujo prazo de próxima atualização ao cliente venceu.">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Ticket</TableHead><TableHead>Cliente</TableHead><TableHead>Responsável</TableHead>
            <TableHead>Atualização desde</TableHead><TableHead>Prio.</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {custUpdateOverdue.slice(0, 50).map(t => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">#{t.ticket_number}</TableCell>
                <TableCell className="text-sm">{t.client_name}</TableCell>
                <TableCell className="text-sm">{t.assigned_to ? profileMap[t.assigned_to] || "—" : <Badge variant="outline">Sem resp.</Badge>}</TableCell>
                <TableCell className="text-xs text-destructive">{formatDistanceToNow(new Date(t.next_customer_update_due_at!), { locale: pt })}</TableCell>
                <TableCell><PriorityBadge p={t.priority} /></TableCell>
                <TableCell><OpenLink to={`/tickets/${t.id}`} /></TableCell>
              </TableRow>
            ))}
            {custUpdateOverdue.length === 0 && <EmptyRow cols={6} text="Todos os clientes em dia." />}
          </TableBody>
        </Table>
      </ListSection>


      {/* LISTS */}
      <ListSection id="no-response" title="Clientes sem resposta" description="Última mensagem é do cliente e nenhum agente respondeu desde então.">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Ticket</TableHead><TableHead>Cliente</TableHead><TableHead>Assunto</TableHead>
            <TableHead>Responsável</TableHead><TableHead>Última msg cliente</TableHead><TableHead>Sem resposta há</TableHead>
            <TableHead>Prio.</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {noResponseTickets.slice(0, 50).map(({ ticket: t, since }) => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">#{t.ticket_number}</TableCell>
                <TableCell className="text-sm">{t.client_name}</TableCell>
                <TableCell className="text-sm max-w-[280px] truncate">{t.subject}</TableCell>
                <TableCell className="text-sm">{t.assigned_to ? profileMap[t.assigned_to] || "—" : <Badge variant="outline">Sem responsável</Badge>}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{format(new Date(since), "dd/MM HH:mm", { locale: pt })}</TableCell>
                <TableCell className="text-xs">{formatDistanceToNow(new Date(since), { locale: pt })}</TableCell>
                <TableCell><PriorityBadge p={t.priority} /></TableCell>
                <TableCell><OpenLink to={`/tickets/${t.id}`} /></TableCell>
              </TableRow>
            ))}
            {noResponseTickets.length === 0 && <EmptyRow cols={8} text="Nenhum cliente sem resposta." />}
          </TableBody>
        </Table>
      </ListSection>

      <ListSection id="overdue" title="Próximas ações atrasadas" description="Tickets com next_action_due_at vencido.">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Ticket</TableHead><TableHead>Cliente</TableHead><TableHead>Próxima ação</TableHead>
            <TableHead>Prazo</TableHead><TableHead>Responsável</TableHead><TableHead>Atraso</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {overdueActions.slice(0, 50).map(t => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">#{t.ticket_number}</TableCell>
                <TableCell className="text-sm">{t.client_name}</TableCell>
                <TableCell className="text-sm max-w-[280px] truncate">{t.next_action || "—"}</TableCell>
                <TableCell className="text-xs">{format(new Date(t.next_action_due_at!), "dd/MM HH:mm", { locale: pt })}</TableCell>
                <TableCell className="text-sm">{t.assigned_to ? profileMap[t.assigned_to] || "—" : <Badge variant="outline">Sem responsável</Badge>}</TableCell>
                <TableCell className="text-xs text-destructive">{formatDistanceToNow(new Date(t.next_action_due_at!), { locale: pt })}</TableCell>
                <TableCell><OpenLink to={`/tickets/${t.id}`} /></TableCell>
              </TableRow>
            ))}
            {overdueActions.length === 0 && <EmptyRow cols={7} text="Sem ações atrasadas." />}
          </TableBody>
        </Table>
      </ListSection>

      <ListSection id="unassigned" title="Tickets sem responsável">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Ticket</TableHead><TableHead>Cliente</TableHead><TableHead>Assunto</TableHead>
            <TableHead>Prio.</TableHead><TableHead>Criado</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {unassigned.slice(0, 50).map(t => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">#{t.ticket_number}</TableCell>
                <TableCell className="text-sm">{t.client_name}</TableCell>
                <TableCell className="text-sm max-w-[280px] truncate">{t.subject}</TableCell>
                <TableCell><PriorityBadge p={t.priority} /></TableCell>
                <TableCell className="text-xs">{format(new Date(t.created_at), "dd/MM HH:mm", { locale: pt })}</TableCell>
                <TableCell className="text-xs">{statusMap[t.status]?.name || t.status}</TableCell>
                <TableCell><OpenLink to={`/tickets/${t.id}`} /></TableCell>
              </TableRow>
            ))}
            {unassigned.length === 0 && <EmptyRow cols={7} text="Todos os tickets têm responsável." />}
          </TableBody>
        </Table>
      </ListSection>

      <ListSection id="no-action" title="Tickets sem próxima ação">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Ticket</TableHead><TableHead>Cliente</TableHead><TableHead>Assunto</TableHead>
            <TableHead>Responsável</TableHead><TableHead>Status</TableHead><TableHead>Prio.</TableHead><TableHead>Criado</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {noNextAction.slice(0, 50).map(t => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">#{t.ticket_number}</TableCell>
                <TableCell className="text-sm">{t.client_name}</TableCell>
                <TableCell className="text-sm max-w-[260px] truncate">{t.subject}</TableCell>
                <TableCell className="text-sm">{t.assigned_to ? profileMap[t.assigned_to] || "—" : <Badge variant="outline">Sem resp.</Badge>}</TableCell>
                <TableCell className="text-xs">{statusMap[t.status]?.name || t.status}</TableCell>
                <TableCell><PriorityBadge p={t.priority} /></TableCell>
                <TableCell className="text-xs">{format(new Date(t.created_at), "dd/MM", { locale: pt })}</TableCell>
                <TableCell><OpenLink to={`/tickets/${t.id}`} /></TableCell>
              </TableRow>
            ))}
            {noNextAction.length === 0 && <EmptyRow cols={8} text="Todos os tickets têm próxima ação definida." />}
          </TableBody>
        </Table>
      </ListSection>

      <ListSection id="inbox" title="Caixa de Entrada que precisa de ação" description="Pendentes, quarentena e falhas.">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Data</TableHead><TableHead>Remetente</TableHead><TableHead>Assunto</TableHead>
            <TableHead>Status</TableHead><TableHead>Spam</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {inbound.slice(0, 30).map(e => (
              <TableRow key={e.id}>
                <TableCell className="text-xs">{format(new Date(e.received_at), "dd/MM HH:mm", { locale: pt })}</TableCell>
                <TableCell className="text-sm">{e.from_name || e.from_address}</TableCell>
                <TableCell className="text-sm max-w-[300px] truncate">{e.subject || "—"}</TableCell>
                <TableCell><InboundStatusBadge s={e.status} /></TableCell>
                <TableCell className="text-xs">{e.spam_score}</TableCell>
                <TableCell><OpenLink to="/inbound-events" /></TableCell>
              </TableRow>
            ))}
            {inbound.length === 0 && <EmptyRow cols={6} text="Caixa de Entrada limpa." />}
          </TableBody>
        </Table>
      </ListSection>

      <ListSection id="continuation" title="Tickets de continuação" description="Casos que voltaram depois de resolvidos.">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Novo</TableHead><TableHead>Anterior</TableHead><TableHead>Cliente</TableHead>
            <TableHead>Assunto</TableHead><TableHead>Responsável</TableHead><TableHead>Status</TableHead><TableHead>Criado</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {continuationTickets.slice(0, 50).map(t => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">#{t.ticket_number}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  <Link to={`/tickets/${t.parent_ticket_id}`} className="hover:underline">ver pai</Link>
                </TableCell>
                <TableCell className="text-sm">{t.client_name}</TableCell>
                <TableCell className="text-sm max-w-[260px] truncate">{t.subject}</TableCell>
                <TableCell className="text-sm">{t.assigned_to ? profileMap[t.assigned_to] || "—" : <Badge variant="outline">Sem resp.</Badge>}</TableCell>
                <TableCell className="text-xs">{statusMap[t.status]?.name || t.status}</TableCell>
                <TableCell className="text-xs">{format(new Date(t.created_at), "dd/MM", { locale: pt })}</TableCell>
                <TableCell><OpenLink to={`/tickets/${t.id}`} /></TableCell>
              </TableRow>
            ))}
            {continuationTickets.length === 0 && <EmptyRow cols={8} text="Nenhum ticket de continuação aberto." />}
          </TableBody>
        </Table>
      </ListSection>

      <ListSection id="orders" title="Encomendas com atenção" description="Tickets com order_number sem verificação ou com divergência.">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Ticket</TableHead><TableHead>Cliente</TableHead><TableHead>Encomenda</TableHead>
            <TableHead>Estado consulta</TableHead><TableHead>Erro</TableHead><TableHead>Responsável</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {[...orderAttention, ...orderUnverified].slice(0, 50).map(t => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">#{t.ticket_number}</TableCell>
                <TableCell className="text-sm">{t.client_name}</TableCell>
                <TableCell className="font-mono text-xs">{t.order_number}</TableCell>
                <TableCell><OrderStatusBadge s={t.order_lookup_status} /></TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">{t.order_lookup_error || "—"}</TableCell>
                <TableCell className="text-sm">{t.assigned_to ? profileMap[t.assigned_to] || "—" : "—"}</TableCell>
                <TableCell><OpenLink to={`/tickets/${t.id}`} /></TableCell>
              </TableRow>
            ))}
            {orderAttention.length + orderUnverified.length === 0 && <EmptyRow cols={7} text="Sem encomendas pendentes." />}
          </TableBody>
        </Table>
      </ListSection>

      {/* RESPONSÁVEIS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Responsáveis</CardTitle>
          <p className="text-xs text-muted-foreground">Carga atual e pendências por agente. Use para coordenar, não como ranking.</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Responsável</TableHead><TableHead>Abertos</TableHead><TableHead>Sem resp. cliente</TableHead>
              <TableHead>Atrasos</TableHead><TableHead>Hoje</TableHead><TableHead>Sem próx. ação</TableHead>
              <TableHead>Críticos</TableHead><TableHead>Continuação</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {byResp.map(([id, g]) => (
                <TableRow key={id}>
                  <TableCell className="text-sm font-medium">{g.name}</TableCell>
                  <TableCell>{g.open}</TableCell>
                  <TableCell>{g.noResp}</TableCell>
                  <TableCell className={g.overdue > 0 ? "text-destructive font-medium" : ""}>{g.overdue}</TableCell>
                  <TableCell>{g.today}</TableCell>
                  <TableCell>{g.noAction}</TableCell>
                  <TableCell>{g.critical}</TableCell>
                  <TableCell>{g.continuation}</TableCell>
                </TableRow>
              ))}
              {byResp.length === 0 && <EmptyRow cols={8} text="Sem dados." />}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* CATEGORIAS */}
      <Card>
        <CardHeader><CardTitle className="text-base">Categorias</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Categoria</TableHead><TableHead>Abertos</TableHead><TableHead>Atrasos</TableHead>
              <TableHead>Sem resp. cliente</TableHead><TableHead>Continuação</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {byCategory.map(([id, g]) => (
                <TableRow key={id}>
                  <TableCell className="text-sm">{g.name}</TableCell>
                  <TableCell>{g.open}</TableCell>
                  <TableCell className={g.overdue > 0 ? "text-destructive" : ""}>{g.overdue}</TableCell>
                  <TableCell>{g.noResp}</TableCell>
                  <TableCell>{g.continuation}</TableCell>
                </TableRow>
              ))}
              {byCategory.length === 0 && <EmptyRow cols={5} text="Sem dados." />}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="pt-6 text-xs text-muted-foreground space-y-1">
          <p><strong>Notificações futuras:</strong> estes indicadores serão a base para alertas reais — cliente sem resposta, ação atrasada, ticket sem responsável, e-mail em falha/quarentena, ticket crítico sem ação, ticket de continuação criado, encomenda não encontrada ou divergente.</p>
          <p><strong>Limitação:</strong> "clientes sem resposta" usa apenas <code>ticket_messages</code> (sender_type). Respostas enviadas apenas por e-mail sem espelho em <code>ticket_messages</code> podem não contar — refinar em fase futura usando <code>email_logs</code>.</p>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Subcomponents ---

function FilterSelect({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[180px] h-9 text-xs"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function KpiCard({ icon: Icon, label, value, tone, anchor, href }: { icon: any; label: string; value: number | null; tone: "info" | "warn" | "danger" | "muted"; anchor?: string; href?: string }) {
  const toneCls = {
    info: "text-blue-600 dark:text-blue-400",
    warn: "text-amber-600 dark:text-amber-400",
    danger: "text-destructive",
    muted: "text-muted-foreground",
  }[tone];
  const onClick = anchor ? () => { document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" }); } : undefined;
  const content = (
    <Card className="hover:shadow-sm transition-shadow cursor-pointer">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold mt-1">{value === null ? <Skeleton className="h-7 w-12" /> : value}</p>
          </div>
          <Icon className={`h-4 w-4 ${toneCls}`} />
        </div>
      </CardContent>
    </Card>
  );
  if (href) return <Link to={href}>{content}</Link>;
  return <div onClick={onClick}>{content}</div>;
}

function ListSection({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card id={id}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent className="pt-0 overflow-x-auto">{children}</CardContent>
    </Card>
  );
}

function PriorityBadge({ p }: { p: string | null }) {
  if (!p) return <span className="text-xs text-muted-foreground">—</span>;
  const tone = p === "P1" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" :
               p === "P2" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" :
               "bg-muted text-muted-foreground";
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${tone}`}>{p}</span>;
}

function InboundStatusBadge({ s }: { s: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending_review: { label: "Pendente", cls: "bg-amber-100 text-amber-700" },
    quarantined: { label: "Quarentena", cls: "bg-orange-100 text-orange-700" },
    failed: { label: "Falha", cls: "bg-red-100 text-red-700" },
  };
  const v = map[s] || { label: s, cls: "bg-muted text-muted-foreground" };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${v.cls}`}>{v.label}</span>;
}

function OrderStatusBadge({ s }: { s: string | null }) {
  if (!s || s === "not_checked") return <Badge variant="outline" className="text-[10px]">Não verificada</Badge>;
  const map: Record<string, string> = {
    not_found: "Não encontrada",
    error: "Erro",
    multiple_matches: "Múltiplos",
    mismatch: "Divergência",
    found: "OK",
  };
  return <Badge variant={s === "found" ? "default" : "destructive"} className="text-[10px]">{map[s] || s}</Badge>;
}

function OpenLink({ to }: { to: string }) {
  return (
    <Button asChild size="sm" variant="ghost" className="h-7 px-2">
      <Link to={to}><ExternalLink className="h-3 w-3" /></Link>
    </Button>
  );
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return <TableRow><TableCell colSpan={cols} className="text-center text-xs text-muted-foreground py-6">{text}</TableCell></TableRow>;
}
