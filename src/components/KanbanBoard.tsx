import { useState, useRef, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import PriorityFlag from "@/components/ticket/PriorityFlag";
import { useTicketStatuses } from "@/hooks/useTicketStatuses";
import { getTicketSlaStatus, calcRemaining, type SlaStatus } from "@/components/ticket/SlaDashboard";
import { AlertTriangle, Clock, CheckCircle, Timer, Pencil, Check, X, Phone } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  sla_resolution_at: string | null;
  sla_paused_at: string | null;
  sla_paused_total_seconds: number | null;
  sla_stage_deadline_at: string | null;
  resolved_at: string | null;
  assigned_to: string | null;
};

interface KanbanBoardProps {
  tickets: TicketRow[];
  categoryNames?: Record<string, string>;
  onTicketMoved?: () => void;
  callCounts?: Record<string, number>;
  agentProfiles?: Record<string, { full_name: string; avatar_url: string | null }>;
  unreadCounts?: Record<string, number>;
}

function formatSlaTime(ms: number): string {
  const abs = Math.abs(ms);
  const hours = Math.floor(abs / 3600000);
  const mins = Math.floor((abs % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function KanbanSlaIcon({ ticket }: { ticket: TicketRow }) {
  const status = getTicketSlaStatus(ticket);
  const icon =
    status === "breached" ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> :
    status === "at_risk" ? <Timer className="h-3.5 w-3.5 text-warning" /> :
    status === "on_track" ? <Clock className="h-3.5 w-3.5 text-success" /> :
    status === "completed" ? <CheckCircle className="h-3.5 w-3.5 text-success" /> :
    null;
  if (!icon) return null;

  let label = "";
  if (status === "completed") label = "SLA concluído";
  else if (status === "no_sla") label = "Sem SLA";
  else if (ticket.sla_resolution_at) {
    const remaining = calcRemaining(ticket.sla_resolution_at, ticket.sla_paused_total_seconds || 0, ticket.sla_paused_at);
    label = remaining <= 0 ? `Expirado há ${formatSlaTime(remaining)}` : `${formatSlaTime(remaining)} restante`;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild><span className="cursor-default">{icon}</span></TooltipTrigger>
      <TooltipContent><p className="text-xs">{label}</p></TooltipContent>
    </Tooltip>
  );
}

function TicketCard({ ticket, isDragging, categoryNames, callCount, agentProfile, unreadCount }: { ticket: TicketRow; isDragging?: boolean; categoryNames?: Record<string, string>; callCount?: number; agentProfile?: { full_name: string; avatar_url: string | null }; unreadCount?: number }) {
  const initials = agentProfile
    ? agentProfile.full_name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()
    : null;

  return (
    <div className={`bg-background border rounded-md p-3 transition-shadow ${isDragging ? "shadow-lg opacity-80 rotate-2" : "hover:shadow-md"}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-muted-foreground">#{ticket.ticket_number}</span>
        <div className="flex items-center gap-1.5">
          {unreadCount && unreadCount > 0 && (
            <Badge variant="destructive" className="text-[10px] h-4 min-w-[16px] justify-center px-1">
              {unreadCount}
            </Badge>
          )}
          {callCount && callCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-muted-foreground">
              <Phone className="h-3 w-3" />
              <span className="text-[10px]">{callCount}</span>
            </span>
          )}
          <KanbanSlaIcon ticket={ticket} />
          <PriorityFlag priority={ticket.priority} size={14} />
        </div>
      </div>
      <p className="text-sm font-medium leading-tight line-clamp-2">{ticket.subject}</p>
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-xs text-muted-foreground truncate">{ticket.client_name}</p>
        {agentProfile && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className="h-5 w-5 shrink-0">
                <AvatarImage src={agentProfile.avatar_url || undefined} />
                <AvatarFallback className="text-[8px] bg-primary/10 text-primary font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent><p className="text-xs">{agentProfile.full_name}</p></TooltipContent>
          </Tooltip>
        )}
      </div>
      {ticket.category_id && (
        <Badge variant="outline" className="text-[10px] mt-1.5">{categoryNames?.[ticket.category_id] || ticket.category_id}</Badge>
      )}
    </div>
  );
}

function DraggableTicket({ ticket, categoryNames, callCount, agentProfile, unreadCount }: { ticket: TicketRow; categoryNames?: Record<string, string>; callCount?: number; agentProfile?: { full_name: string; avatar_url: string | null }; unreadCount?: number }) {
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
      <TicketCard ticket={ticket} categoryNames={categoryNames} callCount={callCount} agentProfile={agentProfile} unreadCount={unreadCount} />
    </div>
  );
}

function getStageSlaAlerts(tickets: TicketRow[]): { expired: number; atRisk: number } {
  let expired = 0;
  let atRisk = 0;
  for (const t of tickets) {
    if (!t.sla_stage_deadline_at) continue;
    const remaining = new Date(t.sla_stage_deadline_at).getTime() - Date.now();
    const total = new Date(t.sla_stage_deadline_at).getTime() - new Date(t.created_at).getTime();
    if (remaining <= 0) expired++;
    else if (total > 0 && remaining / total < 0.25) atRisk++;
  }
  return { expired, atRisk };
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

function InlineStatusHeader({
  statusId,
  name,
  color,
  count,
  onRename,
  slaAlerts,
}: {
  statusId: string;
  name: string;
  color: string;
  count: number;
  onRename: (id: string, newName: string) => void;
  slaAlerts: { expired: number; atRisk: number };
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== name) {
      onRename(statusId, trimmed);
    } else {
      setEditName(name);
    }
    setEditing(false);
  };

  return (
    <div className="px-3 py-2 border-b">
      <div className="flex items-center justify-between gap-1">
        {editing ? (
          <div className="flex items-center gap-1 flex-1">
            <Input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditName(name); setEditing(false); } }}
              className="h-6 text-xs px-1.5 py-0"
            />
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={save}><Check className="h-3 w-3" /></Button>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setEditName(name); setEditing(false); }}><X className="h-3 w-3" /></Button>
          </div>
        ) : (
          <div className="flex items-center gap-1 flex-1 group">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {name}
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
          {slaAlerts.expired > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-destructive bg-destructive/10 rounded px-1 py-0.5">
                  <AlertTriangle className="h-3 w-3" />{slaAlerts.expired}
                </span>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">{slaAlerts.expired} ticket{slaAlerts.expired > 1 ? "s" : ""} com SLA de estágio expirado</p></TooltipContent>
            </Tooltip>
          )}
          {slaAlerts.atRisk > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-warning bg-warning/10 rounded px-1 py-0.5">
                  <Timer className="h-3 w-3" />{slaAlerts.atRisk}
                </span>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">{slaAlerts.atRisk} ticket{slaAlerts.atRisk > 1 ? "s" : ""} em risco de SLA de estágio</p></TooltipContent>
            </Tooltip>
          )}
          <Badge variant="secondary" className="text-xs h-5 min-w-[20px] justify-center">
            {count}
          </Badge>
        </div>
      </div>
    </div>
  );
}

export default function KanbanBoard({ tickets, categoryNames, onTicketMoved, callCounts, agentProfiles, unreadCounts }: KanbanBoardProps) {
  const { toast } = useToast();
  const { statuses, statusLabels, refetch: refetchStatuses } = useTicketStatuses();
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

      supabase.functions.invoke("send-ticket-email", {
        body: { ticket_id: ticket.id, template_id: "status_changed" },
      }).then(({ error }) => {
        if (error) toast({ title: "Falha ao enviar notificação por email", description: error.message, variant: "destructive" });
      }).catch(() => {
        toast({ title: "Falha ao enviar notificação por email", variant: "destructive" });
      });

      onTicketMoved?.();
    }
  };

  const handleRenameStatus = async (id: string, newName: string) => {
    const { error } = await supabase
      .from("ticket_statuses")
      .update({ name: newName })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao renomear status", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Status renomeado → ${newName}` });
      refetchStatuses();
    }
  };

  return (
    <TooltipProvider>
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
            <InlineStatusHeader
              statusId={s.id}
              name={s.name}
              color={s.color}
              count={(grouped[s.id] || []).length}
              onRename={handleRenameStatus}
              slaAlerts={getStageSlaAlerts(grouped[s.id] || [])}
            />
            <ScrollArea className="h-[calc(100vh-320px)]">
              <div className="p-2 space-y-2">
                {(grouped[s.id] || []).map((t) => (
                  <DraggableTicket key={t.id} ticket={t} categoryNames={categoryNames} callCount={callCounts?.[t.id]} agentProfile={t.assigned_to ? agentProfiles?.[t.assigned_to] : undefined} unreadCount={unreadCounts?.[t.id]} />
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
        {activeTicket && <TicketCard ticket={activeTicket} isDragging categoryNames={categoryNames} callCount={callCounts?.[activeTicket.id]} agentProfile={activeTicket.assigned_to ? agentProfiles?.[activeTicket.assigned_to] : undefined} unreadCount={unreadCounts?.[activeTicket.id]} />}
      </DragOverlay>
    </DndContext>
    </TooltipProvider>
  );
}
