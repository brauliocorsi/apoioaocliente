import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, GripVertical, Loader2 } from "lucide-react";
import type { TicketStatus } from "@/hooks/useTicketStatuses";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableStatusRow({
  s,
  agents,
  updateField,
  deleteStatus,
}: {
  s: TicketStatus;
  agents: { id: string; full_name: string }[];
  updateField: (id: string, field: string, value: any) => void;
  deleteStatus: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>
      <span className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
      <div className="flex-1 grid gap-2 md:grid-cols-4 items-center">
        <div>
          <Input
            className="h-7 text-sm font-medium px-1.5"
            value={s.name}
            onChange={(e) => updateField(s.id, "name", e.target.value)}
          />
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{s.id}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Switch checked={!!s.pauses_sla} onCheckedChange={(v) => updateField(s.id, "pauses_sla", v)} className="scale-75" />
            <span className="text-muted-foreground">Pausa SLA</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Switch checked={!!s.is_resolved} onCheckedChange={(v) => updateField(s.id, "is_resolved", v)} className="scale-75" />
            <span className="text-muted-foreground">Resolvido</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Switch checked={!!s.is_closed} onCheckedChange={(v) => updateField(s.id, "is_closed", v)} className="scale-75" />
            <span className="text-muted-foreground">Encerrado</span>
          </label>
        </div>
        <div className="flex gap-2 items-center">
          <Input
            className="h-7 text-xs w-20 px-1.5"
            type="number"
            placeholder="SLA min"
            value={s.sla_minutes ?? ""}
            onChange={(e) => updateField(s.id, "sla_minutes", e.target.value ? parseInt(e.target.value) : null)}
          />
          <Select value={s.default_assign || "__none__"} onValueChange={(v) => updateField(s.id, "default_assign", v === "__none__" ? null : v)}>
            <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Agente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Nenhum</SelectItem>
              {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-1 justify-end">
          <input type="color" value={s.color} onChange={(e) => updateField(s.id, "color", e.target.value)} className="h-7 w-8 rounded border cursor-pointer" />
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteStatus(s.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function StatusPage() {
  const { toast } = useToast();
  const [statuses, setStatuses] = useState<TicketStatus[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [newStatus, setNewStatus] = useState({ id: "", name: "", color: "#6b7280", pauses_sla: false, is_resolved: false, is_closed: false, sla_minutes: "", default_assign: "" });
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const fetchData = async () => {
    const [{ data: s }, { data: p }] = await Promise.all([
      supabase.from("ticket_statuses").select("*").order("sort_order"),
      supabase.from("profiles").select("id, full_name"),
    ]);
    setStatuses((s as TicketStatus[]) || []);
    setAgents(p || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const addStatus = async () => {
    if (!newStatus.id || !newStatus.name) return;
    const maxOrder = statuses.reduce((max, s) => Math.max(max, s.sort_order), 0);
    const { error } = await supabase.from("ticket_statuses").insert({
      id: newStatus.id,
      name: newStatus.name,
      color: newStatus.color,
      sort_order: maxOrder + 1,
      pauses_sla: newStatus.pauses_sla,
      is_resolved: newStatus.is_resolved,
      is_closed: newStatus.is_closed,
      sla_minutes: newStatus.sla_minutes ? parseInt(newStatus.sla_minutes) : null,
      default_assign: newStatus.default_assign || null,
    } as any);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Estado criado" });
      setNewStatus({ id: "", name: "", color: "#6b7280", pauses_sla: false, is_resolved: false, is_closed: false, sla_minutes: "", default_assign: "" });
      fetchData();
    }
  };

  const updateField = async (id: string, field: string, value: any) => {
    await supabase.from("ticket_statuses").update({ [field]: value } as any).eq("id", id);
    fetchData();
  };

  const deleteStatus = async (id: string) => {
    const { data: tickets } = await supabase.from("tickets").select("id").eq("status", id as any).limit(1);
    if (tickets && tickets.length > 0) {
      toast({ title: "Não é possível eliminar", description: "Existem tickets com este estado.", variant: "destructive" });
      return;
    }
    await supabase.from("ticket_statuses").delete().eq("id", id);
    toast({ title: "Estado eliminado" });
    fetchData();
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = statuses.findIndex((s) => s.id === active.id);
    const newIndex = statuses.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(statuses, oldIndex, newIndex);

    // Optimistic update
    setStatuses(reordered);

    // Persist new sort_order values
    const updates = reordered.map((s, i) =>
      supabase.from("ticket_statuses").update({ sort_order: i + 1 } as any).eq("id", s.id)
    );
    await Promise.all(updates);
    fetchData();
  };

  const activeStatus = activeId ? statuses.find((s) => s.id === activeId) : null;

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gestão de Estados</h1>
        <p className="text-muted-foreground">Configurar estados dos tickets e propriedades de SLA</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Novo Estado</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">ID (slug)</Label>
              <Input className="h-8 text-sm" placeholder="ex: em_espera" value={newStatus.id} onChange={(e) => setNewStatus({ ...newStatus, id: e.target.value.toLowerCase().replace(/\s/g, "_") })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input className="h-8 text-sm" placeholder="ex: Em espera" value={newStatus.name} onChange={(e) => setNewStatus({ ...newStatus, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cor</Label>
              <div className="flex gap-2">
                <input type="color" value={newStatus.color} onChange={(e) => setNewStatus({ ...newStatus, color: e.target.value })} className="h-8 w-10 rounded border cursor-pointer" />
                <Input className="h-8 text-sm flex-1" value={newStatus.color} onChange={(e) => setNewStatus({ ...newStatus, color: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-6 mt-3">
            <label className="flex items-center gap-2 text-sm"><Switch checked={newStatus.pauses_sla} onCheckedChange={(v) => setNewStatus({ ...newStatus, pauses_sla: v })} /> Pausa SLA</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={newStatus.is_resolved} onCheckedChange={(v) => setNewStatus({ ...newStatus, is_resolved: v })} /> Marca resolvido</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={newStatus.is_closed} onCheckedChange={(v) => setNewStatus({ ...newStatus, is_closed: v })} /> Marca encerrado</label>
          </div>
          <div className="grid gap-3 md:grid-cols-2 mt-3">
            <div className="space-y-1">
              <Label className="text-xs">SLA (minutos, opcional)</Label>
              <Input className="h-8 text-sm" type="number" placeholder="ex: 60" value={newStatus.sla_minutes} onChange={(e) => setNewStatus({ ...newStatus, sla_minutes: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Atribuição automática</Label>
              <Select value={newStatus.default_assign || "__none__"} onValueChange={(v) => setNewStatus({ ...newStatus, default_assign: v === "__none__" ? "" : v })}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma</SelectItem>
                  {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="mt-4" onClick={addStatus} disabled={!newStatus.id || !newStatus.name}>
            <Plus className="mr-2 h-4 w-4" /> Criar Estado
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Estados Existentes</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <SortableContext items={statuses.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {statuses.map((s) => (
                <SortableStatusRow key={s.id} s={s} agents={agents} updateField={updateField} deleteStatus={deleteStatus} />
              ))}
            </SortableContext>
            <DragOverlay>
              {activeStatus && (
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-background shadow-lg">
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: activeStatus.color }} />
                  <p className="text-sm font-medium">{activeStatus.name}</p>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </CardContent>
      </Card>
    </div>
  );
}
