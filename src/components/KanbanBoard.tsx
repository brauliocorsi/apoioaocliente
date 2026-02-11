import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import PriorityFlag from "@/components/ticket/PriorityFlag";
import { useTicketStatuses } from "@/hooks/useTicketStatuses";
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

type TicketRow = {
  id: string;
  ticket_number: number;
  client_name: string;
  subject: string;
  category_id: string | null;
  priority: string;
  status: string;
  order_number: string | null;
  created_at: string;
};

interface KanbanBoardProps {
  tickets: TicketRow[];
  categoryNames?: Record<string, string>;
  onTicketMoved?: () => void;
}

function TicketCard({ ticket, isDragging, categoryNames }: { ticket: TicketRow; isDragging?: boolean; categoryNames?: Record<string, string> }) {
  return (
    <div className={`bg-background border rounded-md p-3 transition-shadow ${isDragging ? "shadow-lg opacity-80 rotate-2" : "hover:shadow-md"}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-muted-foreground">#{ticket.ticket_number}</span>
        <PriorityFlag priority={ticket.priority} size={14} />
      </div>
      <p className="text-sm font-medium leading-tight line-clamp-2">{ticket.subject}</p>
      <p className="text-xs text-muted-foreground mt-1 truncate">{ticket.client_name}</p>
      {ticket.category_id && (
        <Badge variant="outline" className="text-[10px] mt-1.5">{categoryNames?.[ticket.category_id] || ticket.category_id}</Badge>
      )}
    </div>
  );
}

function DraggableTicket({ ticket, categoryNames }: { ticket: TicketRow; categoryNames?: Record<string, string> }) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: ticket.id,
    data: { ticket },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? "opacity-30" : ""}`}
      onClick={() => navigate(`/tickets/${ticket.id}`)}
    >
      <TicketCard ticket={ticket} categoryNames={categoryNames} />
    </div>
  );
}

function DroppableColumn({ statusId, color, children, isOver }: { statusId: string; color: string; children: React.ReactNode; isOver: boolean }) {
  const { setNodeRef } = useDroppable({ id: statusId });

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-64 rounded-lg border border-t-4 transition-colors ${isOver ? "bg-primary/10 ring-2 ring-primary/30" : "bg-muted/30"}`}
      style={{ borderTopColor: color }}
    >
      {children}
    </div>
  );
}

export default function KanbanBoard({ tickets, categoryNames, onTicketMoved }: KanbanBoardProps) {
  const { toast } = useToast();
  const { statuses, statusLabels } = useTicketStatuses();
  const [activeTicket, setActiveTicket] = useState<TicketRow | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const statusIds = statuses.map((s) => s.id);

  const grouped = statuses.reduce((acc, s) => {
    acc[s.id] = tickets.filter((t) => t.status === s.id);
    return acc;
  }, {} as Record<string, TicketRow[]>);

  const handleDragStart = (event: DragStartEvent) => {
    const ticket = event.active.data.current?.ticket as TicketRow;
    setActiveTicket(ticket);
  };

  const handleDragOver = (event: any) => {
    const overId = event.over?.id as string | null;
    setOverColumn(overId && statusIds.includes(overId) ? overId : null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTicket(null);
    setOverColumn(null);

    const { active, over } = event;
    if (!over) return;

    const ticket = active.data.current?.ticket as TicketRow;
    const newStatus = over.id as string;

    if (!statusIds.includes(newStatus) || ticket.status === newStatus) return;

    const { error } = await supabase
      .from("tickets")
      .update({ status: newStatus as any })
      .eq("id", ticket.id);

    if (error) {
      toast({ title: "Erro ao mover ticket", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Ticket #${ticket.ticket_number} → ${statusLabels[newStatus]}` });
      onTicketMoved?.();
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
      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
        {statuses.map((s) => (
          <DroppableColumn key={s.id} statusId={s.id} color={s.color} isOver={overColumn === s.id}>
            <div className="px-3 py-2 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {s.name}
                </h3>
                <Badge variant="secondary" className="text-xs h-5 min-w-[20px] justify-center">
                  {(grouped[s.id] || []).length}
                </Badge>
              </div>
            </div>
            <ScrollArea className="h-[calc(100vh-320px)]">
              <div className="p-2 space-y-2">
                {(grouped[s.id] || []).map((t) => (
                  <DraggableTicket key={t.id} ticket={t} categoryNames={categoryNames} />
                ))}
                {(grouped[s.id] || []).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">Sem tickets</p>
                )}
              </div>
            </ScrollArea>
          </DroppableColumn>
        ))}
      </div>

      <DragOverlay>
        {activeTicket && <TicketCard ticket={activeTicket} isDragging categoryNames={categoryNames} />}
      </DragOverlay>
    </DndContext>
  );
}
