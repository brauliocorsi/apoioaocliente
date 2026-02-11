import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Check, X } from "lucide-react";
import TagSelector from "./TagSelector";

interface TicketSidebarProps {
  ticket: any;
  tags: string[];
  clauses: string[];
  onUpdate: () => void;
}

type Category = { id: string; name: string };
type Subcategory = { id: string; category_id: string; name: string };

export default function TicketSidebar({ ticket, tags, clauses, onUpdate }: TicketSidebarProps) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    Promise.all([
      supabase.from("categories").select("id, name").order("sort_order"),
      supabase.from("subcategories").select("id, category_id, name").order("sort_order"),
      supabase.from("profiles").select("id, full_name"),
    ]).then(([{ data: cats }, { data: subs }, { data: profs }]) => {
      setCategories(cats || []);
      setSubcategories(subs || []);
      setAgents(profs || []);
    });
  }, []);

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
                        {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
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
                  <div><span className="text-muted-foreground">Atribuído a:</span> <span className="ml-2">{agentName(ticket.assigned_to)}</span></div>
                  <div><span className="text-muted-foreground">Criado:</span> <span className="ml-2">{new Date(ticket.created_at).toLocaleString("pt-PT")}</span></div>
                </div>
              </div>

              <hr className="border-border" />

              {/* === Cliente === */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Cliente</p>
                <div className="space-y-1.5">
                  <div><span className="text-muted-foreground">Nome:</span> <span className="ml-2">{ticket.client_name}</span></div>
                  <div><span className="text-muted-foreground">Email:</span> <span className="ml-2">{ticket.client_email || "–"}</span></div>
                  <div><span className="text-muted-foreground">Telefone:</span> <span className="ml-2">{ticket.client_phone || "–"}</span></div>
                </div>
              </div>

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
              </div>

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
