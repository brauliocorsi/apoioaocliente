import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Check, X, UserPlus, Loader2, Phone, Mail, ArrowLeft, ArrowRight, Wrench } from "lucide-react";
import TagSelector from "./TagSelector";
import TicketDocuments from "./TicketDocuments";
import GestaoClickSearch from "./GestaoClickSearch";
import { useNavigate } from "react-router-dom";

interface TicketSidebarProps {
  ticket: any;
  tags: string[];
  clauses: string[];
  userId: string;
  onUpdate: () => void;
}

type Category = { id: string; name: string };
type Subcategory = { id: string; category_id: string; name: string };

export default function TicketSidebar({ ticket, tags, clauses, userId, onUpdate }: TicketSidebarProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string; role: string }[]>([]);
  const [form, setForm] = useState<any>({});
  const [linkedCalls, setLinkedCalls] = useState<any[]>([]);
  const [emailMessages, setEmailMessages] = useState<any[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<any>(null);
  const [clientOS, setClientOS] = useState<any[]>([]);
  const [loadingOS, setLoadingOS] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("categories").select("id, name").order("sort_order"),
      supabase.from("subcategories").select("id, category_id, name").order("sort_order"),
      supabase.rpc("get_agent_profiles"),
    ]).then(([{ data: cats }, { data: subs }, { data: profs }]) => {
      setCategories(cats || []);
      setSubcategories(subs || []);
      setAgents((profs as { id: string; full_name: string; role: string }[]) || []);
    });
  }, []);

  useEffect(() => {
    if (ticket?.id) {
      Promise.all([
        supabase
          .from("phone_calls")
          .select("id, subject, client_name, status, created_at")
          .eq("ticket_id", ticket.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("ticket_messages")
          .select("id, sender_type, created_at, content")
          .eq("ticket_id", ticket.id)
          .order("created_at", { ascending: true }),
      ]).then(([{ data: calls }, { data: msgs }]) => {
        setLinkedCalls(calls || []);
        setEmailMessages(msgs || []);
      });
    }
  }, [ticket?.id]);

  // Fetch OS from GestãoClick by client name
  useEffect(() => {
    if (!ticket?.client_name) return;
    setLoadingOS(true);
    supabase.functions
      .invoke("gestaoclick-proxy", {
        body: { action: "search_os", nome: ticket.client_name },
      })
      .then(({ data }) => {
        const list = data?.data || data?.ordens_servicos || (Array.isArray(data) ? data : []);
        setClientOS(list.map((o: any) => o.ordem_servico || o));
      })
      .catch(() => setClientOS([]))
      .finally(() => setLoadingOS(false));
  }, [ticket?.client_name]);

  useEffect(() => {
    if (ticket) {
      setForm({
        category_id: ticket.category_id || "",
        subcategory_id: ticket.subcategory_id || "",
        priority: ticket.priority,
        client_name: ticket.client_name,
        client_email: ticket.client_email || "",
        client_phone: ticket.client_phone || "",
        order_number: ticket.order_number || "",
        delivery_date: ticket.delivery_date || "",
        purchase_date: ticket.purchase_date || "",
        service_number: ticket.service_number || "",
        assigned_to: ticket.assigned_to || "",
        is_assembled: ticket.is_assembled,
        is_personalized: ticket.is_personalized,
        is_exhibition: ticket.is_exhibition,
        delivery_type: ticket.delivery_type || "",
        pickup_date: ticket.pickup_date || "",
        product_name: ticket.product_name || "",
      });
    }
  }, [ticket]);

  const categoryName = (id: string | null) => {
    if (!id) return "–";
    const cat = categories.find((c) => c.id === id);
    return cat ? cat.name : id;
  };

  const subcategoryName = (id: string | null) => {
    if (!id) return "–";
    const sub = subcategories.find((s) => s.id === id);
    return sub ? sub.name : id;
  };

  const agentName = (id: string | null) => {
    if (!id) return "Não atribuído";
    const a = agents.find((ag) => ag.id === id);
    return a ? a.full_name : id;
  };

  const filteredSubs = subcategories.filter((s) => s.category_id === form.category_id);

  const saveChanges = async () => {
    const updates: any = {
      category_id: form.category_id || null,
      subcategory_id: form.subcategory_id || null,
      priority: form.priority,
      client_name: form.client_name,
      client_email: form.client_email || null,
      client_phone: form.client_phone || null,
      order_number: form.order_number || null,
      delivery_date: form.delivery_date || null,
      purchase_date: form.purchase_date || null,
      service_number: form.service_number || null,
      assigned_to: form.assigned_to || null,
      is_assembled: form.is_assembled,
      is_personalized: form.is_personalized,
      is_exhibition: form.is_exhibition,
      delivery_type: form.delivery_type || null,
      pickup_date: form.pickup_date || null,
      product_name: form.product_name || null,
    };
    await supabase.from("tickets").update(updates).eq("id", ticket.id);
    toast({ title: "Ticket atualizado" });
    setEditing(false);
    onUpdate();
  };

  const createClientAccount = async () => {
    if (!ticket.client_email || !ticket.client_name) {
      toast({ title: "Email e nome do cliente são obrigatórios", variant: "destructive" });
      return;
    }
    setCreatingClient(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-client-account", {
        body: {
          email: ticket.client_email,
          full_name: ticket.client_name,
          phone: ticket.client_phone || null,
          ticket_id: ticket.id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: data.is_new
          ? "Conta de cliente criada e email enviado"
          : "Cliente associado ao ticket",
      });
      onUpdate();
    } catch (e: any) {
      toast({ title: "Erro ao criar conta", description: e.message, variant: "destructive" });
    } finally {
      setCreatingClient(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Informação</CardTitle>
            {!editing ? (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(false); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={saveChanges}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {editing ? (
            <>
              {/* === Ticket === */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Ticket</p>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Categoria</Label>
                    <Select value={form.category_id || "__none__"} onValueChange={(v) => setForm({ ...form, category_id: v === "__none__" ? "" : v, subcategory_id: "" })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhuma</SelectItem>
                        {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Subcategoria</Label>
                    <Select value={form.subcategory_id || "__none__"} onValueChange={(v) => setForm({ ...form, subcategory_id: v === "__none__" ? "" : v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhuma</SelectItem>
                        {filteredSubs.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Prioridade</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="P1">P1 – Urgente</SelectItem>
                        <SelectItem value="P2">P2 – Normal</SelectItem>
                        <SelectItem value="P3">P3 – Baixa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Atribuído a</Label>
                    <Select value={form.assigned_to || "__none__"} onValueChange={(v) => setForm({ ...form, assigned_to: v === "__none__" ? "" : v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Não atribuído" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Não atribuído</SelectItem>
                        {agents.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.full_name} <span className="text-muted-foreground ml-1">({a.role === "supervisor" ? "Supervisor" : "Agente"})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <hr className="border-border" />

              {/* === Cliente === */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Cliente</p>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Nome</Label>
                    <Input className="h-8 text-xs" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Email</Label>
                    <Input className="h-8 text-xs" value={form.client_email} onChange={(e) => setForm({ ...form, client_email: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Telefone</Label>
                    <Input className="h-8 text-xs" value={form.client_phone} onChange={(e) => setForm({ ...form, client_phone: e.target.value })} />
                  </div>
                </div>
              </div>

              <hr className="border-border" />

              {/* === Encomenda / Entrega === */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Encomenda & Entrega</p>
                <div className="space-y-2">
                  <GestaoClickSearch
                    compact
                    onSelectOrder={(od) => setForm({
                      ...form,
                      order_number: od.order_number || form.order_number,
                      client_name: od.client_name || form.client_name,
                      client_email: od.client_email || form.client_email,
                      client_phone: od.client_phone || form.client_phone,
                      product_name: od.product_name || form.product_name,
                      delivery_date: od.delivery_date || form.delivery_date,
                      purchase_date: od.purchase_date || form.purchase_date,
                    })}
                  />
                  <div className="space-y-1">
                    <Label className="text-xs">Nº Encomenda</Label>
                    <Input className="h-8 text-xs" value={form.order_number} onChange={(e) => setForm({ ...form, order_number: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Nº Assistência</Label>
                    <Input className="h-8 text-xs" value={form.service_number} onChange={(e) => setForm({ ...form, service_number: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Data compra</Label>
                    <Input type="date" className="h-8 text-xs" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo de entrega</Label>
                    <Select value={form.delivery_type || "__none__"} onValueChange={(v) => setForm({ ...form, delivery_type: v === "__none__" ? "" : v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">–</SelectItem>
                        <SelectItem value="entrega">Entrega</SelectItem>
                        <SelectItem value="levantamento">Levantamento</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Data entrega</Label>
                    <Input type="date" className="h-8 text-xs" value={form.delivery_date} onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} />
                  </div>
                  {form.delivery_type === "levantamento" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Data levantamento</Label>
                      <Input type="date" className="h-8 text-xs" value={form.pickup_date} onChange={(e) => setForm({ ...form, pickup_date: e.target.value })} />
                    </div>
                  )}
                </div>
              </div>

              <hr className="border-border" />

              {/* === Produto === */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Produto</p>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Produto</Label>
                    <Input className="h-8 text-xs" placeholder="Nome ou referência" value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} />
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={form.is_assembled} onChange={(e) => setForm({ ...form, is_assembled: e.target.checked })} className="rounded" />
                    Montado
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={form.is_personalized} onChange={(e) => setForm({ ...form, is_personalized: e.target.checked })} className="rounded" />
                    Personalizado
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={form.is_exhibition} onChange={(e) => setForm({ ...form, is_exhibition: e.target.checked })} className="rounded" />
                    Exposição
                  </label>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* === Ticket === */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Ticket</p>
                <div className="space-y-1.5">
                  <div><span className="text-muted-foreground">Categoria:</span> <span className="ml-2">{categoryName(ticket.category_id)}</span></div>
                  <div><span className="text-muted-foreground">Subcategoria:</span> <span className="ml-2">{subcategoryName(ticket.subcategory_id)}</span></div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Atribuído a:</span>
                    {ticket.assigned_to ? (
                      <span>{agentName(ticket.assigned_to)}</span>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300">
                        Sem responsável
                      </Badge>
                    )}
                  </div>
                  <div><span className="text-muted-foreground">Criado:</span> <span className="ml-2">{new Date(ticket.created_at).toLocaleString("pt-PT")}</span></div>
                </div>
              </div>

              <hr className="border-border" />

              {/* === Próxima ação === */}
              <NextActionEditor ticket={ticket} onUpdate={onUpdate} />


              <hr className="border-border" />

              {/* === Cliente === */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Cliente</p>
                <div className="space-y-1.5">
                  <div><span className="text-muted-foreground">Nome:</span> <span className="ml-2">{ticket.client_name}</span></div>
                  <div><span className="text-muted-foreground">Email:</span> <span className="ml-2">{ticket.client_email || "–"}</span></div>
                  <div><span className="text-muted-foreground">Telefone:</span> <span className="ml-2">{ticket.client_phone || "–"}</span></div>
                  {ticket.client_user_id ? (
                    <Badge variant="secondary" className="text-xs mt-1">Conta de portal ativa</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-2 text-xs"
                      onClick={createClientAccount}
                      disabled={creatingClient || !ticket.client_email}
                    >
                      {creatingClient ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <UserPlus className="h-3 w-3 mr-1" />}
                      Criar Conta de Cliente
                    </Button>
                  )}
                </div>
              </div>

              {/* === Emails === */}
              {emailMessages.length > 0 && (
                <>
                  <hr className="border-border" />
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Mail className="h-3 w-3" />
                      Emails ({emailMessages.length})
                    </p>
                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                      {emailMessages.map((msg, idx) => (
                        <div
                          key={msg.id}
                          className="flex items-start gap-2 text-xs p-1.5 rounded-md bg-muted/30 cursor-pointer hover:bg-muted/60 transition-colors"
                          onClick={() => setSelectedEmail(msg)}
                        >
                          <div className={`h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 ${msg.sender_type === 'client' ? 'bg-blue-500' : 'bg-primary'}`} />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground">
                              {msg.sender_type === 'client' ? 'Cliente' : 'Agente'}
                            </p>
                            <p className="text-muted-foreground truncate">{(() => { const plain = (msg.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); return plain.substring(0, 60) + (plain.length > 60 ? '...' : ''); })()}</p>
                            <p className="text-muted-foreground/70 text-[10px]">
                              {new Date(msg.created_at).toLocaleString("pt-PT", { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Email Reader Dialog */}
              <Dialog open={!!selectedEmail} onOpenChange={(open) => { if (!open) setSelectedEmail(null); }}>
                <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4" />
                      {selectedEmail?.sender_type === 'client' ? 'Email do Cliente' : 'Email Enviado'}
                      <Badge variant={selectedEmail?.sender_type === 'client' ? 'secondary' : 'default'} className="text-[10px]">
                        {selectedEmail?.sender_type === 'client' ? 'Recebido' : 'Enviado'}
                      </Badge>
                    </DialogTitle>
                  </DialogHeader>
                  <div className="text-xs text-muted-foreground mb-2">
                    {selectedEmail && new Date(selectedEmail.created_at).toLocaleString("pt-PT")}
                  </div>
                  <div className="flex-1 overflow-y-auto border rounded-md p-4 bg-muted/20">
                    {selectedEmail && (() => {
                      const content = selectedEmail.content || '';
                      const isHtml = /<\w+[^>]*>/.test(content) && (content.includes("</") || content.includes("/>"));
                      if (isHtml) {
                        let safe = content
                          .replace(/<script[\s\S]*?<\/script>/gi, "")
                          .replace(/<style[\s\S]*?<\/style>/gi, "")
                          .replace(/\s+on\w+\s*=\s*"[^"]*"/gi, "")
                          .replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"');
                        return (
                          <div
                            className="prose prose-sm dark:prose-invert max-w-none [&_img]:max-w-full [&_a]:text-primary break-words"
                            dangerouslySetInnerHTML={{ __html: safe }}
                          />
                        );
                      }
                      return <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>;
                    })()}
                  </div>
                  {/* Navigation */}
                  {emailMessages.length > 1 && selectedEmail && (
                    <div className="flex items-center justify-between pt-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={emailMessages.indexOf(selectedEmail) <= 0}
                        onClick={() => {
                          const idx = emailMessages.indexOf(selectedEmail);
                          if (idx > 0) setSelectedEmail(emailMessages[idx - 1]);
                        }}
                      >
                        <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Anterior
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        {emailMessages.indexOf(selectedEmail) + 1} de {emailMessages.length}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={emailMessages.indexOf(selectedEmail) >= emailMessages.length - 1}
                        onClick={() => {
                          const idx = emailMessages.indexOf(selectedEmail);
                          if (idx < emailMessages.length - 1) setSelectedEmail(emailMessages[idx + 1]);
                        }}
                      >
                        Seguinte <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </div>
                  )}
                </DialogContent>
              </Dialog>

              <hr className="border-border" />

              {/* === Encomenda / Entrega === */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Encomenda & Entrega</p>
                <div className="space-y-1.5">
                  <div><span className="text-muted-foreground">Nº Encomenda:</span> <span className="ml-2">{ticket.order_number || "–"}</span></div>
                  <div><span className="text-muted-foreground">Nº Assistência:</span> <span className="ml-2">{ticket.service_number || "–"}</span></div>
                  <div><span className="text-muted-foreground">Data compra:</span> <span className="ml-2">{ticket.purchase_date || "–"}</span></div>
                  <div><span className="text-muted-foreground">Tipo entrega:</span> <span className="ml-2">{ticket.delivery_type === "entrega" ? "Entrega" : ticket.delivery_type === "levantamento" ? "Levantamento" : "–"}</span></div>
                  <div><span className="text-muted-foreground">Data entrega:</span> <span className="ml-2">{ticket.delivery_date || "–"}</span></div>
                  {ticket.delivery_type === "levantamento" && (
                    <div><span className="text-muted-foreground">Data levantamento:</span> <span className="ml-2">{ticket.pickup_date || "–"}</span></div>
                  )}
                </div>
                {/* OS associadas do GestãoClick */}
                {loadingOS && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> A verificar OS...
                  </div>
                )}
                {!loadingOS && clientOS.length > 0 && (
                  <div className="pt-2 space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Wrench className="h-3 w-3" /> OS no GestãoClick ({clientOS.length})
                    </p>
                    {clientOS.map((os: any, idx: number) => (
                      <div key={os.id || idx} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted-foreground truncate">
                          #{os.codigo || os.numero || os.id}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] shrink-0 border-primary/30 text-primary bg-primary/5"
                        >
                          {os.situacao || os.status || os.nome_situacao || "–"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <hr className="border-border" />

              {/* === Pesquisa GestãoClick (consulta rápida + preencher campos vazios) === */}
              <GestaoClickSearch
                compact
                onSelectOrder={async (od) => {
                  const updates: any = {};
                  if (!ticket.order_number && od.order_number) updates.order_number = od.order_number;
                  if (!ticket.client_name && od.client_name) updates.client_name = od.client_name;
                  if (!ticket.client_email && od.client_email) updates.client_email = od.client_email;
                  if (!ticket.client_phone && od.client_phone) updates.client_phone = od.client_phone;
                  if (!ticket.product_name && od.product_name) updates.product_name = od.product_name;
                  if (!ticket.delivery_date && od.delivery_date) updates.delivery_date = od.delivery_date;
                  if (!ticket.purchase_date && od.purchase_date) updates.purchase_date = od.purchase_date;

                  if (Object.keys(updates).length === 0) {
                    toast({ title: "Todos os campos já estão preenchidos" });
                    return;
                  }

                  const { error } = await supabase
                    .from("tickets")
                    .update(updates)
                    .eq("id", ticket.id);
                  if (error) {
                    toast({ title: "Erro ao preencher campos", description: error.message, variant: "destructive" });
                  } else {
                    toast({ title: `${Object.keys(updates).length} campo(s) preenchido(s) com dados do GestãoClick` });
                    onUpdate();
                  }
                }}
              />

              <hr className="border-border" />

              {/* === Produto === */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Produto</p>
                <div className="space-y-1.5">
                  <div><span className="text-muted-foreground">Produto:</span> <span className="ml-2">{ticket.product_name || "–"}</span></div>
                  <div><span className="text-muted-foreground">Montado:</span> <span className="ml-2">{ticket.is_assembled ? "Sim" : "Não"}</span></div>
                  <div><span className="text-muted-foreground">Personalizado:</span> <span className="ml-2">{ticket.is_personalized ? "Sim" : "Não"}</span></div>
                  <div><span className="text-muted-foreground">Exposição:</span> <span className="ml-2">{ticket.is_exhibition ? "Sim" : "Não"}</span></div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Tags */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Etiquetas</CardTitle></CardHeader>
        <CardContent>
          <TagSelector ticketId={ticket.id} selectedTags={tags} onTagsChange={onUpdate} />
        </CardContent>
      </Card>

      {/* Linked Calls */}
      {linkedCalls.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" />
              Ligações ({linkedCalls.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {linkedCalls.map((call) => (
              <div
                key={call.id}
                className="text-xs p-2 border rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => navigate("/phone-calls")}
              >
                <p className="font-medium truncate">{call.subject}</p>
                <p className="text-muted-foreground">{call.client_name} · {new Date(call.created_at).toLocaleDateString("pt-PT")}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {/* Documentos */}
      <TicketDocuments ticketId={ticket.id} userId={userId} />

      {clauses.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Cláusulas</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-1">
            {clauses.map((c) => <Badge key={c} variant="outline" className="text-xs font-mono">{c}</Badge>)}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
