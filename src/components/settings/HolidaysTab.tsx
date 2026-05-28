import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2, CalendarDays } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

type Holiday = {
  id: string;
  holiday_date: string;
  name: string;
  country: string;
  region: string | null;
  is_active: boolean;
};

export default function HolidaysTab() {
  const { toast } = useToast();
  const [items, setItems] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [form, setForm] = useState({ holiday_date: "", name: "" });

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("business_holidays" as any)
      .select("*")
      .eq("country", "PT")
      .is("region", null)
      .order("holiday_date", { ascending: true });
    if (error) toast({ title: "Erro a carregar feriados", description: error.message, variant: "destructive" });
    setItems((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const add = async () => {
    if (!form.holiday_date || !form.name.trim()) return;
    const { error } = await supabase.from("business_holidays" as any).insert({
      holiday_date: form.holiday_date,
      name: form.name.trim(),
      country: "PT",
      region: null,
      is_active: true,
    } as any);
    if (error) {
      toast({ title: "Erro a criar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Feriado adicionado" });
      setForm({ holiday_date: "", name: "" });
      fetchData();
    }
  };

  const toggleActive = async (id: string, v: boolean) => {
    const { error } = await supabase.from("business_holidays" as any).update({ is_active: v } as any).eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else fetchData();
  };

  const updateName = async (id: string, name: string) => {
    await supabase.from("business_holidays" as any).update({ name } as any).eq("id", id);
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("business_holidays" as any).delete().eq("id", id);
    if (error) toast({ title: "Erro a remover", description: error.message, variant: "destructive" });
    else { toast({ title: "Feriado removido" }); fetchData(); }
  };

  const years = Array.from(new Set(items.map(i => i.holiday_date.slice(0, 4)))).sort();
  const filtered = year === "all" ? items : items.filter(i => i.holiday_date.startsWith(year));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" /> Calendário SLA — Feriados Nacionais (PT)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Feriados ativos não contam como dia útil. Sábado continua a contar 08:00–20:00, salvo se marcado como feriado.
            Recomenda-se <strong>desativar</strong> em vez de remover, para preservar histórico.
          </p>

          <div className="grid gap-3 md:grid-cols-[160px_1fr_auto] items-end">
            <div className="space-y-1">
              <Label className="text-xs">Data</Label>
              <Input type="date" className="h-9" value={form.holiday_date}
                onChange={e => setForm({ ...form, holiday_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input className="h-9" placeholder="ex: Dia de Portugal"
                value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <Button onClick={add} disabled={!form.holiday_date || !form.name.trim()}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Feriados Cadastrados</CardTitle>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os anos</SelectItem>
              {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              {!years.includes(String(new Date().getFullYear())) && (
                <SelectItem value={String(new Date().getFullYear())}>{new Date().getFullYear()}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sem feriados para este filtro.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(h => (
                <div key={h.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <div className="text-xs tabular-nums w-28 shrink-0">
                    {format(new Date(h.holiday_date + "T00:00:00"), "EEE, dd MMM yyyy", { locale: pt })}
                  </div>
                  <Input
                    className="h-8 text-sm flex-1"
                    defaultValue={h.name}
                    onBlur={(e) => e.target.value !== h.name && updateName(h.id, e.target.value)}
                  />
                  {h.is_active
                    ? <Badge variant="outline" className="bg-success/10 text-success border-success/30">Ativo</Badge>
                    : <Badge variant="outline" className="bg-muted text-muted-foreground">Desativado</Badge>}
                  <label className="flex items-center gap-1.5 text-xs">
                    <Switch checked={h.is_active} onCheckedChange={(v) => toggleActive(h.id, v)} className="scale-75" />
                  </label>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover feriado?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Vai eliminar <strong>{h.name}</strong> ({h.holiday_date}). Esta ação é permanente.
                          Para preservar histórico, prefira desativar.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove(h.id)}>Remover</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
