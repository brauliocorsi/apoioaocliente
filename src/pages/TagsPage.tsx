import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2 } from "lucide-react";

const groupLabels: Record<string, string> = {
  prazo: "Prazo",
  produto: "Produto",
  entrega: "Entrega",
  pagamentos: "Pagamentos",
  reclamacao: "Reclamação / Devolução",
  gestao_interna: "Gestão Interna / Garantia",
};

const groups = Object.keys(groupLabels);

export default function TagsPage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [tags, setTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState("prazo");
  const [newColor, setNewColor] = useState("#6b7280");
  const [adding, setAdding] = useState(false);

  const fetchTags = async () => {
    const { data } = await supabase.from("tags").select("*").order("tag_group").order("sort_order");
    setTags(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchTags(); }, []);

  const addTag = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    const id = newName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const maxSort = tags.filter(t => t.tag_group === newGroup).reduce((max, t) => Math.max(max, t.sort_order), 0);
    const { error } = await supabase.from("tags").insert({
      id,
      name: newName.trim(),
      tag_group: newGroup as any,
      sort_order: maxSort + 1,
      color: newColor,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setNewName("");
      toast({ title: "Etiqueta criada" });
      fetchTags();
    }
    setAdding(false);
  };

  const updateColor = async (tagId: string, color: string) => {
    await supabase.from("tags").update({ color }).eq("id", tagId);
    setTags(prev => prev.map(t => t.id === tagId ? { ...t, color } : t));
  };

  const deleteTag = async (tagId: string) => {
    const { error } = await supabase.from("tags").delete().eq("id", tagId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      fetchTags();
      toast({ title: "Etiqueta eliminada" });
    }
  };

  const isSupervisor = role === "supervisor";
  const grouped = tags.reduce((acc, tag) => {
    const g = tag.tag_group || "prazo";
    if (!acc[g]) acc[g] = [];
    acc[g].push(tag);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="space-y-6">

      {isSupervisor && (
        <Card>
          <CardHeader><CardTitle className="text-base">Nova Etiqueta</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[160px]">
              <label className="text-xs text-muted-foreground">Nome</label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome da etiqueta" />
            </div>
            <div className="space-y-1 w-48">
              <label className="text-xs text-muted-foreground">Grupo</label>
              <Select value={newGroup} onValueChange={setNewGroup}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {groups.map(g => <SelectItem key={g} value={g}>{groupLabels[g]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Cor</label>
              <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="h-9 w-12 rounded border cursor-pointer" />
            </div>
            <Button onClick={addTag} disabled={adding || !newName.trim()}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Criar
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => {
            const groupTags = grouped[group];
            if (!groupTags || groupTags.length === 0) return null;
            return (
              <Card key={group}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{groupLabels[group]}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {groupTags.map((tag: any) => (
                      <div key={tag.id} className="inline-flex items-center gap-1.5 border rounded-md px-2 py-1">
                        <Badge
                          className="text-xs text-white border-0"
                          style={{ backgroundColor: tag.color || "#6b7280" }}
                        >
                          {tag.name}
                        </Badge>
                        {isSupervisor && (
                          <>
                            <input
                              type="color"
                              value={tag.color || "#6b7280"}
                              onChange={e => updateColor(tag.id, e.target.value)}
                              className="h-5 w-5 rounded cursor-pointer border-0"
                            />
                            <button onClick={() => deleteTag(tag.id)} className="text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
