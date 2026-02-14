import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface PhoneCallFormProps {
  onCreated: () => void;
}

export default function PhoneCallForm({ onCreated }: PhoneCallFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    client_name: "",
    client_phone: "",
    invoice_number: "",
    subject: "",
    priority: "P2",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client_name || !form.client_phone || !form.subject) return;
    setLoading(true);
    const { error } = await supabase.from("phone_calls" as any).insert({
      client_name: form.client_name,
      client_phone: form.client_phone,
      invoice_number: form.invoice_number || null,
      subject: form.subject,
      priority: form.priority,
      status: "pendente",
    } as any);
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao registar ligação", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Ligação registada com sucesso" });
      setForm({ client_name: "", client_phone: "", invoice_number: "", subject: "", priority: "P2" });
      setOpen(false);
      onCreated();
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4" /> Registar Nova Ligação
            </CardTitle>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="client_name">Nome do Cliente *</Label>
                <Input id="client_name" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="client_phone">Contato/Telefone *</Label>
                <Input id="client_phone" value={form.client_phone} onChange={(e) => setForm({ ...form, client_phone: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invoice_number">Nº da Nota</Label>
                <Input id="invoice_number" value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
                <Label htmlFor="subject">Assunto *</Label>
                <Input id="subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="P1">P1 – Urgente</SelectItem>
                    <SelectItem value="P2">P2 – Normal</SelectItem>
                    <SelectItem value="P3">P3 – Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
                <Button type="submit" disabled={loading}>{loading ? "A registar..." : "Registar Ligação"}</Button>
              </div>
            </form>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
