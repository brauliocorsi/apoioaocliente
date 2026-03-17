import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { ClipboardCheck, Search, Plus, Trash2, Pencil, Check, X, CalendarDays, CheckCircle2, XCircle, Star, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { startOfDay, startOfWeek, startOfMonth, isAfter } from "date-fns";

type DateFilter = "all" | "today" | "week" | "month";

interface PostDeliveryRecord {
  id: string;
  order_number: string;
  client_name: string;
  client_phone: string;
  delivery_date: string | null;
  product_ok: boolean;
  assembly_ok: boolean;
  no_damage: boolean;
  client_satisfied: boolean;
  issues_reported: string | null;
  assembly_nps: number | null;
  notes: string | null;
  created_by: string;
  created_at: string;
}

interface AgentProfile {
  id: string;
  full_name: string;
}

export default function PostDeliveryConfirmations() {
  const { user } = useAuth();
  const [records, setRecords] = useState<PostDeliveryRecord[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  // Form
  const [orderNumber, setOrderNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [productOk, setProductOk] = useState(false);
  const [assemblyOk, setAssemblyOk] = useState(false);
  const [noDamage, setNoDamage] = useState(false);
  const [clientSatisfied, setClientSatisfied] = useState(false);
  const [issuesReported, setIssuesReported] = useState("");
  const [assemblyNps, setAssemblyNps] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<PostDeliveryRecord>>({});
  const [previewRecord, setPreviewRecord] = useState<PostDeliveryRecord | null>(null);

  const fetchData = async () => {
    const [{ data: recs }, { data: profs }] = await Promise.all([
      supabase.from("post_delivery_confirmations").select("*").order("created_at", { ascending: false }),
      supabase.rpc("get_agent_profiles"),
    ]);
    setRecords((recs as PostDeliveryRecord[]) || []);
    setAgents((profs as AgentProfile[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim() || !clientName.trim() || !clientPhone.trim()) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("post_delivery_confirmations").insert({
      order_number: orderNumber.trim(),
      client_name: clientName.trim(),
      client_phone: clientPhone.trim(),
      delivery_date: deliveryDate || null,
      product_ok: productOk,
      assembly_ok: assemblyOk,
      no_damage: noDamage,
      client_satisfied: clientSatisfied,
      issues_reported: issuesReported.trim() || null,
      assembly_nps: assemblyNps,
      notes: notes.trim() || null,
      created_by: user!.id,
    } as any);
    setSubmitting(false);
    if (error) {
      toast({ title: "Erro ao registar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Confirmação pós-entrega registada" });
      setOrderNumber(""); setClientName(""); setClientPhone(""); setDeliveryDate("");
      setProductOk(false); setAssemblyOk(false); setNoDamage(false); setClientSatisfied(false);
      setIssuesReported(""); setAssemblyNps(null); setNotes("");
      fetchData();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("post_delivery_confirmations").delete().eq("id", id);
    if (error) toast({ title: "Erro ao apagar", variant: "destructive" });
    else fetchData();
  };

  const startEdit = (r: PostDeliveryRecord) => {
    setEditingId(r.id);
    setEditData({ ...r });
  };

  const saveEdit = async () => {
    if (!editData.order_number?.trim() || !editData.client_name?.trim() || !editData.client_phone?.trim()) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("post_delivery_confirmations").update({
      order_number: editData.order_number!.trim(),
      client_name: editData.client_name!.trim(),
      client_phone: editData.client_phone!.trim(),
      delivery_date: editData.delivery_date || null,
      product_ok: editData.product_ok ?? false,
      assembly_ok: editData.assembly_ok ?? false,
      no_damage: editData.no_damage ?? false,
      client_satisfied: editData.client_satisfied ?? false,
      issues_reported: editData.issues_reported?.trim() || null,
      assembly_nps: editData.assembly_nps ?? null,
      notes: editData.notes?.trim() || null,
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
    const matchesSearch = r.order_number.toLowerCase().includes(search.toLowerCase()) ||
      r.client_name.toLowerCase().includes(search.toLowerCase()) ||
      r.client_phone.includes(search);
    const cutoff = getDateCutoff(dateFilter);
    const matchesDate = !cutoff || isAfter(new Date(r.created_at), cutoff);
    return matchesSearch && matchesDate;
  });

  const checkCount = (r: PostDeliveryRecord) => [r.product_ok, r.assembly_ok, r.no_damage, r.client_satisfied].filter(Boolean).length;

  const today = new Date().toDateString();
  const todayRecords = records.filter(r => new Date(r.created_at).toDateString() === today);
  const allOkToday = todayRecords.filter(r => checkCount(r) === 4).length;
  const npsRecords = records.filter(r => r.assembly_nps != null && r.assembly_nps > 0);
  const avgNps = npsRecords.length > 0 ? (npsRecords.reduce((sum, r) => sum + (r.assembly_nps || 0), 0) / npsRecords.length) : null;

  const CheckItem = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <div className="flex items-center gap-2">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <Label className="font-normal cursor-pointer text-sm">{label}</Label>
    </div>
  );

  const StarRating = ({ value, onChange, readOnly = false }: { value: number | null; onChange?: (v: number) => void; readOnly?: boolean }) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(value === star ? 0 : star)}
          className={`transition-colors ${readOnly ? "cursor-default" : "cursor-pointer hover:text-yellow-400"}`}
        >
          <Star
            className={`h-5 w-5 ${(value ?? 0) >= star ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`}
          />
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Confirmação Pós-Entrega</h1>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
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
              <p className="text-sm text-muted-foreground">Tudo OK</p>
              <p className="text-3xl font-bold text-foreground">{allOkToday}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-sm text-muted-foreground">Com problemas</p>
              <p className="text-3xl font-bold text-foreground">{todayRecords.length - allOkToday}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
            <div>
              <p className="text-sm text-muted-foreground">NPS Montagem</p>
              <div className="flex items-baseline gap-1.5">
                <p className="text-3xl font-bold text-foreground">{avgNps !== null ? avgNps.toFixed(1) : "—"}</p>
                {avgNps !== null && <span className="text-xs text-muted-foreground">/ 5 ({npsRecords.length})</span>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-4 w-4" /> Novo Registo Pós-Entrega
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Nº Encomenda *</Label>
                <Input placeholder="Ex: 12345" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Nome do Cliente *</Label>
                <Input placeholder="Nome" value={clientName} onChange={e => setClientName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Telefone *</Label>
                <Input placeholder="912345678" value={clientPhone} onChange={e => setClientPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Data da Entrega</Label>
                <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
              </div>
            </div>

            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <Label className="text-sm font-semibold">Checklist de Verificação</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <CheckItem label="Produto OK" checked={productOk} onChange={setProductOk} />
                <CheckItem label="Montagem OK" checked={assemblyOk} onChange={setAssemblyOk} />
                <CheckItem label="Sem danos" checked={noDamage} onChange={setNoDamage} />
                <CheckItem label="Cliente satisfeito" checked={clientSatisfied} onChange={setClientSatisfied} />
              </div>
              <div className="pt-2">
                <Label className="text-sm">NPS Equipa de Montagem</Label>
                <StarRating value={assemblyNps} onChange={setAssemblyNps} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Problemas reportados</Label>
                <Textarea placeholder="Descreva problemas encontrados..." value={issuesReported} onChange={e => setIssuesReported(e.target.value)} rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea placeholder="Notas adicionais..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
              </div>
            </div>

            <Button type="submit" disabled={submitting} className="w-full md:w-auto">
              {submitting ? "A registar..." : "Registar"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input placeholder="Pesquisar..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Nº Encomenda</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Checklist</TableHead>
                    <TableHead>NPS Montagem</TableHead>
                    <TableHead>Problemas</TableHead>
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
                          <TableCell><Input value={editData.order_number || ""} onChange={e => setEditData(d => ({ ...d, order_number: e.target.value }))} className="h-8 text-sm" /></TableCell>
                          <TableCell><Input value={editData.client_name || ""} onChange={e => setEditData(d => ({ ...d, client_name: e.target.value }))} className="h-8 text-sm" /></TableCell>
                          <TableCell><Input value={editData.client_phone || ""} onChange={e => setEditData(d => ({ ...d, client_phone: e.target.value }))} className="h-8 text-sm" /></TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <CheckItem label="Produto" checked={editData.product_ok ?? false} onChange={v => setEditData(d => ({ ...d, product_ok: v }))} />
                              <CheckItem label="Montagem" checked={editData.assembly_ok ?? false} onChange={v => setEditData(d => ({ ...d, assembly_ok: v }))} />
                              <CheckItem label="Sem danos" checked={editData.no_damage ?? false} onChange={v => setEditData(d => ({ ...d, no_damage: v }))} />
                              <CheckItem label="Satisfeito" checked={editData.client_satisfied ?? false} onChange={v => setEditData(d => ({ ...d, client_satisfied: v }))} />
                            </div>
                          </TableCell>
                          <TableCell>
                            <StarRating value={editData.assembly_nps ?? null} onChange={v => setEditData(d => ({ ...d, assembly_nps: v }))} />
                          </TableCell>
                          <TableCell><Input value={editData.issues_reported || ""} onChange={e => setEditData(d => ({ ...d, issues_reported: e.target.value }))} className="h-8 text-sm" /></TableCell>
                          <TableCell className="text-sm">{agentName(r.created_by)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <button onClick={saveEdit} className="text-primary hover:text-primary/80 transition-colors"><Check className="h-4 w-4" /></button>
                              <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground transition-colors"><X className="h-4 w-4" /></button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="font-medium">{r.order_number}</TableCell>
                          <TableCell>{r.client_name}</TableCell>
                          <TableCell>{r.client_phone}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {[
                                { ok: r.product_ok, label: "Produto" },
                                { ok: r.assembly_ok, label: "Montagem" },
                                { ok: r.no_damage, label: "Sem danos" },
                                { ok: r.client_satisfied, label: "Satisfeito" },
                              ].map(item => (
                                <Badge key={item.label} variant={item.ok ? "default" : "outline"} className={`text-[10px] ${item.ok ? "bg-green-500/15 text-green-700 border-green-300 dark:text-green-400" : ""}`}>
                                  {item.ok ? "✓" : "✗"} {item.label}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <StarRating value={r.assembly_nps} readOnly />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{r.issues_reported || "—"}</TableCell>
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
