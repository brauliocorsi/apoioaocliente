import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  MessageSquare,
  AlertTriangle,
  AtSign,
  Phone,
  CheckCheck,
  Clock,
  History,
  Sparkles,
  Inbox,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface AgentNotification {
  id: string;
  sender_id: string | null;
  ticket_id: string | null;
  type: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

interface UnreadTicket {
  ticket_id: string;
  ticket_number: number;
  subject: string;
  count: number;
  latest_at: string;
}

interface OpNotification {
  id: string;
  user_id: string;
  ticket_id: string | null;
  inbound_email_event_id: string | null;
  type: string;
  title: string;
  message: string | null;
  priority: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

const MENTION_TYPES = new Set(["mention"]);

function formatRelative(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "agora mesmo";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  return d.toLocaleString("pt-PT");
}

function typeLabel(type: string) {
  switch (type) {
    case "mention": return "Menção";
    case "phone_call_assigned": return "Chamada atribuída";
    case "approval_request": return "Pedido de aprovação";
    case "approval_response": return "Resposta de aprovação";
    case "reminder": return "Lembrete";
    default: return "Notificação";
  }
}

function typeIcon(type: string) {
  switch (type) {
    case "mention": return <AtSign className="h-4 w-4" />;
    case "phone_call_assigned": return <Phone className="h-4 w-4" />;
    case "approval_request":
    case "approval_response": return <CheckCheck className="h-4 w-4" />;
    case "reminder": return <Clock className="h-4 w-4" />;
    default: return <Bell className="h-4 w-4" />;
  }
}

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [agentNotifs, setAgentNotifs] = useState<AgentNotification[]>([]);
  const [opNotifications, setOpNotifications] = useState<OpNotification[]>([]);
  const [unreadTickets, setUnreadTickets] = useState<UnreadTicket[]>([]);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "mentions" | "messages" | "tickets" | "ops">("all");

  const fetchAgentNotifs = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("agent_notifications")
      .select("*")
      .eq("recipient_id", user.id)
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(50);
    const rows = (data as AgentNotification[]) || [];
    setAgentNotifs(rows);
    const senderIds = [...new Set(rows.map((n) => n.sender_id).filter(Boolean))] as string[];
    if (senderIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles").select("id, full_name").in("id", senderIds);
      const map: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { map[p.id] = p.full_name; });
      setSenderNames(map);
    }
  }, [user]);

  const fetchUnreadMessages = useCallback(async () => {
    if (!user) return;
    const [{ data: readStatuses }, { data: clientMsgs }] = await Promise.all([
      supabase.from("ticket_read_status").select("ticket_id, last_read_at"),
      supabase.from("ticket_messages").select("ticket_id, created_at")
        .eq("sender_type", "client").order("created_at", { ascending: false }),
    ]);
    const readMap: Record<string, string> = {};
    (readStatuses || []).forEach((r: any) => { readMap[r.ticket_id] = r.last_read_at; });
    const ticketUnread: Record<string, { count: number; latest_at: string }> = {};
    (clientMsgs || []).forEach((m: any) => {
      const lastRead = readMap[m.ticket_id];
      if (!lastRead || new Date(m.created_at) > new Date(lastRead)) {
        if (!ticketUnread[m.ticket_id]) ticketUnread[m.ticket_id] = { count: 0, latest_at: m.created_at };
        ticketUnread[m.ticket_id].count++;
        if (new Date(m.created_at) > new Date(ticketUnread[m.ticket_id].latest_at)) {
          ticketUnread[m.ticket_id].latest_at = m.created_at;
        }
      }
    });
    const ticketIds = Object.keys(ticketUnread);
    if (ticketIds.length === 0) { setUnreadTickets([]); return; }
    const { data: tickets } = await supabase
      .from("tickets").select("id, ticket_number, subject").in("id", ticketIds);
    const result: UnreadTicket[] = (tickets || [])
      .map((t: any) => ({
        ticket_id: t.id, ticket_number: t.ticket_number, subject: t.subject,
        count: ticketUnread[t.id]?.count || 0,
        latest_at: ticketUnread[t.id]?.latest_at || "",
      }))
      .sort((a, b) => new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime());
    setUnreadTickets(result);
  }, [user]);

  const fetchOpNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications" as any)
      .select("*")
      .eq("user_id", user.id)
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(50);
    setOpNotifications((data as unknown as OpNotification[]) || []);
  }, [user]);

  useEffect(() => {
    fetchAgentNotifs();
    fetchUnreadMessages();
    fetchOpNotifications();
  }, [fetchAgentNotifs, fetchUnreadMessages, fetchOpNotifications]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_notifications", filter: `recipient_id=eq.${user.id}` }, () => fetchAgentNotifs())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages" }, () => fetchUnreadMessages())
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket_read_status" }, () => fetchUnreadMessages())
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => fetchOpNotifications())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchAgentNotifs, fetchUnreadMessages, fetchOpNotifications]);

  const mentions = useMemo(() => agentNotifs.filter((n) => MENTION_TYPES.has(n.type)), [agentNotifs]);
  const ticketNotifs = useMemo(() => agentNotifs.filter((n) => !MENTION_TYPES.has(n.type)), [agentNotifs]);

  const unreadMentions = mentions.length;
  const unreadTicketNotifs = ticketNotifs.length;
  const unreadOpCount = opNotifications.length;
  const unreadMsgCount = unreadTickets.reduce((sum, t) => sum + t.count, 0);
  const totalBadge = unreadMentions + unreadTicketNotifs + unreadMsgCount + unreadOpCount;

  const markAgentRead = async (id: string) => {
    setAgentNotifs((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("agent_notifications").update({ is_read: true }).eq("id", id);
  };

  const markOpRead = async (id: string) => {
    setOpNotifications((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("notifications" as any)
      .update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
  };

  const markTicketMessagesRead = async (ticketId: string) => {
    if (!user) return;
    setUnreadTickets((prev) => prev.filter((t) => t.ticket_id !== ticketId));
    await supabase.from("ticket_read_status").upsert(
      { ticket_id: ticketId, agent_id: user.id, last_read_at: new Date().toISOString() },
      { onConflict: "ticket_id,agent_id" },
    );
  };

  const markAllRead = async () => {
    if (!user) return;
    const now = new Date().toISOString();
    setAgentNotifs([]);
    setOpNotifications([]);
    const ticketsToMark = unreadTickets.map((t) => t.ticket_id);
    setUnreadTickets([]);
    await Promise.all([
      supabase.from("agent_notifications").update({ is_read: true }).eq("recipient_id", user.id).eq("is_read", false),
      supabase.from("notifications" as any).update({ is_read: true, read_at: now }).eq("user_id", user.id).eq("is_read", false),
      ticketsToMark.length > 0
        ? supabase.from("ticket_read_status").upsert(
            ticketsToMark.map((tid) => ({ ticket_id: tid, agent_id: user.id, last_read_at: now })),
            { onConflict: "ticket_id,agent_id" })
        : Promise.resolve(),
    ]);
  };

  const handleClickAgent = (n: AgentNotification) => {
    markAgentRead(n.id);
    if (n.ticket_id) navigate(`/tickets/${n.ticket_id}`);
    else if (n.type === "phone_call_assigned") navigate("/phone-calls");
    setOpen(false);
  };

  const handleClickOp = (n: OpNotification) => {
    markOpRead(n.id);
    if (n.ticket_id) navigate(`/tickets/${n.ticket_id}`);
    else if (n.inbound_email_event_id) navigate("/inbound-events");
    setOpen(false);
  };

  const handleClickUnreadTicket = (t: UnreadTicket) => {
    markTicketMessagesRead(t.ticket_id);
    navigate(`/tickets/${t.ticket_id}`);
    setOpen(false);
  };

  const renderAgentItem = (n: AgentNotification) => {
    const isMention = n.type === "mention";
    return (
      <button
        key={n.id}
        onClick={() => handleClickAgent(n)}
        className="group w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/50 transition-all relative"
      >
        <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className={cn(
          "mt-0.5 h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
          isMention ? "bg-gradient-to-br from-warning/20 to-warning/5 text-warning ring-1 ring-warning/20"
                    : "bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/20",
        )}>
          {typeIcon(n.type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn(
              "text-[10px] font-semibold uppercase tracking-wider",
              isMention ? "text-warning" : "text-primary",
            )}>
              {typeLabel(n.type)}
            </span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
            <span className="text-[11px] text-muted-foreground">{formatRelative(n.created_at)}</span>
          </div>
          <p className="text-sm leading-snug text-foreground/90">
            {n.sender_id && senderNames[n.sender_id] && (
              <span className="font-semibold">{senderNames[n.sender_id]} </span>
            )}
            {n.content}
          </p>
        </div>
        <span className="mt-2 h-2 w-2 rounded-full bg-primary shrink-0 animate-pulse" />
      </button>
    );
  };

  const renderTicketMessage = (t: UnreadTicket) => (
    <button
      key={t.ticket_id}
      onClick={() => handleClickUnreadTicket(t)}
      className="group w-full text-left px-4 py-3 hover:bg-muted/50 transition-all flex items-start gap-3 relative"
    >
      <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-info opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="mt-0.5 h-10 w-10 rounded-xl bg-gradient-to-br from-info/20 to-info/5 text-info ring-1 ring-info/20 flex items-center justify-center shrink-0 shadow-sm">
        <MessageSquare className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-info">
            Mensagem cliente
          </span>
          <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
          <span className="text-[11px] text-muted-foreground">{formatRelative(t.latest_at)}</span>
        </div>
        <p className="text-sm font-medium leading-snug truncate text-foreground/90">
          #{t.ticket_number} – {t.subject}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t.count === 1 ? "1 mensagem por responder" : `${t.count} mensagens por responder`}
        </p>
      </div>
      <Badge variant="destructive" className="shrink-0 h-5 min-w-5 rounded-full px-1.5 text-[10px] mt-1 shadow-sm">
        {t.count}
      </Badge>
    </button>
  );

  const renderOp = (n: OpNotification) => (
    <button
      key={n.id}
      onClick={() => handleClickOp(n)}
      className="group w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/50 transition-all relative"
    >
      <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-warning opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="mt-0.5 h-10 w-10 rounded-xl bg-gradient-to-br from-warning/20 to-warning/5 text-warning ring-1 ring-warning/20 flex items-center justify-center shrink-0 shadow-sm">
        <AlertTriangle className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-warning">
            Operacional
          </span>
          {n.priority === "urgent" && (
            <Badge variant="destructive" className="h-4 px-1.5 text-[9px]">Urgente</Badge>
          )}
          <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
          <span className="text-[11px] text-muted-foreground">{formatRelative(n.created_at)}</span>
        </div>
        <p className="text-sm font-medium leading-snug text-foreground/90">{n.title}</p>
        {n.message && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
        )}
      </div>
      <span className="mt-2 h-2 w-2 rounded-full bg-warning shrink-0 animate-pulse" />
    </button>
  );

  const hasAny = agentNotifs.length > 0 || unreadTickets.length > 0 || opNotifications.length > 0;

  const filteredView = () => {
    if (tab === "mentions") {
      return mentions.length === 0 ? <EmptyState text="Sem menções por ler" />
        : <div className="divide-y divide-border/50">{mentions.map(renderAgentItem)}</div>;
    }
    if (tab === "tickets") {
      return ticketNotifs.length === 0 ? <EmptyState text="Sem notificações de tickets" />
        : <div className="divide-y divide-border/50">{ticketNotifs.map(renderAgentItem)}</div>;
    }
    if (tab === "messages") {
      return unreadTickets.length === 0 ? <EmptyState text="Sem mensagens por ler" />
        : <div className="divide-y divide-border/50">{unreadTickets.map(renderTicketMessage)}</div>;
    }
    if (tab === "ops") {
      return opNotifications.length === 0 ? <EmptyState text="Sem alertas operacionais" />
        : <div className="divide-y divide-border/50">{opNotifications.map(renderOp)}</div>;
    }
    if (!hasAny) return <EmptyState text="Tudo em dia" subtext="Não tens notificações por ler." celebrate />;
    return (
      <div className="divide-y divide-border/50">
        {mentions.map(renderAgentItem)}
        {unreadTickets.map(renderTicketMessage)}
        {ticketNotifs.map(renderAgentItem)}
        {opNotifications.map(renderOp)}
      </div>
    );
  };

  const tabPill = (value: typeof tab, label: string, count: number, dotClass: string) => (
    <TabsTrigger
      value={value}
      className="text-[11px] h-7 gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
    >
      {label}
      {count > 0 && (
        <span className={cn("h-4 min-w-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center text-white", dotClass)}>
          {count > 9 ? "9+" : count}
        </span>
      )}
    </TabsTrigger>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {totalBadge > 0 && (
            <>
              <span className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full bg-destructive animate-ping opacity-30" />
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full p-0 px-1 flex items-center justify-center text-[10px] shadow-md ring-2 ring-background"
              >
                {totalBadge > 99 ? "99+" : totalBadge}
              </Badge>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0 overflow-hidden border-border/60 shadow-xl" align="end">
        {/* Header with gradient */}
        <div className="relative px-4 py-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-b border-border/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shadow-sm">
                <Bell className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold leading-tight">Notificações</h4>
                <p className="text-[11px] text-muted-foreground">
                  {totalBadge > 0 ? `${totalBadge} por ler` : "Tudo em dia"}
                </p>
              </div>
            </div>
            {totalBadge > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllRead} className="h-7 text-[11px] gap-1 hover:bg-background/80">
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar todas
              </Button>
            )}
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="w-full h-auto p-1 rounded-none bg-muted/30 border-b border-border/60 grid grid-cols-5 gap-1">
            {tabPill("all", "Tudo", totalBadge, "bg-destructive")}
            {tabPill("mentions", "Menções", unreadMentions, "bg-warning")}
            {tabPill("messages", "Msgs", unreadMsgCount, "bg-info")}
            {tabPill("tickets", "Tickets", unreadTicketNotifs, "bg-primary")}
            {tabPill("ops", "Op.", unreadOpCount, "bg-warning")}
          </TabsList>
          <TabsContent value={tab} className="m-0">
            <ScrollArea className="h-[440px]">{filteredView()}</ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="border-t border-border/60 bg-muted/20 px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setOpen(false); navigate("/notifications"); }}
            className="w-full h-8 text-xs gap-2 justify-center text-muted-foreground hover:text-foreground"
          >
            <History className="h-3.5 w-3.5" />
            Ver histórico completo
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EmptyState({ text, subtext, celebrate }: { text: string; subtext?: string; celebrate?: boolean }) {
  return (
    <div className="px-4 py-16 text-center flex flex-col items-center">
      <div className={cn(
        "h-14 w-14 rounded-2xl flex items-center justify-center mb-3",
        celebrate ? "bg-gradient-to-br from-success/20 to-success/5 text-success ring-1 ring-success/20"
                  : "bg-muted text-muted-foreground/50",
      )}>
        {celebrate ? <Sparkles className="h-6 w-6" /> : <Inbox className="h-6 w-6" />}
      </div>
      <p className="text-sm font-medium text-foreground">{text}</p>
      {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
    </div>
  );
}
