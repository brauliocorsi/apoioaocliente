import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, Search, Loader2, Pencil, Trash2, Save, X, Plus, MessageSquareText } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const categoryLabels: Record<string, string> = {
  entrega: "Entrega",
  reclamacao: "Reclamação",
  garantia: "Garantia",
  devolucao: "Devolução",
  pagamento: "Pagamento",
  exposicao: "Exposição",
  geral: "Geral",
};

const categoryColors: Record<string, string> = {
  entrega: "bg-blue-100 text-blue-800",
  reclamacao: "bg-red-100 text-red-800",
  garantia: "bg-green-100 text-green-800",
  devolucao: "bg-orange-100 text-orange-800",
  pagamento: "bg-purple-100 text-purple-800",
  exposicao: "bg-yellow-100 text-yellow-800",
  geral: "bg-gray-100 text-gray-800",
};

type MacroCategory = "entrega" | "reclamacao" | "garantia" | "devolucao" | "pagamento" | "exposicao" | "geral";

interface MacroForm {
  id: string;
  title: string;
  content: string;
  macro_category: MacroCategory;
  variables: string[];
}

export default function Macros() {
  const [macros, setMacros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editingMacro, setEditingMacro] = useState<MacroForm | null>(null);
  const [creatingMacro, setCreatingMacro] = useState<MacroForm | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchMacros = () => {
    supabase.from("macros").select("*").order("sort_order").then(({ data }) => {
      setMacros(data || []);
      setLoading(false);
    });
  };

  useEffect(() => { fetchMacros(); }, []);

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
    });
  };

  const handleSaveNew = async () => {
    if (!creatingMacro || !creatingMacro.title.trim() || !creatingMacro.content.trim()) {
      toast({ title: "Preencha título e conteúdo", variant: "destructive" });
      return;
    }
    setSaving(true);
    const vars = [...new Set((creatingMacro.content.match(/\{(\w+)\}/g) || []).map(v => v.slice(1, -1)))];
    const { error } = await supabase.from("macros").insert({
      id: creatingMacro.id,
      title: creatingMacro.title,
      content: creatingMacro.content,
      macro_category: creatingMacro.macro_category,
      variables: vars,
      sort_order: macros.length + 1,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Macro criada" });
      setCreatingMacro(null);
      fetchMacros();
    }
  };

  const handleSave = async () => {
    if (!editingMacro) return;
    setSaving(true);

    // Extract variables from content like {nome_cliente}
    const vars = [...new Set((editingMacro.content.match(/\{(\w+)\}/g) || []).map(v => v.slice(1, -1)))];

    const { error } = await supabase
      .from("macros")
      .update({
        title: editingMacro.title,
        content: editingMacro.content,
        macro_category: editingMacro.macro_category,
        variables: vars,
      })
      .eq("id", editingMacro.id);

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao guardar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Macro atualizada" });
      setEditingMacro(null);
      fetchMacros();
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("macros").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Erro ao eliminar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Macro eliminada" });
      setDeleteId(null);
      fetchMacros();
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Macros de Resposta"
        subtitle={`${macros.length} modelos pré-definidos para email e WhatsApp`}
        icon={<MessageSquareText className="h-6 w-6" />}
        accent="accent"
        actions={
          <Button onClick={handleCreate}>
            <Plus className="mr-1 h-4 w-4" /> Nova Macro
          </Button>
        }
      />

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
        {filtered.map((m) => (
          <Card key={m.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{m.id} – {m.title}</CardTitle>
                <Badge className={categoryColors[m.macro_category] || ""} variant="secondary">
                  {categoryLabels[m.macro_category] || m.macro_category}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-3">{m.content}</p>
              {m.variables && m.variables.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {m.variables.map((v: string) => (
                    <Badge key={v} variant="outline" className="text-xs font-mono">{`{${v}}`}</Badge>
                  ))}
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
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingMacro} onOpenChange={(open) => !open && setEditingMacro(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Macro</DialogTitle>
            <DialogDescription>Modifique o título, conteúdo ou categoria da macro.</DialogDescription>
          </DialogHeader>
          {editingMacro && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Título</Label>
                <Input
                  value={editingMacro.title}
                  onChange={(e) => setEditingMacro({ ...editingMacro, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select
                  value={editingMacro.macro_category}
                  onValueChange={(v) => setEditingMacro({ ...editingMacro, macro_category: v as MacroCategory })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoryLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Conteúdo</Label>
                <Textarea
                  rows={8}
                  value={editingMacro.content}
                  onChange={(e) => setEditingMacro({ ...editingMacro, content: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Use {`{variavel}`} para variáveis dinâmicas. São detetadas automaticamente.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMacro(null)}>
              <X className="mr-1 h-3 w-3" /> Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={!!creatingMacro} onOpenChange={(open) => !open && setCreatingMacro(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Macro</DialogTitle>
            <DialogDescription>Crie uma nova macro de resposta.</DialogDescription>
          </DialogHeader>
          {creatingMacro && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>ID</Label>
                <Input
                  value={creatingMacro.id}
                  onChange={(e) => setCreatingMacro({ ...creatingMacro, id: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Título</Label>
                <Input
                  value={creatingMacro.title}
                  onChange={(e) => setCreatingMacro({ ...creatingMacro, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select
                  value={creatingMacro.macro_category}
                  onValueChange={(v) => setCreatingMacro({ ...creatingMacro, macro_category: v as MacroCategory })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoryLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Conteúdo</Label>
                <Textarea
                  rows={8}
                  value={creatingMacro.content}
                  onChange={(e) => setCreatingMacro({ ...creatingMacro, content: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Use {`{variavel}`} para variáveis dinâmicas. São detetadas automaticamente.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatingMacro(null)}>
              <X className="mr-1 h-3 w-3" /> Cancelar
            </Button>
            <Button onClick={handleSaveNew} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Macro</DialogTitle>
            <DialogDescription>Tem a certeza que deseja eliminar esta macro? Esta ação não pode ser desfeita.</DialogDescription>
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
