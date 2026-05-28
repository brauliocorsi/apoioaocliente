import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClientAuth } from "@/hooks/useClientAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";

interface ClientNotif {
  id: string;
  ticket_id: string | null;
  type: string;
  title: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
}

export default function ClientNotificationBell() {
  const { user } = useClientAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<ClientNotif[]>([]);
  const [open, setOpen] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("client_notifications" as any)
      .select("id, ticket_id, type, title, message, is_read, created_at")
      .eq("client_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data as unknown as ClientNotif[]) || []);
  }, [user]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`client-notifs-${user.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "client_notifications",
        filter: `client_user_id=eq.${user.id}`,
      }, () => fetchItems())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, fetchItems]);

  const unread = items.filter((n) => !n.is_read).length;

  const markRead = async (id: string) => {
    await supabase.from("client_notifications" as any)
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id);
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("client_notifications" as any)
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("client_user_id", user.id).eq("is_read", false);
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleClick = (n: ClientNotif) => {
    markRead(n.id);
    if (n.ticket_id) navigate(`/portal/tickets/${n.ticket_id}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
              {unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h4 className="text-sm font-semibold">Notificações</h4>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary hover:underline">
              Marcar todas como lidas
            </button>
          )}
        </div>
        <ScrollArea className="max-h-[420px]">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sem notificações</p>
          ) : (
            <div className="divide-y">
              {items.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors ${!n.is_read ? "bg-primary/5" : ""}`}
                  onClick={() => handleClick(n)}
                >
                  <p className="text-sm font-medium leading-tight">{n.title}</p>
                  {n.message && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground/70 mt-1">
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
