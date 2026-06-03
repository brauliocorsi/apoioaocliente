import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Truck, Search, CheckCircle2, XCircle, Plus, Trash2, Pencil, Check, X, PhoneCall, PhoneOff, CalendarDays, HelpCircle, ChevronDown } from "lucide-react";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { startOfDay, startOfWeek, startOfMonth, isAfter } from "date-fns";

type DateFilter = "all" | "today" | "week" | "month";

interface DeliveryConfirmation {
  id: string;
  order_number: string;
  client_phone: string;
  confirmed: boolean;
  contact_attempts: number;
  notes: string | null;
  created_by: string;
  created_at: string;
}

interface AgentProfile {
  id: string;
  full_name: string;
}

export default function DeliveryConfirmations() {
  const { user } = useAuth();
  const [records, setRecords] = useState<DeliveryConfirmation[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPolicies, setShowPolicies] = useState(false);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  // Form state
  const [orderNumber, setOrderNumber] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [confirmed, setConfirmed] = useState<string>("true");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOrder, setEditOrder] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editConfirmed, setEditConfirmed] = useState("true");
  const [editAttempts, setEditAttempts] = useState("1");
  const [editNotes, setEditNotes] = useState("");

  const fetchData = async () => {
    const [{ data: recs }, { data: profs }] = await Promise.all([
      supabase.from("delivery_confirmations").select("*").order("created_at", { ascending: false }),
      supabase.rpc("get_agent_profiles"),
    ]);
    setRecords((recs as DeliveryConfirmation[]) || []);
    setAgents((profs as AgentProfile[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim() || !clientPhone.trim()) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("delivery_confirmations").insert({
      order_number: orderNumber.trim(),
      client_phone: clientPhone.trim(),
      confirmed: confirmed === "true",
      contact_attempts: 1,
      notes: notes.trim() || null,
      created_by: user!.id,
    } as any);
    setSubmitting(false);
    if (error) {
      toast({ title: "Erro ao registar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Confirmação registada com sucesso" });
      setOrderNumber(""); setClientPhone(""); setConfirmed("true"); setNotes("");
      fetchData();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("delivery_confirmations").delete().eq("id", id);
    if (error) toast({ title: "Erro ao apagar", variant: "destructive" });
    else fetchData();
  };

  const startEdit = (r: DeliveryConfirmation) => {
    setEditingId(r.id);
    setEditOrder(r.order_number);
    setEditPhone(r.client_phone);
    setEditConfirmed(r.confirmed ? "true" : "false");
    setEditAttempts(String(r.contact_attempts || 1));
    setEditNotes(r.notes || "");
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async () => {
    if (!editOrder.trim() || !editPhone.trim()) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("delivery_confirmations").update({
      order_number: editOrder.trim(),
      client_phone: editPhone.trim(),
      confirmed: editConfirmed === "true",
      contact_attempts: parseInt(editAttempts) || 1,
      notes: editNotes.trim() || null,
    } as any).eq("id", editingId!);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Registo atualizado" });
      setEditingId(null);
      fetchData();
    }
  };

  const agentName = (id: string) => agents.find(a => a.id === id)?.full_name || "—";

  const getDateCutoff = (filter: DateFilter): Date | null => {
    const now = new Date();
    if (filter === "today") return startOfDay(now);
    if (filter === "week") return startOfWeek(now, { weekStartsOn: 1 });
    if (filter === "month") return startOfMonth(now);
    return null;
  };

  const filtered = records.filter(r => {
    const matchesSearch = r.order_number.toLowerCase().includes(search.toLowerCase()) || r.client_phone.includes(search);
    const cutoff = getDateCutoff(dateFilter);
    const matchesDate = !cutoff || isAfter(new Date(r.created_at), cutoff);
    return matchesSearch && matchesDate;
  });

  const today = new Date().toDateString();
  const todayRecords = records.filter(r => new Date(r.created_at).toDateString() === today);
  const confirmedToday = todayRecords.filter(r => r.confirmed).length;
  const notConfirmedToday = todayRecords.filter(r => !r.confirmed).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Registro de Ligações"
        subtitle="Confirmações de entrega por telefone"
        icon={<Truck className="h-6 w-6" />}
        accent="accent"
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Hoje</p>
            <p className="text-3xl font-bold text-foreground">{todayRecords.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-sm text-muted-foreground">Confirmadas</p>
              <p className="text-3xl font-bold text-foreground">{confirmedToday}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-sm text-muted-foreground">Não confirmadas</p>
              <p className="text-3xl font-bold text-foreground">{notConfirmedToday}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Reference - Termos e Condições */}
      <Card>
        <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowPolicies(p => !p)}>
          <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
            <HelpCircle className="h-4 w-4" />
            Consulta Rápida — Termos e Condições
            <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${showPolicies ? "rotate-180" : ""}`} />
          </CardTitle>
        </CardHeader>
        {showPolicies && (
          <CardContent className="pt-0">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="entrega">
                <AccordionTrigger className="text-sm">📦 Entrega e Montagem</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground space-y-1">
                  <p>• Horário: 8h–20h, segunda a sábado (exceto feriados). Não é possível marcar hora exata.</p>
                  <p>• Pagamento deve ser efetuado antes da descarga e montagem.</p>
                  <p>• O local deve estar limpo e desimpedido. Não inclui desmontagem de móveis antigos.</p>
                  <p>• Anomalias devem ser reportadas com fotos/vídeo em <strong>48 horas</strong> para apoioaocliente@upmoveis.pt</p>
                  <p>• Alterações de data: comunicar com <strong>48h de antecedência</strong>, senão nova taxa de deslocação.</p>
                  <p>• Crianças e animais afastados durante a montagem.</p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="prazos">
                <AccordionTrigger className="text-sm">📅 Prazos de Entrega</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground space-y-1">
                  <p>• Datas indicadas são <strong>estimativas</strong>, sujeitas a variações logísticas.</p>
                  <p>• Quando disponível, contactamos para agendar. Artigos ficam reservados <strong>15 dias</strong>.</p>
                  <p>• Após 15 dias sem resposta, podem ser recolocados à venda.</p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="pagamentos">
                <AccordionTrigger className="text-sm">💳 Pagamentos</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground space-y-1">
                  <p>• Na entrega: Numerário ou Multibanco (comunicar antecipadamente).</p>
                  <p>• Transferência bancária: <strong>não aceite no momento da entrega</strong>. Comunicar antecipadamente para receber IBAN.</p>
                  <p>• seQura: até 12 parcelas, aprovação instantânea.</p>
                  <p>• Produtos sob medida: pagamento antecipado por transferência.</p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="garantia">
                <AccordionTrigger className="text-sm">🛡️ Garantia</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground space-y-1">
                  <p>• <strong>3 anos</strong> para defeitos de fabrico.</p>
                  <p>• Não cobre: danos por uso/montagem inadequada, desgaste normal, produtos de limpeza incorretos.</p>
                  <p>• Contacto: apoioaocliente@upmoveis.pt</p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="devolucoes">
                <AccordionTrigger className="text-sm">🔄 Devoluções e Trocas</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground space-y-1">
                  <p>• Até <strong>15 dias</strong> após compra, se não montado e na embalagem original.</p>
                  <p>• Custos de transporte e recolha a cargo do cliente.</p>
                  <p>• <strong>Exceções:</strong> produtos personalizados, exposição, colchões/almofadas abertos.</p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="exposicao">
                <AccordionTrigger className="text-sm">🏷️ Artigos de Exposição</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground space-y-1">
                  <p>• Vendidos no estado em que se encontram, com possíveis sinais de uso.</p>
                  <p>• Inspecionar antes da compra. Sem devoluções por defeitos visíveis.</p>
                  <p>• Garantia limitada: não cobre sinais de uso pré-existentes.</p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        )}
      </Card>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-4 w-4" /> Novo Registo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="order">Nº Encomenda *</Label>
              <Input id="order" placeholder="Ex: 12345" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone do Cliente *</Label>
              <Input id="phone" placeholder="Ex: 912345678" value={clientPhone} onChange={e => setClientPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Confirmou entrega?</Label>
              <RadioGroup value={confirmed} onValueChange={setConfirmed} className="flex gap-4 pt-1">
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="true" id="yes" />
                  <Label htmlFor="yes" className="font-normal cursor-pointer">Sim</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="false" id="no" />
                  <Label htmlFor="no" className="font-normal cursor-pointer">Não</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Input id="notes" placeholder="Opcional" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <div className="md:col-span-2 lg:col-span-4">
              <Button type="submit" disabled={submitting} className="w-full md:w-auto">
                {submitting ? "A registar..." : "Registar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Search + Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por nº encomenda ou telefone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="max-w-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="today">Hoje</SelectItem>
                  <SelectItem value="week">Esta semana</SelectItem>
                  <SelectItem value="month">Este mês</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm py-4">A carregar...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">Sem registos.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Nº Encomenda</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Tentativas</TableHead>
                  <TableHead>Observações</TableHead>
                  <TableHead>Agente</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(r.created_at), "dd/MM/yyyy HH:mm", { locale: pt })}
                    </TableCell>
                    {editingId === r.id ? (
                      <>
                        <TableCell><Input value={editOrder} onChange={e => setEditOrder(e.target.value)} className="h-8 text-sm" /></TableCell>
                        <TableCell><Input value={editPhone} onChange={e => setEditPhone(e.target.value)} className="h-8 text-sm" /></TableCell>
                        <TableCell>
                          <RadioGroup value={editConfirmed} onValueChange={setEditConfirmed} className="flex gap-3">
                            <div className="flex items-center gap-1"><RadioGroupItem value="true" id={`ey-${r.id}`} /><Label htmlFor={`ey-${r.id}`} className="text-xs font-normal cursor-pointer">Sim</Label></div>
                            <div className="flex items-center gap-1"><RadioGroupItem value="false" id={`en-${r.id}`} /><Label htmlFor={`en-${r.id}`} className="text-xs font-normal cursor-pointer">Não</Label></div>
                          </RadioGroup>
                        </TableCell>
                        <TableCell><Input type="number" min="1" max="99" value={editAttempts} onChange={e => setEditAttempts(e.target.value)} className="h-8 text-sm w-16" /></TableCell>
                        <TableCell><Input value={editNotes} onChange={e => setEditNotes(e.target.value)} className="h-8 text-sm" /></TableCell>
                        <TableCell className="text-sm">{agentName(r.created_by)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <button onClick={saveEdit} className="text-primary hover:text-primary/80 transition-colors"><Check className="h-4 w-4" /></button>
                            <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground transition-colors"><X className="h-4 w-4" /></button>
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="font-medium">{r.order_number}</TableCell>
                        <TableCell>{r.client_phone}</TableCell>
                        <TableCell>
                          {r.confirmed ? (
                            <Badge className="bg-green-500/15 text-green-700 border-green-300 dark:text-green-400 gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Confirmada
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <PhoneOff className="h-3 w-3" /> Não atendeu
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={async () => {
                              const newCount = (r.contact_attempts || 1) + 1;
                              const { error } = await supabase.from("delivery_confirmations").update({ contact_attempts: newCount } as any).eq("id", r.id);
                              if (error) toast({ title: "Erro ao atualizar", variant: "destructive" });
                              else fetchData();
                            }}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-accent transition-colors"
                            title="Adicionar tentativa"
                          >
                            <PhoneCall className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">{r.contact_attempts}</span>
                            <Plus className="h-3 w-3 text-muted-foreground" />
                          </button>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{r.notes || "—"}</TableCell>
                        <TableCell className="text-sm">{agentName(r.created_by)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <button onClick={() => startEdit(r)} className="text-muted-foreground hover:text-primary transition-colors"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => handleDelete(r.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
