import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft } from "lucide-react";
import FileUpload from "@/components/FileUpload";

type Category = { id: string; name: string };
type Subcategory = { id: string; category_id: string; name: string };

export default function TicketNew() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    client_name: "",
    client_email: "",
    client_phone: "",
    order_number: "",
    service_number: "",
    subject: "",
    description: "",
    category_id: "",
    subcategory_id: "",
    priority: "P2" as string,
    delivery_date: "",
    purchase_date: "",
    is_assembled: false,
    is_personalized: false,
    is_exhibition: false,
    payment_method: "",
  });
  const [attachments, setAttachments] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const [{ data: cats }, { data: subs }] = await Promise.all([
        supabase.from("categories").select("id, name").order("sort_order"),
        supabase.from("subcategories").select("id, category_id, name").order("sort_order"),
      ]);
      setCategories(cats || []);
      setSubcategories(subs || []);
    };
    load();
  }, []);

  const filteredSubs = subcategories.filter((s) => s.category_id === form.category_id);

  const update = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "category_id") setForm((prev) => ({ ...prev, subcategory_id: "", [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);

    // Fetch SLA config
    let sla_first_response_at: string | null = null;
    let sla_resolution_at: string | null = null;
    if (form.category_id && form.priority) {
      const { data: slaData } = await supabase
        .from("sla_config")
        .select("first_response_minutes, resolution_minutes")
        .eq("category_id", form.category_id)
        .eq("priority", form.priority as any)
        .single();
      if (slaData) {
        const now = new Date();
        sla_first_response_at = new Date(now.getTime() + slaData.first_response_minutes * 60000).toISOString();
        sla_resolution_at = new Date(now.getTime() + slaData.resolution_minutes * 60000).toISOString();
      }
    }

    const { data, error } = await supabase.from("tickets").insert({
      client_name: form.client_name,
      client_email: form.client_email || null,
      client_phone: form.client_phone || null,
      order_number: form.order_number || null,
      service_number: form.service_number || null,
      subject: form.subject,
      description: form.description || null,
      category_id: form.category_id || null,
      subcategory_id: form.subcategory_id || null,
      priority: form.priority as any,
      delivery_date: form.delivery_date || null,
      purchase_date: form.purchase_date || null,
      is_assembled: form.is_assembled,
      is_personalized: form.is_personalized,
      is_exhibition: form.is_exhibition,
      payment_method: form.payment_method || null,
      sla_first_response_at,
      sla_resolution_at,
      created_by: user.id,
    }).select("id").single();

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else if (data) {
      // Create initial event
      await supabase.from("ticket_events").insert({
        ticket_id: data.id,
        user_id: user.id,
        event_type: "created",
        content: "Ticket criado",
      });
      // Save attachments
      if (attachments.length > 0) {
        await supabase.from("ticket_attachments").insert(
          attachments.map((a) => ({
            ticket_id: data.id,
            file_name: a.file_name,
            file_path: a.file_path,
            file_type: a.file_type,
            file_size: a.file_size,
            uploaded_by: user.id,
          }))
        );
      }
      toast({ title: "Ticket criado com sucesso" });
      navigate(`/tickets/${data.id}`);
    }
    setSubmitting(false);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/tickets")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Novo Ticket</h1>
          <p className="text-muted-foreground">Criar novo ticket de suporte</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Dados do Cliente</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome do cliente *</Label>
              <Input required value={form.client_name} onChange={(e) => update("client_name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nº Encomenda</Label>
              <Input value={form.order_number} onChange={(e) => update("order_number", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nº Assistência (OS)</Label>
              <Input value={form.service_number} onChange={(e) => update("service_number", e.target.value)} placeholder="Número de ordem de serviço" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.client_email} onChange={(e) => update("client_email", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={form.client_phone} onChange={(e) => update("client_phone", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Classificação</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Categoria *</Label>
              <Select value={form.category_id} onValueChange={(v) => update("category_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar categoria" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.id} – {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Subcategoria</Label>
              <Select value={form.subcategory_id} onValueChange={(v) => update("subcategory_id", v)} disabled={!form.category_id}>
                <SelectTrigger><SelectValue placeholder="Selecionar subcategoria" /></SelectTrigger>
                <SelectContent>
                  {filteredSubs.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Select value={form.priority} onValueChange={(v) => update("priority", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="P1">P1 – Urgente</SelectItem>
                  <SelectItem value="P2">P2 – Normal</SelectItem>
                  <SelectItem value="P3">P3 – Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Detalhes</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Assunto *</Label>
              <Input required value={form.subject} onChange={(e) => update("subject", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea rows={4} value={form.description} onChange={(e) => update("description", e.target.value)} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Data de entrega</Label>
                <Input type="date" value={form.delivery_date} onChange={(e) => update("delivery_date", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Data de compra</Label>
                <Input type="date" value={form.purchase_date} onChange={(e) => update("purchase_date", e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_assembled} onChange={(e) => update("is_assembled", e.target.checked)} className="rounded" />
                Produto montado
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_personalized} onChange={(e) => update("is_personalized", e.target.checked)} className="rounded" />
                Personalizado
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_exhibition} onChange={(e) => update("is_exhibition", e.target.checked)} className="rounded" />
                Artigo de exposição
              </label>
            </div>
            <div className="space-y-2">
              <Label>Anexos (fotos/vídeos)</Label>
              <FileUpload
                userId={user?.id || ""}
                attachments={attachments}
                onAttachmentsChange={setAttachments}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/tickets")}>Cancelar</Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar Ticket
          </Button>
        </div>
      </form>
    </div>
  );
}
