import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ChevronDown, Loader2, Pencil, Check, X } from "lucide-react";

type Category = { id: string; name: string; description: string | null; sort_order: number; default_assign: string | null };
type Subcategory = { id: string; category_id: string; name: string; sort_order: number; description: string | null; default_assign: string | null };

export default function CategoriesPage() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCat, setNewCat] = useState({ id: "", name: "", description: "", default_assign: "" });
  const [newSub, setNewSub] = useState<Record<string, { id: string; name: string; description: string; default_assign: string }>>({});
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const fetchData = async () => {
    const [{ data: c }, { data: s }, { data: p }] = await Promise.all([
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("subcategories").select("*").order("sort_order"),
      supabase.from("profiles").select("id, full_name"),
    ]);
    setCategories((c as Category[]) || []);
    setSubcategories((s as Subcategory[]) || []);
    setAgents(p || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const addCategory = async () => {
    if (!newCat.id || !newCat.name) return;
    const maxOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), 0);
    const { error } = await supabase.from("categories").insert({
      id: newCat.id,
      name: newCat.name,
      description: newCat.description || null,
      sort_order: maxOrder + 1,
      default_assign: newCat.default_assign || null,
    } as any);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Categoria criada" });
      setNewCat({ id: "", name: "", description: "", default_assign: "" });
      fetchData();
    }
  };

  const deleteCategory = async (id: string) => {
    const { data: tickets } = await supabase.from("tickets").select("id").eq("category_id", id).limit(1);
    if (tickets && tickets.length > 0) {
      toast({ title: "Não é possível eliminar", description: "Existem tickets com esta categoria.", variant: "destructive" });
      return;
    }
    await supabase.from("subcategories").delete().eq("category_id", id);
    await supabase.from("categories").delete().eq("id", id);
    toast({ title: "Categoria eliminada" });
    fetchData();
  };

  const saveCategory = async (id: string) => {
    await supabase.from("categories").update({
      name: editForm.name,
      description: editForm.description || null,
      default_assign: editForm.default_assign || null,
    } as any).eq("id", id);
    setEditingCat(null);
    toast({ title: "Categoria atualizada" });
    fetchData();
  };

  const addSubcategory = async (categoryId: string) => {
    const sub = newSub[categoryId];
    if (!sub?.id || !sub?.name) return;
    const subs = subcategories.filter((s) => s.category_id === categoryId);
    const maxOrder = subs.reduce((max, s) => Math.max(max, s.sort_order), 0);
    const { error } = await supabase.from("subcategories").insert({
      id: sub.id,
      category_id: categoryId,
      name: sub.name,
      sort_order: maxOrder + 1,
      description: sub.description || null,
      default_assign: sub.default_assign || null,
    } as any);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Subcategoria criada" });
      setNewSub({ ...newSub, [categoryId]: { id: "", name: "", description: "", default_assign: "" } });
      fetchData();
    }
  };

  const deleteSubcategory = async (id: string) => {
    await supabase.from("subcategories").delete().eq("id", id);
    toast({ title: "Subcategoria eliminada" });
    fetchData();
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gestão de Categorias</h1>
        <p className="text-muted-foreground">Configurar categorias, subcategorias e atribuição automática</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Nova Categoria</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">ID (código)</Label>
              <Input className="h-8 text-sm" placeholder="ex: DEV" value={newCat.id} onChange={(e) => setNewCat({ ...newCat, id: e.target.value.toUpperCase().replace(/\s/g, "_") })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input className="h-8 text-sm" placeholder="ex: Devoluções" value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descrição</Label>
              <Input className="h-8 text-sm" value={newCat.description} onChange={(e) => setNewCat({ ...newCat, description: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Atribuição automática</Label>
              <Select value={newCat.default_assign || "__none__"} onValueChange={(v) => setNewCat({ ...newCat, default_assign: v === "__none__" ? "" : v })}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma</SelectItem>
                  {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="mt-4" onClick={addCategory} disabled={!newCat.id || !newCat.name}>
            <Plus className="mr-2 h-4 w-4" /> Criar Categoria
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {categories.map((cat) => {
          const subs = subcategories.filter((s) => s.category_id === cat.id);
          const subForm = newSub[cat.id] || { id: "", name: "", description: "", default_assign: "" };
          const isEditing = editingCat === cat.id;

          return (
            <Collapsible key={cat.id}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CollapsibleTrigger className="flex items-center gap-2 hover:text-primary transition-colors">
                      <ChevronDown className="h-4 w-4" />
                      {isEditing ? (
                        <Input className="h-7 text-sm w-48" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                      ) : (
                        <CardTitle className="text-base">{cat.id} – {cat.name}</CardTitle>
                      )}
                    </CollapsibleTrigger>
                    <div className="flex items-center gap-1">
                      {isEditing ? (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingCat(null)}><X className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => saveCategory(cat.id)}><Check className="h-3.5 w-3.5" /></Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingCat(cat.id); setEditForm({ name: cat.name, description: cat.description || "", default_assign: cat.default_assign || "" }); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteCategory(cat.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {cat.description && !isEditing && <p className="text-xs text-muted-foreground ml-6">{cat.description}</p>}
                  {cat.default_assign && !isEditing && (
                    <p className="text-xs text-muted-foreground ml-6">Atribuição: {agents.find((a) => a.id === cat.default_assign)?.full_name || "?"}</p>
                  )}
                  {isEditing && (
                    <div className="grid gap-2 md:grid-cols-2 ml-6 mt-2">
                      <Input className="h-7 text-xs" placeholder="Descrição" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
                      <Select value={editForm.default_assign || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, default_assign: v === "__none__" ? "" : v })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Atribuição" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhuma</SelectItem>
                          {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="pt-0 space-y-2">
                    {subs.map((sub) => (
                      <div key={sub.id} className="flex items-center justify-between p-2 rounded border bg-muted/30 ml-4">
                        <div>
                          <p className="text-sm">{sub.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{sub.id}</p>
                          {sub.default_assign && <p className="text-xs text-muted-foreground">Atribuição: {agents.find((a) => a.id === sub.default_assign)?.full_name || "?"}</p>}
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteSubcategory(sub.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    <div className="ml-4 p-3 rounded border border-dashed">
                      <p className="text-xs font-medium mb-2">Adicionar subcategoria</p>
                      <div className="grid gap-2 md:grid-cols-2">
                        <Input className="h-7 text-xs" placeholder="ID" value={subForm.id} onChange={(e) => setNewSub({ ...newSub, [cat.id]: { ...subForm, id: e.target.value } })} />
                        <Input className="h-7 text-xs" placeholder="Nome" value={subForm.name} onChange={(e) => setNewSub({ ...newSub, [cat.id]: { ...subForm, name: e.target.value } })} />
                        <Input className="h-7 text-xs" placeholder="Descrição" value={subForm.description} onChange={(e) => setNewSub({ ...newSub, [cat.id]: { ...subForm, description: e.target.value } })} />
                        <Select value={subForm.default_assign || "__none__"} onValueChange={(v) => setNewSub({ ...newSub, [cat.id]: { ...subForm, default_assign: v === "__none__" ? "" : v } })}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Atribuição" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Nenhuma</SelectItem>
                            {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button size="sm" className="mt-2 h-7 text-xs" onClick={() => addSubcategory(cat.id)} disabled={!subForm.id || !subForm.name}>
                        <Plus className="mr-1 h-3 w-3" /> Adicionar
                      </Button>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
