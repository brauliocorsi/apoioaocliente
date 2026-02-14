import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import PriorityFlag from "@/components/ticket/PriorityFlag";
import { Phone, Bell, FileText } from "lucide-react";
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
};

const COLUMNS = [
  { id: "pendente", label: "Pendente", color: "hsl(38, 92%, 50%)" },
  { id: "em_andamento", label: "Em Andamento", color: "hsl(215, 70%, 45%)" },
  { id: "concluido", label: "Concluído", color: "hsl(142, 71%, 45%)" },
  { id: "cancelado", label: "Cancelado", color: "hsl(215, 15%, 47%)" },
];

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
      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-dashed">
        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Phone className="h-3 w-3" /> {call.client_phone}
        </span>
        {call.invoice_number && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <FileText className="h-3 w-3" /> {call.invoice_number}
          </span>
        )}
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

export default function PhoneCallKanban({ calls, onSelect, onStatusChanged }: PhoneCallKanbanProps) {
  const [activeCall, setActiveCall] = useState<PhoneCall | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const columnIds = COLUMNS.map((c) => c.id);

  const grouped = COLUMNS.reduce((acc, col) => {
    acc[col.id] = calls.filter((c) => c.status === col.id);
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
      const label = COLUMNS.find((c) => c.id === newStatus)?.label || newStatus;
      toast({ title: `Ligação movida → ${label}` });
      onStatusChanged();
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3" style={{ minHeight: 300 }}>
        {COLUMNS.map((col) => (
          <DroppableColumn key={col.id} columnId={col.id} color={col.color} isOver={overColumn === col.id}>
            <div className="px-3 py-2.5 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {col.label}
                </h3>
                <Badge variant="secondary" className="text-xs h-5 min-w-[20px] justify-center">
                  {(grouped[col.id] || []).length}
                </Badge>
              </div>
            </div>
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
      </div>

      <DragOverlay>
        {activeCall && <CallCard call={activeCall} isDragging />}
      </DragOverlay>
    </DndContext>
  );
}
