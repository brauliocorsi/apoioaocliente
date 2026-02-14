import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, ChevronDown, Link, X, Phone, FileText, Ticket, Eraser } from "lucide-react";
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
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [suggestedTickets, setSuggestedTickets] = useState<any[]>([]);

  // Auto-search tickets by client_name
  useEffect(() => {
    if (!form.client_name || form.client_name.length < 2) {
      if (!form.invoice_number || form.invoice_number.length < 1) {
        setSuggestedTickets([]);
      }
      return;
    }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from("tickets")
        .select("id, ticket_number, subject, client_name, client_phone, order_number, status")
        .ilike("client_name", `%${form.client_name}%`)
        .limit(10);
      mergeSuggestions(data || [], "name");
    }, 400);
    return () => clearTimeout(timeout);
  }, [form.client_name]);

  // Auto-search tickets by invoice_number → order_number
  useEffect(() => {
    if (!form.invoice_number || form.invoice_number.length < 1) {
      if (!form.client_name || form.client_name.length < 2) {
        setSuggestedTickets([]);
      }
      return;
    }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from("tickets")
        .select("id, ticket_number, subject, client_name, client_phone, order_number, status")
        .eq("order_number", form.invoice_number)
        .limit(10);
      mergeSuggestions(data || [], "invoice");
    }, 400);
    return () => clearTimeout(timeout);
  }, [form.invoice_number]);

  const mergeSuggestions = (newResults: any[], _source: string) => {
    setSuggestedTickets((prev) => {
      const all = [...prev, ...newResults];
      const unique = Array.from(new Map(all.map((t) => [t.id, t])).values());
      return unique.slice(0, 10);
    });
  };

  const selectTicket = (ticket: any) => {
    setSelectedTicket(ticket);
    setForm((prev) => ({
      ...prev,
      client_name: ticket.client_name || prev.client_name,
      client_phone: ticket.client_phone || prev.client_phone,
    }));
  };

  const clearForm = () => {
    setForm({ client_name: "", client_phone: "", invoice_number: "", subject: "", priority: "P2" });
    setSelectedTicket(null);
    setSuggestedTickets([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client_name || !form.client_phone || !form.subject) return;
    setLoading(true);

    const { data: inserted, error } = await supabase.from("phone_calls" as any).insert({
      client_name: form.client_name,
      client_phone: form.client_phone,
      invoice_number: form.invoice_number || null,
      subject: form.subject,
      priority: form.priority,
      status: "pendente",
      ticket_id: selectedTicket?.id || null,
    } as any).select("id").single();

    if (error) {
      toast({ title: "Erro ao registar ligação", description: error.message, variant: "destructive" });
    } else {
      if (selectedTicket?.id && inserted) {
        const { data: userData } = await supabase.auth.getUser();
        await supabase.from("ticket_events").insert({
          ticket_id: selectedTicket.id,
          user_id: userData?.user?.id || null,
          event_type: "phone_call_linked",
          content: `📞 Ligação telefónica registada: "${form.subject}" — Cliente: ${form.client_name} (${form.client_phone})`,
          metadata: { phone_call_id: (inserted as any).id },
        });
      }
      toast({ title: "Ligação registada com sucesso" });
      clearForm();
      setOpen(false);
      onCreated();
    }
    setLoading(false);
  };

  const priorityColor = (p: string) =>
    p === "P1" ? "bg-destructive/10 text-destructive border-destructive/30" :
    p === "P2" ? "bg-warning/10 text-warning border-warning/30" :
    "bg-muted text-muted-foreground border-border";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-t-4 border-t-primary">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer flex flex-row items-center justify-between hover:bg-muted/30 transition-colors rounded-t-lg">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10">
                <Plus className="h-4 w-4 text-primary" />
              </div>
              Registar Nova Ligação
            </CardTitle>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Client info section */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> Dados do Cliente
                </h4>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="invoice_number" className="text-sm flex items-center gap-1">
                      <FileText className="h-3 w-3" /> Nº da Nota / Encomenda
                    </Label>
                    <Input
                      id="invoice_number"
                      placeholder="Nº da encomenda..."
                      value={form.invoice_number}
                      onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="client_name" className="text-sm">
                      Nome do Cliente <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="client_name"
                      placeholder="Digite o nome do cliente..."
                      value={form.client_name}
                      onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="client_phone" className="text-sm">
                      Contato/Telefone <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="client_phone"
                      placeholder="Ex: 912345678"
                      value={form.client_phone}
                      onChange={(e) => setForm({ ...form, client_phone: e.target.value })}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Call details section */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" /> Detalhes da Ligação
                </h4>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
                    <Label htmlFor="subject" className="text-sm">
                      Assunto <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="subject"
                      placeholder="Descreva o assunto da ligação..."
                      value={form.subject}
                      onChange={(e) => setForm({ ...form, subject: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Prioridade</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="P1">P1 – Urgente</SelectItem>
                        <SelectItem value="P2">P2 – Normal</SelectItem>
                        <SelectItem value="P3">P3 – Baixa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Suggested tickets */}
              {suggestedTickets.length > 0 && !selectedTicket && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Ticket className="h-3.5 w-3.5" /> Tickets Sugeridos
                  </h4>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {suggestedTickets.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="text-left p-3 rounded-lg border bg-card hover:bg-accent hover:border-primary/40 transition-colors group"
                        onClick={() => selectTicket(t)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-mono font-semibold text-primary">#{t.ticket_number}</span>
                          <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
                        </div>
                        <p className="text-sm font-medium line-clamp-1">{t.subject}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.client_name}</p>
                        {t.order_number && (
                          <p className="text-xs text-muted-foreground mt-0.5">Encomenda: {t.order_number}</p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected ticket */}
              {selectedTicket && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Link className="h-3.5 w-3.5" /> Ticket Vinculado
                  </h4>
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
                    <Ticket className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm font-mono font-semibold text-primary">#{selectedTicket.ticket_number}</span>
                    <span className="text-sm text-muted-foreground truncate flex-1">
                      {selectedTicket.subject} — {selectedTicket.client_name}
                    </span>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 hover:bg-destructive/10" onClick={() => setSelectedTicket(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" onClick={clearForm} className="gap-1.5">
                  <Eraser className="h-3.5 w-3.5" /> Limpar
                </Button>
                <Button type="submit" disabled={loading} className="gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {loading ? "A registar..." : "Registar Ligação"}
                </Button>
              </div>
            </form>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
