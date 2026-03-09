import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Clock, Send, MessageSquare, Paperclip, X, FileImage, FileVideo, FileText, Trash2, Gavel, ChevronDown, ChevronRight, Check } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DecisionEngine, type RuleSuggestion, type DecisionRule } from "@/lib/decisionEngine";
import { v4 as uuidv4 } from "uuid";
import FileUpload from "@/components/FileUpload";
import MacroSelector from "@/components/ticket/MacroSelector";
import TicketSidebar from "@/components/ticket/TicketSidebar";
import SlaIndicator from "@/components/ticket/SlaIndicator";
import PriorityFlag from "@/components/ticket/PriorityFlag";
import { useTicketStatuses } from "@/hooks/useTicketStatuses";
import MentionTextarea from "@/components/MentionTextarea";
import ResolutionCard from "@/components/ticket/ResolutionCard";
import MessageReactions from "@/components/chat/MessageReactions";

// Detect HTML content
function isHtmlContent(text: string): boolean {
  if (!text) return false;
  return /<\w+[^>]*>/.test(text) && (text.includes("</") || text.includes("/>"));
}

// Sanitize HTML for safe rendering
function sanitizeForDisplay(html: string): string {
  let safe = html;
  safe = safe.replace(/<script[\s\S]*?<\/script>/gi, "");
  safe = safe.replace(/<style[\s\S]*?<\/style>/gi, "");
  safe = safe.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, "");
  safe = safe.replace(/\s+on\w+\s*=\s*'[^']*'/gi, "");
  safe = safe.replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"');
  return safe;
}

// Clean raw MIME content (strip headers, decode quoted-printable)
function cleanMimeContent(text: string): string {
  if (!text) return text;
  // Strip IMAP BODY[TEXT] wrapper
  let cleaned = text.replace(/^BODY\[TEXT\]\s*\{\d+\}\s*/i, "");
  // Strip MIME boundaries and headers
  cleaned = cleaned.replace(/--[a-zA-Z0-9]+\s*(Content-Type:[^\n]+\n(Content-Transfer-Encoding:[^\n]+\n)?(\n)?)?/gi, "");
  cleaned = cleaned.replace(/Content-Type:\s*[^\r\n]+[\r\n]*/gi, "");
  cleaned = cleaned.replace(/Content-Transfer-Encoding:\s*[^\r\n]+[\r\n]*/gi, "");
  // Decode quoted-printable
  cleaned = cleaned.replace(/=\r?\n/g, "");
  cleaned = cleaned.replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
  try {
    const bytes = new Uint8Array([...cleaned].map(c => c.charCodeAt(0)));
    cleaned = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch { /* keep as-is */ }
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned;
}

// Render content intelligently: HTML as HTML, MIME-encoded as cleaned text
function RichContent({ content }: { content: string }) {
  if (!content) return <span className="text-muted-foreground">Sem conteúdo</span>;

  if (isHtmlContent(content)) {
    return (
      <div
        className="prose prose-sm dark:prose-invert max-w-none [&_img]:max-w-full [&_img]:h-auto [&_table]:border-collapse [&_td]:p-1 [&_a]:text-primary [&_a]:underline [&_p]:my-1 [&_*]:max-w-full overflow-hidden break-words"
        dangerouslySetInnerHTML={{ __html: sanitizeForDisplay(content) }}
      />
    );
  }

  // Check if it has raw MIME artifacts
  const hasMimeArtifacts = content.includes("BODY[TEXT]") || content.includes("Content-Type:") || content.includes("Content-Transfer-Encoding:");
  const display = hasMimeArtifacts ? cleanMimeContent(content) : content;

  return <p className="text-sm whitespace-pre-wrap leading-relaxed">{display}</p>;
}

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { toast } = useToast();
  const { statuses, statusLabels } = useTicketStatuses();
  const [ticket, setTicket] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [clauses, setClauses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [reply, setReply] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [suggestions, setSuggestions] = useState<RuleSuggestion[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [noteFiles, setNoteFiles] = useState<File[]>([]);
  const replyFileRef = useRef<HTMLInputElement>(null);
  const noteFileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [senderProfiles, setSenderProfiles] = useState<Record<string, { full_name: string; avatar_url?: string | null }>>({});
  const [clauseMap, setClauseMap] = useState<Record<string, { code: string; description: string }>>({});
  const [macroMap, setMacroMap] = useState<Record<string, string>>({});
  const [allMacros, setAllMacros] = useState<{ id: string; title: string; content: string }[]>([]);
  const [isResolutionOpen, setIsResolutionOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState("");

  const fetchTicket = async () => {
    if (!id) return;
    const [{ data: t }, { data: evts }, { data: tTags }, { data: tClauses }, { data: tAttachments }, { data: msgs }, { data: allClauses }, { data: allMacrosData }, { data: rulesData }] = await Promise.all([
      supabase.from("tickets").select("*").eq("id", id).single(),
      supabase.from("ticket_events").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
      supabase.from("ticket_tags").select("tag_id").eq("ticket_id", id),
      supabase.from("ticket_clauses").select("clause_id").eq("ticket_id", id),
      supabase.from("ticket_attachments").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
      supabase.from("ticket_messages").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
      supabase.from("clauses").select("id, code, description"),
      supabase.from("macros").select("id, title, content"),
      supabase.from("decision_rules" as any).select("*").eq("is_active", true).order("sort_order"),
    ]);
    setTicket(t);
    setEvents(evts || []);
    setMessages(msgs || []);
    setTags((tTags || []).map((r: any) => r.tag_id));
    setClauses((tClauses || []).map((r: any) => r.clause_id));
    setAttachments((tAttachments || []).map((a: any) => ({
      ...a,
      url: supabase.storage.from("ticket-attachments").getPublicUrl(a.file_path).data.publicUrl,
    })));

    // Build clause and macro maps
    const cMap: Record<string, { code: string; description: string }> = {};
    (allClauses || []).forEach((c: any) => { cMap[c.id] = { code: c.code, description: c.description }; cMap[c.code] = { code: c.code, description: c.description }; });
    setClauseMap(cMap);

    const mMap: Record<string, string> = {};
    (allMacrosData || []).forEach((m: any) => { mMap[m.id] = m.title; });
    setMacroMap(mMap);
    setAllMacros((allMacrosData || []) as { id: string; title: string; content: string }[]);

    if (t) {
      const currentTagIds = (tTags || []).map((r: any) => r.tag_id);
      const rules = ((rulesData as unknown) as DecisionRule[]) || [];
      const s = DecisionEngine.evaluateRules(t, currentTagIds, rules);
      setSuggestions(s);
      // Open resolution section if there's an existing resolution
      if (t.resolution_type) setIsResolutionOpen(true);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTicket(); }, [id]);

  // Mark ticket as read for current agent
  useEffect(() => {
    if (!id || !user) return;
    supabase.from("ticket_read_status").upsert(
      { ticket_id: id, agent_id: user.id, last_read_at: new Date().toISOString() },
      { onConflict: "ticket_id,agent_id" }
    );
  }, [id, user]);

  // Load agents for mentions + sender profiles for chat avatars
  useEffect(() => {
    const loadProfiles = async () => {
      const { data: agentData } = await supabase.from("profiles").select("id, full_name, avatar_url");
      const agentList = (agentData as any[] || []).map((p: any) => ({ id: p.id, full_name: p.full_name }));
      setAgents(agentList);
      
      const profileMap: Record<string, { full_name: string; avatar_url?: string | null }> = {};
      (agentData as any[] || []).forEach((p: any) => {
        profileMap[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url };
      });

      // Also load client profiles
      const { data: clientData } = await supabase.from("client_users").select("id, full_name, avatar_url");
      (clientData as any[] || []).forEach((p: any) => {
        profileMap[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url };
      });
      
      setSenderProfiles(profileMap);
    };
    loadProfiles();
  }, []);

  // Realtime for messages
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`agent-ticket-messages-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${id}` },
        (payload) => {
          setMessages((prev) => {
            const newMsg = payload.new as any;
            // Replace optimistic message if it matches
            if (prev.some((m) => m.content === newMsg.content && m.sender_id === newMsg.sender_id && Math.abs(new Date(m.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 10000)) {
              return prev.map((m) =>
                m.content === newMsg.content && m.sender_id === newMsg.sender_id && Math.abs(new Date(m.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 10000
                  ? newMsg : m
              );
            }
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleReplyKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  };

  const updateStatus = async (newStatus: string) => {
    if (!id || !user) return;
    const oldStatus = ticket.status;
    const newStatusObj = statuses.find((s) => s.id === newStatus);
    const oldStatusObj = statuses.find((s) => s.id === oldStatus);
    
    const updates: any = { status: newStatus, status_changed_at: new Date().toISOString() };

    if (newStatusObj?.pauses_sla && !ticket.sla_paused_at) {
      updates.sla_paused_at = new Date().toISOString();
    } else if (oldStatusObj?.pauses_sla && !newStatusObj?.pauses_sla && ticket.sla_paused_at) {
      const pausedSeconds = Math.floor((Date.now() - new Date(ticket.sla_paused_at).getTime()) / 1000);
      updates.sla_paused_total_seconds = (ticket.sla_paused_total_seconds || 0) + pausedSeconds;
      updates.sla_paused_at = null;
    }

    if (newStatusObj?.is_resolved) updates.resolved_at = new Date().toISOString();

    if (newStatusObj?.sla_minutes) {
      updates.sla_stage_deadline_at = new Date(Date.now() + newStatusObj.sla_minutes * 60000).toISOString();
    } else {
      updates.sla_stage_deadline_at = null;
    }

    if (newStatusObj?.default_assign) {
      updates.assigned_to = newStatusObj.default_assign;
    }

    await supabase.from("tickets").update(updates).eq("id", id);
    await supabase.from("ticket_events").insert({
      ticket_id: id,
      user_id: user.id,
      event_type: "status_change",
      content: `Estado alterado: ${statusLabels[oldStatus] || oldStatus} → ${statusLabels[newStatus] || newStatus}`,
      metadata: { from: oldStatus, to: newStatus },
    });

    // Send email notification on status change
    if (ticket.client_user_id || ticket.client_email) {
      supabase.functions.invoke("send-ticket-email", {
        body: { ticket_id: id, template_id: "status_changed" },
      }).then(({ error }) => {
        if (error) toast({ title: "Falha ao enviar notificação por email", description: error.message, variant: "destructive" });
      }).catch(() => {
        toast({ title: "Falha ao enviar notificação por email", variant: "destructive" });
      });
    }

    toast({ title: "Estado atualizado" });
    fetchTicket();
  };

  const addNote = async () => {
    if (!id || !user) return;
    if (!note.trim() && noteFiles.length === 0) return;
    setAddingNote(true);

    // Upload note files
    const uploadedNames: string[] = [];
    for (const file of noteFiles) {
      const ext = file.name.split(".").pop();
      const filePath = `${id}/${uuidv4()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("ticket-attachments")
        .upload(filePath, file);

      if (uploadError) {
        toast({ title: "Erro no upload", description: `${file.name}: ${uploadError.message}`, variant: "destructive" });
        continue;
      }

      await supabase.from("ticket_attachments").insert({
        ticket_id: id,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: user.id,
      });
      uploadedNames.push(file.name);
    }

    let content = note.trim();
    if (uploadedNames.length > 0 && !content) {
      content = `📎 Anexo(s): ${uploadedNames.join(", ")}`;
    } else if (uploadedNames.length > 0) {
      content += `\n📎 Anexo(s): ${uploadedNames.join(", ")}`;
    }

    if (content) {
      await supabase.from("ticket_events").insert({
        ticket_id: id,
        user_id: user.id,
        event_type: "note",
        content,
      });
    }

    // Extract @mentions and create notifications
    const mentionRegex = /@([\w\s]+?)(?=\s@|\s*$|[.,!?])/g;
    let match;
    while ((match = mentionRegex.exec(note)) !== null) {
      const mentionedName = match[1].trim();
      const mentionedAgent = agents.find(
        (a) => a.full_name.toLowerCase() === mentionedName.toLowerCase()
      );
      if (mentionedAgent && mentionedAgent.id !== user.id) {
        await supabase.from("agent_notifications").insert({
          recipient_id: mentionedAgent.id,
          sender_id: user.id,
          ticket_id: id,
          type: "mention",
          content: `mencionou-o no ticket #${ticket.ticket_number}: "${note.slice(0, 80)}${note.length > 80 ? "..." : ""}"`,
        });
      }
    }

    setNote("");
    setNoteFiles([]);
    setAddingNote(false);
    fetchTicket();
  };

  const handleNoteFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const valid = selected.filter((f) => {
      if (f.size > 20 * 1024 * 1024) {
        toast({ title: `${f.name} excede 20MB`, variant: "destructive" });
        return false;
      }
      return true;
    });
    setNoteFiles((prev) => [...prev, ...valid]);
    e.target.value = "";
  };

  const sendReply = async () => {
    if (!id || !user) return;
    if (!reply.trim() && replyFiles.length === 0) return;
    setSendingReply(true);

    // Upload files
    const uploadedCount = replyFiles.length;
    for (const file of replyFiles) {
      const ext = file.name.split(".").pop();
      const filePath = `${id}/${uuidv4()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("ticket-attachments")
        .upload(filePath, file);

      if (uploadError) {
        toast({ title: "Erro no upload", description: `${file.name}: ${uploadError.message}`, variant: "destructive" });
        continue;
      }

      await supabase.from("ticket_attachments").insert({
        ticket_id: id,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: user.id,
      });
    }

    // Build message content
    let content = reply.trim();
    if (uploadedCount > 0 && !content) {
      content = `📎 ${uploadedCount} anexo(s) enviado(s)`;
    } else if (uploadedCount > 0) {
      content += `\n📎 ${uploadedCount} anexo(s) enviado(s)`;
    }

    if (content) {
      // Optimistically add message to local state
      const optimisticMsg = {
        id: crypto.randomUUID(),
        ticket_id: id,
        sender_id: user.id,
        sender_type: "agent",
        content,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMsg]);
      setReply("");
      setReplyFiles([]);
      setSendingReply(false);

      await supabase.from("ticket_messages").insert({
        ticket_id: id,
        sender_id: user.id,
        sender_type: "agent",
        content,
      });
      if (uploadedCount > 0) fetchTicket();
    } else {
      setReply("");
      setReplyFiles([]);
      setSendingReply(false);
      if (uploadedCount > 0) fetchTicket();
    }
  };

  const handleReplyFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const valid = selected.filter((f) => {
      if (f.size > 20 * 1024 * 1024) {
        toast({ title: `${f.name} excede 20MB`, variant: "destructive" });
        return false;
      }
      return true;
    });
    setReplyFiles((prev) => [...prev, ...valid]);
    e.target.value = "";
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!ticket) return <div className="text-center py-20 text-muted-foreground">Ticket não encontrado</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/tickets")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            {editingSubject ? (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  value={subjectDraft}
                  onChange={(e) => setSubjectDraft(e.target.value)}
                  className="text-xl font-bold h-9"
                  autoFocus
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && subjectDraft.trim()) {
                      await supabase.from("tickets").update({ subject: subjectDraft.trim() }).eq("id", id!);
                      toast({ title: "Assunto atualizado" });
                      setEditingSubject(false);
                      fetchTicket();
                    } else if (e.key === "Escape") {
                      setEditingSubject(false);
                    }
                  }}
                />
                <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={async () => {
                  if (subjectDraft.trim()) {
                    await supabase.from("tickets").update({ subject: subjectDraft.trim() }).eq("id", id!);
                    toast({ title: "Assunto atualizado" });
                    setEditingSubject(false);
                    fetchTicket();
                  }
                }}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingSubject(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <h1
                className="text-xl font-bold cursor-pointer hover:text-primary/80 transition-colors"
                onClick={() => { setSubjectDraft(ticket.subject); setEditingSubject(true); }}
                title="Clique para editar o assunto"
              >
                #{ticket.ticket_number} – {ticket.subject}
              </h1>
            )}
            <PriorityFlag priority={ticket.priority} showLabel />
          </div>
          <p className="text-sm text-muted-foreground">{ticket.client_name}{ticket.order_number ? ` · Enc. ${ticket.order_number}` : ""}{ticket.service_number ? ` · OS ${ticket.service_number}` : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={ticket.status} onValueChange={updateStatus}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {statuses.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {role === "supervisor" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="icon" className="text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir Ticket #{ticket.ticket_number}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação é irreversível. Todas as mensagens, eventos, anexos e dados associados serão permanentemente eliminados.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={async () => {
                      // Delete related data first
                      await Promise.all([
                        supabase.from("ticket_messages").delete().eq("ticket_id", id!),
                        supabase.from("ticket_events").delete().eq("ticket_id", id!),
                        supabase.from("ticket_tags").delete().eq("ticket_id", id!),
                        supabase.from("ticket_clauses").delete().eq("ticket_id", id!),
                        supabase.from("ticket_attachments").delete().eq("ticket_id", id!),
                        supabase.from("agent_notifications").delete().eq("ticket_id", id!),
                        supabase.from("phone_calls").update({ ticket_id: null } as any).eq("ticket_id", id!),
                        supabase.from("resolution_approvals").delete().eq("ticket_id", id!),
                        supabase.from("email_logs").delete().eq("ticket_id", id!),
                      ]);
                      const { error } = await supabase.from("tickets").delete().eq("id", id!);
                      if (error) {
                        toast({ title: "Erro ao excluir ticket", description: error.message, variant: "destructive" });
                      } else {
                        toast({ title: "Ticket excluído com sucesso" });
                        navigate("/tickets");
                      }
                    }}
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {suggestions.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              ⚡ Sugestões do Motor de Regras
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {suggestions.map((s, i) => {
              const missingTags = s.suggestedTags.filter((t) => !tags.includes(t));
              const missingClauses = s.suggestedClauses.filter((c) => !clauses.includes(c));

              const applyAll = async () => {
                if (!id) return;
                const tagInserts = missingTags.map((tagId) => ({ ticket_id: id, tag_id: tagId }));
                const clauseInserts = missingClauses.map((clauseId) => ({ ticket_id: id, clause_id: clauseId }));
                if (tagInserts.length > 0) await supabase.from("ticket_tags").insert(tagInserts);
                if (clauseInserts.length > 0) await supabase.from("ticket_clauses").insert(clauseInserts);
                toast({ title: "Tags e cláusulas aplicadas" });
                fetchTicket();
              };

              return (
                <div key={i} className="text-sm p-3 rounded-lg bg-background border space-y-2">
                  <p className="font-medium">{s.message}</p>

                  {s.suggestedTags.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground font-medium">Tags:</span>
                      {s.suggestedTags.map((tagId) => {
                        const alreadyApplied = tags.includes(tagId);
                        return (
                          <Badge
                            key={tagId}
                            variant={alreadyApplied ? "default" : "outline"}
                            className={`text-xs cursor-pointer ${alreadyApplied ? "opacity-60" : "hover:bg-primary/10"}`}
                            onClick={async () => {
                              if (alreadyApplied || !id) return;
                              await supabase.from("ticket_tags").insert({ ticket_id: id, tag_id: tagId });
                              toast({ title: "Tag aplicada" });
                              fetchTicket();
                            }}
                          >
                            {alreadyApplied ? "✓ " : "+ "}{tagId}
                          </Badge>
                        );
                      })}
                    </div>
                  )}

                  {s.suggestedClauses.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-1">Cláusulas sugeridas:</p>
                      <div className="space-y-1">
                        {s.suggestedClauses.map((clauseId) => {
                          const clause = clauseMap[clauseId];
                          const alreadyApplied = clauses.includes(clauseId);
                          return (
                            <div key={clauseId} className="flex items-start gap-2 text-xs">
                              <Button
                                size="sm"
                                variant={alreadyApplied ? "secondary" : "outline"}
                                className="h-5 text-xs px-2 py-0 shrink-0"
                                disabled={alreadyApplied}
                                onClick={async () => {
                                  if (!id) return;
                                  await supabase.from("ticket_clauses").insert({ ticket_id: id, clause_id: clauseId });
                                  toast({ title: "Cláusula aplicada" });
                                  fetchTicket();
                                }}
                              >
                                {alreadyApplied ? "✓ Aplicada" : "+ Aplicar"}
                              </Button>
                              <span className="text-muted-foreground">
                                {clause
                                  ? <><span className="font-mono font-medium text-foreground">{clause.code}</span> — {clause.description}</>
                                  : <span className="font-mono">{clauseId}</span>
                                }
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {s.suggestedMacro && (() => {
                    const macroTitle = macroMap[s.suggestedMacro];
                    const macro = allMacros.find((m) => m.id === s.suggestedMacro);
                    return (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          Macro: <span className="font-mono font-medium text-foreground">{macroTitle || s.suggestedMacro}</span>
                        </span>
                        {macro && (
                          <Button size="sm" variant="outline" className="h-5 text-xs px-2 py-0" onClick={() => setReply(macro.content)}>
                            Usar Macro
                          </Button>
                        )}
                      </div>
                    );
                  })()}

                  {(missingTags.length > 0 || missingClauses.length > 0) && (
                    <Button size="sm" variant="default" className="h-6 text-xs" onClick={applyAll}>
                      <Check className="h-3 w-3 mr-1" /> Aplicar tudo
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <SlaIndicator ticket={ticket} />

      {/* Decisão Formal — Collapsible discreto */}
      <Collapsible open={isResolutionOpen} onOpenChange={setIsResolutionOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-left">
            <Gavel className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium flex-1">Decisão Formal</span>
            {ticket.resolution_type === "resolved" && (
              <Badge variant="default" className="text-xs">✅ Resolvido</Badge>
            )}
            {ticket.resolution_type === "cancelled" && (
              <Badge variant="destructive" className="text-xs">❌ Cancelado</Badge>
            )}
            {!ticket.resolution_type && (
              <span className="text-xs text-muted-foreground">Sem decisão registada</span>
            )}
            {isResolutionOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <ResolutionCard ticket={ticket} userId={user?.id || ""} onUpdate={fetchTicket} />
        </CollapsibleContent>
      </Collapsible>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-sm">Descrição</CardTitle></CardHeader>
            <CardContent>
              <RichContent content={ticket.description || "Sem descrição"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Anexos</CardTitle></CardHeader>
            <CardContent>
              <FileUpload
                ticketId={id}
                userId={user?.id || ""}
                attachments={attachments}
                onAttachmentsChange={async (newAtts) => {
                  const toInsert = newAtts.filter((a) => !a.id);
                  if (toInsert.length > 0) {
                    await supabase.from("ticket_attachments").insert(
                      toInsert.map((a) => ({
                        ticket_id: id!,
                        file_name: a.file_name,
                        file_path: a.file_path,
                        file_type: a.file_type,
                        file_size: a.file_size,
                        uploaded_by: user!.id,
                      }))
                    );
                  }
                  fetchTicket();
                }}
              />
            </CardContent>
          </Card>

          {/* Client Messages */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Mensagens do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Sem mensagens do cliente</p>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {messages.map((msg) => {
                    const sender = senderProfiles[msg.sender_id];
                    const senderName = sender?.full_name || (msg.sender_type === "agent" ? "Agente" : "Cliente");
                    const senderInitials = senderName.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
                    const isAgent = msg.sender_type === "agent";

                    return (
                      <div
                        key={msg.id}
                        className={`group flex gap-2 ${isAgent ? "flex-row-reverse" : "flex-row"}`}
                      >
                        <Avatar className="h-7 w-7 shrink-0 mt-1">
                          <AvatarImage src={sender?.avatar_url || undefined} />
                          <AvatarFallback className={`text-[9px] font-semibold ${isAgent ? "bg-primary/20 text-primary" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"}`}>
                            {senderInitials}
                          </AvatarFallback>
                        </Avatar>
                        <div className={`max-w-[70%] space-y-1`}>
                          <div
                            className={`rounded-lg px-4 py-2 text-sm ${
                              isAgent
                                ? "bg-primary text-primary-foreground"
                                : "bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200"
                            }`}
                          >
                            <p className="text-xs font-medium mb-1">
                              {senderName}
                            </p>
                            <RichContent content={msg.content} />
                            <p className="text-xs mt-1 opacity-70">
                              {new Date(msg.created_at).toLocaleString("pt-PT")}
                            </p>
                          </div>
                          {user && (
                            <MessageReactions
                              messageId={msg.id}
                              userId={user.id}
                              align={isAgent ? "right" : "left"}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
              <div className="border-t pt-3 space-y-2">
                {replyFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-2 rounded-md bg-muted/50 border">
                    {replyFiles.map((file, i) => (
                      <div key={i} className="flex items-center gap-1.5 bg-background rounded px-2 py-1 text-xs border">
                        {file.type.startsWith("image/") ? (
                          <FileImage className="h-3.5 w-3.5 text-primary shrink-0" />
                        ) : file.type.startsWith("video/") ? (
                          <FileVideo className="h-3.5 w-3.5 text-primary shrink-0" />
                        ) : (
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        <span className="truncate max-w-[120px]">{file.name}</span>
                        <span className="text-muted-foreground">({(file.size / 1024 / 1024).toFixed(1)}MB)</span>
                        <button onClick={() => setReplyFiles((prev) => prev.filter((_, idx) => idx !== i))} className="hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    ref={replyFileRef}
                    type="file"
                    accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                    multiple
                    className="hidden"
                    onChange={handleReplyFileSelect}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => replyFileRef.current?.click()}
                    disabled={sendingReply}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Textarea
                    placeholder="Responder ao cliente..."
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={handleReplyKeyDown}
                    rows={2}
                    className="flex-1 resize-none"
                  />
                  <Button size="icon" onClick={sendReply} disabled={sendingReply || (!reply.trim() && replyFiles.length === 0)}>
                    {sendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Internal Timeline */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Timeline (Notas Internas & Emails)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
          {(() => {
            // Merge events + messages into unified timeline
            const timelineItems = [
              ...events.map((ev) => ({ ...ev, _type: 'event' as const })),
              ...messages.map((msg) => ({
                id: msg.id,
                created_at: msg.created_at,
                content: msg.content,
                user_id: msg.sender_id,
                event_type: msg.sender_type === 'client' ? 'email_in' : 'email_out',
                _type: 'message' as const,
                sender_type: msg.sender_type,
              })),
            ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

            return timelineItems.map((ev) => {
              const evSender = ev.user_id ? senderProfiles[ev.user_id] : null;
              const evInitials = evSender?.full_name
                ? evSender.full_name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
                : "?";
              const isEmail = ev._type === 'message';
              const isInbound = isEmail && ev.sender_type === 'client';

              return (
                <div key={ev.id} className={`flex gap-3 text-sm ${isEmail ? 'pl-1' : ''}`}>
                  <Avatar className={`h-6 w-6 shrink-0 mt-0.5 ${isEmail ? (isInbound ? 'ring-1 ring-blue-400' : 'ring-1 ring-primary') : ''}`}>
                    <AvatarImage src={evSender?.avatar_url || undefined} />
                    <AvatarFallback className={`text-[9px] font-semibold ${
                      isInbound ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                      isEmail ? 'bg-primary/20 text-primary' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {isEmail ? (isInbound ? '📩' : '📤') : evInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {evSender?.full_name && (
                        <p className="text-xs font-medium text-foreground">{evSender.full_name}</p>
                      )}
                      {isEmail && (
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${isInbound ? 'border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400' : 'border-primary/30 text-primary'}`}>
                          {isInbound ? 'Email recebido' : 'Email enviado'}
                        </Badge>
                      )}
                    </div>
                    {isEmail ? (
                      <p className="text-xs text-muted-foreground truncate max-w-[400px]">
                        {(ev.content || '').replace(/<[^>]+>/g, '').substring(0, 100)}
                      </p>
                    ) : (
                      <p dangerouslySetInnerHTML={{
                        __html: (ev.content || "").replace(
                          /@([\w\s]+?)(?=\s@|\s*$|[.,!?])/g,
                          '<span class="font-semibold text-primary">@$1</span>'
                        )
                      }} />
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(ev.created_at).toLocaleString("pt-PT", { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            });
          })()}
              <div className="pt-2 border-t space-y-2">
                <div className="flex items-center gap-2">
                  <MacroSelector ticket={ticket} onSelect={(content) => setNote(content)} />
                </div>
                {noteFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-2 rounded-md bg-muted/50 border">
                    {noteFiles.map((file, i) => (
                      <div key={i} className="flex items-center gap-1.5 bg-background rounded px-2 py-1 text-xs border">
                        {file.type.startsWith("image/") ? (
                          <FileImage className="h-3.5 w-3.5 text-primary shrink-0" />
                        ) : file.type.startsWith("video/") ? (
                          <FileVideo className="h-3.5 w-3.5 text-primary shrink-0" />
                        ) : (
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        <span className="truncate max-w-[120px]">{file.name}</span>
                        <span className="text-muted-foreground">({(file.size / 1024 / 1024).toFixed(1)}MB)</span>
                        <button onClick={() => setNoteFiles((prev) => prev.filter((_, idx) => idx !== i))} className="hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    ref={noteFileRef}
                    type="file"
                    accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                    multiple
                    className="hidden"
                    onChange={handleNoteFileSelect}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => noteFileRef.current?.click()}
                    disabled={addingNote}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <MentionTextarea
                    value={note}
                    onChange={setNote}
                    agents={agents}
                    placeholder="Adicionar nota interna... Use @ para mencionar agentes"
                    rows={3}
                  />
                  <Button size="icon" onClick={addNote} disabled={addingNote || (!note.trim() && noteFiles.length === 0)}>
                    {addingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <TicketSidebar ticket={ticket} tags={tags} clauses={clauses} userId={user?.id || ""} onUpdate={fetchTicket} />
      </div>
    </div>
  );
}
