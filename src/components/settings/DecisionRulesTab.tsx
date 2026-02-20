import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, GripVertical, ChevronDown, ChevronUp } from "lucide-react";
import type { DecisionRule } from "@/lib/decisionEngine";

const CONDITION_TYPES = [
  { value: "category", label: "Categoria" },
  { value: "subcategory", label: "Subcategoria" },
  { value: "payment_method", label: "Método de Pagamento" },
  { value: "field_bool", label: "Campo Booleano" },
  { value: "tag_exists", label: "Tag Presente" },
  { value: "delivery_hours", label: "Horas desde Entrega" },
];

const emptyRule: Omit<DecisionRule, "sort_order"> & { sort_order: number } = {
  id: "",
  name: "",
  description: "",
  condition_type: "category",
  condition_value: "",
  condition_extra: {},
  suggested_tag_ids: [],
  suggested_clause_ids: [],
  suggested_macro_id: null,
  message: "",
  is_active: true,
  sort_order: 0,
};

export default function DecisionRulesTab() {
  const { role } = useAuth();
  const { toast } = useToast();
  const isSupervisor = role === "supervisor";

  const [rules, setRules] = useState<DecisionRule[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string; color: string | null }[]>([]);
  const [clauses, setClauses] = useState<{ id: string; code: string; description: string }[]>([]);
  const [macros, setMacros] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<DecisionRule | null>(null);
  const [form, setForm] = useState<typeof emptyRule>({ ...emptyRule });
  const [saving, setSaving] = useState(false);

  // condition_extra editor as JSON string
  const [extraJson, setExtraJson] = useState("{}");
  const [extraError, setExtraError] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: r }, { data: t }, { data: c }, { data: m }] = await Promise.all([
      supabase.from("decision_rules" as any).select("*").order("sort_order"),
      supabase.from("tags").select("id, name, color").order("name"),
      supabase.from("clauses").select("id, code, description").order("code"),
      supabase.from("macros").select("id, title").order("title"),
    ]);
    setRules(((r as unknown) as DecisionRule[]) || []);
    setTags((t as any) || []);
    setClauses((c as any) || []);
    setMacros((m as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const openCreate = () => {
    const maxOrder = rules.reduce((max, r) => Math.max(max, r.sort_order), 0);
    setEditingRule(null);
    setForm({ ...emptyRule, sort_order: maxOrder + 10 });
    setExtraJson("{}");
    setExtraError(false);
    setDialogOpen(true);
  };

  const openEdit = (rule: DecisionRule) => {
    setEditingRule(rule);
    setForm({ ...rule });
    setExtraJson(JSON.stringify(rule.condition_extra || {}, null, 2));
    setExtraError(false);
    setDialogOpen(true);
  };

  const handleExtraChange = (val: string) => {
    setExtraJson(val);
    try {
      JSON.parse(val);
      setExtraError(false);
    } catch {
      setExtraError(true);
    }
  };

  const toggleTag = (id: string) => {
    setForm((prev) => ({
      ...prev,
      suggested_tag_ids: prev.suggested_tag_ids.includes(id)
        ? prev.suggested_tag_ids.filter((t) => t !== id)
        : [...prev.suggested_tag_ids, id],
    }));
  };

  const toggleClause = (id: string) => {
    setForm((prev) => ({
      ...prev,
      suggested_clause_ids: prev.suggested_clause_ids.includes(id)
        ? prev.suggested_clause_ids.filter((c) => c !== id)
        : [...prev.suggested_clause_ids, id],
    }));
  };

  const handleSave = async () => {
    if (!form.id.trim()) { toast({ title: "ID obrigatório", variant: "destructive" }); return; }
    if (!form.name.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    if (!form.message.trim()) { toast({ title: "Mensagem obrigatória", variant: "destructive" }); return; }
    if (extraError) { toast({ title: "JSON inválido no campo Extra", variant: "destructive" }); return; }

    setSaving(true);
    let extra: Record<string, any> = {};
    try { extra = JSON.parse(extraJson); } catch { extra = {}; }

    const payload = {
      ...form,
      condition_extra: extra,
      suggested_macro_id: form.suggested_macro_id || null,
    };

    let error;
    if (editingRule) {
      ({ error } = await supabase.from("decision_rules" as any).update(payload).eq("id", editingRule.id));
    } else {
      ({ error } = await supabase.from("decision_rules" as any).insert(payload));
    }

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingRule ? "Regra actualizada" : "Regra criada" });
      setDialogOpen(false);
      fetchAll();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("decision_rules" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao eliminar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Regra eliminada" });
      fetchAll();
    }
  };

  const handleToggleActive = async (rule: DecisionRule) => {
    const { error } = await supabase.from("decision_rules" as any).update({ is_active: !rule.is_active }).eq("id", rule.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      fetchAll();
    }
  };

  const moveOrder = async (rule: DecisionRule, direction: "up" | "down") => {
    const sorted = [...rules].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((r) => r.id === rule.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const swapRule = sorted[swapIdx];
    await Promise.all([
      supabase.from("decision_rules" as any).update({ sort_order: swapRule.sort_order }).eq("id", rule.id),
      supabase.from("decision_rules" as any).update({ sort_order: rule.sort_order }).eq("id", swapRule.id),
    ]);
    fetchAll();
  };

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground">A carregar...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Motor de Regras</h2>
          <p className="text-sm text-muted-foreground">Configure as regras de sugestão automática de etiquetas, cláusulas e macros.</p>
        </div>
        {isSupervisor && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Nova Regra
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Condição</TableHead>
              <TableHead>Sugestões</TableHead>
              <TableHead className="w-20">Ativa</TableHead>
              {isSupervisor && <TableHead className="w-24"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                  Sem regras configuradas
                </TableCell>
              </TableRow>
            )}
            {rules.map((rule) => (
              <TableRow key={rule.id} className={!rule.is_active ? "opacity-50" : ""}>
                <TableCell>
                  {isSupervisor && (
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => moveOrder(rule, "up")} className="hover:text-primary"><ChevronUp className="h-3.5 w-3.5" /></button>
                      <button onClick={() => moveOrder(rule, "down")} className="hover:text-primary"><ChevronDown className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs font-semibold">{rule.id}</TableCell>
                <TableCell>
                  <p className="font-medium text-sm">{rule.name}</p>
                  {rule.description && <p className="text-xs text-muted-foreground">{rule.description}</p>}
                </TableCell>
                <TableCell className="text-xs">
                  <Badge variant="outline" className="text-xs">
                    {CONDITION_TYPES.find((c) => c.value === rule.condition_type)?.label || rule.condition_type}
                  </Badge>
                  {rule.condition_value && (
                    <span className="ml-1 font-mono text-muted-foreground">= {rule.condition_value}</span>
                  )}
                </TableCell>
                <TableCell className="text-xs space-y-1">
                  {rule.suggested_tag_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {rule.suggested_tag_ids.map((id) => (
                        <Badge key={id} variant="secondary" className="text-xs px-1.5 py-0">{id}</Badge>
                      ))}
                    </div>
                  )}
                  {rule.suggested_clause_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {rule.suggested_clause_ids.map((id) => (
                        <Badge key={id} variant="secondary" className="text-xs px-1.5 py-0">{id}</Badge>
                      ))}
                    </div>
                  )}
                  {rule.suggested_macro_id && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0">
                      📋 {rule.suggested_macro_id}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {isSupervisor ? (
                    <Switch checked={rule.is_active} onCheckedChange={() => handleToggleActive(rule)} />
                  ) : (
                    <Badge variant={rule.is_active ? "default" : "secondary"}>{rule.is_active ? "Sim" : "Não"}</Badge>
                  )}
                </TableCell>
                {isSupervisor && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(rule)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminar regra {rule.id}?</AlertDialogTitle>
                            <AlertDialogDescription>Esta acção é irreversível.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(rule.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? `Editar Regra ${editingRule.id}` : "Nova Regra"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>ID da Regra *</Label>
                <Input
                  placeholder="ex: R8"
                  value={form.id}
                  onChange={(e) => setForm((p) => ({ ...p, id: e.target.value }))}
                  disabled={!!editingRule}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ordem</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((p) => ({ ...p, sort_order: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                placeholder="Nome legível da regra"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input
                placeholder="Quando é que esta regra se activa?"
                value={form.description || ""}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Mensagem apresentada ao agente *</Label>
              <Textarea
                placeholder="Mensagem que aparece no painel Motor de Regras"
                value={form.message}
                onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tipo de Condição</Label>
                <Select value={form.condition_type} onValueChange={(v) => setForm((p) => ({ ...p, condition_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONDITION_TYPES.map((ct) => (
                      <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Valor da Condição</Label>
                <Input
                  placeholder="ex: B, A4, multibanco"
                  value={form.condition_value || ""}
                  onChange={(e) => setForm((p) => ({ ...p, condition_value: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Parâmetros Extra (JSON)</Label>
              <Textarea
                className={`font-mono text-xs ${extraError ? "border-destructive" : ""}`}
                rows={3}
                value={extraJson}
                onChange={(e) => handleExtraChange(e.target.value)}
              />
              {extraError && <p className="text-xs text-destructive">JSON inválido</p>}
              <p className="text-xs text-muted-foreground">
                Exemplos: <code>{"{"}"field":"is_assembled","category_id":"D"{"}"}</code> · <code>{"{"}"hours":48,"direction":"after"{"}"}</code> · <code>{"{"}"tags":["humidade"]{"}"}</code>
              </p>
            </div>

            {/* Tags sugeridas */}
            <div className="space-y-1.5">
              <Label>Etiquetas Sugeridas</Label>
              <div className="border rounded-md p-3 max-h-40 overflow-y-auto">
                {tags.length === 0 && <p className="text-xs text-muted-foreground">Sem etiquetas configuradas</p>}
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => {
                    const selected = form.suggested_tag_ids.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border transition-colors ${
                          selected
                            ? "border-primary bg-primary/10 text-primary font-semibold"
                            : "border-border bg-background text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        <span
                          className="h-2 w-2 rounded-full shrink-0 bg-muted-foreground"
                          style={tag.color ? { backgroundColor: tag.color } : undefined}
                        />
                        {tag.name}
                        {selected && <span>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              {form.suggested_tag_ids.length > 0 && (
                <p className="text-xs text-muted-foreground">Seleccionadas: {form.suggested_tag_ids.join(", ")}</p>
              )}
            </div>

            {/* Cláusulas sugeridas */}
            <div className="space-y-1.5">
              <Label>Cláusulas Sugeridas</Label>
              <div className="border rounded-md p-3 max-h-48 overflow-y-auto">
                {clauses.length === 0 && <p className="text-xs text-muted-foreground">Sem cláusulas configuradas</p>}
                <div className="space-y-1">
                  {clauses.map((clause) => {
                    const selected = form.suggested_clause_ids.includes(clause.id);
                    return (
                      <button
                        key={clause.id}
                        type="button"
                        onClick={() => toggleClause(clause.id)}
                        className={`w-full text-left flex items-start gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                          selected
                            ? "bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700"
                            : "hover:bg-muted border border-transparent"
                        }`}
                      >
                        <span className="font-mono font-semibold shrink-0 mt-0.5">{clause.code}</span>
                        <span className="text-muted-foreground">{clause.description}</span>
                        {selected && <span className="ml-auto shrink-0 text-primary">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              {form.suggested_clause_ids.length > 0 && (
                <p className="text-xs text-muted-foreground">Seleccionadas: {form.suggested_clause_ids.join(", ")}</p>
              )}
            </div>

            {/* Macro sugerida */}
            <div className="space-y-1.5">
              <Label>Macro Sugerida</Label>
              <Select
                value={form.suggested_macro_id || "__none__"}
                onValueChange={(v) => setForm((p) => ({ ...p, suggested_macro_id: v === "__none__" ? null : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma</SelectItem>
                  {macros.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="font-mono font-semibold mr-2">{m.id}</span> {m.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
              />
              <Label>Regra activa</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "A guardar..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
