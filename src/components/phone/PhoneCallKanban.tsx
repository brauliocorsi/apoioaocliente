import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import PriorityFlag from "@/components/ticket/PriorityFlag";
import { usePhoneCallStatuses, type PhoneCallStatus } from "@/hooks/usePhoneCallStatuses";
import { Phone, Bell, FileText, Plus, Trash2, Check, X, Pencil, User, Clock } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";

type PhoneCall = {
  id: string;
  client_name: string;
  client_phone: string;
  invoice_number: string | null;
  subject: string;
  notes: string | null;
  status: string;
  priority: string;
  created_at: string;
  ticket_id?: string | null;
  reminder_count?: number;
  created_by?: string;
  created_by_name?: string;
};

interface PhoneCallKanbanProps {
  calls: PhoneCall[];
  onSelect: (call: PhoneCall) => void;
  onStatusChanged: () => void;
}

function CallCard({ call, isDragging }: { call: PhoneCall; isDragging?: boolean }) {
  const priorityBadge = (p: string) =>
    p === "P1" ? "bg-destructive/10 text-destructive border-destructive/30" :
    p === "P2" ? "bg-warning/10 text-warning border-warning/30" :
    "bg-muted text-muted-foreground border-border";

  return (
    <div className={`bg-card border rounded-lg p-3 transition-all ${isDragging ? "shadow-xl opacity-80 rotate-1 scale-105" : "hover:shadow-md hover:border-primary/20"}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <PriorityFlag priority={call.priority} size={14} />
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${priorityBadge(call.priority)}`}>
            {call.priority}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {(call.reminder_count || 0) > 0 && (
            <div className="flex items-center gap-0.5 text-warning">
              <Bell className="h-3 w-3" />
              <span className="text-[10px] font-semibold">{call.reminder_count}</span>
            </div>
          )}
          {call.ticket_id && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 bg-primary/5 text-primary border-primary/20">
              🔗
            </Badge>
          )}
        </div>
      </div>
      <p className="text-sm font-medium leading-tight line-clamp-2 mb-1">{call.subject}</p>
      <p className="text-xs text-muted-foreground truncate">{call.client_name}</p>
      {call.created_by_name && (
        <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1 mt-0.5">
          <User className="h-2.5 w-2.5" /> {call.created_by_name}
        </p>
      )}
      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-dashed">
        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Phone className="h-3 w-3" /> {call.client_phone}
        </span>
        <div className="flex items-center gap-2">
          {call.invoice_number && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <FileText className="h-3 w-3" /> {call.invoice_number}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <Clock className="h-3 w-3" /> {format(new Date(call.created_at), "dd/MM HH:mm", { locale: pt })}
          </span>
        </div>
      </div>
    </div>
  );
}

function DraggableCall({ call, onSelect }: { call: PhoneCall; onSelect: (c: PhoneCall) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: call.id,
    data: { call },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? "opacity-30" : ""}`}
      onClick={() => onSelect(call)}
    >
      <CallCard call={call} />
    </div>
  );
}

function DroppableColumn({ columnId, color, children, isOver }: { columnId: string; color: string; children: React.ReactNode; isOver: boolean }) {
  const { setNodeRef } = useDroppable({ id: columnId });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[240px] rounded-lg border border-t-4 transition-colors ${isOver ? "bg-primary/5 ring-2 ring-primary/20" : "bg-muted/20"}`}
      style={{ borderTopColor: color }}
    >
      {children}
    </div>
  );
}

function InlineEditHeader({
  status,
  count,
  onRename,
  onDelete,
}: {
  status: PhoneCallStatus;
  count: number;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(status.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== status.name) {
      onRename(status.id, trimmed);
    } else {
      setName(status.name);
    }
    setEditing(false);
  };

  return (
    <div className="px-3 py-2.5 border-b">
      <div className="flex items-center justify-between gap-1">
        {editing ? (
          <div className="flex items-center gap-1 flex-1">
            <Input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setName(status.name); setEditing(false); } }}
              className="h-6 text-xs px-1.5 py-0"
            />
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={save}><Check className="h-3 w-3" /></Button>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setName(status.name); setEditing(false); }}><X className="h-3 w-3" /></Button>
          </div>
        ) : (
          <div className="flex items-center gap-1 flex-1 group">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {status.name}
            </h3>
            <button
              onClick={(e) => { e.stopPropagation(); setEditing(true); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-1">
          <Badge variant="secondary" className="text-xs h-5 min-w-[20px] justify-center">
            {count}
          </Badge>
          {!status.is_default && count === 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(status.id); }}
              className="opacity-0 group-hover:opacity-100 hover:text-destructive text-muted-foreground transition-all"
              title="Excluir coluna"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PhoneCallKanban({ calls, onSelect, onStatusChanged }: PhoneCallKanbanProps) {
  const { statuses, refetch: refetchStatuses } = usePhoneCallStatuses();
  const [activeCall, setActiveCall] = useState<PhoneCall | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const newColRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const columnIds = statuses.map((s) => s.id);

  const grouped = statuses.reduce((acc, s) => {
    acc[s.id] = calls.filter((c) => c.status === s.id);
    return acc;
  }, {} as Record<string, PhoneCall[]>);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCall(event.active.data.current?.call as PhoneCall);
  };

  const handleDragOver = (event: any) => {
    const overId = event.over?.id as string | null;
    setOverColumn(overId && columnIds.includes(overId) ? overId : null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveCall(null);
    setOverColumn(null);

    const { active, over } = event;
    if (!over) return;

    const call = active.data.current?.call as PhoneCall;
    const newStatus = over.id as string;

    if (!columnIds.includes(newStatus) || call.status === newStatus) return;

    const { error } = await supabase
      .from("phone_calls" as any)
      .update({ status: newStatus } as any)
      .eq("id", call.id);

    if (error) {
      toast({ title: "Erro ao mover ligação", description: error.message, variant: "destructive" });
    } else {
      const label = statuses.find((s) => s.id === newStatus)?.name || newStatus;
      toast({ title: `Ligação movida → ${label}` });
      onStatusChanged();
    }
  };

  const handleRename = async (id: string, newName: string) => {
    const { error } = await supabase
      .from("phone_call_statuses" as any)
      .update({ name: newName } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao renomear", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Coluna renomeada → ${newName}` });
      refetchStatuses();
    }
  };

  const handleDelete = async (id: string) => {
    const count = (grouped[id] || []).length;
    if (count > 0) {
      toast({ title: "Não é possível excluir", description: "Mova todas as ligações antes de excluir.", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("phone_call_statuses" as any)
      .delete()
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Coluna excluída" });
      refetchStatuses();
    }
  };

  const handleAddColumn = async () => {
    const trimmed = newColumnName.trim();
    if (!trimmed) return;
    const id = trimmed.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const maxOrder = statuses.reduce((max, s) => Math.max(max, s.sort_order), 0);

    const { error } = await supabase
      .from("phone_call_statuses" as any)
      .insert({ id, name: trimmed, color: "#6b7280", sort_order: maxOrder + 1, is_default: false } as any);
    if (error) {
      toast({ title: "Erro ao criar coluna", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Coluna "${trimmed}" criada` });
      setNewColumnName("");
      setAddingColumn(false);
      refetchStatuses();
    }
  };

  useEffect(() => {
    if (addingColumn) newColRef.current?.focus();
  }, [addingColumn]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 300 }}>
        {statuses.map((col) => (
          <DroppableColumn key={col.id} columnId={col.id} color={col.color} isOver={overColumn === col.id}>
            <InlineEditHeader
              status={col}
              count={(grouped[col.id] || []).length}
              onRename={handleRename}
              onDelete={handleDelete}
            />
            <ScrollArea className="h-[calc(100vh-420px)] min-h-[200px]">
              <div className="p-2 space-y-2">
                {(grouped[col.id] || []).map((c) => (
                  <DraggableCall key={c.id} call={c} onSelect={onSelect} />
                ))}
                {(grouped[col.id] || []).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">Sem ligações</p>
                )}
              </div>
            </ScrollArea>
          </DroppableColumn>
        ))}

        {/* Add column button */}
        <div className="flex-shrink-0 w-[240px]">
          {addingColumn ? (
            <div className="rounded-lg border border-dashed p-3 space-y-2 bg-muted/20">
              <Input
                ref={newColRef}
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddColumn(); if (e.key === "Escape") { setAddingColumn(false); setNewColumnName(""); } }}
                placeholder="Nome da coluna..."
                className="h-8 text-sm"
              />
              <div className="flex gap-1">
                <Button size="sm" className="h-7 text-xs flex-1 gap-1" onClick={handleAddColumn}>
                  <Check className="h-3 w-3" /> Criar
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setAddingColumn(false); setNewColumnName(""); }}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingColumn(true)}
              className="w-full h-20 rounded-lg border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 hover:bg-primary/5 transition-colors flex items-center justify-center gap-2 text-muted-foreground hover:text-primary text-sm"
            >
              <Plus className="h-4 w-4" /> Adicionar Coluna
            </button>
          )}
        </div>
      </div>

      <DragOverlay>
        {activeCall && <CallCard call={activeCall} isDragging />}
      </DragOverlay>
    </DndContext>
  );
}
