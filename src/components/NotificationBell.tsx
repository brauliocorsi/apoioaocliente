import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell } from "lucide-react";
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

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("agent_notifications")
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setNotifications((data as Notification[]) || []);

    // Fetch sender names
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

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "agent_notifications",
        filter: `recipient_id=eq.${user.id}`,
      }, () => { fetchNotifications(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markRead = async (id: string) => {
    await supabase.from("agent_notifications").update({ is_read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("agent_notifications").update({ is_read: true }).eq("recipient_id", user.id).eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleClick = (n: Notification) => {
    markRead(n.id);
    if (n.ticket_id) {
      navigate(`/tickets/${n.ticket_id}`);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
              {unreadCount}
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
        <ScrollArea className="max-h-[400px]">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sem notificações</p>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors ${!n.is_read ? "bg-primary/5" : ""}`}
                  onClick={() => handleClick(n)}
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
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
