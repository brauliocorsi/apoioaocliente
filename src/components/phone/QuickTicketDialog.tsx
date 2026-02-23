import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Ticket } from "lucide-react";

interface QuickTicketDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (ticket: { id: string; ticket_number: number; subject: string }) => void;
  prefill?: {
    client_name?: string;
    client_phone?: string;
    invoice_number?: string;
    subject?: string;
    priority?: string;
  };
}

type Category = { id: string; name: string };
type Subcategory = { id: string; category_id: string; name: string };

export default function QuickTicketDialog({ open, onClose, onCreated, prefill }: QuickTicketDialogProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    client_name: "",
    client_phone: "",
    order_number: "",
    subject: "",
    description: "",
    category_id: "",
    subcategory_id: "",
    priority: "P2",
  });

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const [{ data: cats }, { data: subs }] = await Promise.all([
        supabase.from("categories").select("id, name").order("sort_order"),
        supabase.from("subcategories").select("id, category_id, name").order("sort_order"),
      ]);
      setCategories(cats || []);
      setSubcategories(subs || []);
    };
    load();
  }, [open]);

  useEffect(() => {
    if (open && prefill) {
      setForm((prev) => ({
        ...prev,
        client_name: prefill.client_name || "",
        client_phone: prefill.client_phone || "",
        order_number: prefill.invoice_number || "",
        subject: prefill.subject ? `Ligação: ${prefill.subject}` : "",
        priority: prefill.priority || "P2",
        description: "",
        category_id: "",
        subcategory_id: "",
      }));
    }
  }, [open, prefill]);

  const filteredSubs = subcategories.filter((s) => s.category_id === form.category_id);

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "category_id") setForm((prev) => ({ ...prev, subcategory_id: "", [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client_name || !form.subject) return;
    setSubmitting(true);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      toast({ title: "Erro de autenticação", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    // SLA calculation
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
      client_phone: form.client_phone || null,
      order_number: form.order_number || null,
      subject: form.subject,
      description: form.description || null,
      category_id: form.category_id || null,
      subcategory_id: form.subcategory_id || null,
      priority: form.priority as any,
      sla_first_response_at,
      sla_resolution_at,
      created_by: userData.user.id,
    }).select("id, ticket_number, subject").single();

    if (error) {
      toast({ title: "Erro ao criar ticket", description: error.message, variant: "destructive" });
    } else if (data) {
      await supabase.from("ticket_events").insert({
        ticket_id: data.id,
        user_id: userData.user.id,
        event_type: "created",
        content: "Ticket criado via registo de ligação telefónica",
      });
      toast({ title: "Ticket criado com sucesso", description: `#${data.ticket_number}` });
      onCreated(data);
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" />
            Criar Ticket Rápido
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Nome do Cliente <span className="text-destructive">*</span></Label>
              <Input value={form.client_name} onChange={(e) => update("client_name", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Telefone</Label>
              <Input value={form.client_phone} onChange={(e) => update("client_phone", e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Nº Encomenda</Label>
              <Input value={form.order_number} onChange={(e) => update("order_number", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Prioridade</Label>
              <Select value={form.priority} onValueChange={(v) => update("priority", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="P1">P1 – Urgente</SelectItem>
                  <SelectItem value="P2">P2 – Normal</SelectItem>
                  <SelectItem value="P3">P3 – Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Categoria</Label>
              <Select value={form.category_id} onValueChange={(v) => update("category_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.id} – {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Subcategoria</Label>
              <Select value={form.subcategory_id} onValueChange={(v) => update("subcategory_id", v)} disabled={!form.category_id}>
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  {filteredSubs.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Assunto <span className="text-destructive">*</span></Label>
            <Input value={form.subject} onChange={(e) => update("subject", e.target.value)} required />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Descrição</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Detalhes adicionais..." />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={submitting} className="gap-1.5">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
              Criar Ticket
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
