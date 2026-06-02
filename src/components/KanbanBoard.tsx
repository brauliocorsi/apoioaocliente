import { useState, useRef, useEffect, useCallback } from "react";
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
import { AlertTriangle, Clock, CheckCircle, Timer, Pencil, Check, X, Phone, Mail, MailCheck, Paperclip, Image, Video, Plus } from "lucide-react";
import type { AttachmentInfo } from "@/pages/Tickets";
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
  onOpenTicket?: (ticketId: string) => void;
  callCounts?: Record<string, number>;
  agentProfiles?: Record<string, { full_name: string; avatar_url: string | null }>;
  unreadCounts?: Record<string, number>;
  emailUnreadCounts?: Record<string, number>;
  ticketTagsMap?: Record<string, string[]>;
  allTags?: { id: string; name: string; color: string | null }[];
  agentRepliedMap?: Record<string, boolean>;
  attachmentInfoMap?: Record<string, AttachmentInfo>;
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

function TicketCard({ ticket, isDragging, categoryNames, callCount, agentProfile, unreadCount, emailUnreadCount, ticketTags, allTags, agentReplied, attachmentInfo }: { ticket: TicketRow; isDragging?: boolean; categoryNames?: Record<string, string>; callCount?: number; agentProfile?: { full_name: string; avatar_url: string | null }; unreadCount?: number; emailUnreadCount?: number; ticketTags?: string[]; allTags?: { id: string; name: string; color: string | null }[]; agentReplied?: boolean; attachmentInfo?: AttachmentInfo }) {
  const initials = agentProfile
    ? agentProfile.full_name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()
    : null;

  return (
    <div className={`group/card relative bg-card border border-border/70 rounded-xl p-3.5 transition-all duration-200 ${isDragging ? "shadow-elevated opacity-90 rotate-2 scale-[1.02]" : "shadow-soft hover:shadow-card-hover hover:border-primary/30 hover:-translate-y-0.5"}`}>
      {/* Unread pulse strip */}
      {(emailUnreadCount && emailUnreadCount > 0) || (unreadCount && unreadCount > 0) ? (
        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-gradient-primary animate-pulse" />
      ) : null}

      {/* Top: ticket id + indicators */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono font-semibold text-muted-foreground bg-muted/70 px-1.5 py-0.5 rounded-md">#{ticket.ticket_number}</span>
          <PriorityFlag priority={ticket.priority} size={14} />
        </div>
        <div className="flex items-center gap-1.5">
          {emailUnreadCount && emailUnreadCount > 0 ? (
            <Badge className="text-[10px] h-5 min-w-[20px] justify-center px-1.5 gap-0.5 bg-info hover:bg-info text-info-foreground border-0 shadow-soft">
              <Mail className="h-3 w-3" />
              {emailUnreadCount}
            </Badge>
          ) : agentReplied ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-md bg-success-soft">
                  <MailCheck className="h-3 w-3 text-success" />
                </span>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Cliente respondido</p></TooltipContent>
            </Tooltip>
          ) : unreadCount && unreadCount > 0 ? (
            <Badge variant="destructive" className="text-[10px] h-5 min-w-[20px] justify-center px-1.5 shadow-soft">
              {unreadCount}
            </Badge>
          ) : null}
          {callCount && callCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-muted-foreground bg-muted/60 rounded-md px-1.5 h-5">
              <Phone className="h-3 w-3" />
              <span className="text-[10px] font-semibold">{callCount}</span>
            </span>
          )}
          {attachmentInfo && attachmentInfo.count > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-0.5 text-muted-foreground bg-muted/60 rounded-md px-1.5 h-5">
                  {attachmentInfo.hasImages ? <Image className="h-3 w-3 text-info" /> :
                   attachmentInfo.hasVideos ? <Video className="h-3 w-3" style={{ color: "hsl(var(--cat-4))" }} /> :
                   <Paperclip className="h-3 w-3" />}
                  <span className="text-[10px] font-semibold">{attachmentInfo.count}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">{attachmentInfo.count} anexo(s){attachmentInfo.hasImages ? " · fotos" : ""}{attachmentInfo.hasVideos ? " · vídeos" : ""}</p></TooltipContent>
            </Tooltip>
          )}
          <KanbanSlaIcon ticket={ticket} />
        </div>
      </div>

      {/* Middle: subject */}
      <p className="text-[14px] font-medium leading-snug line-clamp-2 text-foreground mb-1.5">{ticket.subject}</p>
      {ticket.order_number && (
        <p className="text-[11px] text-muted-foreground mb-2 font-mono">📦 Enc. {ticket.order_number}</p>
      )}

      {/* Bottom: client + agent */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-dashed border-border/60">
        <p className="text-[12px] text-muted-foreground truncate flex-1">{ticket.client_name}</p>
        {agentProfile && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className="h-5 w-5 shrink-0 ring-1 ring-primary/30">
                <AvatarImage src={agentProfile.avatar_url || undefined} />
                <AvatarFallback className="text-[8px] bg-gradient-primary text-white font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent><p className="text-xs">{agentProfile.full_name}</p></TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Category + tags */}
      {(ticket.category_id || (ticketTags && ticketTags.length > 0)) && (
        <div className="flex flex-wrap gap-1 mt-2">
          {ticket.category_id && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary-soft text-primary border-primary/20">
              {categoryNames?.[ticket.category_id] || ticket.category_id}
            </Badge>
          )}
          {ticketTags?.map((tagId) => {
            const tag = allTags?.find((t) => t.id === tagId);
            if (!tag) return null;
            return (
              <Badge key={tagId} className="text-[10px] text-white border-0 px-1.5 py-0 shadow-soft" style={{ backgroundColor: tag.color || "#6b7280" }}>
                {tag.name}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}


function DraggableTicket({ ticket, categoryNames, callCount, agentProfile, unreadCount, emailUnreadCount, ticketTags, allTags, agentReplied, attachmentInfo, onOpenTicket }: { ticket: TicketRow; categoryNames?: Record<string, string>; callCount?: number; agentProfile?: { full_name: string; avatar_url: string | null }; unreadCount?: number; emailUnreadCount?: number; ticketTags?: string[]; allTags?: { id: string; name: string; color: string | null }[]; agentReplied?: boolean; attachmentInfo?: AttachmentInfo; onOpenTicket?: (ticketId: string) => void }) {
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
      onClick={() => {
        onOpenTicket?.(ticket.id);
        navigate(`/tickets/${ticket.id}`);
      }}
    >
      <TicketCard ticket={ticket} categoryNames={categoryNames} callCount={callCount} agentProfile={agentProfile} unreadCount={unreadCount} emailUnreadCount={emailUnreadCount} ticketTags={ticketTags} allTags={allTags} agentReplied={agentReplied} attachmentInfo={attachmentInfo} />
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
      className={`flex-shrink-0 w-72 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm transition-all overflow-hidden ${isOver ? "ring-2 ring-primary/40 shadow-glow-primary" : "shadow-soft"}`}
      style={{
        borderTop: `4px solid ${color}`,
        background: isOver ? `linear-gradient(180deg, ${color}10, hsl(var(--card)/0.6))` : undefined,
      }}
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
    <div className="px-3.5 py-3 border-b bg-card/60" style={{ borderBottomColor: `${color}33` }}>
      <div className="flex items-center justify-between gap-2">
        {editing ? (
          <div className="flex items-center gap-1 flex-1">
            <Input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditName(name); setEditing(false); } }}
              className="h-7 text-xs px-2 py-0"
            />
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={save}><Check className="h-3 w-3" /></Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditName(name); setEditing(false); }}><X className="h-3 w-3" /></Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-0 group">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-foreground truncate">
              {name}
            </h3>
            <button
              onClick={(e) => { e.stopPropagation(); setEditing(true); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-1.5 shrink-0">
          {slaAlerts.expired > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-destructive bg-destructive-soft rounded-md px-1.5 py-0.5">
                  <AlertTriangle className="h-3 w-3" />{slaAlerts.expired}
                </span>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">{slaAlerts.expired} ticket{slaAlerts.expired > 1 ? "s" : ""} com SLA de estágio expirado</p></TooltipContent>
            </Tooltip>
          )}
          {slaAlerts.atRisk > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-warning bg-warning-soft rounded-md px-1.5 py-0.5">
                  <Timer className="h-3 w-3" />{slaAlerts.atRisk}
                </span>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">{slaAlerts.atRisk} ticket{slaAlerts.atRisk > 1 ? "s" : ""} em risco de SLA de estágio</p></TooltipContent>
            </Tooltip>
          )}
          <span
            className="inline-flex items-center justify-center min-w-[26px] h-6 px-2 rounded-md text-[12px] font-bold"
            style={{ backgroundColor: `${color}22`, color }}
          >
            {count}
          </span>
        </div>
      </div>
    </div>

  );
}

export default function KanbanBoard({ tickets, categoryNames, onTicketMoved, onOpenTicket, callCounts, agentProfiles, unreadCounts, emailUnreadCounts, ticketTagsMap, allTags, agentRepliedMap, attachmentInfoMap }: KanbanBoardProps) {
  const { toast } = useToast();
  const { statuses, statusLabels, refetch: refetchStatuses } = useTicketStatuses();
  const [activeTicket, setActiveTicket] = useState<TicketRow | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnColor, setNewColumnColor] = useState("#6b7280");
  const newColumnInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const statusIds = statuses.map((s) => s.id);

  // Group tickets and sort: unread emails first, then unread portal msgs, then rest
  const grouped = statuses.reduce((acc, s) => {
    const columnTickets = tickets.filter((t) => t.status === s.id);
    columnTickets.sort((a, b) => {
      const aEmail = emailUnreadCounts?.[a.id] || 0;
      const bEmail = emailUnreadCounts?.[b.id] || 0;
      const aUnread = unreadCounts?.[a.id] || 0;
      const bUnread = unreadCounts?.[b.id] || 0;
      // Tickets with unread emails first
      if (aEmail > 0 && bEmail === 0) return -1;
      if (bEmail > 0 && aEmail === 0) return 1;
      // Then tickets with unread portal messages
      if (aUnread > 0 && bUnread === 0) return -1;
      if (bUnread > 0 && aUnread === 0) return 1;
      // Keep original order (most recent first)
      return 0;
    });
    acc[s.id] = columnTickets;
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

      // Check if status change email notifications are enabled
      const { data: notifySetting } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "notify_status_change_email")
        .maybeSingle();

      if (notifySetting?.value === "true") {
        supabase.functions.invoke("send-ticket-email", {
          body: { ticket_id: ticket.id, template_id: "status_changed" },
        }).then(({ error }) => {
          if (error) toast({ title: "Falha ao enviar notificação por email", description: error.message, variant: "destructive" });
        }).catch(() => {
          toast({ title: "Falha ao enviar notificação por email", variant: "destructive" });
        });
      }

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

  const handleCreateStatus = useCallback(async () => {
    const trimmed = newColumnName.trim();
    if (!trimmed) return;
    const newId = trimmed.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const maxSort = statuses.length > 0 ? Math.max(...statuses.map(s => s.sort_order)) : 0;
    const { error } = await supabase
      .from("ticket_statuses")
      .insert({ id: newId, name: trimmed, color: newColumnColor, sort_order: maxSort + 1 } as any);
    if (error) {
      toast({ title: "Erro ao criar estado", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Estado "${trimmed}" criado` });
      setNewColumnName("");
      setNewColumnColor("#6b7280");
      setAddingColumn(false);
      refetchStatuses();
    }
  }, [newColumnName, newColumnColor, statuses, refetchStatuses, toast]);

  useEffect(() => {
    if (addingColumn) newColumnInputRef.current?.focus();
  }, [addingColumn]);

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
                  <DraggableTicket key={t.id} ticket={t} categoryNames={categoryNames} callCount={callCounts?.[t.id]} agentProfile={t.assigned_to ? agentProfiles?.[t.assigned_to] : undefined} unreadCount={unreadCounts?.[t.id]} emailUnreadCount={emailUnreadCounts?.[t.id]} ticketTags={ticketTagsMap?.[t.id]} allTags={allTags} agentReplied={agentRepliedMap?.[t.id]} attachmentInfo={attachmentInfoMap?.[t.id]} onOpenTicket={onOpenTicket} />
                ))}
                {(grouped[s.id] || []).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">Sem tickets</p>
                )}
              </div>
            </ScrollArea>
          </DroppableColumn>
        ))}
          {/* Add new column button */}
          <div className="flex-shrink-0 w-64">
            {addingColumn ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 space-y-2">
                <Input
                  ref={newColumnInputRef}
                  placeholder="Nome do estado..."
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateStatus();
                    if (e.key === "Escape") { setAddingColumn(false); setNewColumnName(""); }
                  }}
                  className="h-8 text-sm"
                />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Cor:</label>
                  <input
                    type="color"
                    value={newColumnColor}
                    onChange={(e) => setNewColumnColor(e.target.value)}
                    className="h-6 w-8 rounded border cursor-pointer"
                  />
                </div>
                <div className="flex gap-1">
                  <Button size="sm" className="h-7 text-xs flex-1" onClick={handleCreateStatus}>
                    <Check className="h-3 w-3 mr-1" /> Criar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAddingColumn(false); setNewColumnName(""); }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingColumn(true)}
                className="w-full h-24 rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary"
              >
                <Plus className="h-5 w-5" />
                <span className="text-xs font-medium">Novo Estado</span>
              </button>
            )}
          </div>
        </div>
      <DragOverlay>
        {activeTicket && <TicketCard ticket={activeTicket} isDragging categoryNames={categoryNames} callCount={callCounts?.[activeTicket.id]} agentProfile={activeTicket.assigned_to ? agentProfiles?.[activeTicket.assigned_to] : undefined} unreadCount={unreadCounts?.[activeTicket.id]} emailUnreadCount={emailUnreadCounts?.[activeTicket.id]} ticketTags={ticketTagsMap?.[activeTicket.id]} allTags={allTags} agentReplied={agentRepliedMap?.[activeTicket.id]} attachmentInfo={attachmentInfoMap?.[activeTicket.id]} />}
      </DragOverlay>
    </DndContext>
    </TooltipProvider>
  );
}
