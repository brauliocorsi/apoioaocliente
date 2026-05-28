import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, MessageSquare, AlertTriangle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";

interface Notification {
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

// Fase 5B: new operational notifications table
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

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [opNotifications, setOpNotifications] = useState<OpNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [unreadTickets, setUnreadTickets] = useState<UnreadTicket[]>([]);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("agent_notifications")
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setNotifications((data as Notification[]) || []);

    const senderIds = [...new Set((data || []).map((n: any) => n.sender_id).filter(Boolean))];
    if (senderIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", senderIds);
      const map: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { map[p.id] = p.full_name; });
      setSenderNames(map);
    }
  }, [user]);

  const fetchUnreadMessages = useCallback(async () => {
    if (!user) return;
    const [{ data: readStatuses }, { data: clientMsgs }] = await Promise.all([
      supabase.from("ticket_read_status").select("ticket_id, last_read_at"),
      supabase.from("ticket_messages")
        .select("ticket_id, created_at")
        .eq("sender_type", "client")
        .order("created_at", { ascending: false }),
    ]);

    const readMap: Record<string, string> = {};
    (readStatuses || []).forEach((r: any) => { readMap[r.ticket_id] = r.last_read_at; });

    // Group unread messages per ticket
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

    // Fetch ticket info for those tickets
    const { data: tickets } = await supabase
      .from("tickets")
      .select("id, ticket_number, subject")
      .in("id", ticketIds);

    const result: UnreadTicket[] = (tickets || []).map((t: any) => ({
      ticket_id: t.id,
      ticket_number: t.ticket_number,
      subject: t.subject,
      count: ticketUnread[t.id]?.count || 0,
      latest_at: ticketUnread[t.id]?.latest_at || "",
    })).sort((a, b) => new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime());

    setUnreadTickets(result);
  }, [user]);

  // Fase 5B: load operational notifications
  const fetchOpNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setOpNotifications((data as OpNotification[]) || []);
  }, [user]);

  useEffect(() => {
    fetchNotifications();
    fetchUnreadMessages();
    fetchOpNotifications();
  }, [fetchNotifications, fetchUnreadMessages, fetchOpNotifications]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "agent_notifications",
        filter: `recipient_id=eq.${user.id}`,
      }, () => { fetchNotifications(); fetchUnreadMessages(); })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "ticket_messages",
      }, () => { fetchUnreadMessages(); })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, () => { fetchOpNotifications(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchNotifications, fetchUnreadMessages, fetchOpNotifications]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const unreadOpCount = opNotifications.filter((n) => !n.is_read).length;
  const unreadMsgCount = unreadTickets.reduce((sum, t) => sum + t.count, 0);
  const totalBadge = unreadCount + unreadMsgCount + unreadOpCount;

  const markRead = async (id: string) => {
    await supabase.from("agent_notifications").update({ is_read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  };

  const markOpRead = async (id: string) => {
    await supabase.from("notifications" as any).update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
    setOpNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    if (!user) return;
    await Promise.all([
      supabase.from("agent_notifications").update({ is_read: true }).eq("recipient_id", user.id).eq("is_read", false),
      supabase.from("notifications" as any).update({ is_read: true, read_at: new Date().toISOString() }).eq("user_id", user.id).eq("is_read", false),
    ]);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setOpNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleClickOpNotification = (n: OpNotification) => {
    markOpRead(n.id);
    if (n.ticket_id) navigate(`/tickets/${n.ticket_id}`);
    else if (n.inbound_email_event_id) navigate("/inbound-events");
    setOpen(false);
  };

  const handleClickNotification = (n: Notification) => {
    markRead(n.id);
    if (n.ticket_id) {
      navigate(`/tickets/${n.ticket_id}`);
    } else if (n.type === "phone_call_assigned") {
      navigate("/phone-calls");
    }
    setOpen(false);
  };

  const handleClickUnreadTicket = (ticketId: string) => {
    navigate(`/tickets/${ticketId}`);
    setOpen(false);
  };

  const hasAny = notifications.length > 0 || unreadTickets.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {totalBadge > 0 && (
            <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
              {totalBadge}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h4 className="text-sm font-semibold">Notificações</h4>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary hover:underline">
              Marcar todas como lidas
            </button>
          )}
        </div>

        <ScrollArea className="max-h-[420px]">
          {!hasAny ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sem notificações</p>
          ) : (
            <div>
              {/* Section: Unread client messages */}
              {unreadTickets.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 border-b">
                    <MessageSquare className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                      Mensagens de clientes
                    </span>
                    <Badge variant="destructive" className="ml-auto h-4 min-w-4 rounded-full px-1 text-[10px]">
                      {unreadMsgCount}
                    </Badge>
                  </div>
                  <div className="divide-y">
                    {unreadTickets.map((t) => (
                      <div
                        key={t.ticket_id}
                        className="px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors bg-primary/5 flex items-start gap-3"
                        onClick={() => handleClickUnreadTicket(t.ticket_id)}
                      >
                        <div className="mt-0.5 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <MessageSquare className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-tight truncate">
                            #{t.ticket_number} – {t.subject}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t.count === 1
                              ? "1 mensagem por responder"
                              : `${t.count} mensagens por responder`}
                          </p>
                          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                            {new Date(t.latest_at).toLocaleString("pt-PT")}
          </p>
                        </div>
                        <Badge variant="destructive" className="shrink-0 h-5 min-w-5 rounded-full px-1.5 text-[10px] mt-0.5">
                          {t.count}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section: System notifications */}
              {notifications.length > 0 && (
                <div>
                  {unreadTickets.length > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 border-b border-t">
                      <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Notificações do sistema
                      </span>
                      {unreadCount > 0 && (
                        <Badge className="ml-auto h-4 min-w-4 rounded-full px-1 text-[10px]">
                          {unreadCount}
                        </Badge>
                      )}
                    </div>
                  )}
                  <div className="divide-y">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors ${!n.is_read ? "bg-primary/5" : ""}`}
                        onClick={() => handleClickNotification(n)}
                      >
                        <p className="text-sm">
                          {n.sender_id && senderNames[n.sender_id] && (
                            <span className="font-medium">{senderNames[n.sender_id]} </span>
                          )}
                          {n.content}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(n.created_at).toLocaleString("pt-PT")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
