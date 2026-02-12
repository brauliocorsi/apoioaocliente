import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Save, X, Trash2, GripVertical } from "lucide-react";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export default function FaqTab() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [adding, setAdding] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");

  const isSupervisor = role === "supervisor";

  const fetchItems = async () => {
    const { data } = await supabase
      .from("faq_items")
      .select("*")
      .order("sort_order");
    setItems((data as FaqItem[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, []);

  const startEdit = (item: FaqItem) => {
    setEditing(item.id);
    setEditQuestion(item.question);
    setEditAnswer(item.answer);
  };

  const saveEdit = async (id: string) => {
    const { error } = await supabase
      .from("faq_items")
      .update({ question: editQuestion, answer: editAnswer })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setEditing(null);
      toast({ title: "FAQ atualizada" });
      fetchItems();
    }
  };

  const addItem = async () => {
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    const maxOrder = items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) : 0;
    const { error } = await supabase.from("faq_items").insert({
      question: newQuestion,
      answer: newAnswer,
      sort_order: maxOrder + 1,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setAdding(false);
      setNewQuestion("");
      setNewAnswer("");
      toast({ title: "FAQ adicionada" });
      fetchItems();
    }
  };

  const toggleActive = async (item: FaqItem) => {
    await supabase.from("faq_items").update({ is_active: !item.is_active }).eq("id", item.id);
    fetchItems();
  };

  const deleteItem = async (id: string) => {
    await supabase.from("faq_items").delete().eq("id", id);
    toast({ title: "FAQ removida" });
    fetchItems();
  };

  const moveItem = async (id: string, direction: "up" | "down") => {
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;

    const a = items[idx];
    const b = items[swapIdx];
    await Promise.all([
      supabase.from("faq_items").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("faq_items").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
    fetchItems();
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Perguntas frequentes visíveis no portal do cliente
        </p>
        {isSupervisor && !adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-3 w-3" /> Adicionar FAQ
          </Button>
        )}
      </div>

      {adding && (
        <Card className="border-primary/30">
          <CardContent className="pt-4 space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Pergunta</label>
              <Input value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} placeholder="Ex: Qual é o prazo de devolução?" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Resposta (suporta HTML)</label>
              <Textarea value={newAnswer} onChange={(e) => setNewAnswer(e.target.value)} rows={4} placeholder="Resposta detalhada..." />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={addItem} disabled={!newQuestion.trim() || !newAnswer.trim()}>
                <Save className="mr-1 h-3 w-3" /> Guardar
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setAdding(false); setNewQuestion(""); setNewAnswer(""); }}>
                <X className="mr-1 h-3 w-3" /> Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma FAQ criada.</p>
      ) : (
        items.map((item, idx) => (
          <Card key={item.id} className={!item.is_active ? "opacity-60" : ""}>
            <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
              <div className="flex items-center gap-3">
                {isSupervisor && (
                  <div className="flex flex-col gap-0.5">
                    <button
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={idx === 0}
                      onClick={() => moveItem(item.id, "up")}
                    >
                      ▲
                    </button>
                    <button
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={idx === items.length - 1}
                      onClick={() => moveItem(item.id, "down")}
                    >
                      ▼
                    </button>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">{item.question}</p>
                  {editing !== item.id && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.answer.replace(/<[^>]*>/g, "").slice(0, 100)}</p>
                  )}
                </div>
              </div>
              {isSupervisor && editing !== item.id && (
                <div className="flex items-center gap-2">
                  <Switch checked={item.is_active} onCheckedChange={() => toggleActive(item)} />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(item)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteItem(item.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </CardHeader>
            {editing === item.id && (
              <CardContent className="space-y-3 pt-0">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Pergunta</label>
                  <Input value={editQuestion} onChange={(e) => setEditQuestion(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Resposta (HTML)</label>
                  <Textarea value={editAnswer} onChange={(e) => setEditAnswer(e.target.value)} rows={4} className="font-mono text-xs" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveEdit(item.id)}>
                    <Save className="mr-1 h-3 w-3" /> Guardar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                    <X className="mr-1 h-3 w-3" /> Cancelar
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
