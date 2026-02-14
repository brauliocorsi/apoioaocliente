import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, ChevronDown, Link, X } from "lucide-react";
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
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketResults, setTicketResults] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [searching, setSearching] = useState(false);

  // Search tickets when user types
  useEffect(() => {
    if (!ticketSearch || ticketSearch.length < 2) {
      setTicketResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearching(true);
      const isNumber = /^\d+$/.test(ticketSearch);
      let query = supabase.from("tickets").select("id, ticket_number, subject, client_name").limit(8);
      if (isNumber) {
        query = query.eq("ticket_number", parseInt(ticketSearch));
      } else {
        query = query.or(`client_name.ilike.%${ticketSearch}%,subject.ilike.%${ticketSearch}%`);
      }
      const { data } = await query;
      setTicketResults(data || []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [ticketSearch]);

  // Auto-fill client info when ticket is selected
  const selectTicket = (ticket: any) => {
    setSelectedTicket(ticket);
    setTicketSearch("");
    setTicketResults([]);
    if (ticket.client_name && !form.client_name) {
      setForm((prev) => ({ ...prev, client_name: ticket.client_name }));
    }
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
      // Register in ticket timeline if linked
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
      setForm({ client_name: "", client_phone: "", invoice_number: "", subject: "", priority: "P2" });
      setSelectedTicket(null);
      setOpen(false);
      onCreated();
    }
    setLoading(false);
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

              {/* Ticket linking */}
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                <Label className="flex items-center gap-1.5">
                  <Link className="h-3.5 w-3.5" /> Vincular a Ticket (opcional)
                </Label>
                {selectedTicket ? (
                  <div className="flex items-center gap-2 p-2 rounded border bg-muted/50">
                    <span className="text-sm font-medium">#{selectedTicket.ticket_number}</span>
                    <span className="text-sm text-muted-foreground truncate flex-1">
                      {selectedTicket.subject} — {selectedTicket.client_name}
                    </span>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedTicket(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      placeholder="Pesquisar ticket por nº, nome do cliente ou assunto..."
                      value={ticketSearch}
                      onChange={(e) => setTicketSearch(e.target.value)}
                    />
                    {ticketResults.length > 0 && (
                      <div className="absolute z-10 top-full mt-1 w-full bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
                        {ticketResults.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                            onClick={() => selectTicket(t)}
                          >
                            <span className="font-medium">#{t.ticket_number}</span>
                            <span className="text-muted-foreground truncate">{t.subject} — {t.client_name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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
