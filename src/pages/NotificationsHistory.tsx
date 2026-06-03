import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bell, AtSign, MessageSquare, AlertTriangle, Phone, CheckCheck, Clock,
  Search, History, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

type UnifiedNotification = {
  id: string;
  source: "agent" | "op";
  type: string;
  title: string;
  content: string;
  ticket_id: string | null;
  is_read: boolean;
  created_at: string;
  sender_name?: string;
};

function formatFull(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatRelative(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `há ${Math.floor(diff / 86400)} d`;
  return d.toLocaleDateString("pt-PT");
}

function typeMeta(type: string) {
  switch (type) {
    case "mention":
      return { label: "Menção", icon: AtSign, tone: "warning" as const };
    case "phone_call_assigned":
      return { label: "Chamada", icon: Phone, tone: "primary" as const };
    case "approval_request":
    case "approval_response":
      return { label: "Aprovação", icon: CheckCheck, tone: "info" as const };
    case "reminder":
      return { label: "Lembrete", icon: Clock, tone: "primary" as const };
    case "client_message":
      return { label: "Cliente", icon: MessageSquare, tone: "info" as const };
    default:
      return { label: "Alerta", icon: AlertTriangle, tone: "warning" as const };
  }
}

const toneClasses = {
  primary: "bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-primary/20",
  warning: "bg-gradient-to-br from-warning/20 to-warning/5 text-warning ring-warning/20",
  info: "bg-gradient-to-br from-info/20 to-info/5 text-info ring-info/20",
  success: "bg-gradient-to-br from-success/20 to-success/5 text-success ring-success/20",
};

const toneText = {
  primary: "text-primary",
  warning: "text-warning",
  info: "text-info",
  success: "text-success",
};

export default function NotificationsHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<UnifiedNotification[]>([]);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: agentData }, { data: opData }] = await Promise.all([
      supabase.from("agent_notifications").select("*")
        .eq("recipient_id", user.id).order("created_at", { ascending: false }).limit(200),
      supabase.from("notifications" as any).select("*")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
    ]);

    const agentRows = (agentData || []) as any[];
    const senderIds = [...new Set(agentRows.map((n) => n.sender_id).filter(Boolean))];
    const nameMap: Record<string, string> = {};
    if (senderIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", senderIds);
      (profiles || []).forEach((p: any) => { nameMap[p.id] = p.full_name; });
    }

    const merged: UnifiedNotification[] = [
      ...agentRows.map((n: any) => ({
        id: `agent-${n.id}`, source: "agent" as const, type: n.type,
        title: n.type === "mention" ? "Foste mencionado" : "Notificação",
        content: n.content, ticket_id: n.ticket_id, is_read: n.is_read,
        created_at: n.created_at,
        sender_name: n.sender_id ? nameMap[n.sender_id] : undefined,
      })),
      ...((opData || []) as any[]).map((n: any) => ({
        id: `op-${n.id}`, source: "op" as const, type: n.type,
        title: n.title, content: n.message || "", ticket_id: n.ticket_id,
        is_read: n.is_read, created_at: n.created_at,
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setItems(merged);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const types = useMemo(() => {
    const set = new Set(items.map((i) => i.type));
    return Array.from(set);
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((n) => {
      if (filter === "unread" && n.is_read) return false;
      if (filter === "read" && !n.is_read) return false;
      if (typeFilter !== "all" && n.type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!n.content.toLowerCase().includes(q) && !n.title.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [items, filter, typeFilter, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, UnifiedNotification[]> = {};
    filtered.forEach((n) => {
      const d = new Date(n.created_at);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
      const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
      let key: string;
      if (d >= today) key = "Hoje";
      else if (d >= yesterday) key = "Ontem";
      else if (d >= weekAgo) key = "Últimos 7 dias";
      else key = "Mais antigas";
      if (!groups[key]) groups[key] = [];
      groups[key].push(n);
    });
    return groups;
  }, [filtered]);

  const unreadCount = items.filter((i) => !i.is_read).length;

  const handleClick = async (n: UnifiedNotification) => {
    if (!n.is_read) {
      setItems((prev) => prev.map((i) => i.id === n.id ? { ...i, is_read: true } : i));
      if (n.source === "agent") {
        await supabase.from("agent_notifications").update({ is_read: true }).eq("id", n.id.replace("agent-", ""));
      } else {
        await supabase.from("notifications" as any)
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq("id", n.id.replace("op-", ""));
      }
    }
    if (n.ticket_id) navigate(`/tickets/${n.ticket_id}`);
  };

  const markAllRead = async () => {
    if (!user) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
    await Promise.all([
      supabase.from("agent_notifications").update({ is_read: true })
        .eq("recipient_id", user.id).eq("is_read", false),
      supabase.from("notifications" as any).update({ is_read: true, read_at: now })
        .eq("user_id", user.id).eq("is_read", false),
    ]);
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <PageHeader
        title="Histórico de notificações"
        subtitle={`${items.length} no total • ${unreadCount} por ler`}
        accent="primary"
        icon={<History className="h-5 w-5" />}
        actions={
          unreadCount > 0 ? (
            <Button variant="outline" size="sm" onClick={markAllRead} className="gap-2">
              <CheckCheck className="h-4 w-4" />
              Marcar todas como lidas
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar nas notificações..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList>
              <TabsTrigger value="all">Todas</TabsTrigger>
              <TabsTrigger value="unread" className="gap-1.5">
                Por ler
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">
                    {unreadCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="read">Lidas</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {types.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/50">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <button
              onClick={() => setTypeFilter("all")}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                typeFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70",
              )}
            >
              Tudo
            </button>
            {types.map((t) => {
              const meta = typeMeta(t);
              return (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5",
                    typeFilter === t ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70",
                  )}
                >
                  <meta.icon className="h-3 w-3" />
                  {meta.label}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* List */}
      {loading ? (
        <Card className="p-12 text-center text-muted-foreground">A carregar...</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted text-muted-foreground/50 flex items-center justify-center mx-auto mb-3">
            <Bell className="h-7 w-7" />
          </div>
          <p className="font-medium">Nenhuma notificação encontrada</p>
          <p className="text-sm text-muted-foreground mt-1">Ajusta os filtros para ver mais resultados.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([group, list]) => (
            <div key={group}>
              <div className="flex items-center gap-3 mb-2 px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</h3>
                <div className="flex-1 h-px bg-border/60" />
                <span className="text-xs text-muted-foreground">{list.length}</span>
              </div>
              <Card className="divide-y divide-border/50 overflow-hidden">
                {list.map((n) => {
                  const meta = typeMeta(n.type);
                  const Icon = meta.icon;
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleClick(n)}
                      className={cn(
                        "group w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-muted/40 transition-all relative",
                        !n.is_read && "bg-primary/[0.03]",
                      )}
                    >
                      {!n.is_read && (
                        <span className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                      )}
                      <div className={cn(
                        "mt-0.5 h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ring-1",
                        toneClasses[meta.tone],
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={cn("text-[10px] font-semibold uppercase tracking-wider", toneText[meta.tone])}>
                            {meta.label}
                          </span>
                          <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                          <span className="text-[11px] text-muted-foreground" title={formatFull(n.created_at)}>
                            {formatRelative(n.created_at)}
                          </span>
                          {!n.is_read && (
                            <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-primary/40 text-primary">
                              Nova
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm leading-snug text-foreground/90">
                          {n.sender_name && <span className="font-semibold">{n.sender_name} </span>}
                          {n.title && n.source === "op" && (
                            <span className="font-semibold">{n.title}{n.content ? " — " : ""}</span>
                          )}
                          {n.content}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
