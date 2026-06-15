import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Copy, Search, Loader2, Pencil, Trash2, Save, X, Plus, MessageSquareText, AlertTriangle, Check } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

const categoryLabels: Record<string, string> = {
  entrega: "Entrega", reclamacao: "Reclamação", garantia: "Garantia",
  devolucao: "Devolução", pagamento: "Pagamento", exposicao: "Exposição", geral: "Geral",
};
const categoryColors: Record<string, string> = {
  entrega: "bg-blue-100 text-blue-800", reclamacao: "bg-red-100 text-red-800",
  garantia: "bg-green-100 text-green-800", devolucao: "bg-orange-100 text-orange-800",
  pagamento: "bg-purple-100 text-purple-800", exposicao: "bg-yellow-100 text-yellow-800",
  geral: "bg-gray-100 text-gray-800",
};

type MacroCategory = "entrega" | "reclamacao" | "garantia" | "devolucao" | "pagamento" | "exposicao" | "geral";

interface MacroForm {
  id: string;
  title: string;
  content: string;
  macro_category: MacroCategory;
  variables: string[];
  category_ids: string[];
  subcategory_ids: string[];
  tag_ids: string[];
  is_active: boolean;
}

interface MultiSelectProps {
  label: string;
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  required?: boolean;
}

function MultiSelect({ label, options, selected, onChange, placeholder, required }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () => options.filter((o) => o.name.toLowerCase().includes(search.toLowerCase())),
    [options, search]
  );
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };
  const selectedItems = options.filter((o) => selected.includes(o.id));

  return (
    <div className="space-y-1.5">
      <Label className="text-xs flex items-center gap-1">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-start font-normal h-auto min-h-9 py-1.5">
            {selectedItems.length === 0 ? (
              <span className="text-muted-foreground">{placeholder || "Selecionar..."}</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {selectedItems.map((s) => (
                  <Badge key={s.id} variant="secondary" className="text-xs">
                    {s.name}
                    <span
                      role="button"
                      tabIndex={0}
                      className="ml-1 -mr-1 hover:text-destructive cursor-pointer inline-flex"
                      onClick={(e) => { e.stopPropagation(); toggle(s.id); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); toggle(s.id); } }}
                    >
                      <X className="h-3 w-3" />
                    </span>
                  </Badge>
                ))}
              </div>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="p-2 border-b">
            <Input placeholder="Pesquisar..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-sm" />
          </div>
          <ScrollArea className="h-64">
            <div className="p-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-xs text-center text-muted-foreground">Nada encontrado</div>
              ) : filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(o.id)}
                  className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-muted flex items-center gap-2"
                >
                  <span className={`h-4 w-4 rounded border flex items-center justify-center ${selected.includes(o.id) ? "bg-primary border-primary text-primary-foreground" : "border-input"}`}>
                    {selected.includes(o.id) && <Check className="h-3 w-3" />}
                  </span>
                  <span className="flex-1">{o.name}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function Macros() {
  const [macros, setMacros] = useState<any[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [subcategories, setSubcategories] = useState<{ id: string; name: string; category_id: string }[]>([]);
  const [allTags, setAllTags] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editingMacro, setEditingMacro] = useState<MacroForm | null>(null);
  const [creatingMacro, setCreatingMacro] = useState<MacroForm | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: m }, { data: c }, { data: s }, { data: t }] = await Promise.all([
      supabase.from("macros").select("*").order("sort_order"),
      supabase.from("categories").select("id, name").order("sort_order"),
      supabase.from("subcategories").select("id, name, category_id").order("sort_order"),
      supabase.from("tags").select("id, name").order("sort_order"),
    ]);
    setMacros(m || []);
    setCategories((c as any) || []);
    setSubcategories((s as any) || []);
    setAllTags((t as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const filtered = macros.filter((m) => {
    const matchesSearch = m.title.toLowerCase().includes(search.toLowerCase()) || m.content.toLowerCase().includes(search.toLowerCase());
    const matchesCat = categoryFilter === "all" || m.macro_category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado para clipboard" });
  };

  const handleEdit = (m: any) => {
    setEditingMacro({
      id: m.id,
      title: m.title,
      content: m.content,
      macro_category: m.macro_category,
      variables: m.variables || [],
      category_ids: m.category_ids || [],
      subcategory_ids: m.subcategory_ids || [],
      tag_ids: m.tag_ids || [],
      is_active: m.is_active !== false,
    });
  };

  const handleCreate = () => {
    const nextId = `M${String(macros.length + 1).padStart(2, "0")}`;
    setCreatingMacro({
      id: nextId,
      title: "",
      content: "",
      macro_category: "geral",
      variables: [],
      category_ids: [],
      subcategory_ids: [],
      tag_ids: [],
      is_active: true,
    });
  };

  const validate = (m: MacroForm): string | null => {
    if (!m.title.trim()) return "Título é obrigatório";
    if (!m.content.trim()) return "Conteúdo é obrigatório";
    if (m.category_ids.length === 0) return "Selecione pelo menos uma categoria";
    if (m.subcategory_ids.length === 0) return "Selecione pelo menos uma subcategoria";
    return null;
  };

  const handleSaveNew = async () => {
    if (!creatingMacro) return;
    const err = validate(creatingMacro);
    if (err) { toast({ title: err, variant: "destructive" }); return; }
    setSaving(true);
    const vars = [...new Set((creatingMacro.content.match(/\{(\w+)\}/g) || []).map(v => v.slice(1, -1)))];
    const { error } = await supabase.from("macros").insert({
      id: creatingMacro.id,
      title: creatingMacro.title,
      content: creatingMacro.content,
      macro_category: creatingMacro.macro_category,
      variables: vars,
      category_ids: creatingMacro.category_ids,
      subcategory_ids: creatingMacro.subcategory_ids,
      tag_ids: creatingMacro.tag_ids,
      is_active: creatingMacro.is_active,
      sort_order: macros.length + 1,
    });
    setSaving(false);
    if (error) toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
    else { toast({ title: "Macro criada" }); setCreatingMacro(null); fetchAll(); }
  };

  const handleSave = async () => {
    if (!editingMacro) return;
    const err = validate(editingMacro);
    if (err) { toast({ title: err, variant: "destructive" }); return; }
    setSaving(true);
    const vars = [...new Set((editingMacro.content.match(/\{(\w+)\}/g) || []).map(v => v.slice(1, -1)))];
    const { error } = await supabase.from("macros").update({
      title: editingMacro.title,
      content: editingMacro.content,
      macro_category: editingMacro.macro_category,
      variables: vars,
      category_ids: editingMacro.category_ids,
      subcategory_ids: editingMacro.subcategory_ids,
      tag_ids: editingMacro.tag_ids,
      is_active: editingMacro.is_active,
    }).eq("id", editingMacro.id);
    setSaving(false);
    if (error) toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
    else { toast({ title: "Macro atualizada" }); setEditingMacro(null); fetchAll(); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("macros").delete().eq("id", deleteId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Macro eliminada" }); setDeleteId(null); fetchAll(); }
  };

  // Subcategorias filtradas pelas categorias atualmente selecionadas no formulário
  const availableSubcategories = (selectedCats: string[]) =>
    selectedCats.length === 0
      ? subcategories
      : subcategories.filter((s) => selectedCats.includes(s.category_id));

  const categoryNameMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories]);
  const subcategoryNameMap = useMemo(() => Object.fromEntries(subcategories.map((s) => [s.id, s.name])), [subcategories]);
  const tagNameMap = useMemo(() => Object.fromEntries(allTags.map((t) => [t.id, t.name])), [allTags]);

  const incompleteCount = macros.filter((m) => (m.category_ids || []).length === 0 || (m.subcategory_ids || []).length === 0).length;

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const renderForm = (form: MacroForm, setForm: (f: MacroForm) => void) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">ID</Label>
          <Input value={form.id} disabled={form === editingMacro} onChange={(e) => setForm({ ...form, id: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Grupo</Label>
          <Select value={form.macro_category} onValueChange={(v) => setForm({ ...form, macro_category: v as MacroCategory })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(categoryLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Título</Label>
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>

      <MultiSelect
        label="Categorias do ticket"
        options={categories}
        selected={form.category_ids}
        onChange={(ids) => {
          // Drop subcategorias que já não pertencem às categorias selecionadas
          const validSubs = subcategories.filter((s) => ids.includes(s.category_id)).map((s) => s.id);
          setForm({ ...form, category_ids: ids, subcategory_ids: form.subcategory_ids.filter((s) => validSubs.includes(s)) });
        }}
        placeholder="Selecionar categorias..."
        required
      />

      <MultiSelect
        label={`Subcategorias ${form.category_ids.length === 0 ? "(selecione primeiro categorias)" : ""}`}
        options={availableSubcategories(form.category_ids)}
        selected={form.subcategory_ids}
        onChange={(ids) => setForm({ ...form, subcategory_ids: ids })}
        placeholder="Selecionar subcategorias..."
        required
      />

      <MultiSelect
        label="Etiquetas (opcional, dão prioridade na sugestão)"
        options={allTags}
        selected={form.tag_ids}
        onChange={(ids) => setForm({ ...form, tag_ids: ids })}
        placeholder="Etiquetas opcionais..."
      />

      <div className="space-y-1.5">
        <Label className="text-xs">Conteúdo</Label>
        <Textarea rows={8} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        <p className="text-[10px] text-muted-foreground">Use {`{variavel}`} ou [cliente], [ticket], [encomenda], [produto].</p>
      </div>

      <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
        <div>
          <Label className="text-sm">Macro ativa</Label>
          <p className="text-[11px] text-muted-foreground">Macros inativas não aparecem nas sugestões.</p>
        </div>
        <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Macros de Resposta"
        subtitle={`${macros.length} modelos · ligados a categorias e subcategorias`}
        icon={<MessageSquareText className="h-6 w-6" />}
        accent="accent"
        actions={<Button onClick={handleCreate}><Plus className="mr-1 h-4 w-4" /> Nova Macro</Button>}
      />

      {incompleteCount > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{incompleteCount} macro(s) sem categoria/subcategoria atribuída — não aparecerão nas sugestões automáticas.</span>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Pesquisar macros..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 flex-wrap">
          <Button size="sm" variant={categoryFilter === "all" ? "default" : "outline"} onClick={() => setCategoryFilter("all")}>Todas</Button>
          {Object.entries(categoryLabels).map(([k, v]) => (
            <Button key={k} size="sm" variant={categoryFilter === k ? "default" : "outline"} onClick={() => setCategoryFilter(k)}>{v}</Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((m) => {
          const cats = (m.category_ids || []) as string[];
          const subs = (m.subcategory_ids || []) as string[];
          const tags = (m.tag_ids || []) as string[];
          const isIncomplete = cats.length === 0 || subs.length === 0;
          return (
            <Card key={m.id} className={!m.is_active ? "opacity-60" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{m.id} – {m.title}</CardTitle>
                  <div className="flex items-center gap-1">
                    {!m.is_active && <Badge variant="outline" className="text-[10px]">Inativa</Badge>}
                    <Badge className={categoryColors[m.macro_category] || ""} variant="secondary">
                      {categoryLabels[m.macro_category] || m.macro_category}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-3 line-clamp-4">{m.content}</p>

                {isIncomplete ? (
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-700 mb-2">
                    <AlertTriangle className="h-3 w-3" /> Sem categoria/subcategoria — edite para ativar nas sugestões.
                  </div>
                ) : (
                  <div className="space-y-1.5 mb-3">
                    <div className="flex flex-wrap gap-1">
                      {cats.map((id) => <Badge key={id} variant="secondary" className="text-[10px]">{categoryNameMap[id] || id}</Badge>)}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {subs.map((id) => <Badge key={id} variant="outline" className="text-[10px]">{subcategoryNameMap[id] || id}</Badge>)}
                    </div>
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tags.map((id) => <Badge key={id} variant="outline" className="text-[10px] border-primary/40 text-primary">#{tagNameMap[id] || id}</Badge>)}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(m.content)}>
                    <Copy className="mr-1 h-3 w-3" /> Copiar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleEdit(m)}>
                    <Pencil className="mr-1 h-3 w-3" /> Editar
                  </Button>
                  <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(m.id)}>
                    <Trash2 className="mr-1 h-3 w-3" /> Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editingMacro} onOpenChange={(o) => !o && setEditingMacro(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Macro</DialogTitle>
            <DialogDescription>Modifique conteúdo e contexto da macro.</DialogDescription>
          </DialogHeader>
          {editingMacro && renderForm(editingMacro, setEditingMacro)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMacro(null)}><X className="mr-1 h-3 w-3" /> Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!creatingMacro} onOpenChange={(o) => !o && setCreatingMacro(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Macro</DialogTitle>
            <DialogDescription>Crie uma macro ligada a categorias e subcategorias do ticket.</DialogDescription>
          </DialogHeader>
          {creatingMacro && renderForm(creatingMacro, setCreatingMacro)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatingMacro(null)}><X className="mr-1 h-3 w-3" /> Cancelar</Button>
            <Button onClick={handleSaveNew} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />} Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Macro</DialogTitle>
            <DialogDescription>Tem a certeza? Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
