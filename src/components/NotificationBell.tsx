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
  Ticket as TicketIcon,
  Phone,
  CheckCheck,
  Clock,
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
    case "mention":
      return "Menção";
    case "phone_call_assigned":
      return "Chamada atribuída";
    case "approval_request":
      return "Pedido de aprovação";
    case "approval_response":
      return "Resposta de aprovação";
    case "reminder":
      return "Lembrete";
    default:
      return "Notificação";
  }
}

function typeIcon(type: string) {
  switch (type) {
    case "mention":
      return <AtSign className="h-3.5 w-3.5" />;
    case "phone_call_assigned":
      return <Phone className="h-3.5 w-3.5" />;
    case "approval_request":
    case "approval_response":
      return <CheckCheck className="h-3.5 w-3.5" />;
    case "reminder":
      return <Clock className="h-3.5 w-3.5" />;
    default:
      return <Bell className="h-3.5 w-3.5" />;
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
  const [tab, setTab] = useState<"all" | "mentions" | "tickets" | "messages" | "ops">("all");

  const fetchAgentNotifs = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("agent_notifications")
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    const rows = (data as AgentNotification[]) || [];
    setAgentNotifs(rows);

    const senderIds = [...new Set(rows.map((n) => n.sender_id).filter(Boolean))] as string[];
    if (senderIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", senderIds);
      const map: Record<string, string> = {};
      (profiles || []).forEach((p: any) => {
        map[p.id] = p.full_name;
      });
      setSenderNames(map);
    }
  }, [user]);

  const fetchUnreadMessages = useCallback(async () => {
    if (!user) return;
    const [{ data: readStatuses }, { data: clientMsgs }] = await Promise.all([
      supabase.from("ticket_read_status").select("ticket_id, last_read_at"),
      supabase
        .from("ticket_messages")
        .select("ticket_id, created_at")
        .eq("sender_type", "client")
        .order("created_at", { ascending: false }),
    ]);

    const readMap: Record<string, string> = {};
    (readStatuses || []).forEach((r: any) => {
      readMap[r.ticket_id] = r.last_read_at;
    });

    const ticketUnread: Record<string, { count: number; latest_at: string }> = {};
    (clientMsgs || []).forEach((m: any) => {
      const lastRead = readMap[m.ticket_id];
      if (!lastRead || new Date(m.created_at) > new Date(lastRead)) {
        if (!ticketUnread[m.ticket_id]) {
          ticketUnread[m.ticket_id] = { count: 0, latest_at: m.created_at };
        }
        ticketUnread[m.ticket_id].count++;
        if (new Date(m.created_at) > new Date(ticketUnread[m.ticket_id].latest_at)) {
          ticketUnread[m.ticket_id].latest_at = m.created_at;
        }
      }
    });

    const ticketIds = Object.keys(ticketUnread);
    if (ticketIds.length === 0) {
      setUnreadTickets([]);
      return;
    }

    const { data: tickets } = await supabase
      .from("tickets")
      .select("id, ticket_number, subject")
      .in("id", ticketIds);

    const result: UnreadTicket[] = (tickets || [])
      .map((t: any) => ({
        ticket_id: t.id,
        ticket_number: t.ticket_number,
        subject: t.subject,
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
      .order("created_at", { ascending: false })
      .limit(30);
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_notifications",
          filter: `recipient_id=eq.${user.id}`,
        },
        () => fetchAgentNotifs(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ticket_messages" },
        () => fetchUnreadMessages(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ticket_read_status" },
        () => fetchUnreadMessages(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchOpNotifications(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchAgentNotifs, fetchUnreadMessages, fetchOpNotifications]);

  const mentions = useMemo(
    () => agentNotifs.filter((n) => MENTION_TYPES.has(n.type)),
    [agentNotifs],
  );
  const ticketNotifs = useMemo(
    () => agentNotifs.filter((n) => !MENTION_TYPES.has(n.type)),
    [agentNotifs],
  );

  const unreadMentions = mentions.filter((n) => !n.is_read).length;
  const unreadTicketNotifs = ticketNotifs.filter((n) => !n.is_read).length;
  const unreadOpCount = opNotifications.filter((n) => !n.is_read).length;
  const unreadMsgCount = unreadTickets.reduce((sum, t) => sum + t.count, 0);
  const totalBadge =
    unreadMentions + unreadTicketNotifs + unreadMsgCount + unreadOpCount;

  const markAgentRead = async (id: string) => {
    setAgentNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await supabase.from("agent_notifications").update({ is_read: true }).eq("id", id);
  };

  const markOpRead = async (id: string) => {
    setOpNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    await supabase
      .from("notifications" as any)
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id);
  };

  const markTicketMessagesRead = async (ticketId: string) => {
    if (!user) return;
    setUnreadTickets((prev) => prev.filter((t) => t.ticket_id !== ticketId));
    await supabase
      .from("ticket_read_status")
      .upsert(
        { ticket_id: ticketId, agent_id: user.id, last_read_at: new Date().toISOString() },
        { onConflict: "ticket_id,agent_id" },
      );
  };

  const markAllRead = async () => {
    if (!user) return;
    const now = new Date().toISOString();

    setAgentNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setOpNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    const ticketsToMark = unreadTickets.map((t) => t.ticket_id);
    setUnreadTickets([]);

    await Promise.all([
      supabase
        .from("agent_notifications")
        .update({ is_read: true })
        .eq("recipient_id", user.id)
        .eq("is_read", false),
      supabase
        .from("notifications" as any)
        .update({ is_read: true, read_at: now })
        .eq("user_id", user.id)
        .eq("is_read", false),
      ticketsToMark.length > 0
        ? supabase.from("ticket_read_status").upsert(
            ticketsToMark.map((tid) => ({
              ticket_id: tid,
              agent_id: user.id,
              last_read_at: now,
            })),
            { onConflict: "ticket_id,agent_id" },
          )
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

  const renderAgentItem = (n: AgentNotification) => (
    <button
      key={n.id}
      onClick={() => handleClickAgent(n)}
      className={cn(
        "w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/60 transition-colors",
        !n.is_read && "bg-primary/5",
      )}
    >
      <div
        className={cn(
          "mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0 ring-1",
          n.type === "mention"
            ? "bg-amber-500/15 text-amber-600 ring-amber-500/30"
            : "bg-primary/10 text-primary ring-primary/20",
        )}
      >
        {typeIcon(n.type)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Badge
            variant="outline"
            className={cn(
              "h-4 px-1.5 text-[10px] font-medium",
              n.type === "mention" && "border-amber-500/40 text-amber-700",
            )}
          >
            {typeLabel(n.type)}
          </Badge>
          {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
        </div>
        <p className="text-sm leading-snug">
          {n.sender_id && senderNames[n.sender_id] && (
            <span className="font-medium">{senderNames[n.sender_id]} </span>
          )}
          {n.content}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">
          {formatRelative(n.created_at)}
        </p>
      </div>
    </button>
  );

  const renderTicketMessage = (t: UnreadTicket) => (
    <button
      key={t.ticket_id}
      onClick={() => handleClickUnreadTicket(t)}
      className="w-full text-left px-4 py-3 cursor-pointer hover:bg-muted/60 transition-colors bg-primary/5 flex items-start gap-3"
    >
      <div className="mt-0.5 h-8 w-8 rounded-full bg-info/15 text-info ring-1 ring-info/30 flex items-center justify-center shrink-0">
        <MessageSquare className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight truncate">
          #{t.ticket_number} – {t.subject}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t.count === 1 ? "1 mensagem por responder" : `${t.count} mensagens por responder`}
        </p>
        <p className="text-[11px] text-muted-foreground/70 mt-0.5">
          {formatRelative(t.latest_at)}
        </p>
      </div>
      <Badge variant="destructive" className="shrink-0 h-5 min-w-5 rounded-full px-1.5 text-[10px] mt-0.5">
        {t.count}
      </Badge>
    </button>
  );

  const renderOp = (n: OpNotification) => (
    <button
      key={n.id}
      onClick={() => handleClickOp(n)}
      className={cn(
        "w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/60 transition-colors",
        !n.is_read && "bg-amber-50 dark:bg-amber-950/20",
      )}
    >
      <div className="mt-0.5 h-8 w-8 rounded-full bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/30 flex items-center justify-center shrink-0">
        <AlertTriangle className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {n.priority === "urgent" && (
            <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">Urgente</Badge>
          )}
          {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
        </div>
        <p className="text-sm font-medium leading-tight">{n.title}</p>
        {n.message && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
        )}
        <p className="text-[11px] text-muted-foreground/70 mt-1">
          {formatRelative(n.created_at)}
        </p>
      </div>
    </button>
  );

  const sectionHeader = (
    icon: React.ReactNode,
    label: string,
    count: number,
    tone: "primary" | "amber" | "info" = "primary",
  ) => (
    <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 border-b border-t first:border-t-0">
      <span
        className={cn(
          tone === "amber" && "text-amber-600",
          tone === "info" && "text-info",
          tone === "primary" && "text-primary",
        )}
      >
        {icon}
      </span>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {count > 0 && (
        <Badge variant="destructive" className="ml-auto h-4 min-w-4 rounded-full px-1 text-[10px]">
          {count}
        </Badge>
      )}
    </div>
  );

  const hasAny =
    agentNotifs.length > 0 || unreadTickets.length > 0 || opNotifications.length > 0;

  const filteredView = () => {
    if (tab === "mentions") {
      return mentions.length === 0 ? (
        <EmptyState text="Sem menções" />
      ) : (
        <div className="divide-y">{mentions.map(renderAgentItem)}</div>
      );
    }
    if (tab === "tickets") {
      return ticketNotifs.length === 0 ? (
        <EmptyState text="Sem notificações de tickets" />
      ) : (
        <div className="divide-y">{ticketNotifs.map(renderAgentItem)}</div>
      );
    }
    if (tab === "messages") {
      return unreadTickets.length === 0 ? (
        <EmptyState text="Sem mensagens por ler" />
      ) : (
        <div className="divide-y">{unreadTickets.map(renderTicketMessage)}</div>
      );
    }
    if (tab === "ops") {
      return opNotifications.length === 0 ? (
        <EmptyState text="Sem alertas operacionais" />
      ) : (
        <div className="divide-y">{opNotifications.map(renderOp)}</div>
      );
    }
    // all
    if (!hasAny) return <EmptyState text="Sem notificações" />;
    return (
      <div>
        {mentions.length > 0 && (
          <>
            {sectionHeader(<AtSign className="h-3.5 w-3.5" />, "Menções (timeline)", unreadMentions, "amber")}
            <div className="divide-y">{mentions.map(renderAgentItem)}</div>
          </>
        )}
        {unreadTickets.length > 0 && (
          <>
            {sectionHeader(<MessageSquare className="h-3.5 w-3.5" />, "Mensagens de clientes", unreadMsgCount, "info")}
            <div className="divide-y">{unreadTickets.map(renderTicketMessage)}</div>
          </>
        )}
        {ticketNotifs.length > 0 && (
          <>
            {sectionHeader(<TicketIcon className="h-3.5 w-3.5" />, "Notificações de tickets", unreadTicketNotifs, "primary")}
            <div className="divide-y">{ticketNotifs.map(renderAgentItem)}</div>
          </>
        )}
        {opNotifications.length > 0 && (
          <>
            {sectionHeader(<AlertTriangle className="h-3.5 w-3.5" />, "Operacional", unreadOpCount, "amber")}
            <div className="divide-y">{opNotifications.map(renderOp)}</div>
          </>
        )}
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {totalBadge > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full p-0 px-1 flex items-center justify-center text-[10px]"
            >
              {totalBadge > 99 ? "99+" : totalBadge}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h4 className="text-sm font-semibold">Notificações</h4>
            {totalBadge > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {totalBadge} por ler
              </p>
            )}
          </div>
          {totalBadge > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllRead}
              className="h-7 text-xs gap-1"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar todas
            </Button>
          )}
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="w-full h-auto p-1 rounded-none bg-muted/40 border-b grid grid-cols-5">
            <TabsTrigger value="all" className="text-[11px] h-7">
              Tudo
            </TabsTrigger>
            <TabsTrigger value="mentions" className="text-[11px] h-7 gap-1">
              Menções
              {unreadMentions > 0 && (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              )}
            </TabsTrigger>
            <TabsTrigger value="messages" className="text-[11px] h-7 gap-1">
              Msgs
              {unreadMsgCount > 0 && (
                <span className="h-1.5 w-1.5 rounded-full bg-info" />
              )}
            </TabsTrigger>
            <TabsTrigger value="tickets" className="text-[11px] h-7 gap-1">
              Tickets
              {unreadTicketNotifs > 0 && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </TabsTrigger>
            <TabsTrigger value="ops" className="text-[11px] h-7 gap-1">
              Op.
              {unreadOpCount > 0 && (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="m-0">
            <ScrollArea className="max-h-[460px]">{filteredView()}</ScrollArea>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <Bell className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
