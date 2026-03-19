import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Clock, Phone, PhoneCall, Plus, RefreshCw, Search, Timer, Archive, CheckCircle, Loader2, Filter } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays, parseISO } from "date-fns";
import { pt } from "date-fns/locale";

const DEFAULT_SITUACOES = [
  "Aguardando Produto",
  "Em Produção",
  "Pedido Confirmado",
  "Separação",
];

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

function getSlaStatus(orderDate: string | null): { label: string; color: string; days: number } {
  if (!orderDate) return { label: "Sem data", color: "bg-muted text-muted-foreground", days: 0 };
  const days = differenceInDays(new Date(), parseISO(orderDate));
  if (days > 60) return { label: `${days} dias — Crítico`, color: "bg-destructive text-destructive-foreground", days };
  if (days > 45) return { label: `${days} dias — Alerta`, color: "bg-warning text-warning-foreground", days };
  if (days > 30) return { label: `${days} dias — Atenção`, color: "bg-accent text-accent-foreground", days };
  return { label: `${days} dias`, color: "bg-primary/10 text-primary", days };
}

export default function DelayedOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<DelayedOrder[]>([]);
  const [contacts, setContacts] = useState<Record<string, OrderContact[]>>({});
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selectedSituacoes, setSelectedSituacoes] = useState<string[]>(DEFAULT_SITUACOES);
  const [customSituacao, setCustomSituacao] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [contactDialog, setContactDialog] = useState<{ open: boolean; order: DelayedOrder | null }>({ open: false, order: null });
  const [contactNotes, setContactNotes] = useState("");
  const [contactNextDate, setContactNextDate] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [filterSituacao, setFilterSituacao] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("delayed_orders")
      .select("*")
      .eq("is_archived", showArchived)
      .order("order_date", { ascending: true });
    if (error) {
      toast.error("Erro ao carregar notas atrasadas");
      console.error(error);
    } else {
      setOrders((data as DelayedOrder[]) || []);
      // Fetch contacts for all orders
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

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const importFromGestaoClick = async () => {
    if (selectedSituacoes.length === 0) {
      toast.error("Selecione pelo menos uma situação");
      return;
    }
    setImporting(true);
    try {
      const allVendas: any[] = [];
      for (const sit of selectedSituacoes) {
        const { data: session } = await supabase.auth.getSession();
        const res = await supabase.functions.invoke("gestaoclick-proxy", {
          body: { action: "search_vendas", situacao: sit },
        });
        if (res.error) throw res.error;
        const vendas = res.data?.data || res.data?.vendas || (Array.isArray(res.data) ? res.data : []);
        allVendas.push(...vendas);
      }

      // Deduplicate by codigo
      const uniqueMap = new Map<string, any>();
      allVendas.forEach((v: any) => {
        const venda = v.venda || v;
        const code = venda.codigo || venda.id;
        if (code && !uniqueMap.has(String(code))) uniqueMap.set(String(code), venda);
      });

      const uniqueVendas = Array.from(uniqueMap.values());
      
      // Filter orders older than 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      let imported = 0;
      for (const venda of uniqueVendas) {
        const orderDate = venda.data_emissao || venda.data_venda || venda.created_at;
        if (orderDate && new Date(orderDate) > thirtyDaysAgo) continue; // Skip if < 30 days

        const orderNumber = String(venda.codigo || venda.id);
        // Check if already exists
        const { data: existing } = await supabase
          .from("delayed_orders")
          .select("id")
          .eq("order_number", orderNumber)
          .maybeSingle();

        if (existing) continue;

        const clientName = venda.nome_cliente || venda.cliente?.nome || venda.nome || "Cliente";
        const clientPhone = venda.telefone_cliente || venda.cliente?.telefone || venda.telefone || null;

        const slaDeadline = orderDate ? new Date(new Date(orderDate).getTime() + 30 * 24 * 60 * 60 * 1000) : null;

        await supabase.from("delayed_orders").insert({
          order_number: orderNumber,
          client_name: clientName,
          client_phone: clientPhone,
          order_date: orderDate ? orderDate.substring(0, 10) : null,
          situacao: venda.situacao || venda.status || null,
          sla_deadline_at: slaDeadline?.toISOString() || null,
        });
        imported++;
      }

      toast.success(`${imported} nota(s) importada(s) do GestãoClick`);
      fetchOrders();
    } catch (error: any) {
      console.error("Import error:", error);
      toast.error("Erro ao importar do GestãoClick: " + (error.message || "Erro desconhecido"));
    }
    setImporting(false);
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

      // Update the order's updated_at
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

      // Register the contact with linked phone call
      await supabase.from("delayed_order_contacts").insert({
        delayed_order_id: order.id,
        notes: `Ligação criada: ${data.id}`,
        contact_type: "phone_call",
        phone_call_id: data.id,
      });

      toast.success("Ligação criada e vinculada à nota atrasada");
      fetchOrders();
    } catch (error) {
      toast.error("Erro ao criar ligação");
    }
  };

  const toggleArchive = async (order: DelayedOrder) => {
    await supabase.from("delayed_orders").update({ is_archived: !order.is_archived }).eq("id", order.id);
    fetchOrders();
  };

  const addSituacao = () => {
    const trimmed = customSituacao.trim();
    if (trimmed && !selectedSituacoes.includes(trimmed)) {
      setSelectedSituacoes([...selectedSituacoes, trimmed]);
      setCustomSituacao("");
    }
  };

  const removeSituacao = (sit: string) => {
    setSelectedSituacoes(selectedSituacoes.filter((s) => s !== sit));
  };

  const filteredOrders = orders.filter((o) => {
    if (filterSituacao !== "all" && o.situacao !== filterSituacao) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      if (
        !o.order_number.toLowerCase().includes(term) &&
        !o.client_name.toLowerCase().includes(term) &&
        !(o.client_phone || "").toLowerCase().includes(term)
      )
        return false;
    }
    return true;
  });

  const uniqueSituacoes = [...new Set(orders.map((o) => o.situacao).filter(Boolean))] as string[];

  // Stats
  const stats = {
    total: orders.length,
    critical: orders.filter((o) => getSlaStatus(o.order_date).days > 60).length,
    alert: orders.filter((o) => { const d = getSlaStatus(o.order_date).days; return d > 45 && d <= 60; }).length,
    attention: orders.filter((o) => { const d = getSlaStatus(o.order_date).days; return d > 30 && d <= 45; }).length,
    withContact: orders.filter((o) => (contacts[o.id] || []).length > 0).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notas Atrasadas</h1>
          <p className="text-sm text-muted-foreground">Monitorização de encomendas com atraso no GestãoClick</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowArchived(!showArchived)}>
            <Archive className="h-4 w-4 mr-1" />
            {showArchived ? "Ver ativas" : "Ver arquivadas"}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchOrders}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
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
        <Card className={stats.critical > 0 ? "border-destructive/30" : ""}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <p className="text-xl font-bold leading-none text-destructive">{stats.critical}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Crítico (&gt;60d)</p>
            </div>
          </CardContent>
        </Card>
        <Card className={stats.alert > 0 ? "border-warning/30" : ""}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10">
              <Timer className="h-4 w-4 text-warning" />
            </div>
            <div>
              <p className="text-xl font-bold leading-none text-warning">{stats.alert}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Alerta (45-60d)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
              <Clock className="h-4 w-4 text-orange-500" />
            </div>
            <div>
              <p className="text-xl font-bold leading-none text-orange-500">{stats.attention}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Atenção (30-45d)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/10">
              <PhoneCall className="h-4 w-4 text-success" />
            </div>
            <div>
              <p className="text-xl font-bold leading-none text-success">{stats.withContact}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Com contacto</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Import Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Importar do GestãoClick
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {selectedSituacoes.map((sit) => (
              <Badge key={sit} variant="secondary" className="cursor-pointer" onClick={() => removeSituacao(sit)}>
                {sit} ×
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Adicionar situação personalizada..."
              value={customSituacao}
              onChange={(e) => setCustomSituacao(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSituacao()}
              className="max-w-xs"
            />
            <Button variant="outline" size="sm" onClick={addSituacao} disabled={!customSituacao.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
            <Button onClick={importFromGestaoClick} disabled={importing || selectedSituacoes.length === 0}>
              {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
              Importar notas atrasadas
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Clique nas badges para remover situações. Apenas encomendas com mais de 30 dias serão importadas.</p>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nº nota, cliente ou telefone..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterSituacao} onValueChange={setFilterSituacao}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por situação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as situações</SelectItem>
            {uniqueSituacoes.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                <TableHead>Data Encomenda</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead>Contactos</TableHead>
                <TableHead>Último Contacto</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Nenhuma nota atrasada encontrada. Clique em "Importar" para buscar do GestãoClick.
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map((order) => {
                  const sla = getSlaStatus(order.order_date);
                  const orderContacts = contacts[order.id] || [];
                  const lastContact = orderContacts[0];

                  return (
                    <TableRow key={order.id} className={sla.days > 60 ? "bg-destructive/5" : ""}>
                      <TableCell className="font-mono font-medium">#{order.order_number}</TableCell>
                      <TableCell className="font-medium">{order.client_name}</TableCell>
                      <TableCell className="text-muted-foreground">{order.client_phone || "—"}</TableCell>
                      <TableCell>
                        {order.order_date ? format(parseISO(order.order_date), "dd/MM/yyyy") : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{order.situacao || "N/A"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${sla.color}`}>{sla.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{orderContacts.length}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {lastContact ? format(new Date(lastContact.contacted_at), "dd/MM HH:mm", { locale: pt }) : "Nunca"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Registar contacto rápido"
                            onClick={() => {
                              setContactDialog({ open: true, order });
                              setContactNotes("");
                              setContactNextDate("");
                            }}
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Criar ligação completa"
                            onClick={() => createPhoneCall(order)}
                          >
                            <PhoneCall className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={order.is_archived ? "Desarquivar" : "Arquivar"}
                            onClick={() => toggleArchive(order)}
                          >
                            {order.is_archived ? <RefreshCw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                          </Button>
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

      {/* Contact History inline */}
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
    </div>
  );
}
