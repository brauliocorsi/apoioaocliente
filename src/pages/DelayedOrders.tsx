import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Bell, Clock, Eye, Phone, PhoneCall, RefreshCw, Search, Timer, Archive, CheckCircle, Loader2, Zap, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInBusinessDays, differenceInDays, parseISO, isToday, isBefore, startOfDay } from "date-fns";
import { pt } from "date-fns/locale";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import DelayedOrdersCharts from "@/components/delayed/DelayedOrdersCharts";
import VendaPDFDialog from "@/components/ticket/VendaPDFDialog";

type DelayedOrder = {
  id: string;
  order_number: string;
  client_name: string;
  client_phone: string | null;
  order_date: string | null;
  situacao: string | null;
  sla_deadline_at: string | null;
  notes: string | null;
  is_archived: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  valor_total: number | null;
};

// Strip country code prefixes (e.g. +351, 00351) from phone numbers
const formatPhone = (phone: string | null): string => {
  if (!phone) return "—";
  return phone.replace(/^(\+|00)?351\s?/, "").replace(/^(\+|00)\d{1,3}\s?/, "").trim() || phone;
};

type OrderContact = {
  id: string;
  delayed_order_id: string;
  contacted_at: string;
  contact_type: string;
  notes: string | null;
  next_contact_at: string | null;
  phone_call_id: string | null;
  contacted_by: string;
  created_at: string;
};

type SlaLevel = "normal" | "attention" | "alert" | "critical";

function getSlaInfo(orderDate: string | null): { label: string; level: SlaLevel; days: number; calendarDays: number; progress: number; dateFormatted: string } {
  if (!orderDate) return { label: "Sem data", level: "normal", days: 0, calendarDays: 0, progress: 0, dateFormatted: "" };
  const parsed = parseISO(orderDate);
  const days = differenceInBusinessDays(new Date(), parsed);
  const calendarDays = differenceInDays(new Date(), parsed);
  const dateFormatted = format(parsed, "dd/MM/yyyy");
  if (days > 22) return { label: `${days}dú — Vencido!`, level: "critical", days, calendarDays, progress: 100, dateFormatted };
  if (days >= 14) return { label: `${days}dú — Alerta`, level: "alert", days, calendarDays, progress: Math.round((days / 22) * 100), dateFormatted };
  if (days >= 11) return { label: `${days}dú — Atenção`, level: "attention", days, calendarDays, progress: Math.round((days / 22) * 100), dateFormatted };
  return { label: `${days}dú`, level: "normal", days, calendarDays, progress: Math.round((days / 22) * 100), dateFormatted };
}

const slaColors: Record<SlaLevel, string> = {
  normal: "bg-primary/10 text-primary",
  attention: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  alert: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  critical: "bg-destructive text-destructive-foreground",
};

const slaProgressColors: Record<SlaLevel, string> = {
  normal: "[&>div]:bg-primary",
  attention: "[&>div]:bg-yellow-500",
  alert: "[&>div]:bg-orange-500",
  critical: "[&>div]:bg-destructive",
};

export default function DelayedOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<DelayedOrder[]>([]);
  const [contacts, setContacts] = useState<Record<string, OrderContact[]>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [contactDialog, setContactDialog] = useState<{ open: boolean; order: DelayedOrder | null }>({ open: false, order: null });
  const [contactNotes, setContactNotes] = useState("");
  const [contactNextDate, setContactNextDate] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [filterSituacao, setFilterSituacao] = useState<string>("all");
  const [filterSla, setFilterSla] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [vendaDialog, setVendaDialog] = useState<{ open: boolean; vendaId: string; vendaCodigo: string }>({ open: false, vendaId: "", vendaCodigo: "" });
  const [loadingVendaId, setLoadingVendaId] = useState<string | null>(null);
  const [contactHistoryDialog, setContactHistoryDialog] = useState<{ open: boolean; order: DelayedOrder | null; contacts: OrderContact[] }>({ open: false, order: null, contacts: [] });

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("delayed_orders")
      .select("*")
      .eq("is_archived", showArchived)
      .order("order_date", { ascending: true });
    if (error) {
      toast.error("Erro ao carregar encomendas");
      console.error(error);
    } else {
      setOrders((data as DelayedOrder[]) || []);
      const ids = (data || []).map((o: any) => o.id);
      if (ids.length > 0) {
        const { data: contactsData } = await supabase
          .from("delayed_order_contacts")
          .select("*")
          .in("delayed_order_id", ids)
          .order("contacted_at", { ascending: false });
        const grouped: Record<string, OrderContact[]> = {};
        (contactsData as OrderContact[] || []).forEach((c) => {
          if (!grouped[c.delayed_order_id]) grouped[c.delayed_order_id] = [];
          grouped[c.delayed_order_id].push(c);
        });
        setContacts(grouped);
      }
    }
    setLoading(false);
  }, [showArchived]);

  // Fetch last sync time from system_settings
  const fetchLastSync = async () => {
    const { data } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "delayed_orders_last_sync")
      .maybeSingle();
    if (data) setLastSync(data.value);
  };

  useEffect(() => { fetchOrders(); fetchLastSync(); }, [fetchOrders]);

  const runManualSync = async () => {
    setSyncing(true);
    try {
      const res = await supabase.functions.invoke("sync-delayed-orders");
      if (res.error) throw res.error;
      const d = res.data;
      toast.success(
        `Sincronização concluída: ${d.imported} novas, ${d.updated} atualizadas, ${d.archived} arquivadas`
      );
      fetchOrders();
      fetchLastSync();
    } catch (error: any) {
      console.error("Sync error:", error);
      toast.error("Erro na sincronização: " + (error.message || "Erro desconhecido"));
    }
    setSyncing(false);
  };

  const registerContact = async () => {
    if (!contactDialog.order) return;
    setSavingContact(true);
    try {
      await supabase.from("delayed_order_contacts").insert({
        delayed_order_id: contactDialog.order.id,
        notes: contactNotes || null,
        next_contact_at: contactNextDate ? new Date(contactNextDate).toISOString() : null,
        contact_type: "phone",
      });
      await supabase.from("delayed_orders").update({ notes: contactNotes || contactDialog.order.notes }).eq("id", contactDialog.order.id);
      toast.success("Contacto registado com sucesso");
      setContactDialog({ open: false, order: null });
      setContactNotes("");
      setContactNextDate("");
      fetchOrders();
    } catch (error) {
      toast.error("Erro ao registar contacto");
    }
    setSavingContact(false);
  };

  const createPhoneCall = async (order: DelayedOrder) => {
    try {
      const { data, error } = await supabase.from("phone_calls").insert({
        client_name: order.client_name,
        client_phone: order.client_phone || "",
        subject: `Atraso encomenda #${order.order_number}`,
        notes: `Contacto sobre atraso da encomenda #${order.order_number}. Situação: ${order.situacao || "N/A"}`,
        priority: "P2",
        invoice_number: order.order_number,
      }).select().single();
      if (error) throw error;
      await supabase.from("delayed_order_contacts").insert({
        delayed_order_id: order.id,
        notes: `Ligação criada: ${data.id}`,
        contact_type: "phone_call",
        phone_call_id: data.id,
      });
      toast.success("Ligação criada e vinculada");
      fetchOrders();
    } catch (error) {
      toast.error("Erro ao criar ligação");
    }
  };

  const toggleArchive = async (order: DelayedOrder) => {
    await supabase.from("delayed_orders").update({ is_archived: !order.is_archived }).eq("id", order.id);
    fetchOrders();
  };

  const openVendaDetail = async (order: DelayedOrder) => {
    setLoadingVendaId(order.id);
    try {
      const { data, error } = await supabase.functions.invoke("gestaoclick-proxy", {
        body: { action: "search_vendas", query: order.order_number },
      });
      if (error) throw error;
      const vendas = data?.data || data?.vendas || (Array.isArray(data) ? data : []);
      const match = vendas.find((v: any) => {
        const venda = v.venda || v;
        return String(venda.codigo) === order.order_number;
      });
      const venda = match?.venda || match;
      if (venda?.id) {
        setVendaDialog({ open: true, vendaId: String(venda.id), vendaCodigo: order.order_number });
      } else {
        toast.error("Venda não encontrada no GestãoClick");
      }
    } catch (e: any) {
      toast.error("Erro ao buscar detalhes: " + (e.message || "Erro"));
    }
    setLoadingVendaId(null);
  };

  const filteredOrders = orders.filter((o) => {
    if (filterSituacao !== "all" && o.situacao !== filterSituacao) return false;
    if (filterSla !== "all") {
      const sla = getSlaInfo(o.order_date);
      if (filterSla === "critical" && sla.level !== "critical") return false;
      if (filterSla === "alert" && sla.level !== "alert") return false;
      if (filterSla === "attention" && sla.level !== "attention") return false;
      if (filterSla === "contacted") {
        if ((contacts[o.id] || []).length === 0) return false;
      }
      if (filterSla === "no_contact") {
        if ((contacts[o.id] || []).length > 0) return false;
      }
      if (filterSla === "today_contact") {
        const next = getNextContact(o.id);
        if (!next) return false;
        const nextDate = new Date(next);
        if (!isToday(nextDate) && !isBefore(nextDate, startOfDay(new Date()))) return false;
      }
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      if (
        !o.order_number.toLowerCase().includes(term) &&
        !o.client_name.toLowerCase().includes(term) &&
        !(o.client_phone || "").toLowerCase().includes(term)
      ) return false;
    }
    return true;
  });

  const uniqueSituacoes = [...new Set(orders.map((o) => o.situacao).filter(Boolean))] as string[];

  // Get the latest next_contact_at for each order
  const getNextContact = (orderId: string): string | null => {
    const orderContacts = contacts[orderId] || [];
    const withNext = orderContacts
      .filter((c) => c.next_contact_at)
      .sort((a, b) => new Date(b.contacted_at).getTime() - new Date(a.contacted_at).getTime());
    return withNext.length > 0 ? withNext[0].next_contact_at : null;
  };

  // Orders with contact scheduled for today or overdue
  const todayContactOrders = orders.filter((o) => {
    const next = getNextContact(o.id);
    if (!next) return false;
    const nextDate = new Date(next);
    return isToday(nextDate) || isBefore(nextDate, startOfDay(new Date()));
  });

  const stats = {
    total: orders.length,
    critical: orders.filter((o) => getSlaInfo(o.order_date).level === "critical").length,
    alert: orders.filter((o) => getSlaInfo(o.order_date).level === "alert").length,
    attention: orders.filter((o) => getSlaInfo(o.order_date).level === "attention").length,
    withContact: orders.filter((o) => (contacts[o.id] || []).length > 0).length,
    noContact: orders.filter((o) => (contacts[o.id] || []).length === 0).length,
    todayContacts: todayContactOrders.length,
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Controlo de Encomendas</h1>
            <p className="text-sm text-muted-foreground">
              Monitorização automática de encomendas pendentes — Sincroniza diariamente às 08:00
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastSync && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" />
                    Último sync: {format(new Date(lastSync), "dd/MM HH:mm")}
                  </span>
                </TooltipTrigger>
                <TooltipContent>Última sincronização automática com o GestãoClick</TooltipContent>
              </Tooltip>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowArchived(!showArchived)}>
              <Archive className="h-4 w-4 mr-1" />
              {showArchived ? "Ativas" : "Arquivadas"}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchOrders}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Atualizar
            </Button>
            <Button onClick={runManualSync} disabled={syncing} className="gap-1">
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Sincronizar agora
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setFilterSla("all")}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold leading-none text-primary">{stats.total}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Total</p>
              </div>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer hover:border-destructive/50 transition-colors ${stats.critical > 0 ? "border-destructive/30" : ""}`} onClick={() => setFilterSla("critical")}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <p className="text-xl font-bold leading-none text-destructive">{stats.critical}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Vencidas (&gt;30d)</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-orange-500/50 transition-colors" onClick={() => setFilterSla("alert")}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/20">
                <Timer className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-xl font-bold leading-none text-orange-600 dark:text-orange-400">{stats.alert}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Alerta (20-30d)</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-yellow-500/50 transition-colors" onClick={() => setFilterSla("attention")}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-yellow-100 dark:bg-yellow-900/20">
                <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-xl font-bold leading-none text-yellow-600 dark:text-yellow-400">{stats.attention}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Atenção (15-20d)</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-green-500/50 transition-colors" onClick={() => setFilterSla("contacted")}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/20">
                <PhoneCall className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xl font-bold leading-none text-green-600 dark:text-green-400">{stats.withContact}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Com contacto</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-muted-foreground/50 transition-colors" onClick={() => setFilterSla("no_contact")}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Phone className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xl font-bold leading-none text-muted-foreground">{stats.noContact}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Sem contacto</p>
              </div>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer hover:border-blue-500/50 transition-colors ${stats.todayContacts > 0 ? "border-blue-500/50 ring-1 ring-blue-500/20" : ""}`} onClick={() => setFilterSla("today_contact")}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/20">
                <Bell className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xl font-bold leading-none text-blue-600 dark:text-blue-400">{stats.todayContacts}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Contactar hoje</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Today's contacts reminder */}
        {todayContactOrders.length > 0 && (
          <Card className="border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-blue-700 dark:text-blue-300">
                <Bell className="h-4 w-4" />
                Contactos Agendados para Hoje ({todayContactOrders.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {todayContactOrders.map((order) => {
                  const next = getNextContact(order.id);
                  const nextDate = next ? new Date(next) : null;
                  const isOverdue = nextDate && isBefore(nextDate, startOfDay(new Date()));
                  const sla = getSlaInfo(order.order_date);
                  return (
                    <div key={order.id} className="flex items-center gap-3 text-sm bg-background/80 rounded-lg p-2 border border-border/50">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${isOverdue ? "bg-destructive" : "bg-blue-500"}`} />
                      <span className="font-mono font-medium text-xs">#{order.order_number}</span>
                      <span className="font-medium truncate">{order.client_name}</span>
                      <span className="text-muted-foreground text-xs">{order.client_phone || "—"}</span>
                      <Badge className={`text-[10px] ml-auto ${slaColors[sla.level]}`}>{sla.label}</Badge>
                      {nextDate && (
                        <span className={`text-xs whitespace-nowrap ${isOverdue ? "text-destructive font-medium" : "text-blue-600 dark:text-blue-400"}`}>
                          {isOverdue ? "⚠️ Atrasado" : format(nextDate, "HH:mm")}
                        </span>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => {
                        setContactDialog({ open: true, order });
                        setContactNotes("");
                        setContactNextDate("");
                      }}>
                        <Phone className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info banner */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 text-sm flex items-start gap-3">
            <Zap className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-primary">Sincronização Automática Ativa</p>
              <p className="text-muted-foreground text-xs mt-0.5">
                Todos os dias às 08:00, o sistema busca automaticamente encomendas com situação:
                <strong> Encomenda</strong>, <strong>Encomenda Fornecedor</strong>, <strong>Encomenda Fabrica</strong> e <strong>Encomenda Fornecedor - Fábrica</strong>.
                Encomendas que mudarem de situação são automaticamente arquivadas. Você também pode clicar em "Sincronizar agora" a qualquer momento.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Charts Dashboard */}
        <DelayedOrdersCharts orders={orders} contacts={contacts} />

        {/* Filters */}
        <div className="flex gap-3 items-center flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nº nota, cliente ou telefone..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterSituacao} onValueChange={setFilterSituacao}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Filtrar por situação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as situações</SelectItem>
              {uniqueSituacoes.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterSla} onValueChange={setFilterSla}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Filtrar por SLA" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os SLA</SelectItem>
              <SelectItem value="critical">🔴 Vencidas (&gt;30d)</SelectItem>
              <SelectItem value="alert">🟠 Alerta (20-30d)</SelectItem>
              <SelectItem value="attention">🟡 Atenção (15-20d)</SelectItem>
              <SelectItem value="contacted">✅ Com contacto</SelectItem>
              <SelectItem value="no_contact">⚪ Sem contacto</SelectItem>
              <SelectItem value="today_contact">📅 Contactar hoje</SelectItem>
            </SelectContent>
          </Select>
          {(filterSla !== "all" || filterSituacao !== "all" || searchTerm) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterSla("all"); setFilterSituacao("all"); setSearchTerm(""); }}>
              Limpar filtros
            </Button>
          )}
        </div>

        {/* Orders Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nota</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Data Venda</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Dias / SLA</TableHead>
                  <TableHead>Contactos</TableHead>
                  <TableHead>Último Contacto</TableHead>
                  <TableHead>Próximo Contacto</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      {orders.length === 0
                        ? "Nenhuma encomenda pendente. Clique em \"Sincronizar agora\" para buscar do GestãoClick."
                        : "Nenhuma encomenda encontrada com os filtros atuais."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => {
                    const sla = getSlaInfo(order.order_date);
                    const orderContacts = contacts[order.id] || [];
                    const lastContact = orderContacts[0];

                    return (
                      <TableRow key={order.id} className={sla.level === "critical" ? "bg-destructive/5" : sla.level === "alert" ? "bg-orange-50/50 dark:bg-orange-950/10" : ""}>
                        <TableCell className="font-mono font-medium text-sm">#{order.order_number}</TableCell>
                        <TableCell className="font-medium">{order.client_name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{order.client_phone || "—"}</TableCell>
                        <TableCell className="text-sm">
                          {order.order_date ? format(parseISO(order.order_date), "dd/MM/yyyy") : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{order.situacao || "N/A"}</Badge>
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="space-y-1 min-w-[120px] cursor-help">
                                <Badge className={`text-xs ${slaColors[sla.level]}`}>{sla.label}</Badge>
                                <Progress value={sla.progress} className={`h-1.5 ${slaProgressColors[sla.level]}`} />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="text-xs space-y-1 max-w-[220px]">
                              <p className="font-semibold">📅 Encomenda: {sla.dateFormatted || "N/A"}</p>
                              <p>Dias úteis: <span className="font-bold">{sla.days}dú</span></p>
                              <p>Dias corridos: <span className="text-muted-foreground">{sla.calendarDays}d</span></p>
                              <p>Limite: 22 dias úteis</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant={orderContacts.length > 0 ? "secondary" : "outline"} className={`text-xs ${orderContacts.length === 0 && sla.level !== "normal" ? "border-destructive/50 text-destructive" : ""}`}>
                                {orderContacts.length > 0 ? `${orderContacts.length}x` : "Nenhum"}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              {orderContacts.length > 0
                                ? `${orderContacts.length} contacto(s) registado(s)`
                                : "Nenhum contacto feito — considere entrar em contacto"}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {lastContact ? (
                            <div>
                              <div>{format(new Date(lastContact.contacted_at), "dd/MM HH:mm", { locale: pt })}</div>
                              {lastContact.notes && <div className="truncate max-w-[120px] text-[10px]">{lastContact.notes}</div>}
                            </div>
                          ) : (
                            <span className={sla.level !== "normal" ? "text-destructive" : ""}>Nunca</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {(() => {
                            const next = getNextContact(order.id);
                            if (!next) return <span className="text-muted-foreground">—</span>;
                            const nextDate = new Date(next);
                            const overdue = isBefore(nextDate, startOfDay(new Date()));
                            const today = isToday(nextDate);
                            return (
                              <div className={`flex items-center gap-1 ${overdue ? "text-destructive font-medium" : today ? "text-blue-600 dark:text-blue-400 font-medium" : "text-muted-foreground"}`}>
                                <CalendarClock className="h-3 w-3 shrink-0" />
                                <span>{format(nextDate, "dd/MM HH:mm")}</span>
                                {overdue && <span className="text-[10px]">⚠️</span>}
                                {today && !overdue && <span className="text-[10px]">📅</span>}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openVendaDetail(order)}
                                  disabled={loadingVendaId === order.id}
                                >
                                  {loadingVendaId === order.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Ver detalhes da venda</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => {
                                    setContactDialog({ open: true, order });
                                    setContactNotes("");
                                    setContactNextDate("");
                                  }}
                                >
                                  <Phone className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Registar contacto rápido</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => createPhoneCall(order)}>
                                  <PhoneCall className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Criar ligação completa</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleArchive(order)}>
                                  {order.is_archived ? <RefreshCw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{order.is_archived ? "Desarquivar" : "Arquivar"}</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Contact Dialog */}
        <Dialog open={contactDialog.open} onOpenChange={(open) => setContactDialog({ open, order: open ? contactDialog.order : null })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registar Contacto — #{contactDialog.order?.order_number}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-1">Cliente</p>
                <p className="text-sm text-muted-foreground">{contactDialog.order?.client_name} — {contactDialog.order?.client_phone || "Sem telefone"}</p>
              </div>
              {contactDialog.order && (
                <div>
                  <p className="text-sm font-medium mb-1">SLA</p>
                  <Badge className={`${slaColors[getSlaInfo(contactDialog.order.order_date).level]}`}>
                    {getSlaInfo(contactDialog.order.order_date).label}
                  </Badge>
                </div>
              )}
              <div>
                <label className="text-sm font-medium">Notas do contacto</label>
                <Textarea
                  value={contactNotes}
                  onChange={(e) => setContactNotes(e.target.value)}
                  placeholder="Ex: Cliente informado sobre atraso, previsão de entrega em 15 dias..."
                  rows={3}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Próximo contacto (opcional)</label>
                <Input type="datetime-local" value={contactNextDate} onChange={(e) => setContactNextDate(e.target.value)} />
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => contactDialog.order && createPhoneCall(contactDialog.order)}>
                  <PhoneCall className="h-4 w-4 mr-1" />
                  Criar ligação completa
                </Button>
                <Button onClick={registerContact} disabled={savingContact}>
                  {savingContact ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                  Registar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Contact History */}
        {filteredOrders.some((o) => (contacts[o.id] || []).length > 0) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Histórico de Contactos Recentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredOrders
                  .flatMap((o) => (contacts[o.id] || []).map((c) => ({ ...c, order: o })))
                  .sort((a, b) => new Date(b.contacted_at).getTime() - new Date(a.contacted_at).getTime())
                  .slice(0, 20)
                  .map((c) => (
                    <div key={c.id} className="flex items-start gap-3 text-sm border-b border-border/50 pb-2">
                      <Phone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">#{c.order.order_number}</span>
                          <span className="text-muted-foreground">{c.order.client_name}</span>
                          {c.phone_call_id && <Badge variant="outline" className="text-xs">Ligação vinculada</Badge>}
                        </div>
                        {c.notes && <p className="text-muted-foreground text-xs mt-0.5">{c.notes}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(c.contacted_at), "dd/MM HH:mm", { locale: pt })}
                      </span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Venda Detail Dialog */}
        <VendaPDFDialog
          open={vendaDialog.open}
          onOpenChange={(open) => setVendaDialog({ ...vendaDialog, open })}
          vendaId={vendaDialog.vendaId}
          vendaCodigo={vendaDialog.vendaCodigo}
        />
      </div>
    </TooltipProvider>
  );
}
