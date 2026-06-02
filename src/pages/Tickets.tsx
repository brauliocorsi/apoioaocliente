import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Loader2, List, LayoutGrid, AlertTriangle, Clock, CheckCircle, Timer, Phone, Mail, MailCheck, Paperclip, Image, Video, Ticket } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

export type AttachmentInfo = {
  count: number;
  hasImages: boolean;
  hasVideos: boolean;
};
import { useNavigate, useLocation } from "react-router-dom";
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
  client_phone: string | null;
  subject: string;
  category_id: string | null;
  priority: string;
  status: string;
  order_number: string | null;
  service_number: string | null;
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
  const [callCounts, setCallCounts] = useState<Record<string, number>>({});
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [allTags, setAllTags] = useState<{ id: string; name: string; color: string | null }[]>([]);
  const [ticketTagsMap, setTicketTagsMap] = useState<Record<string, string[]>>({});
  const [agents, setAgents] = useState<{ id: string; full_name: string; avatar_url?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [slaFilter, setSlaFilter] = useState<string>("all");
  const [view, setView] = useState<"list" | "kanban">("kanban");
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [emailUnreadCounts, setEmailUnreadCounts] = useState<Record<string, number>>({});
  const [agentRepliedMap, setAgentRepliedMap] = useState<Record<string, boolean>>({});
  const [attachmentInfoMap, setAttachmentInfoMap] = useState<Record<string, AttachmentInfo>>({});
  const [fetchKey, setFetchKey] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { statuses, statusLabels } = useTicketStatuses();

  const refreshTickets = () => setFetchKey((k) => k + 1);

  const markTicketAsRead = useCallback(async (ticketId: string) => {
    setUnreadCounts((prev) => {
      if (!prev[ticketId]) return prev;
      const next = { ...prev };
      delete next[ticketId];
      return next;
    });
    setEmailUnreadCounts((prev) => {
      if (!prev[ticketId]) return prev;
      const next = { ...prev };
      delete next[ticketId];
      return next;
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("ticket_read_status")
      .upsert(
        { ticket_id: ticketId, agent_id: user.id, last_read_at: new Date().toISOString() },
        { onConflict: "ticket_id,agent_id" }
      );

    if (error) {
      console.error("Erro ao marcar ticket como lido:", error.message);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      supabase.from("categories").select("id, name"),
      supabase.rpc("get_agent_profiles"),
      supabase.from("tags").select("id, name, color"),
    ]).then(async ([{ data: cats }, { data: profs }, { data: tagsData }]) => {
      setAllTags((tagsData as any[]) || []);
      const map: Record<string, string> = {};
      (cats || []).forEach((c: any) => { map[c.id] = c.name; });
      setCategories(map);
      
      const agentIds = ((profs as any[]) || []).map((p: any) => p.id);
      let avatarMap: Record<string, string | null> = {};
      if (agentIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, avatar_url").in("id", agentIds);
        (profiles as any[] || []).forEach((p: any) => { avatarMap[p.id] = p.avatar_url; });
      }
      
      setAgents(((profs as any[]) || []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name,
        avatar_url: avatarMap[p.id] || null,
      })));
    });
  }, []);

  useEffect(() => {
    const fetch = async () => {
      let query = supabase
        .from("tickets")
        .select("id, ticket_number, client_name, client_phone, subject, category_id, priority, status, order_number, service_number, created_at, assigned_to, sla_first_response_at, sla_resolution_at, sla_paused_at, sla_paused_total_seconds, first_responded_at, resolved_at, sla_stage_deadline_at")
        .order("created_at", { ascending: false });
      
      if (statusFilter !== "all") query = query.eq("status", statusFilter as any);
      if (priorityFilter !== "all") query = query.eq("priority", priorityFilter as any);
      if (agentFilter !== "all") query = query.eq("assigned_to", agentFilter);

      const [{ data }, { data: callData }, { data: ttData }] = await Promise.all([
        query.limit(200),
        supabase.from("phone_calls").select("ticket_id").not("ticket_id", "is", null),
        supabase.from("ticket_tags").select("ticket_id, tag_id"),
      ]);
      setTickets((data as TicketRow[]) || []);
      // Group call counts by ticket_id
      const counts: Record<string, number> = {};
      (callData || []).forEach((c: any) => {
        counts[c.ticket_id] = (counts[c.ticket_id] || 0) + 1;
      });
      setCallCounts(counts);
      // Group tags by ticket_id
      const tagsMap: Record<string, string[]> = {};
      (ttData || []).forEach((tt: any) => {
        if (!tagsMap[tt.ticket_id]) tagsMap[tt.ticket_id] = [];
        tagsMap[tt.ticket_id].push(tt.tag_id);
      });
      setTicketTagsMap(tagsMap);

      // Fetch attachment info per ticket
      if (data && data.length > 0) {
        const tIds = data.map((t: any) => t.id);
        const { data: attData } = await supabase
          .from("ticket_attachments")
          .select("ticket_id, file_type")
          .in("ticket_id", tIds);
        const attMap: Record<string, AttachmentInfo> = {};
        (attData || []).forEach((a: any) => {
          if (!attMap[a.ticket_id]) attMap[a.ticket_id] = { count: 0, hasImages: false, hasVideos: false };
          attMap[a.ticket_id].count++;
          if (a.file_type?.startsWith("image/")) attMap[a.ticket_id].hasImages = true;
          if (a.file_type?.startsWith("video/")) attMap[a.ticket_id].hasVideos = true;
        });
        setAttachmentInfoMap(attMap);
      }

      setLoading(false);

      // Fetch unread message counts and agent-replied status
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser && data && data.length > 0) {
        const ticketIds = data.map((t: any) => t.id);
        const [{ data: readStatuses }, { data: clientMsgs }, { data: emailThreads }, { data: lastMsgs }] = await Promise.all([
          supabase.from("ticket_read_status").select("ticket_id, last_read_at").in("ticket_id", ticketIds),
          supabase.from("ticket_messages").select("ticket_id, created_at, sender_type").eq("sender_type", "client").in("ticket_id", ticketIds),
          supabase.from("email_threads").select("ticket_id").in("ticket_id", ticketIds),
          // Fetch the most recent message per ticket to determine if agent replied last
          supabase.from("ticket_messages").select("ticket_id, sender_type, created_at").in("ticket_id", ticketIds).order("created_at", { ascending: false }),
        ]);
        const readMap: Record<string, string> = {};
        (readStatuses || []).forEach((r: any) => { readMap[r.ticket_id] = r.last_read_at; });
        const emailTicketIds = new Set(((emailThreads as any[]) || []).map((t: any) => t.ticket_id));
        const unread: Record<string, number> = {};
        const emailUnread: Record<string, number> = {};
        (clientMsgs || []).forEach((m: any) => {
          const lastRead = readMap[m.ticket_id];
          if (!lastRead || new Date(m.created_at) > new Date(lastRead)) {
            unread[m.ticket_id] = (unread[m.ticket_id] || 0) + 1;
            if (emailTicketIds.has(m.ticket_id)) {
              emailUnread[m.ticket_id] = (emailUnread[m.ticket_id] || 0) + 1;
            }
          }
        });
        setUnreadCounts(unread);
        setEmailUnreadCounts(emailUnread);

        // Determine agent-replied: last message is from agent AND there are client messages in the thread
        const replied: Record<string, boolean> = {};
        const seenTickets = new Set<string>();
        (lastMsgs || []).forEach((m: any) => {
          if (!seenTickets.has(m.ticket_id)) {
            seenTickets.add(m.ticket_id);
            // Only mark as "replied" if the last message is from an agent AND ticket had client messages
            if (m.sender_type === "agent" && emailTicketIds.has(m.ticket_id)) {
              replied[m.ticket_id] = true;
            }
          }
        });
        setAgentRepliedMap(replied);
      }
    };
    fetch();
  }, [statusFilter, priorityFilter, agentFilter, fetchKey]);

  // Refresh when navigating back to this page (location.key changes on each navigation)
  useEffect(() => {
    refreshTickets();
  }, [location.key]);

  // Pre-compute SLA counts (before SLA filter, but after other filters)
  const preSlaCounts = (() => {
    const counts = { breached: 0, at_risk: 0, on_track: 0, completed: 0, no_sla: 0 };
    tickets.forEach((t) => {
      const q = search.toLowerCase();
      const matchesSearch =
        t.client_name.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        (t.order_number && t.order_number.toLowerCase().includes(q)) ||
        (t.service_number && t.service_number.toLowerCase().includes(q)) ||
        (t.client_phone && t.client_phone.includes(search)) ||
        String(t.ticket_number).includes(search);
      if (!matchesSearch) return;
      const s = getTicketSlaStatus(t);
      if (s in counts) counts[s as keyof typeof counts]++;
    });
    return counts;
  })();

  const filtered = tickets.filter((t) => {
    const q = search.toLowerCase();
    const matchesSearch =
      t.client_name.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      (t.order_number && t.order_number.toLowerCase().includes(q)) ||
      (t.service_number && t.service_number.toLowerCase().includes(q)) ||
      (t.client_phone && t.client_phone.includes(search)) ||
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

  const agentProfiles = agents.reduce((acc, a) => {
    acc[a.id] = { full_name: a.full_name, avatar_url: a.avatar_url || null };
    return acc;
  }, {} as Record<string, { full_name: string; avatar_url: string | null }>);

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <PageHeader
        title="Tickets"
        subtitle={`${filtered.length} ticket${filtered.length === 1 ? "" : "s"} · gestão de suporte`}
        icon={<Ticket className="h-5 w-5" />}
        accent="primary"
        actions={
          <>
            <div className="flex border border-border/60 rounded-lg overflow-hidden bg-card/80 backdrop-blur-sm">
              <Button variant={view === "list" ? "secondary" : "ghost"} size="icon" className="h-9 w-9 rounded-none" onClick={() => setView("list")}>
                <List className="h-4 w-4" />
              </Button>
              <Button variant={view === "kanban" ? "secondary" : "ghost"} size="icon" className="h-9 w-9 rounded-none" onClick={() => setView("kanban")}>
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={() => navigate("/tickets/new")} className="shadow-soft">
              <Plus className="mr-2 h-4 w-4" /> Novo Ticket
            </Button>
          </>
        }
      />

      {!loading && <SlaDashboard tickets={filtered as SlaTicket[]} />}

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Pesquisar por nome, telefone, assunto, nº encomenda, nº assistência..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
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
        <KanbanBoard tickets={filtered} categoryNames={categories} onTicketMoved={refreshTickets} onOpenTicket={markTicketAsRead} callCounts={callCounts} agentProfiles={agentProfiles} unreadCounts={unreadCounts} emailUnreadCounts={emailUnreadCounts} ticketTagsMap={ticketTagsMap} allTags={allTags} agentRepliedMap={agentRepliedMap} attachmentInfoMap={attachmentInfoMap} />
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
                    onClick={() => { void markTicketAsRead(t.id); navigate(`/tickets/${t.id}`); }}
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
                      {attachmentInfoMap[t.id] && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                              {attachmentInfoMap[t.id].hasImages ? <Image className="h-3.5 w-3.5 text-blue-500" /> :
                               attachmentInfoMap[t.id].hasVideos ? <Video className="h-3.5 w-3.5 text-purple-500" /> :
                               <Paperclip className="h-3.5 w-3.5" />}
                              <span className="text-xs">{attachmentInfoMap[t.id].count}</span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent><p className="text-xs">{attachmentInfoMap[t.id].count} anexo(s){attachmentInfoMap[t.id].hasImages ? " · fotos" : ""}{attachmentInfoMap[t.id].hasVideos ? " · vídeos" : ""}</p></TooltipContent>
                        </Tooltip>
                      )}
                      {callCounts[t.id] > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-0.5 text-muted-foreground cursor-default">
                              <Phone className="h-3.5 w-3.5" />
                              <span className="text-xs">{callCounts[t.id]}</span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent><p className="text-xs">{callCounts[t.id]} ligação(ões) vinculada(s)</p></TooltipContent>
                        </Tooltip>
                      )}
                      <SlaIcon status={getTicketSlaStatus(t)} ticket={t as SlaTicket} />
                      {(ticketTagsMap[t.id] || []).map((tagId) => {
                        const tag = allTags.find((at) => at.id === tagId);
                        if (!tag) return null;
                        return (
                          <Badge key={tagId} className="text-[10px] text-white border-0" style={{ backgroundColor: tag.color || "#6b7280" }}>
                            {tag.name}
                          </Badge>
                        );
                      })}
                      {t.category_id && <Badge variant="outline" className="text-xs">{categories[t.category_id] || t.category_id}</Badge>}
                       {emailUnreadCounts[t.id] > 0 ? (
                         <Badge className="text-[10px] h-5 min-w-[20px] justify-center gap-0.5 bg-blue-500 hover:bg-blue-600 text-white border-0 animate-pulse">
                           <Mail className="h-3 w-3" />
                           {emailUnreadCounts[t.id]}
                         </Badge>
                       ) : agentRepliedMap[t.id] ? (
                         <Tooltip>
                           <TooltipTrigger asChild>
                             <span className="inline-flex items-center">
                               <MailCheck className="h-4 w-4 text-success" />
                             </span>
                           </TooltipTrigger>
                           <TooltipContent><p className="text-xs">Cliente respondido</p></TooltipContent>
                         </Tooltip>
                       ) : null}
                       {unreadCounts[t.id] > 0 && !emailUnreadCounts[t.id] && (
                         <Badge variant="destructive" className="text-[10px] h-5 min-w-[20px] justify-center">
                           {unreadCounts[t.id]}
                         </Badge>
                       )}
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
